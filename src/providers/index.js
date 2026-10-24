const asilmedia  = require('./asilmedia');
const anikai     = require('./anikai');
const idub       = require('./idub');
const kinogo     = require('./kinogo');
const mochitv    = require('./mochitv');
const uzmovi     = require('./uzmovi');
const vidapi     = require('./vidapi');
const vidsrc     = require('./vidsrc');
const pinoymoviepedia     = require('./pinoymoviepedia');
const animeav1   = require('./animeav1');
const stremio    = require('./stremio');
const _providers = { vidapi, vidsrc, asilmedia, anikai, idub, kinogo, mochitv, uzmovi, /*pinoymoviepedia,*/ animeav1, stremio };

const _meta = {
    vidapi: {
        id:          'vidapi',
        name:        'VidAPI',
        image:       'https://vidapi.ru/favicon.ico',
        url:         'https://vidapi.ru',
        description: 'Universal TMDB/IMDb-backed catalog — VidAPI (vaplayer.ru) iframe playback',
    },
    vidsrc: {
        id:          'vidsrc',
        name:        'Vidsrc.Ru',
        image:       'https://vidsrc.ru/favicon.ico',
        url:         'https://vidsrc.ru',
        description: 'Universal TMDB/IMDb-backed catalog - Vidsrc.Ru playback',
    },
    animeav1: {
        id:          'animeav1',
        name:        'AnimeAV1',
        image:       'https://animeav1.com/favicon.png',
        url:         'https://animeav1.com',
        description: 'Anime catalog, episodios recientes, HLS player and mirror embeds',
    },
    asilmedia: {
        id:          'asilmedia',
        name:        'AsilMedia',
        image:       'https://yt3.googleusercontent.com/-RIlt8gzCSWUh-bRzUGqWJIioEAl5BygNWNGp6Q-f18avpxgWufo9JLcGRA1WSi6XF_3MxmnPQ=s900-c-k-c0x00ffffff-no-rj',
        url:         'https://asilmedia.org',
        description: "O'zbek tilidagi kino va seriallar platformasi",
    },
    anikai: {
        id:          'anikai',
        name:        'AnimeKAI',
        image:       'https://play-lh.googleusercontent.com/OwgUfCxkDmV3wFlqViTGPAt1yAY7h1MWbvLoveVxIWvwtsgzRdrGPc-X5coLm-clg0Mz_HOg123RX73dpGH0_Ew',
        url:         'https://anikai.to',
        description: 'Sub & Dub anime - multi-language streaming (sub / softsub / dub)',
    },
    idub: {
        id:          'idub',
        name:        'IDUB',
        image:       'https://idub.tv/templates/cinemagic/images/favicon.png',
        url:         'https://idub.tv',
        description: "O'zbek tilidagi seriallar va doramalar — mover.uz orqali oqim",
    },
    kinogo: {
        id:          'kinogo',
        name:        'KinoGo',
        image:       'https://kinogo-film.my/favicon.ico',
        logo:        'https://kinogo-film.my/favicon.ico',
        url:         'https://kinogo-film.my',
        description: 'Русские фильмы и сериалы онлайн — KinoGo',
    },
    mochitv: {
        id:          'mochitv',
        name:        'MochiTV',
        image:       'https://www.mochitv.uz/favicon.ico',
        url:         'https://www.mochitv.uz',
        description: "O'zbek tilidagi anime to'plami",
    },
    uzmovi: {
        id:          'uzmovi',
        name:        'UzMovi',
        image:       'https://avatars.githubusercontent.com/u/106664405?s=200&v=4',
        url:         'https://uzmovi.tv',
        description: "O'zbek tilidagi onlayn kinoteatr — kinolar, seriallar, anime",
    },
    stremio: {
        id:          'stremio',
        name:        'Worldwide',
        image:       null,
        url:         'https://www.stremio.com',
        description: 'Global TMDB catalog and language metadata; playback requires configured community add-ons',
    },

};

function httpError(message, status) {
    return Object.assign(new Error(message), { status });
}

function getProvider(name) {
    const p = _providers[name];
    if (!p) {
        throw httpError(`Unknown provider "${name}". Valid: ${Object.keys(_providers).join(', ')}`, 400);
    }
    return p;
}

function detectProvider(contentUrl) {
    if (!contentUrl) throw httpError('contentUrl is required', 400);
    for (const [name, provider] of Object.entries(_providers)) {
        if (provider.domains?.some(d => contentUrl.includes(d))) return name;
    }
    throw httpError(`Cannot detect provider from URL: ${contentUrl}`, 400);
}

function listProviders() {
    return Object.keys(_providers).map(id => {
        const m = _meta[id] ?? {};
        const img = m.image ?? null;
    return {
            id,
            name:        m.name        ?? id,
            image:       img,
            logo:        img,
            url:         m.url         ?? null,
            description: m.description ?? null,
            domains:     _providers[id].domains ?? [],
            ...(id === 'stremio' && !_providers[id].isPlaybackConfigured?.()
                ? {
                    browseOnly: true,
                    browseOnlyReason: 'Playback requires a valid server-configured community add-on manifest.',
                  }
                : {}),
        };
    });
}

function avatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=200&background=1e293b&color=94a3b8&bold=true`;
}

function slugifyName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function normalizeCast(rawCast) {
    const seen = new Set();
    const out = [];
    for (const a of rawCast ?? []) {
        const name = typeof a === 'string' ? a : (a?.name ?? '');
        if (!name) continue;
        const id    = typeof a === 'string' ? slugifyName(name) : (a.id ?? slugifyName(name));
        const image = typeof a === 'string' ? avatarUrl(name) : (a.image ?? avatarUrl(name));
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name, image });
        if (out.length >= 20) break;
    }
    return out;
}

function normalizeDetail(raw, providerName) {
    return {
        provider:    raw.provider    ?? providerName,
        contentId:   raw.contentId   ?? null,
        contentUrl:  raw.contentUrl  ?? raw.url ?? null,
        title:       raw.title       ?? '',
        description: raw.description ?? null,
        thumbnail:   raw.thumbnail   ?? null,
        banner:      raw.banner      ?? null,
        year:        raw.year        ?? null,
        duration:    raw.duration    ?? null,
        country:     raw.country     ?? null,
        originalLanguage: raw.originalLanguage ?? null,
        spokenLanguages:  raw.spokenLanguages ?? [],
        director:    raw.director    ?? null,
        genres:      raw.genres      ?? [],
        cast:        normalizeCast(raw.cast),
        likes:       raw.likes       ?? 0,
        dislikes:    raw.dislikes    ?? 0,
        isSerial:    Boolean(raw.isSerial),
        screenshots: raw.screenshots ?? [],
        related:     raw.related     ?? [],
        extra:       raw.extra       ?? null,
    };
}

function normalizeEpisode(e) {
    const out = {
        episode:  e.episode,
        label:    e.label,
        mediaRef: e.mediaRef ?? null,
    };
    if (e.availableLangs) out.availableLangs = e.availableLangs;
    if (e.hasSub != null) out.hasSub          = e.hasSub;
    if (e.hasDub != null) out.hasDub          = e.hasDub;
    if (e.isUncensored)   out.isUncensored    = true;
    if (e.image)          out.image           = e.image;
    if (e.airdate)        out.airdate         = e.airdate;
    if (e.runtime)        out.runtime         = e.runtime;
    if (e.overview)       out.overview        = e.overview;
    return out;
}

const EPISODES_DEFAULT_PAGE_SIZE = 100;
const EPISODES_MAX_PAGE_SIZE     = 500;

function sortDir(opts) {
    return String(opts?.sort || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function sortEpisodes(arr, dir) {
    const out = [...arr];
    out.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    if (dir === 'desc') out.reverse();
    return out;
}

function normalizeEpisodes(raw, providerName, opts = {}) {
    const isSerial = Boolean(raw.isSerial ?? (raw.episodes?.length > 0));
    const base = {
        provider:   raw.provider   ?? providerName,
        contentUrl: raw.contentUrl ?? null,
        isSerial,
    };
    if (!isSerial) {
        return {
            ...base,
            videoSources: raw.videoSources ?? [],
            playerSrc:    raw.playerSrc    ?? raw.videoUrl ?? null,
            type:         raw.type         ?? null,
            headers:      raw.headers      ?? {},
            ...(raw.title != null ? { title: raw.title } : {}),
            ...(raw.host != null ? { host: raw.host } : {}),
            ...(raw.server != null ? { server: raw.server } : {}),
            ...(raw.mediaRef != null ? { mediaRef: raw.mediaRef } : {}),
            ...(raw.subtitles != null ? { subtitles: raw.subtitles } : {}),
            ...(raw.languagesAvailable != null ? { languagesAvailable: raw.languagesAvailable } : {}),
            ...(raw.audioLanguages != null ? { audioLanguages: raw.audioLanguages } : {}),
            ...(raw.multiAudioAvailable != null ? { multiAudioAvailable: raw.multiAudioAvailable } : {}),
            ...(raw.languageSource != null ? { languageSource: raw.languageSource } : {}),
        };
    }

    const sort = sortDir(opts);

    if (raw.total != null && raw.page != null && raw.size != null) {
        return {
            ...base,
            episodes:   (raw.episodes ?? []).map(normalizeEpisode),
            page:       raw.page,
            size:       raw.size,
            total:      raw.total,
            totalPages: raw.totalPages ?? Math.max(1, Math.ceil(raw.total / raw.size)),
            sort:       raw.sort ?? sort,
        };
    }

    const sorted = sortEpisodes(raw.episodes ?? [], sort);
    const size  = Math.max(1, Math.min(parseInt(opts.size) || EPISODES_DEFAULT_PAGE_SIZE, EPISODES_MAX_PAGE_SIZE));
    const page  = Math.max(1, parseInt(opts.page) || 1);
    const start = (page - 1) * size;
    const slice = sorted.slice(start, start + size).map(normalizeEpisode);
    return {
        ...base,
        episodes:   slice,
        page,
        size,
        total:      sorted.length,
        totalPages: Math.max(1, Math.ceil(sorted.length / size)),
        sort,
    };
}

function normalizeMedia(raw, providerName) {
    if (!raw) return null;
    const videoUrl = raw.videoUrl || raw.playerSrc || null;
    const inferType = (u) => {
        if (!u) return null;
        if (/\.m3u8(\?|$)/i.test(u)) return 'hls';
        if (/\.mp4(\?|$)/i.test(u))  return 'mp4';
        return 'iframe';
    };
    const type = raw.type || inferType(videoUrl);
    const sources = raw.videoSources && raw.videoSources.length > 0
        ? raw.videoSources.map(s => ({
            quality:   s.quality || 'auto',
            videoUrl:  s.videoUrl,
            isDefault: Boolean(s.isDefault),
            ...(s.host ? { host: s.host } : {}),
            ...(s.type ? { type: s.type } : {}),
            ...(s.headers ? { headers: s.headers } : {}),
            ...(s.embed ? { embed: s.embed } : {}),
            ...(s.audioLanguage ? { audioLanguage: s.audioLanguage } : {}),
            ...(s.audioLanguages ? { audioLanguages: s.audioLanguages } : {}),
            ...(s.multiAudio != null ? { multiAudio: s.multiAudio } : {}),
            ...(s.languageSource ? { languageSource: s.languageSource } : {}),
          }))
        : (videoUrl ? [{ quality: 'auto', videoUrl, isDefault: true }] : []);

    const out = {
        provider:     providerName,
        videoUrl,
        type,
        headers:      raw.headers || {},
        videoSources: sources,
    };
    for (const k of ['subtitles', 'poster', 'thumbnails', 'duration', 'host', 'embed',
                     'title', 'backdrop', 'server', 'skip', 'alternates', 'languagesAvailable',
                     'audioLanguages', 'multiAudioAvailable', 'languageSource']) {
        if (raw[k] != null) out[k] = raw[k];
    }
    return out;
}

async function getEpisodes(providerName, url, opts) {
    const provider = getProvider(providerName);
    if (typeof provider.getEpisodes !== 'function') {
        throw httpError(`"${providerName}" provider epizodlarni qo'llab-quvvatlamaydi`, 501);
    }
    return provider.getEpisodes(url, opts);
}

async function resolveMedia(providerName, mediaRef, opts) {
    const provider = getProvider(providerName);
    if (typeof provider.resolveMedia !== 'function') {
        throw httpError(`"${providerName}" provider media yechishni qo'llab-quvvatlamaydi`, 501);
    }
    return provider.resolveMedia(mediaRef, opts);
}

module.exports = {
    getProvider,
    detectProvider,
    listProviders,
    normalizeDetail,
    normalizeEpisodes,
    normalizeMedia,
    getEpisodes,
    resolveMedia,
};
