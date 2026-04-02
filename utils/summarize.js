/**
 * Post Summarization Utility
 * Auto-generates a short summary for posts using AI
 */

const MINIMAX_BASE_URL = String(process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com').replace(/\/+$/, '');
const MINIMAX_API_URL = `${MINIMAX_BASE_URL}/v1/text/chatcompletion_v2`;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_MODEL = 'MiniMax-M2.7';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[#*_~>-]/g, '') // markdown chars
    .replace(/\n+/g, ' ') // newlines
    .trim();
}

/**
 * Generate a short summary for a post
 * @param {string} title - Post title
 * @param {string} content - Post content (markdown)
 * @returns {Promise<string>} - Summary text (30-60 chars)
 */
async function generatePostSummary(title, content) {
  // Strip markdown and limit content
  const cleanContent = stripMarkdown(content || '').substring(0, 800);
  const text = `标题：${title || '(无标题)'}\n内容：${cleanContent}`;

  // Fallback: use first sentence of content
  function simpleSummary() {
    const firstSentence = (cleanContent.split(/[。！？.!?]/)[0] || '').trim();
    if (firstSentence.length < 10) {
      return cleanContent.substring(0, 50) + (cleanContent.length > 50 ? '...' : '');
    }
    return firstSentence.substring(0, 60) + (firstSentence.length > 60 ? '...' : '');
  }

  if (!MINIMAX_API_KEY) {
    return simpleSummary();
  }

  const prompt = `你是一个帖子摘要助手。为以下帖子生成一句简短摘要（30-60字），概括核心内容，不要标题复述。

标题：${title || '(无标题)'}
内容：${cleanContent}

要求：
1. 直接输出摘要，不要前缀或解释
2. 30-60字
3. 概括帖子核心内容或最有价值的信息
4. 如果内容太短无法概括，输出"暂无摘要"

示例：
输入：分享一个React性能优化的技巧，包括useMemo、useCallback等
输出：React性能优化实战总结，详解useMemo、useCallback等Hooks的使用场景和注意事项

输入：有人知道怎么在Linux下配置Nginx反向代理吗？
输出：Linux+Nginx反向代理配置指南，涵盖代理转发和负载均衡的基础设置

输入：今天天气真好
输出：暂无摘要`;

  const messages = [{ role: 'user', content: prompt }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_API_KEY}`
        },
        body: JSON.stringify({
          model: MINIMAX_MODEL,
          messages,
          temperature: 0.3,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timer);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.warn('[Summarize] AI API error:', data?.error?.message || `HTTP ${response.status}`);
        if (attempt < 2) { await sleep(500); continue; }
        return simpleSummary();
      }

      let text = '';
      if (data.choices?.[0]?.messages?.[0]?.content) {
        text = data.choices[0].messages[0].content.trim();
      } else if (data.choices?.[0]?.text) {
        text = data.choices[0].text.trim();
      }

      if (!text || text === '暂无摘要' || text.length < 5) {
        if (attempt < 2) { await sleep(300); continue; }
        return simpleSummary();
      }

      // Limit to 60 chars
      return text.substring(0, 80);

    } catch (err) {
      console.warn('[Summarize] Attempt', attempt, 'failed:', err.message);
      if (attempt < 2) { await sleep(500); }
    }
  }

  return simpleSummary();
}

module.exports = { generatePostSummary };
