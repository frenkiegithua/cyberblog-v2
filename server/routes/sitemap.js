// server/routes/sitemap.js
const { prepare, exec, transaction } = require('../db');

module.exports = (req, res) => {
  const posts = prepare("SELECT slug, updated_at FROM posts WHERE status = 'published'").all();
  const base = `${req.protocol}://${req.get('host')}`;

  const staticUrls = ['/', '/blog', '/categories', '/resources', '/about', '/contact']
    .map(p => `<url><loc>${base}${p}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
    .join('\n  ');

  const postUrls = posts
    .map(p => `<url><loc>${base}/blog/${p.slug}</loc><lastmod>${p.updated_at?.slice(0,10)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`)
    .join('\n  ');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticUrls}
  ${postUrls}
</urlset>`);
};
