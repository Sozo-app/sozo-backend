require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./src/config/db');
const swaggerSpec = require('./src/config/swagger');
const { loadShed } = require('./src/middlewares/loadShed');

const authRoutes    = require('./src/routes/auth');
const contentRoutes = require('./src/routes/content');
const commentRoutes = require('./src/routes/comments');
const shortsRoutes  = require('./src/routes/shorts');
const adminRoutes   = require('./src/routes/admin/index');

const app = express();

// Nginx orqasida ishlaganda real IP olish
app.set('trust proxy', 1);

app.use(loadShed({ softMs: 2000, hardMs: 8000 }));
app.use(cors(process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN.split(','), credentials: true }
  : {}
));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const CACHE_RULES = [
  { test: /^\/api\/contents\/home$/,       maxAge: 300, swr: 600 },
  { test: /^\/api\/contents\/latest$/,     maxAge: 180, swr: 600 },
  { test: /^\/api\/contents\/category\//,  maxAge: 600, swr: 1800 },
  { test: /^\/api\/contents\/genre\//,     maxAge: 600, swr: 1800 },
  { test: /^\/api\/contents\/year\//,      maxAge: 1800, swr: 3600 },
  { test: /^\/api\/contents\/country\//,   maxAge: 1800, swr: 3600 },
  { test: /^\/api\/contents\/categories$/, maxAge: 3600, swr: 86400 },
  { test: /^\/api\/contents\/genres$/,     maxAge: 3600, swr: 86400 },
  { test: /^\/api\/contents\/providers$/,  maxAge: 3600, swr: 86400 },
  { test: /^\/api\/contents\/languages$/,  maxAge: 86400, swr: 172800 },
  { test: /^\/api\/contents\/watch-providers$/, maxAge: 3600, swr: 7200 },
  { test: /^\/api\/contents\/detail$/,     maxAge: 600, swr: 1800 },
  { test: /^\/api\/contents\/search$/,     maxAge: 60, swr: 300 },
];
const NO_STORE_PATHS = [
  /^\/api\/contents\/episodes$/,
  /^\/api\/contents\/media$/,
];
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.headers.authorization) {
    res.setHeader('Cache-Control', 'private, no-store');
    return next();
  }
  if (NO_STORE_PATHS.some((pattern) => pattern.test(req.path))) {
    res.setHeader('Cache-Control', 'private, no-store');
    return next();
  }
  for (const rule of CACHE_RULES) {
    if (rule.test.test(req.path)) {
      res.setHeader('Cache-Control', `public, max-age=${rule.maxAge}, stale-while-revalidate=${rule.swr}`);
      break;
    }
  }
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth',     authRoutes);
app.use('/api/contents', contentRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/shorts',   shortsRoutes);
app.use('/api/admin',    adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {

  if (res.headersSent || res.locals?.timedOut) {
    return next(err);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || '';
    const friendly = {
      email:       'Email already in use',
      username:    'Username already taken',
      firebaseUid: 'Google account already linked to another user',
    };
    return res.status(409).json({ message: friendly[field] || 'An account with these details already exists' });
  }
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server:  http://localhost:${PORT}`);
    console.log(`Swagger: http://localhost:${PORT}/api-docs`);
  });

  // Graceful shutdown — Docker stop signali kelganda DB ulanishni to'g'ri yopish
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(() => {
      const mongoose = require('mongoose');
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB disconnected');
        process.exit(0);
      });
    });
    // 10 sekund kutib force exit
    setTimeout(() => process.exit(0), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
