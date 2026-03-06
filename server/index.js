// server/index.js — CyberNotes Backend
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts. Wait 15 minutes.' } });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Wait for DB before registering routes
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Auto-initialize database if it doesn't exist
const dbPath = path.join(dataDir, 'blog.db');
if (!fs.existsSync(dbPath)) {
  console.log('Database not found, initializing...');
  require('./setup-db.js');
}

initDB().then(() => {
  console.log('✓ Database ready');

  app.use('/api/auth',     require('./routes/auth'));
  app.use('/api/posts',    require('./routes/posts'));
  app.use('/api/comments', require('./routes/comments'));
  app.use('/api/admin',    require('./routes/admin'));
  app.use('/api/settings', require('./routes/settings'));

  app.get('/feed.xml',    require('./routes/feed'));
  app.get('/sitemap.xml', require('./routes/sitemap'));

  app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: 'Internal server error' }); });

  app.listen(PORT, () => {
    console.log(`\n🚀 CyberNotes running at http://localhost:${PORT}`);
    console.log(`   Blog:  http://localhost:${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin`);
    console.log(`   API:   http://localhost:${PORT}/api\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
