# Worldwide profile (TMDB + configured add-ons)

The backend exposes one `Worldwide` profile backed by TMDB's global movie/TV catalogue and selected community Stremio add-ons for playback. Catalog browsing and metadata can work without add-ons, but playback needs one or more server-configured HTTPS manifests:

```env
STREMIO_ADDONS=https://addon-one.example/manifest.json,https://addon-two.example/manifest.json
```

Configure at most 12 add-ons. The sample hostnames above are placeholders, not enabled providers.

For direct TMDB API access, set `TMDB_API_KEY` as a backend secret. It is read only by the server and must never be embedded in Android/Web builds, source archives, or public logs. If no key is configured, the existing backend TMDB proxy path is retained.

The profile uses TMDB for worldwide catalog, search, details, and episode metadata. Home, genre, category, year, search, and combined filters use `/api/contents/...` with `provider=stremio`; combined discovery filters use `GET /api/contents/discover?provider=stremio&type=movie|tv&sort=popular|rating|newest&year=YYYY&rating=0..10&genre=<slug-or-id>`. TMDB's `original_language` and `spoken_languages` are returned on content details as **catalog metadata hints**. For a selected title, playback asks configured add-ons for the standard `/stream/{movie|series}/{id}.json` response. Movies use `/api/contents/episodes?provider=stremio&url=...`; series return TMDB episode metadata and opaque `mediaRef` values resolved by `/api/contents/media?provider=stremio&ref=...`. Send `provider=stremio` on TMDB URLs because other providers may share those URLs.

`GET /api/contents/providers` marks Stremio `browseOnly: true` with a reason until at least one valid server-configured manifest is present. The client must not offer this catalog adapter as a playable source while it is browse-only.

## Audio-language selection

`GET /api/contents/languages` returns TMDB's global ISO 639-1 language catalogue for Settings. It is a list of languages the catalog can represent—not a list of languages available for playback. A preference such as `lang=hi` filters to add-on streams whose name/title/description/filename metadata explicitly identifies Hindi; `lang=en` does the same for English. `lang=auto` or no preference leaves all sources available. Stream responses report `languagesAvailable`, `audioLanguages`, and `languageSource` from the add-on labels; `multiAudioAvailable` separately indicates that at least one source is labeled “Multi/Dual Audio.”

This is **metadata matching**, not audio-track inspection. TMDB does not provide the actual audio-track list of a playable file or stream. Its `spoken_languages` field describes content metadata, not necessarily dubs. Add-ons may omit or mislabel audio languages, and no movie or language is guaranteed. If no stream explicitly matches a requested language, the adapter returns 404 instead of silently selecting an unverified source. Multi/Dual Audio is not treated as an individual language, and it does not identify the tracks included.

AnimeKAI continues to use its existing `sub`, `softsub`, and `dub` modes; those mode values are not interchangeable with ISO language codes.

## Playback startup hints

`GET /api/contents/watch-providers?url=<TMDB URL>&region=<ISO country code>` can show regional subscription, free/ad-supported, rental, and purchase provider names. The region is required instead of inferred. TMDB's endpoint is powered by JustWatch; display the returned JustWatch attribution and link to the returned TMDB watch page. It provides availability hints, not provider deep links, playable video URLs, or audio-track data.

## Network and source limits

- Only server-configured HTTPS manifests on the standard HTTPS port are accepted; query strings and credentials in manifest URLs are rejected.
- Add-on hosts must resolve to public IP addresses. Requests are pinned to a checked public address, redirects are disabled, and JSON responses are size- and time-limited.
- Only direct HTTPS stream URLs are returned. Torrent-only entries, HTTP sources, and other non-URL stream types are skipped.
- The adapter does not hard-code or enable any community add-on. Operators must provide add-on manifests they have chosen and are authorized to use.
- Stream language labels and returned player headers are sourced from the add-on response; only `Referer`, `Origin`, and `User-Agent` are forwarded from its behavior hints.

## Relationship to MovieBox-TUI

MovieBox-TUI is a standalone Rust terminal client, not a server API. This backend adapter is independently implemented against the Stremio HTTP add-on format; it does not copy or bundle MovieBox-TUI code. The upstream project's MIT/Apache-2.0 license files and copyright notices remain with that separate source project.
