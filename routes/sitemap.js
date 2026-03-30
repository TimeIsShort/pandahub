const express = require('express');
const db = require('../models/database');

const router = express.Router();
const BASE_URL = 'https://pandahub.cloud';

router.get('/', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM posts
      WHERE status = 'approved'
      ORDER BY created_at DESC
      LIMIT 500
    `).all();

    const tags = db.prepare(`
      SELECT id, name FROM tags
    `).all();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

    for (const tag of tags) {
      xml += `  <url>
    <loc>${BASE_URL}/#/?tag=${tag.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;
    }

    for (const post of posts) {
      const date = (post.updated_at || post.created_at).slice(0, 10);
      xml += `  <url>
    <loc>${BASE_URL}/#/post/${post.id}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('[Sitemap]', err);
    res.status(500).send('Error');
  }
});

module.exports = router;
