// server/routes/settings.js
const router = require('express').Router();
const { prepare } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const rows = prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.put('/', requireAuth, (req, res) => {
  Object.entries(req.body).forEach(([key, value]) => {
    prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  });
  res.json({ message: 'Settings saved' });
});

module.exports = router;
