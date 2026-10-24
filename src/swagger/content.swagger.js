const categoryEnum = [
  'tarjima-kinolar', 'xorij-kinolar', 'rus-kinolar',
  'seriallar', 'multfilmlar', 'treylerlar',
];

const pageParam = {
  in: 'query', name: 'page',
  schema: { type: 'integer', default: 1, minimum: 1 },
  description: 'Sahifa raqami',
};

const providerParam = {
  in: 'query', name: 'provider',
  schema: {
    type: 'string',
    default: 'asilmedia',
    enum: ['asilmedia', 'anikai', 'idub', 'mochitv', 'uzmovi', 'vidapi', 'vidsrc', 'animeav1', 'stremio'],
    example: 'asilmedia',
  },
  description: 'Kontent manbai (default: asilmedia)',
};

module.exports = {
  tags: [{ name: 'Contents', description: 'Multi-provider real-time kontent' }],
  paths: {
    '/contents/providers': {
      get: {
        tags: ['Contents'],
        summary: 'Mavjud providerlar ro\'yxati',
        responses: {
          200: {
            description: 'Providerlar',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'stremio' },
                          name: { type: 'string', example: 'Worldwide' },
                          image: { type: 'string', nullable: true },
                          logo: { type: 'string', nullable: true },
                          url: { type: 'string' },
                          description: { type: 'string' },
                          domains: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/contents/languages': {
      get: {
        tags: ['Contents'],
        summary: 'Global language choices for Settings',
        description: 'Returns TMDB\'s ISO 639-1 language catalogue for Settings. It is not a list of playable audio tracks and does not guarantee dubbing or a stream in those languages.',
        responses: {
          200: {
            description: 'TMDB language catalogue',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', example: 'hi' },
                          englishName: { type: 'string', example: 'Hindi' },
                          label: { type: 'string', example: 'Hindi' },
                          name: { type: 'string', example: 'हिन्दी' },
                        },
                      },
                    },
                    source: { type: 'string' },
                    note: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/contents/watch-providers': {
      get: {
        tags: ['Contents'],
        summary: 'Regional legal streaming availability hints',
        description: 'Reads TMDB/JustWatch availability for a TMDB movie or TV URL and an explicit region. It returns service names and a TMDB watch page, not a direct video URL or audio-track inventory. Attribute availability data to JustWatch.',
        parameters: [
          {
            in: 'query', name: 'url', required: true,
            schema: { type: 'string' },
            description: 'TMDB movie or TV URL',
          },
          {
            in: 'query', name: 'region', required: true,
            schema: { type: 'string', pattern: '^[A-Za-z]{2}$', example: 'IN' },
            description: 'Two-letter ISO 3166-1 country code; region is explicit, not inferred from location.',
          },
        ],
        responses: {
          200: {
            description: 'Regional provider availability metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    region: { type: 'string', example: 'IN' },
                    providers: { type: 'array', items: { type: 'object' } },
                    tmdbLink: { type: 'string', nullable: true },
                    source: { type: 'string', example: 'JustWatch availability data via TMDB' },
                    attribution: { type: 'string' },
                    note: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/contents/categories': {
      get: {
        tags: ['Contents'],
        summary: 'Provider kategoriyalar ro\'yxati',
        parameters: [providerParam],
        responses: {
          200: {
            description: 'Kategoriyalar',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          provider: { type: 'string', example: 'asilmedia' },
                          slug:     { type: 'string' },
                          path:     { type: 'string' },
                          url:      { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/contents/genres': {
      get: {
        tags: ['Contents'],
        summary: 'Provider janrlar ro\'yxati',
        parameters: [providerParam],
        responses: {
          200: {
            description: 'Janrlar',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          provider: { type: 'string', example: 'asilmedia' },
                          slug:     { type: 'string', example: 'drama' },
                          url:      { type: 'string', example: 'https://asilmedia.org/xfsearch/genre/drama/' },
                          image:    { type: 'string', nullable: true, example: 'https://placehold.co/400x225/2d3561/ffffff?text=Drama' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/contents/home': {
      get: {
        tags: ['Contents'],
        summary: 'Bosh sahifa — barcha bo\'limlar (parallel, keshli)',
        description: 'Bir so\'rovda latest, seriallar, tarjima kinolar va multfilmlarning dastlabki 12 tasini qaytaradi.',
        parameters: [providerParam],
        responses: {
          200: {
            description: 'Bosh sahifa ma\'lumotlari',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    provider: { type: 'string', example: 'asilmedia' },
                    banner:   { type: 'array', items: { $ref: '#/components/schemas/BannerCard' }, description: 'Hero slider — ContentCard + genres' },
                    sections: { type: 'array', items: { $ref: '#/components/schemas/HomeSection' }, description: 'Har provider o\'z tartibi va labelini belgilaydi' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/latest': {
      get: {
        tags: ['Contents'],
        summary: 'Eng yangi kontentlar',
        parameters: [providerParam, pageParam],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/search': {
      get: {
        tags: ['Contents'],
        summary: 'Kontent qidirish',
        parameters: [
          providerParam,
          {
            in: 'query', name: 'q', required: true,
            schema: { type: 'string', minLength: 2 },
            description: 'Qidiruv so\'zi (kamida 2 belgi)',
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Qidiruv natijalari',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/detail': {
      get: {
        tags: ['Contents'],
        summary: 'Kontent metadatasi — yengil va tez',
        description: 'Faqat metadata: title, description, cast, screenshots, related va isSerial flag. Epizodlar yoki video manbalari uchun /contents/episodes ga murojaat qiling. Stremio/TMDB URL larida `provider=stremio` ni yuboring, chunki TMDB URL bir nechta providerda ishlatiladi. Authorization header berilsa `isFavorited` ham qaytadi.',
        security: [{}, { BearerAuth: [] }],
        parameters: [
          {
            in: 'query', name: 'url', required: true,
            schema: { type: 'string' },
            description: 'Kontent URL (istalgan provider)',
            example: 'https://asilmedia.org/17987-arosat-oramizda.html',
          },
          {
            in: 'query', name: 'provider',
            schema: { type: 'string', example: 'stremio' },
            description: 'Optional explicit provider. Required for TMDB URLs used by the Worldwide profile.',
          },
        ],
        responses: {
          200: {
            description: 'Kontent metadatasi',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentDetail' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/episodes': {
      get: {
        tags: ['Contents'],
        summary: 'Ijro payloadi — epizodlar (serial) yoki video manbalari (kino)',
        description: "Detail dan alohida endpoint, chunki ayrim providerlar epizodlarni alohida so'rovda olib keladi. Serial bo'lsa `episodes` (lazy `mediaRef` bilan, paginated), kino bo'lsa `videoSources` + `playerSrc` qaytaradi. Worldwide/TMDB kontentida `provider=stremio` ni aniq yuboring.\n\n**Pagination & sort** (faqat serial uchun):\n- `page` (default 1) va `size` (default 100, max 500) — One Piece kabi 1000+ epizodli serial uchun.\n- `sort=asc` (1 → N, default) yoki `sort=desc` (N → 1) — masalan, oxirgi epizoddan boshlab ko'rish uchun.",
        parameters: [
          {
            in: 'query', name: 'url', required: true,
            schema: { type: 'string' },
            description: 'Kontent URL (istalgan provider)',
            example: 'https://asilmedia.org/17987-arosat-oramizda.html',
          },
          {
            in: 'query', name: 'page',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Sahifa raqami (faqat serial uchun)',
          },
          {
            in: 'query', name: 'size',
            schema: { type: 'integer', default: 100, minimum: 1, maximum: 500 },
            description: 'Sahifadagi epizodlar soni',
          },
          {
            in: 'query', name: 'sort',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            description: "asc = 1→N (default), desc = N→1",
          },
          {
            in: 'query', name: 'provider',
            schema: { type: 'string', example: 'stremio' },
            description: 'Provider name from the content detail response; required when the content URL is shared by multiple providers.',
          },
          {
            in: 'query', name: 'lang',
            schema: { type: 'string', example: 'hi' },
            description: 'Optional language preference. Stremio matches only explicit add-on stream labels; AnimeKAI uses sub/softsub/dub.',
          },
          {
            in: 'query', name: 'server',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Optional source index (1-based) after language filtering.',
          },
        ],
        responses: {
          200: {
            description: 'Ijro payloadi',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/EpisodesPayload' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          501: { description: "Provider epizodlarni qo'llab-quvvatlamaydi" },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/media': {
      get: {
        tags: ['Contents'],
        summary: 'Epizod video URL ni yechish (lazy load)',
        description: 'Detail dagi `mediaRef` ni real video URL ga aylantiradi. Serial epizodini ijro etish oldidan chaqiriladi. Provider o\'z mantig\'ini implement qiladi — boshqa provider uchun alohida HTML so\'rov yuborilishi mumkin.',
        parameters: [
          {
            in: 'query', name: 'ref', required: true,
            schema: { type: 'string' },
            description: 'Detail epizodidagi `mediaRef` qiymati',
          },
          {
            in: 'query', name: 'provider', required: true,
            schema: { type: 'string', example: 'asilmedia' },
            description: 'Provider nomi (detail responsedagi `provider` field)',
          },
          {
            in: 'query', name: 'lang', required: false,
            schema: { type: 'string', example: 'hi' },
            description: 'Provider qo\'llasa: AnimeKAI `sub|softsub|dub` rejimini, Stremio esa ISO 639-1 audio-language kodini (masalan `hi`, `en`) qabul qiladi. Stremio faqat add-on matnida aniq ko\'rsatilgan tilga moslaydi.',
          },
          {
            in: 'query', name: 'server', required: false,
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Provider qo\'llasa: server tartib raqami (1, 2...). Default 1.',
          },
        ],
        responses: {
          200: {
            description: 'Video URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    videoUrl:  { type: 'string', description: 'To\'g\'ridan-to\'g\'ri ijro etiluvchi video URL (MP4, M3U8...)' },
                    type:      { type: 'string', nullable: true, example: 'hls' },
                    headers:   {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      description: 'Playerga uzatish kerak bo\'lgan HTTP headerlar (Referer, User-Agent...). Hotlink himoyasidan o\'tish uchun majburiy.',
                      example: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0)...', 'Referer': 'https://asilmedia.org/' },
                    },
                    subtitles: {
                      type: 'array', nullable: true,
                      description: 'Provider qo\'llasa: tashqi subtitr fayllari',
                      items: {
                        type: 'object',
                        properties: {
                          label:   { type: 'string' },
                          file:    { type: 'string' },
                          kind:    { type: 'string', example: 'captions' },
                          default: { type: 'boolean' },
                        },
                      },
                    },
                    skip: {
                      type: 'object', nullable: true,
                      description: 'Provider qo\'llasa: intro/outro skip vaqtlari (sekund)',
                      properties: {
                        intro: { type: 'array', items: { type: 'integer' } },
                        outro: { type: 'array', items: { type: 'integer' } },
                      },
                    },
                    server: {
                      type: 'object', nullable: true,
                      description: 'Provider qo\'llasa: tanlangan server',
                      properties: {
                        name: { type: 'string' },
                        sid:  { type: 'integer' },
                        lang: { type: 'string' },
                      },
                    },
                    languagesAvailable: {
                      type: 'array', nullable: true,
                      description: 'Provider metadata-sida shu ijro javobi uchun tanilgan audio til kodlari; to\'liq audio-trek tekshiruvi emas.',
                      items: { type: 'string', example: 'hi' },
                    },
                    audioLanguages: {
                      type: 'array', nullable: true,
                      description: 'Tanlangan oqimning add-on metadata-sidan aniqlangan til kodlari.',
                      items: { type: 'string', example: 'hi' },
                    },
                    multiAudioAvailable: {
                      type: 'boolean', nullable: true,
                      description: 'At least one add-on stream is labeled Multi/Dual Audio; this does not identify or verify individual tracks.',
                    },
                    languageSource: {
                      type: 'string', nullable: true,
                      description: 'Til yorlig\'ining kelib chiqishi; Stremio uchun add-on stream nomi/title/description/filename.',
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          422: { description: 'Video URL aniqlanmadi' },
          501: { description: 'Provider media yechishni qo\'llab-quvvatlamaydi' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/check-video': {
      get: {
        tags: ['Contents'],
        summary: 'Video URL mavjudligini tekshirish (HEAD so\'rovi)',
        description: 'Provider `url` dan avtomatik aniqlanadi.',
        parameters: [
          {
            in: 'query', name: 'url', required: true,
            schema: { type: 'string' },
            description: 'MP4 yoki boshqa video URL',
            example: 'https://fayllar1.ru/37/Seriallar/Arosat/Arosat%201-1-qism.mp4',
          },
        ],
        responses: {
          200: {
            description: 'Video meta ma\'lumotlari',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessible:    { type: 'boolean' },
                    status:        { type: 'integer' },
                    contentType:   { type: 'string', nullable: true },
                    contentLength: { type: 'integer', nullable: true },
                    acceptRanges:  { type: 'string', nullable: true },
                    error:         { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },

    '/contents/category/{category}': {
      get: {
        tags: ['Contents'],
        summary: 'Kategoriya bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'category', required: true,
            schema: { type: 'string', enum: categoryEnum },
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/genre/{genre}': {
      get: {
        tags: ['Contents'],
        summary: 'Janr bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'genre', required: true,
            schema: { type: 'string' },
            example: 'drama',
            description: 'boevik | komediya | drama | melodrama | triller | ...',
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/year/{year}': {
      get: {
        tags: ['Contents'],
        summary: 'Yil bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'year', required: true,
            schema: { type: 'integer' },
            example: 2025,
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/country/{country}': {
      get: {
        tags: ['Contents'],
        summary: 'Mamlakat bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'country', required: true,
            schema: { type: 'string' },
            example: 'турция',
            description: 'Mamlakat nomi (masalan: турция, корея, хиндистон)',
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/actor/{actor}': {
      get: {
        tags: ['Contents'],
        summary: 'Aktyor bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'actor', required: true,
            schema: { type: 'string' },
            example: 'Miray Dogan',
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },

    '/contents/director/{director}': {
      get: {
        tags: ['Contents'],
        summary: 'Rejissyor bo\'yicha kontentlar',
        parameters: [
          providerParam,
          {
            in: 'path', name: 'director', required: true,
            schema: { type: 'string' },
            example: 'Oguzhan Denizhan',
          },
          pageParam,
        ],
        responses: {
          200: {
            description: 'Kontentlar',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentList' } } },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          502: { $ref: '#/components/responses/BadGateway' },
        },
      },
    },
  },
};
