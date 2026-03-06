// server/routes/admin.js
const router = require('express').Router();
const { prepare, exec, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/admin/stats — dashboard overview
router.get('/stats', requireAuth, (req, res) => {
  const totalPosts = prepare('SELECT COUNT(*) as c FROM posts').get().c;
  const published = prepare('SELECT COUNT(*) as c FROM posts WHERE status = "published"').get().c;
  const drafts = prepare('SELECT COUNT(*) as c FROM posts WHERE status = "draft"').get().c;
  const totalViews = prepare('SELECT COALESCE(SUM(views), 0) as c FROM posts').get().c;
  const totalComments = prepare('SELECT COUNT(*) as c FROM comments').get().c;
  const pendingComments = prepare('SELECT COUNT(*) as c FROM comments WHERE approved = 0').get().c;

  const topPosts = prepare(`
    SELECT id, slug, title, views, created_at FROM posts
    WHERE status = 'published' ORDER BY views DESC LIMIT 5
  `).all();

  const recentPosts = prepare(`
    SELECT id, slug, title, status, created_at FROM posts
    ORDER BY created_at DESC LIMIT 5
  `).all();

  const recentComments = prepare(`
    SELECT c.id, c.name, c.body, c.approved, c.created_at, p.title as post_title
    FROM comments c JOIN posts p ON c.post_id = p.id
    ORDER BY c.created_at DESC LIMIT 5
  `).all();

  const byCategory = prepare(`
    SELECT category, COUNT(*) as count FROM posts
    WHERE status = 'published' GROUP BY category
  `).all();

  res.json({
    stats: { totalPosts, published, drafts, totalViews, totalComments, pendingComments },
    topPosts,
    recentPosts,
    recentComments,
    byCategory
  });
});

module.exports = router;
