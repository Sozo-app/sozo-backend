const axios = require('axios');
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const tmdb = require('../utils/tmdb');

const PROVIDER = 'stremio';
const MANIFEST_CACHE_MS = 5 * 60 * 1000;
const MAX_ADDON_JSON_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CONFIGURED_ADDONS = 12;
const manifestCache = new Map();

// Labels are inferred from add-on stream metadata, not inspected from the media file.
const AUDIO_LANGUAGES = [
  { code: 'ar', label: 'Arabic', aliases: ['arabic', 'ara'] },
  { code: 'bn', label: 'Bengali', aliases: ['bengali', 'bangla', 'ben'] },
  { code: 'zh', label: 'Chinese', aliases: ['chinese', 'mandarin', 'cantonese', 'chi', 'zho'] },
  { code: 'cs', label: 'Czech', aliases: ['czech', 'ces'] },
  { code: 'da', label: 'Danish', aliases: ['danish', 'dan'] },
  { code: 'nl', label: 'Dutch', aliases: ['dutch', 'nld', 'dut'] },
  { code: 'en', label: 'English', aliases: ['english', 'eng'] },
  { code: 'fi', label: 'Finnish', aliases: ['finnish', 'fin'] },
  { code: 'fr', label: 'French', aliases: ['french', 'fra', 'fre'] },
  { code: 'de', label: 'German', aliases: ['german', 'deu', 'ger'] },
  { code: 'el', label: 'Greek', aliases: ['greek', 'ell', 'gre'] },
  { code: 'he', label: 'Hebrew', aliases: ['hebrew', 'heb'] },
  { code: 'hi', label: 'Hindi', aliases: ['hindi', 'hin'] },
  { code: 'hu', label: 'Hungarian', aliases: ['hungarian', 'hun'] },
  { code: 'id', label: 'Indonesian', aliases: ['indonesian', 'bahasa', 'ind'] },
  { code: 'it', label: 'Italian', aliases: ['italian', 'ita'] },
  { code: 'ja', label: 'Japanese', aliases: ['japanese', 'jpn'] },
  { code: 'kn', label: 'Kannada', aliases: ['kannada', 'kan'] },
  { code: 'ko', label: 'Korean', aliases: ['korean', 'kor'] },
  { code: 'ml', label: 'Malayalam', aliases: ['malayalam', 'mal'] },
  { code: 'mr', label: 'Marathi', aliases: ['marathi', 'mar'] },
  { code: 'ms', label: 'Malay', aliases: ['malay', 'msa', 'may', 'melayu'] },
  { code: 'mul', label: 'Multi Audio', aliases: ['multi audio', 'multi-audio', 'dual audio', 'dual-audio'] },
  { code: 'no', label: 'Norwegian', aliases: ['norwegian', 'norsk', 'nor'] },
  { code: 'fa', label: 'Persian', aliases: ['persian', 'farsi', 'fas', 'per'] },
  { code: 'pl', label: 'Polish', aliases: ['polish', 'pol'] },
  { code: 'pt', label: 'Portuguese', aliases: ['portuguese', 'por'] },
  { code: 'pa', label: 'Punjabi', aliases: ['punjabi', 'pan'] },
  { code: 'ro', label: 'Romanian', aliases: ['romanian', 'ron', 'rum'] },
  { code: 'ru', label: 'Russian', aliases: ['russian', 'rus'] },
  { code: 'es', label: 'Spanish', aliases: ['spanish', 'espanol', 'castellano', 'spa'] },
  { code: 'sv', label: 'Swedish', aliases: ['swedish', 'swe'] },
  { code: 'tl', label: 'Tagalog', aliases: ['tagalog', 'filipino', 'fil'] },
  { code: 'ta', label: 'Tamil', aliases: ['tamil', 'tam'] },
  { code: 'te', label: 'Telugu', aliases: ['telugu', 'tel'] },
  { code: 'th', label: 'Thai', aliases: ['thai', 'tha'] },
  { code: 'tr', label: 'Turkish', aliases: ['turkish', 'tur'] },
  { code: 'uk', label: 'Ukrainian', aliases: ['ukrainian', 'ukr'] },
  { code: 'ur', label: 'Urdu', aliases: ['urdu', 'urd'] },
  { code: 'vi', label: 'Vietnamese', aliases: ['vietnamese', 'vie'] },
];

const LANGUAGE_BY_CODE = new Map(AUDIO_LANGUAGES.map((item) => [item.code, item]));
const LANGUAGE_ALIAS_MAP = new Map();
for (const language of AUDIO_LANGUAGES) {
  LANGUAGE_ALIAS_MAP.set(language.code, language.code);
  for (const alias of language.aliases) LANGUAGE_ALIAS_MAP.set(alias, language.code);
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function configuredManifestUrls() {
  const raw = process.env.STREMIO_ADDONS || '';
  const urls = raw.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
  if (urls.length > MAX_CONFIGURED_ADDONS) {
    throw httpError(`At most ${MAX_CONFIGURED_ADDONS} Stremio add-ons may be configured`, 500);
  }
  const normalized = [];
  const seen = new Set();
  for (const value of urls) {
    const url = normalizeManifestUrl(value);
    if (!seen.has(url)) {
      seen.add(url);
      normalized.push(url);
    }
  }
  return normalized;
}

function isPlaybackConfigured() {
  try {
    return configuredManifestUrls().length > 0;
  } catch {
    return false;
  }
}

function normalizeManifestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError('Invalid Stremio add-on manifest URL', 500);
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw httpError('Stremio add-ons must use an HTTPS manifest URL without credentials, query, or fragment', 500);
  }
  if (url.port && url.port !== '443') {
    throw httpError('Stremio add-on URLs on non-standard ports are not allowed', 500);
  }
  if (isLocalHostname(url.hostname)) {
    throw httpError('Private or local Stremio add-on hosts are not allowed', 500);
  }

  if (!url.pathname.endsWith('/manifest.json')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/manifest.json`;
  }
  return url.toString();
}

function isLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.test')
    || host.endsWith('.example')
    || host === 'metadata.google.internal';
}

function isPublicIPv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIPv6(address) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:') || normalized === '::1' || normalized === '::') return false;
  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  if (firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0:')
      || normalized.startsWith('2001:20:') || normalized.startsWith('2002:')) return false;
  return true;
}

function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

async function resolvePublicAddresses(hostname) {
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  const family = net.isIP(normalizedHost);
  const records = family
    ? [{ address: normalizedHost, family }]
    : await dns.lookup(normalizedHost, { all: true, verbatim: true }).catch(() => []);

  if (records.length === 0 || records.some((record) => !isPublicIp(record.address))) {
    throw httpError('Stremio add-on host did not resolve exclusively to public IP addresses', 502);
  }
  return records;
}

function pinnedHttpsAgent(records) {
  const record = records[0];
  return new https.Agent({
    keepAlive: false,
    lookup(hostname, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      if (options?.all) return callback(null, [record]);
      return callback(null, record.address, record.family);
    },
  });
}

async function requestPublicJson(urlValue, expectedHostname, records) {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || url.hostname !== expectedHostname) {
    throw httpError('Stremio add-on request escaped its configured HTTPS host', 502);
  }
  const agent = pinnedHttpsAgent(records);
  try {
    const response = await axios.get(url.toString(), {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_ADDON_JSON_BYTES,
      maxBodyLength: MAX_ADDON_JSON_BYTES,
      httpsAgent: agent,
      proxy: false,
      headers: { Accept: 'application/json' },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    throw Object.assign(
      new Error(status ? `Stremio add-on returned HTTP ${status}` : 'Stremio add-on request failed'),
      { status: status || 502 }
    );
  } finally {
    agent.destroy();
  }
}

function addonBaseUrl(manifestUrl) {
  const url = new URL(manifestUrl);
  url.pathname = url.pathname.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

function getManifestRuntime(manifestUrl) {
  return manifestCache.get(manifestUrl);
}

async function loadAddonRuntime(manifestUrl) {
  const cached = getManifestRuntime(manifestUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const normalized = normalizeManifestUrl(manifestUrl);
  const url = new URL(normalized);
  const addresses = await resolvePublicAddresses(url.hostname);
  const manifest = await requestPublicJson(normalized, url.hostname, addresses);
  if (!manifest || typeof manifest !== 'object' || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw httpError('Stremio add-on returned an invalid manifest', 502);
  }

  const runtime = {
    name: manifest.name.trim().slice(0, 80),
    id: typeof manifest.id === 'string' ? manifest.id : '',
    types: Array.isArray(manifest.types) ? manifest.types.filter((value) => typeof value === 'string') : [],
    idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes.filter((value) => typeof value === 'string') : [],
    resources: Array.isArray(manifest.resources) ? manifest.resources : [],
    baseUrl: addonBaseUrl(normalized),
    hostname: url.hostname,
    addresses,
  };
  if (!manifestCache.has(manifestUrl) && manifestCache.size >= 32) {
    manifestCache.delete(manifestCache.keys().next().value);
  }
  manifestCache.set(manifestUrl, { value: runtime, expiresAt: Date.now() + MANIFEST_CACHE_MS });
  return runtime;
}

function findStreamResource(runtime, mediaType) {
  const resource = runtime.resources.find((item) => item === 'stream' || item?.name === 'stream');
  if (!resource) return null;
  const resourceTypes = typeof resource === 'object' && Array.isArray(resource.types) ? resource.types : runtime.types;
  if (resourceTypes.length > 0 && !resourceTypes.includes(mediaType)) return null;
  return resource;
}

function idMatchesPrefixes(id, prefixes) {
  return prefixes.length === 0 || prefixes.some((prefix) => id.startsWith(prefix));
}

function languageCode(value) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (!cleaned) return null;
  const token = cleaned.split(/[-\s]/)[0];
  return LANGUAGE_ALIAS_MAP.get(cleaned) || LANGUAGE_ALIAS_MAP.get(token)
    || (/^[a-z]{2}$/.test(token) ? token : null);
}

function normalizeLanguagePreference(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || ['auto', 'all', 'default', 'sub', 'softsub', 'dub'].includes(raw)) return null;
  const code = languageCode(raw);
  if (!code) throw httpError(`Unsupported Stremio audio language preference "${raw}"`, 400);
  if (code === 'mul') throw httpError('Multi Audio is a stream label, not a specific language choice', 400);
  return code;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectAudioLanguages(stream, languageCatalog = AUDIO_LANGUAGES) {
  const hints = [
    stream.name,
    stream.title,
    stream.description,
    stream.behaviorHints?.filename,
  ].filter((value) => typeof value === 'string').join(' ');
  const normalized = hints.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const found = [];

  for (const language of languageCatalog) {
    if (language.code === 'mul') continue;
    const tokens = [language.label, ...(language.aliases || [])]
      .filter((token) => typeof token === 'string' && token.trim().length >= 3);
    const match = tokens.some((token) => {
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(token)}($|[^\\p{L}\\p{N}])`, 'iu');
      return pattern.test(normalized);
    });
    const code = escapeRegExp(language.code);
    const taggedCode = new RegExp(`(?:\\[${code}\\]|\\(${code}\\)|\\b(?:audio|lang|language)\\s*[:= -]\\s*${code}\\b)`, 'i');
    if ((match || taggedCode.test(normalized)) && !found.includes(language.code)) found.push(language.code);
  }

  if (/\b(?:dual[ -]?audio|multi[ -]?audio)\b/i.test(normalized) && !found.includes('mul')) {
    found.push('mul');
  }
  return found;
}

async function getAudioLanguageCatalog() {
  const fromTmdb = await tmdb.getLanguages().catch(() => []);
  const byCode = new Map();
  for (const language of AUDIO_LANGUAGES) {
    if (language.code !== 'mul') byCode.set(language.code, { ...language, aliases: [...language.aliases] });
  }
  for (const language of fromTmdb) {
    if (!language?.code || !/^[a-z]{2}$/.test(language.code)) continue;
    const existing = byCode.get(language.code);
    const aliases = [language.englishName, language.name]
      .filter((name) => typeof name === 'string' && name.trim());
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...aliases])];
    } else {
      byCode.set(language.code, {
        code: language.code,
        label: language.englishName || language.name || language.code,
        aliases,
      });
    }
  }
  return [...byCode.values()];
}

function streamQuality(text) {
  const value = String(text || '');
  const match = value.match(/\b(2160|1440|1080|720|576|480|360)p\b/i)
    || (/(?:\b4k\b|uhd)/i.test(value) ? [null, '2160'] : null);
  return match ? `${match[1]}p` : 'auto';
}

function streamType(urlValue, hint) {
  const explicit = String(hint || '').toLowerCase();
  if (['hls', 'dash', 'mp4', 'iframe'].includes(explicit)) return explicit;
  let path = '';
  try {
    path = new URL(urlValue).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (/\.(mp4|mkv|webm|mov)$/.test(path)) return 'mp4';
  return null;
}

function safePlayerHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Map([
    ['referer', 'Referer'],
    ['origin', 'Origin'],
    ['user-agent', 'User-Agent'],
  ]);
  const out = {};
  for (const [name, headerValue] of Object.entries(value)) {
    const normalized = allowed.get(name.toLowerCase());
    if (normalized && typeof headerValue === 'string' && headerValue.length <= 2048 && !/[\r\n]/.test(headerValue)) {
      out[normalized] = headerValue;
    }
  }
  return out;
}

function mapStream(stream, addonName, languageCatalog = AUDIO_LANGUAGES) {
  if (!stream || typeof stream !== 'object' || typeof stream.url !== 'string') return null;
  if (stream.infoHash || stream.fileIdx != null) return null;
  let url;
  try {
    url = new URL(stream.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;

  const metadata = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter((value) => typeof value === 'string').join(' ');
  const detectedLanguages = detectAudioLanguages(stream, languageCatalog);
  const languages = detectedLanguages.filter((code) => code !== 'mul');
  return {
    videoUrl: url.toString(),
    type: streamType(url.toString(), stream.type || stream.behaviorHints?.streamType),
    quality: streamQuality(metadata),
    addonName,
    label: (typeof stream.name === 'string' && stream.name.trim())
      || (typeof stream.title === 'string' && stream.title.trim())
      || addonName,
    headers: safePlayerHeaders(stream.behaviorHints?.headers),
    languages,
    multiAudio: detectedLanguages.includes('mul'),
    languageSource: 'Stremio add-on stream name/title/description/filename metadata',
  };
}

function qualityScore(quality) {
  const match = String(quality || '').match(/^(\d+)p$/i);
  return match ? Number(match[1]) : 0;
}

async function fetchAddonStreams(manifestUrl, mediaType, id, languageCatalog) {
  const runtime = await loadAddonRuntime(manifestUrl);
  const resource = findStreamResource(runtime, mediaType);
  if (!resource) return [];
  const prefixes = typeof resource === 'object' && Array.isArray(resource.idPrefixes)
    ? resource.idPrefixes
    : runtime.idPrefixes;
  if (!idMatchesPrefixes(id, prefixes)) return [];

  const encodedId = encodeURIComponent(id).replace(/%3A/gi, ':');
  const base = `${runtime.baseUrl.replace(/\/$/, '')}/`;
  const endpoint = new URL(`stream/${mediaType}/${encodedId}.json`, base).toString();
  const payload = await requestPublicJson(endpoint, runtime.hostname, runtime.addresses);
  const streams = Array.isArray(payload) ? payload : payload?.streams;
  if (!Array.isArray(streams)) return [];
  return streams.map((stream) => mapStream(stream, runtime.name, languageCatalog)).filter(Boolean);
}

async function collectStreams(mediaType, id) {
  const manifests = configuredManifestUrls();
  if (manifests.length === 0) {
    throw httpError('No Stremio add-ons are configured. Set STREMIO_ADDONS to HTTPS manifest URLs.', 503);
  }

  const languageCatalog = await getAudioLanguageCatalog();
  const results = await Promise.allSettled(manifests.map((manifestUrl) => (
    fetchAddonStreams(manifestUrl, mediaType, id, languageCatalog)
  )));
  const all = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') all.push(...result.value);
    else failures += 1;
  }

  const seen = new Set();
  const unique = all.filter((stream) => {
    if (seen.has(stream.videoUrl)) return false;
    seen.add(stream.videoUrl);
    return true;
  });
  unique.sort((left, right) => qualityScore(right.quality) - qualityScore(left.quality));

  if (unique.length === 0 && failures === results.length) {
    throw httpError('All configured Stremio add-ons failed to return streams', 502);
  }
  return unique;
}

function chooseStreams(streams, preferredLanguage, server) {
  const candidates = preferredLanguage
    ? streams.filter((stream) => stream.languages.includes(preferredLanguage))
    : streams;
  if (preferredLanguage && candidates.length === 0) {
    const label = LANGUAGE_BY_CODE.get(preferredLanguage)?.label || preferredLanguage;
    throw httpError(`No stream is explicitly marked as ${label} by the configured add-on metadata`, 404);
  }
  if (candidates.length === 0) throw httpError('No direct HTTP(S) streams are available from configured Stremio add-ons', 404);

  const requestedServer = Math.max(1, Number.parseInt(server, 10) || 1);
  const selectedIndex = Math.min(requestedServer - 1, candidates.length - 1);
  return { candidates, selectedIndex, selected: candidates[selectedIndex] };
}

function toMediaPayload(streams, options = {}) {
  const preferredLanguage = normalizeLanguagePreference(options.lang);
  const { candidates, selectedIndex, selected } = chooseStreams(streams, preferredLanguage, options.server);
  const languagesAvailable = [...new Set(streams.flatMap((stream) => stream.languages))].sort();
  const multiAudioAvailable = streams.some((stream) => stream.multiAudio);
  const videoSources = candidates.map((stream, index) => ({
    quality: stream.quality,
    videoUrl: stream.videoUrl,
    isDefault: index === 0,
    type: stream.type,
    host: stream.addonName,
    headers: stream.headers,
    audioLanguages: stream.languages,
    ...(stream.languages.length === 1 ? { audioLanguage: stream.languages[0] } : {}),
    multiAudio: stream.multiAudio,
    languageSource: stream.languageSource,
  }));

  return {
    videoUrl: selected.videoUrl,
    type: selected.type,
    headers: selected.headers,
    videoSources,
    title: selected.label,
    host: selected.addonName,
    server: {
      name: selected.addonName,
      sid: selectedIndex + 1,
      lang: selected.languages.length === 1 ? selected.languages[0] : null,
    },
    languagesAvailable,
    audioLanguages: selected.languages,
    multiAudioAvailable,
    languageSource: selected.languageSource,
  };
}

function encodeMediaRef(value) {
  return `${PROVIDER}:${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
}

function decodeMediaRef(value) {
  if (typeof value !== 'string' || !value.startsWith(`${PROVIDER}:`)) {
    throw httpError('mediaRef does not belong to the Stremio provider', 400);
  }
  try {
    const decoded = JSON.parse(Buffer.from(value.slice(PROVIDER.length + 1), 'base64url').toString('utf8'));
    if (!decoded || !['movie', 'series'].includes(decoded.type) || typeof decoded.id !== 'string' || !decoded.id) {
      throw new Error('invalid media reference');
    }
    if (decoded.type === 'series' && (!Number.isInteger(decoded.season) || !Number.isInteger(decoded.episode) || decoded.season < 1 || decoded.episode < 1)) {
      throw new Error('invalid episode reference');
    }
    return decoded;
  } catch {
    throw httpError('Invalid Stremio mediaRef', 400);
  }
}

function stremioId(externalIds, tmdbId) {
  const imdbId = externalIds?.imdb_id;
  return typeof imdbId === 'string' && /^tt\d+$/.test(imdbId) ? imdbId : `tmdb:${tmdbId}`;
}

async function idsForTmdb(type, tmdbId) {
  const externalIds = await tmdb.getExternalIds(type, tmdbId).catch(() => ({}));
  return stremioId(externalIds, tmdbId);
}

const getLatest = (page = 1) => tmdb.getLatest(PROVIDER, page);
const getCategory = (category, page = 1) => tmdb.getCategory(PROVIDER, category, page);
const getGenre = (genre, page = 1) => tmdb.getGenre(PROVIDER, genre, page);
const getYear = (year, page = 1) => tmdb.getYear(PROVIDER, year, page);
const discover = (filters, page = 1) => tmdb.discover(PROVIDER, filters, page);
const getCountry = (country, page = 1) => tmdb.getCountry(PROVIDER, country, page);
const getActor = (actor, page = 1) => tmdb.getActor(PROVIDER, actor, page);
const getDirector = (director, page = 1) => tmdb.getDirector(PROVIDER, director, page);
const search = (query, page = 1) => tmdb.search(PROVIDER, query, page);
const getHome = () => tmdb.getHome(PROVIDER);
const getDetail = (url) => tmdb.getDetail(PROVIDER, url);

async function getEpisodes(url, options = {}) {
  const ref = tmdb.parseUrl(url);
  if (!ref) throw httpError('Valid TMDB URL required', 400);

  const id = await idsForTmdb(ref.type, ref.id);
  if (ref.type === 'movie') {
    const mediaRef = encodeMediaRef({ type: 'movie', id });
    const streams = await collectStreams('movie', id);
    const payload = toMediaPayload(streams, options);
    return {
      provider: PROVIDER,
      contentUrl: url,
      isSerial: false,
      mediaRef,
      playerSrc: payload.videoUrl,
      ...payload,
    };
  }

  const series = await tmdb.api(`/tv/${ref.id}`);
  const seasons = (series.seasons || []).filter((season) => Number(season.season_number) > 0).slice(0, 40);
  const seasonResults = [];
  for (let offset = 0; offset < seasons.length; offset += 4) {
    const batch = seasons.slice(offset, offset + 4);
    seasonResults.push(...await Promise.all(batch.map((season) => (
      tmdb.getSeasonEpisodes(ref.id, season.season_number).catch(() => null)
    ))));
  }
  const episodes = [];
  for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex += 1) {
    const seasonNumber = Number(seasons[seasonIndex].season_number);
    const seasonData = seasonResults[seasonIndex];
    for (const episode of seasonData?.episodes || []) {
      const episodeNumber = Number(episode.episode_number);
      if (!Number.isInteger(episodeNumber) || episodeNumber < 1) continue;
      episodes.push({
        episode: episodes.length + 1,
        label: `S${seasonNumber}E${episodeNumber}${episode.name ? ` · ${episode.name}` : ''}`,
        mediaRef: encodeMediaRef({ type: 'series', id, season: seasonNumber, episode: episodeNumber }),
        image: episode.still_path ? tmdb.poster(episode.still_path) : undefined,
        airdate: episode.air_date || undefined,
        runtime: episode.runtime ? `${episode.runtime} min` : undefined,
        overview: episode.overview || undefined,
      });
      if (episodes.length >= 2000) break;
    }
    if (episodes.length >= 2000) break;
  }

  return { provider: PROVIDER, contentUrl: url, isSerial: true, episodes };
}

async function resolveMedia(mediaRef, options = {}) {
  const ref = decodeMediaRef(mediaRef);
  const mediaType = ref.type === 'series' ? 'series' : 'movie';
  const id = ref.type === 'series' ? `${ref.id}:${ref.season}:${ref.episode}` : ref.id;
  const streams = await collectStreams(mediaType, id);
  return toMediaPayload(streams, options);
}

const getCategoryList = () => tmdb.categoryList(PROVIDER);
const getGenreList = () => tmdb.genreList(PROVIDER);

module.exports = {
  name: PROVIDER,
  domains: [],
  getLatest,
  getCategory,
  getGenre,
  getYear,
  discover,
  getCountry,
  getActor,
  getDirector,
  search,
  getHome,
  getDetail,
  getEpisodes,
  resolveMedia,
  getCategoryList,
  getGenreList,
  isPlaybackConfigured,
  _test: {
    isPlaybackConfigured,
    normalizeManifestUrl,
    isPublicIPv4,
    isPublicIPv6,
    languageCode,
    normalizeLanguagePreference,
    detectAudioLanguages,
    streamQuality,
    findStreamResource,
    idMatchesPrefixes,
    mapStream,
    toMediaPayload,
    encodeMediaRef,
    decodeMediaRef,
    chooseStreams,
  },
};
