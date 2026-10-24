const express      = require('express');
const router       = express.Router();
const c            = require('../controllers/contentController');
const optionalAuth = require('../middlewares/optionalAuth');
const { rateLimit, timeout } = require('../middlewares/rateLimit');

const generalLimit = rateLimit({ name: 'content',     capacity: 60, refillPerSec: 1 });
const heavyLimit   = rateLimit({ name: 'media',       capacity: 20, refillPerSec: 1 / 3 });
const searchLimit  = rateLimit({ name: 'search',      capacity: 30, refillPerSec: 1 / 2 });

router.use(timeout(20_000));
router.use(generalLimit);

router.get('/providers',            c.getProviders);
router.get('/languages',            c.getLanguages);
router.get('/watch-providers',      c.getWatchProviders);
router.get('/categories',           c.getCategories);
router.get('/genres',               c.getGenres);
router.get('/home',                 optionalAuth, c.getHome);
router.get('/latest',               c.getLatest);
router.get('/search',               searchLimit, c.search);
router.get('/discover',             searchLimit, c.discover);
router.get('/detail',               optionalAuth, c.getDetail);
router.get('/episodes',             c.getEpisodes);
router.get('/media',                heavyLimit, c.getMedia);
router.get('/check-video',          c.checkVideo);
router.get('/subtitles',            generalLimit, c.getSubtitles);
router.get('/diagnose',             heavyLimit, c.diagnose);
router.get('/category/:category',   c.getCategory);
router.get('/genre/:genre',         c.getGenre);
router.get('/year/:year',           c.getYear);
router.get('/country/:country',     c.getCountry);
router.get('/actor/:actor',         c.getActor);
router.get('/director/:director',   c.getDirector);

module.exports = router;
