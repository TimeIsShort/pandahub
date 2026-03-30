const db = require('../models/database');

const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || '';
const BAILIAN_BASE_URL = (process.env.BAILIAN_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1').replace(/\/+$/, '');

const MODERATION_PROMPT = `你是一个严格的内容安全审核员。请判断以下帖子内容是否适合在社区发布。

判断标准：
- ✅ 通过：正常讨论、提问、分享经验、技术交流
- ❌ 拒绝：垃圾广告、敏感政治内容、色情低俗、人身攻击、违法信息、明显引战

请从以下三个标签中选择一个回复（只回复标签，不要其他内容）：
[APPROVED] - 内容安全，可以通过
[REJECTED] - 内容违规，必须拒绝
[MANUAL_REVIEW] - 内容可疑，需要人工审核

帖子标题：{title}
帖子内容：{content}`;

async function callBailianModeration(title, content) {
  if (!BAILIAN_API_KEY) {
    console.warn('[AutoMod] Bailian API 未配置，跳过自动审核');
    return null;
  }

  const prompt = MODERATION_PROMPT
    .replace('{title}', title || '(无标题)')
    .replace('{content}', content || '(无内容)');

  try {
    const response = await fetch(`${BAILIAN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BAILIAN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error('[AutoMod] Bailian API 错误:', response.status);
      return null;
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';
    return result;
  } catch (err) {
    console.error('[AutoMod] 调用失败:', err.message);
    return null;
  }
}

function parseModerationResult(raw) {
  if (!raw) return 'error';
  if (raw.includes('[APPROVED]')) return 'approved';
  if (raw.includes('[REJECTED]')) return 'rejected';
  if (raw.includes('[MANUAL_REVIEW]')) return 'manual_review';
  return 'error';
}

module.exports = { callBailianModeration, parseModerationResult };
