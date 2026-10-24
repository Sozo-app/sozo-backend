const test = require('node:test');
const assert = require('node:assert/strict');
const stremio = require('../src/providers/stremio');
const tmdb = require('../src/utils/tmdb');

const { _test } = stremio;

test('accepts only canonical HTTPS TMDB URLs', () => {
  assert.deepEqual(tmdb.parseUrl('https://www.themoviedb.org/movie/550-fight-club'), {
    type: 'movie', id: 550, season: null, episode: null,
  });
  assert.deepEqual(tmdb.parseUrl('https://themoviedb.org/tv/1399-game-of-thrones/season/1/episode/1?language=en-US'), {
    type: 'tv', id: 1399, season: 1, episode: 1,
  });
  assert.equal(tmdb.parseUrl('https://evilthemoviedb.org/movie/550'), null);
  assert.equal(tmdb.parseUrl('https://www.themoviedb.org.evil.com/movie/550'), null);
  assert.equal(tmdb.parseUrl('http://www.themoviedb.org/movie/550'), null);
  assert.equal(tmdb.parseUrl('https://www.themoviedb.org/movie/550/season/1'), null);
});

test('normalizes only secure public add-on manifest URLs', () => {
  assert.equal(
    _test.normalizeManifestUrl('https://addons.example.org'),
    'https://addons.example.org/manifest.json'
  );
  assert.equal(
    _test.normalizeManifestUrl('https://addons.example.org/feed/manifest.json'),
    'https://addons.example.org/feed/manifest.json'
  );
  assert.throws(() => _test.normalizeManifestUrl('http://addons.example.org'), /HTTPS/);
  assert.throws(() => _test.normalizeManifestUrl('https://localhost/manifest.json'), /Private or local/);
  assert.throws(() => _test.normalizeManifestUrl('https://addons.example.org:8443/manifest.json'), /non-standard ports/);
  assert.throws(() => _test.normalizeManifestUrl('https://addons.example.org/manifest.json?token=secret'), /query/);
});

test('maps Worldwide discovery filters to safe TMDB parameters', () => {
  const result = tmdb.discoverParams({
    type: 'tv', sort: 'newest', year: '2024', rating: '7', genre: 'drama',
  }, 3);
  assert.deepEqual(result, {
    type: 'tv',
    params: {
      page: 3,
      sort_by: 'first_air_date.desc',
      include_adult: false,
      first_air_date_year: 2024,
      'vote_average.gte': 7,
      with_genres: 18,
    },
  });
  assert.throws(() => tmdb.discoverParams({ type: 'person' }), /type must be movie or tv/);
  assert.throws(() => tmdb.discoverParams({ genre: 'not-a-genre' }), /Unknown genre/);
});

test('rejects private, reserved, and non-routable IP ranges', () => {
  for (const address of [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.1.2',
    '172.20.1.2', '192.168.1.4', '192.0.2.5', '198.18.0.1', '203.0.113.9', '224.0.0.1',
  ]) {
    assert.equal(_test.isPublicIPv4(address), false, `${address} should not be public`);
  }
  assert.equal(_test.isPublicIPv4('8.8.8.8'), true);
  assert.equal(_test.isPublicIPv4('1.1.1.1'), true);
  assert.equal(_test.isPublicIPv6('::1'), false);
  assert.equal(_test.isPublicIPv6('fc00::1'), false);
  assert.equal(_test.isPublicIPv6('2001:db8::1'), false);
  assert.equal(_test.isPublicIPv6('2001:4860:4860::8888'), true);
});

test('normalizes common audio language codes and labels', () => {
  assert.equal(_test.languageCode('Hindi'), 'hi');
  assert.equal(_test.languageCode('eng'), 'en');
  assert.equal(_test.languageCode('pt-BR'), 'pt');
  assert.equal(_test.languageCode('Dual Audio'), 'mul');
  assert.equal(_test.normalizeLanguagePreference('auto'), null);
  assert.equal(_test.normalizeLanguagePreference('dub'), null);
  assert.equal(_test.normalizeLanguagePreference('bi'), 'bi');
  assert.throws(() => _test.normalizeLanguagePreference('mul'), /not a specific language/);
  assert.throws(() => _test.normalizeLanguagePreference('Klingon'), /Unsupported/);
});

test('detects only languages explicitly named in add-on text metadata', () => {
  const languages = _test.detectAudioLanguages({
    name: 'Hindi Dub',
    title: '1080p English + Hindi',
    description: 'Dual Audio release',
  });
  assert.deepEqual(languages, ['en', 'hi', 'mul']);
  assert.deepEqual(_test.detectAudioLanguages({ name: '1080p WEB-DL' }), []);
  assert.deepEqual(
    _test.detectAudioLanguages({ name: 'Bislama 720p' }, [{ code: 'bi', label: 'Bislama', aliases: [] }]),
    ['bi']
  );
  assert.deepEqual(
    _test.detectAudioLanguages({ name: 'Movie [bi] 720p' }, [{ code: 'bi', label: 'Bislama', aliases: [] }]),
    ['bi']
  );
});

test('maps direct HTTPS streams and rejects torrent-only entries', () => {
  const mapped = _test.mapStream({
    name: 'Hindi 1080p',
    url: 'https://cdn.example.org/movie.m3u8',
    behaviorHints: { headers: { Referer: 'https://addon.example.org/', Cookie: 'ignored' } },
  }, 'Community Add-on');
  assert.equal(mapped.type, 'hls');
  assert.equal(mapped.quality, '1080p');
  assert.deepEqual(mapped.languages, ['hi']);
  assert.deepEqual(mapped.headers, { Referer: 'https://addon.example.org/' });
  const multi = _test.mapStream({
    name: 'Hindi Dual Audio',
    url: 'https://cdn.example.org/film.mp4',
  }, 'Community Add-on');
  assert.deepEqual(multi.languages, ['hi']);
  assert.equal(multi.multiAudio, true);
  assert.equal(_test.mapStream({ infoHash: 'abc', fileIdx: 0 }, 'Torrent'), null);
  assert.equal(_test.mapStream({ url: 'http://cdn.example.org/movie.mp4' }, 'Insecure'), null);
  assert.equal(_test.mapStream({ url: 'javascript:alert(1)' }, 'Unsafe'), null);
});

test('honors resource-level stream types and ID prefixes', () => {
  const resource = _test.findStreamResource({
    types: ['movie'],
    resources: [{ name: 'stream', types: ['series'], idPrefixes: ['tt'] }],
  }, 'series');
  assert.deepEqual(resource.idPrefixes, ['tt']);
  assert.equal(_test.findStreamResource({ resources: [{ name: 'stream', types: ['movie'] }] }, 'series'), null);
  assert.equal(_test.idMatchesPrefixes('tt1234', resource.idPrefixes), true);
  assert.equal(_test.idMatchesPrefixes('tmdb:1234', resource.idPrefixes), false);
});

test('filters streams by explicit language and creates bounded Stremio media refs', () => {
  const streams = [
    { videoUrl: 'https://cdn.example.org/en.mp4', languages: ['en'] },
    { videoUrl: 'https://cdn.example.org/hi.mp4', languages: ['hi'] },
  ];
  const selected = _test.chooseStreams(streams, 'hi', 1);
  assert.equal(selected.selected.videoUrl, 'https://cdn.example.org/hi.mp4');
  assert.throws(() => _test.chooseStreams(streams, 'ja', 1), /explicitly marked/);

  const encoded = _test.encodeMediaRef({ type: 'series', id: 'tt1234567', season: 2, episode: 3 });
  assert.deepEqual(_test.decodeMediaRef(encoded), { type: 'series', id: 'tt1234567', season: 2, episode: 3 });
  assert.throws(() => _test.decodeMediaRef('stremio:not-json'), /Invalid Stremio/);
});
