#!/usr/bin/env node
/**
 * AI日报自动发布脚本
 * 每天早上8点执行，搜索最新AI新闻并发布到论坛
 */

const https = require('https');
const http = require('http');
const db = require('../models/database');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USER = 'admin';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractTitles(xml, count = 12) {
  const titles = [];
  const regex = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g;
  let match;
  while ((match = regex.exec(xml)) !== null && titles.length < count) {
    const title = match[1] || match[2];
    // Filter out feed titles and empty entries
    if (title && !title.includes('CDATA') && title.length > 10 && 
        !title.includes('RSS') && !title.includes('Feed') &&
        title.length < 200) {
      titles.push(title.trim());
    }
  }
  return titles;
}

async function searchAInews() {
  console.log('📡 正在获取AI新闻...');
  
  const feeds = [
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', weight: 3 },
    { url: 'https://www.wired.com/feed/tag/ai/latest/rss', weight: 2 },
    { url: 'https://feeds.feedburner.com/techcrunch/AI', weight: 2 },
  ];
  
  let allNews = [];
  
  for (const feed of feeds) {
    try {
      const xml = await httpGet(feed.url);
      const titles = extractTitles(xml, feed.weight * 4);
      allNews = allNews.concat(titles.map(t => ({ title: t, source: feed.url.includes('techcrunch') ? 'TechCrunch' : 'Wired' })));
    } catch (e) {
      console.log(`⚠️ 获取失败: ${feed.url}`);
    }
  }
  
  // Deduplicate and shuffle
  const seen = new Set();
  allNews = allNews.filter(n => {
    const key = n.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Shuffle
  allNews.sort(() => Math.random() - 0.5);
  
  console.log(`✅ 获取到 ${allNews.length} 条新闻`);
  return allNews.slice(0, 15);
}

function formatNewsContent(newsItems) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  
  // Categorize news
  const categories = {
    '🏢 企业动向': [],
    '💰 融资并购': [],
    '🛠️ 技术产品': [],
    '⚖️ 政策安全': [],
    '📌 行业观察': []
  };
  
  const keywords = {
    '🏢 企业动向': ['OpenAI', 'Google', 'Microsoft', 'Meta', 'Apple', 'Amazon', 'Anthropic', 'Nvidia', 'Tesla', '字节', '腾讯', '阿里', '百度'],
    '💰 融资并购': ['融资', '投资', '收购', 'funding', 'raises', 'acquires', 'million', 'billion'],
    '🛠️ 技术产品': ['launch', 'release', 'new', 'model', '更新', '发布', '上线', '功能'],
    '⚖️ 政策安全': ['安全', '监管', 'policy', 'regulation', 'ban', 'lawsuit', ' FTC', '欧盟'],
    '📌 行业观察': []
  };
  
  for (const item of newsItems) {
    let categorized = false;
    const title = item.title;
    
    for (const [cat, kws] of Object.entries(keywords)) {
      if (cat === '📌 行业观察') continue;
      for (const kw of kws) {
        if (title.includes(kw)) {
          categories[cat].push(item);
          categorized = true;
          break;
        }
      }
      if (categorized) break;
    }
    
    if (!categorized) {
      categories['📌 行业观察'].push(item);
    }
  }
  
  // Build content
  let content = `🤖 AI科技早报\n\n📅 ${dateStr}\n\n━━━━━━━━━━━━━━━━\n\n`;
  
  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    content += `${cat}\n`;
    items.slice(0, 4).forEach(item => {
      content += `• ${item.title}\n`;
    });
    content += '\n';
  }
  
  content += `━━━━━━━━━━━━━━━━\n\n📡 数据来源：TechCrunch、Wired 等 | 关注AI最新动态\n`;
  
  return content;
}

async function getAdminToken() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 未配置，无法生成管理员令牌');
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(ADMIN_USER);
  if (!user) throw new Error('Admin user not found');
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
}

async function createPost(token, title, content, tagId = 1) {
  const payload = JSON.stringify({ title, content, tag_id: tagId });
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/posts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    console.log('🤖 AI日报发布任务开始...');
    
    // Check if already posted today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    
    const existing = db.prepare(`
      SELECT id FROM posts 
      WHERE title LIKE '📰 AI日报%' 
      AND created_at >= ?
    `).get(todayStr);
    
    if (existing) {
      console.log('⏭️ 今日已发布AI日报，跳过');
      return;
    }
    
    // Search news
    const news = await searchAInews();
    if (news.length === 0) {
      console.log('❌ 获取新闻失败，退出');
      process.exit(1);
    }
    
    // Format content
    const title = `📰 AI日报 | ${new Date().toLocaleDateString('zh-CN')}`;
    const content = formatNewsContent(news);
    
    // Get admin token and post
    const token = await getAdminToken();
    const result = await createPost(token, title, content);
    
    if (result.post) {
      console.log(`✅ AI日报发布成功！帖子ID: ${result.post.id}`);
    } else {
      console.log('❌ 发布失败:', result.error);
      process.exit(1);
    }
    
  } catch (e) {
    console.error('❌ 任务失败:', e.message);
    process.exit(1);
  }
}

main();
