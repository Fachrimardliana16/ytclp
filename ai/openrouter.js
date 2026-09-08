'use strict';

const https = require('https');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

function isOpenRouterConfigured() {
  return !!OPENROUTER_KEY;
}

// ===== Call OpenRouter API =====
async function chat(messages, { temperature = 0.7, max_tokens = 1024 } = {}) {
  if (!OPENROUTER_KEY) throw new Error('OpenRouter API key not configured');

  const body = JSON.stringify({
    model: MODEL,
    messages,
    temperature,
    max_tokens,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://ytclipper.com',
        'X-Title': 'YT Clipper',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'OpenRouter error'));
          resolve(json.choices?.[0]?.message?.content || '');
        } catch (e) {
          reject(new Error('Failed to parse OpenRouter response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenRouter timeout')); });
    req.write(body);
    req.end();
  });
}

// ===== AI Highlight Scoring =====
async function scoreHighlights(transcript, clipLength) {
  const text = transcript.map((s, i) => `[${i}] ${(s.offset/1000).toFixed(1)}s-${((s.offset+s.duration)/1000).toFixed(1)}s: ${s.text}`).join('\n');

  const prompt = `You are a video highlight detector. Given a transcript with timestamps, identify the ${Math.ceil(300/clipLength)} most engaging segments for short-form video (TikTok/Reels/Shorts).

Transcript:
${text}

For each segment, return JSON array:
[{"start": seconds, "end": seconds, "score": 1-100, "title": "catchy title", "reason": "why engaging"}]

Rules:
- Segments should be ${clipLength} seconds long
- Prioritize: emotional moments, surprising facts, funny parts, key takeaways
- Score based on engagement potential (hook factor, shareability)
- Return ONLY valid JSON, no markdown`;

  const response = await chat([
    { role: 'system', content: 'You are a video content analyst. Return only valid JSON arrays.' },
    { role: 'user', content: prompt }
  ], { temperature: 0.3, max_tokens: 2048 });

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

// ===== AI Title Generation =====
async function generateTitle(transcriptText, style = 'catchy') {
  const styles = {
    catchy: 'Generate a catchy, clickbait-worthy short video title (max 60 chars). Use emojis sparingly.',
    professional: 'Generate a professional, informative title (max 60 chars).',
    funny: 'Generate a funny, humorous title (max 60 chars).',
    viral: 'Generate a viral-worthy title with shock value (max 60 chars).',
  };

  const prompt = `Given this transcript excerpt:
"${transcriptText.substring(0, 500)}"

${styles[style] || styles.catchy}

Return ONLY the title text, no quotes, no explanation.`;

  const response = await chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.8, max_tokens: 100 });

  return response.trim().replace(/^["']|["']$/g, '').substring(0, 60);
}

// ===== AI Caption Style Suggestion =====
async function suggestCaptionStyle(transcriptText, platform = 'tiktok') {
  const prompt = `Given this transcript excerpt from a short video:
"${transcriptText.substring(0, 300)}"

Platform: ${platform}

Suggest the best caption style. Return JSON:
{
  "font": "font name",
  "color": "hex color",
  "position": "top|center|bottom",
  "animation": "none|fade|bounce|typewriter",
  "fontSize": "small|medium|large",
  "background": "none|blur|solid"
}

Return ONLY valid JSON.`;

  const response = await chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.5, max_tokens: 300 });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

// ===== Batch Title Generation =====
async function generateBatchTitles(transcriptText, count = 5) {
  const prompt = `Given this transcript excerpt:
"${transcriptText.substring(0, 500)}"

Generate ${count} different short video titles. Each should be unique and engaging.
Return JSON array of strings: ["title1", "title2", ...]

Return ONLY valid JSON.`;

  const response = await chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.8, max_tokens: 500 });

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return [];
}

module.exports = { isOpenRouterConfigured, scoreHighlights, generateTitle, suggestCaptionStyle, generateBatchTitles, chat };
