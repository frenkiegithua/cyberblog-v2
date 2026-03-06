// server/routes/feed.js — dynamic RSS feed
const { prepare, exec, transaction } = require('../db');

module.exports = (req, res) => {
  const posts = prepare(`
    SELECT slug, title, excerpt, category, created_at
    FROM posts WHERE status = 'published'
    ORDER BY created_at DESC LIMIT 20
  `).all();

  const site = prepare("SELECT key, value FROM settings WHERE key IN ('site_title','site_description')").all();
  const s = Object.fromEntries(site.map(r => [r.key, r.value]));

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const items = posts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${baseUrl}/blog/${p.slug}</link>
      <guid>${baseUrl}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <description><![CDATA[${p.excerpt}]]></description>
      <category>${p.category}</category>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${s.site_title || 'CyberNotes'}</title>
    <link>${baseUrl}</link>
    <description>${s.site_description || 'Cybersecurity & Networking blog'}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  res.type('application/xml').send(xml);
};
