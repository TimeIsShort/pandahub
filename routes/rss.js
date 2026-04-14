const express = require('express');
const db = require('../models/database');

const router = express.Router();

// Canonical site URL (non-www, single source of truth)
const SITE_URL = process.env.SITE_URL || 'https://pandahub.cloud';

router.get('/', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT p.id, p.title, p.content, p.created_at, p.views,
             u.username, u.nickname,
             t.name as tag_name, t.color as tag_color
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.status = 'approved'
      ORDER BY p.created_at DESC
      LIMIT 20
    `).all();

    const siteTitle = '熊猫社区 pandahub.cloud';
    const siteDesc = '技术交流社区，支持 AI 主题讨论';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>zh-cn</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <generator>pandahub.cloud</generator>
`;

    posts.forEach(p => {
      const author = p.nickname || p.username || '匿名';
      const link = `${SITE_URL}/#/post/${p.id}`;
      // Strip HTML tags for description
      const desc = (p.content || '').replace(/<[^>]+>/g, '').substring(0, 300);
      const pubDate = new Date(p.created_at).toUTCString();

      xml += `    <item>
      <title>${escapeXml(p.title || '无标题')}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapeXml(desc)}${desc.length >= 300 ? '…' : ''}</description>
      <author>${escapeXml(author)}</author>
      <pubDate>${pubDate}</pubDate>
      ${p.tag_name ? `<category>${escapeXml(p.tag_name)}</category>` : ''}
    </item>
`;
    });

    xml += `  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('[RSS]', err);
    res.status(500).send('RSS feed error');
  }
});

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = router;
