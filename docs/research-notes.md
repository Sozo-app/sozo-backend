# Research notes

## TMDB language metadata and watch-provider limits

The official [movie details reference](https://developer.themoviedb.org/reference/movie-details) documents `original_language` and `spoken_languages[]` (`english_name`, `iso_639_1`, `name`). These describe catalog metadata; the endpoint does not enumerate the audio tracks inside a playable file. The official [language configuration reference](https://developer.themoviedb.org/reference/configuration-languages) supplies ISO 639-1 codes and language names, so it can populate a global Settings picker but cannot prove dubbing availability.

The official [movie watch-provider reference](https://developer.themoviedb.org/reference/movie-watch-providers) describes regional subscription/free/rental/purchase availability powered by JustWatch. It explicitly says it does not return full provider deep links; the response supplies a TMDB watch-page link and requires JustWatch attribution. The backend therefore exposes this as regional availability metadata only, with an explicit region parameter.

A live server-side check using the saved key reference returned 187 TMDB language entries, and Fight Club details with `original_language: en` and a single `spoken_languages` entry for English. The same API response family included regional watch-provider results. The key was not written to source, client files, or logs.

## MovieBox-TUI compatibility

The [MovieBox-TUI repository](https://github.com/mesamirh/MovieBox-TUI) documents a Rust `Provider` trait for search/details and an optional `ReleaseProvider`; it is a standalone terminal client, not a server API. Its `src/providers/moviebox/adapt.rs` reads `subject.audios` and `subject.dubs[]`, where dub labels (`lanName`/`language`/`lang`) point to sibling subject IDs. The app then resolves the provider's stream and launches a local media player. This is provider metadata, not a decoded, per-file track inventory.

`src/providers/moviebox/title.rs::language_to_code` normalizes English, Spanish, Hindi, French, German, Italian, Japanese, Korean, Chinese, Portuguese, Russian, Arabic, Turkish, Bengali, Tamil, Telugu, Malayalam, Kannada, Marathi, Punjabi, Gujarati, Urdu, Indonesian, Thai, Vietnamese, Dutch, Polish, Swedish, Danish, Norwegian, Finnish, Greek, Hebrew, Czech, Hungarian, Romanian, Ukrainian, Persian, Tagalog, and Malay. That list describes code normalization only; it does not guarantee a title has those tracks. MovieBox-TUI is MIT OR Apache-2.0 licensed. This staging adapter is independently implemented against the Stremio HTTP add-on format and does not copy MovieBox-TUI code, so its source notices remain with the upstream project.
