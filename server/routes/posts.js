// server/routes/posts.js
const router = require('express').Router();
const { prepare, exec, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { marked } = require('marked');

// Configure marked for safe rendering
marked.setOptions({ breaks: true, gfm: true });

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function estimateReadTime(content) {
  const words = content.split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

// ── PUBLIC ROUTES ────────────────────────────────────────────────────────

// GET /api/posts — list published posts
router.get('/', (req, res) => {
  const { category, tag, search, page = 1, limit = 10, featured } = req.query;
  let sql = 'SELECT id, slug, title, excerpt, category, tags, read_time, views, featured, created_at FROM posts WHERE status = "published"';
  const params = [];

  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (featured === 'true') { sql += ' AND featured = 1'; }
  if (search) { sql += ' AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ?)'; const q = `%${search}%`; params.push(q, q, q); }
  if (tag) { sql += ' AND tags LIKE ?'; params.push(`%${tag}%`); }

  // Count total
  const countSql = sql.replace('SELECT id, slug, title, excerpt, category, tags, read_time, views, featured, created_at', 'SELECT COUNT(*) as total');
  const countRow = prepare(countSql).get(...params);
  const total = countRow ? countRow.total : 0;

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const posts = prepare(sql).all(...params).map(p => ({
    ...p,
    tags: JSON.parse(p.tags || '[]')
  }));

  res.json({ posts, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/posts/categories — post count per category
router.get('/categories', (req, res) => {
  const rows = prepare(`
    SELECT category, COUNT(*) as count FROM posts
    WHERE status = 'published' GROUP BY category
  `).all();
  res.json(rows);
});
// Admin: get single post by ID (includes drafts)
router.get('/admin/:id', async (req, res) => {
  try {
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /api/posts/:slug — single published post
router.get('/:slug', (req, res) => {
  const post = prepare('SELECT * FROM posts WHERE slug = ? AND status = "published"').get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Increment view count
  prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);

  // Render markdown to HTML
  const html = marked.parse(post.content);

  // Get approved comments
  const comments = prepare(`
    SELECT id, name, body, created_at FROM comments
    WHERE post_id = ? AND approved = 1 ORDER BY created_at ASC
  `).all(post.id);

  res.json({
    ...post,
    tags: JSON.parse(post.tags || '[]'),
    content_html: html,
    comments
  });
});

// ── ADMIN ROUTES (protected) ─────────────────────────────────────────────

// GET /api/posts/admin/all — all posts including drafts
router.get('/admin/all', requireAuth, (req, res) => {
  const posts = prepare(`
    SELECT id, slug, title, category, status, featured, views, created_at, updated_at
    FROM posts ORDER BY created_at DESC
  `).all();
  res.json(posts);
});

// POST /api/posts — create post
router.post('/', requireAuth, (req, res) => {
  const { title, excerpt, content, category, tags = [], status = 'draft', featured = false } = req.body;
  if (!title || !excerpt || !content || !category) return res.status(400).json({ error: 'title, excerpt, content, category are required' });

  let slug = slugify(title);
  // Ensure unique slug
  const existing = prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  if (existing) slug += '-' + Date.now().toString(36);

  const read_time = estimateReadTime(content);
  const result = prepare(`
    INSERT INTO posts (slug, title, excerpt, content, category, tags, status, featured, read_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, title, excerpt, content, category, JSON.stringify(tags), status, featured ? 1 : 0, read_time);

  const post = prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...post, tags: JSON.parse(post.tags) });
});

// PUT /api/posts/:id — update post
router.put('/:id', requireAuth, (req, res) => {
  const { title, excerpt, content, category, tags, status, featured } = req.body;
  const post = prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const updated = {
    title: title ?? post.title,
    excerpt: excerpt ?? post.excerpt,
    content: content ?? post.content,
    category: category ?? post.category,
    tags: JSON.stringify(tags ?? JSON.parse(post.tags)),
    status: status ?? post.status,
    featured: featured !== undefined ? (featured ? 1 : 0) : post.featured,
    read_time: content ? estimateReadTime(content) : post.read_time
  };

  prepare(`
    UPDATE posts SET title=?, excerpt=?, content=?, category=?, tags=?, status=?, featured=?, read_time=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(updated.title, updated.excerpt, updated.content, updated.category, updated.tags, updated.status, updated.featured, updated.read_time, req.params.id);

  const result = prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  res.json({ ...result, tags: JSON.parse(result.tags) });
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, (req, res) => {
  const post = prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Post deleted' });
});

module.exports = router;
