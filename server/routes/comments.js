// server/routes/comments.js
const router = require('express').Router();
const { prepare, exec, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// POST /api/comments — submit comment (public)
router.post('/', (req, res) => {
  const { post_id, name, email, body } = req.body;
  if (!post_id || !name || !body) return res.status(400).json({ error: 'post_id, name, body required' });
  if (body.length > 2000) return res.status(400).json({ error: 'Comment too long' });

  const post = prepare('SELECT id FROM posts WHERE id = ? AND status = "published"').get(post_id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Check if moderation is on
  const modSetting = prepare('SELECT value FROM settings WHERE key = "comment_moderation"').get();
  const autoApprove = modSetting?.value === 'false';

  prepare('INSERT INTO comments (post_id, name, email, body, approved) VALUES (?, ?, ?, ?, ?)')
    .run(post_id, escHtml(name.slice(0, 100)), email ? email.slice(0, 200) : '', escHtml(body.slice(0, 2000)), autoApprove ? 1 : 0);

  res.status(201).json({
    message: autoApprove
      ? 'Comment posted!'
      : 'Comment submitted and pending moderation. Thank you!'
  });
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────

// GET /api/comments/admin — all comments for moderation
router.get('/admin', requireAuth, (req, res) => {
  const comments = prepare(`
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM comments c JOIN posts p ON c.post_id = p.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(comments);
});

// GET /api/comments/admin/pending — pending count
router.get('/admin/pending', requireAuth, (req, res) => {
  const { count } = prepare('SELECT COUNT(*) as count FROM comments WHERE approved = 0').get();
  res.json({ count });
});

// PUT /api/comments/:id/approve
router.put('/:id/approve', requireAuth, (req, res) => {
  prepare('UPDATE comments SET approved = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Comment approved' });
});

// DELETE /api/comments/:id
router.delete('/:id', requireAuth, (req, res) => {
  prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Comment deleted' });
});

module.exports = router;
