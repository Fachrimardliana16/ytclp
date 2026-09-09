'use strict';

const https = require('https');
const localAI = require('./local');
const { getAIConfig } = require('../admin/settings');

// Cached config — di-refresh tiap 5 detik (admin update otomatis ke-pickup)
let cfgCache = null;
let cfgTime = 0;
async function getConfig() {
  if (cfgCache && Date.now() - cfgTime < 5000) return cfgCache;
  cfgCache = await getAIConfig();
  cfgTime = Date.now();
  return cfgCache;
}

// ===== Call OpenRouter API (settings-driven) =====
async function chat(messages, { temperature, max_tokens = 1024 } = {}) {
  const cfg = await getConfig();
  if (!cfg.apiKey) throw new Error('OpenRouter API key not configured');

  const body = JSON.stringify({
    model: cfg.model,
    messages,
    temperature: temperature ?? cfg.temperature,
    max_tokens,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
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
        } catch {
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

// ===== Check AI status (async, settings-driven) =====
async function getAIStatus() {
  const cfg = await getConfig();
  return {
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.model,
    fallbackLocal: cfg.fallbackLocal,
    activeMode: cfg.configured ? 'openrouter' : (cfg.fallbackLocal ? 'local' : 'disabled'),
  };
}

// Sync version untuk backward-compat
function isOpenRouterConfigured() {
  if (cfgCache) return cfgCache.configured;
  return !!process.env.OPENROUTER_API_KEY;
}

// ===== AI Highlight Scoring (fallback ke local) =====
async function scoreHighlights(transcript, clipLength) {
  const cfg = await getConfig();

  if (!cfg.configured) {
    if (!cfg.fallbackLocal) throw new Error('AI tidak dikonfigurasi dan fallback dimatikan');
    await localAI.initialize();
    return localAI.analyzeHighlights(transcript, { clipLength, numClips: Math.max(3, Math.ceil(300 / clipLength)) });
  }

  const text = transcript.map((s, i) => `[${i}] ${(s.offset/1000).toFixed(1)}s-${((s.offset+s.duration)/1000).toFixed(1)}s: ${s.text}`).join('\n');

  const prompt = `You are a video highlight detector. Given a transcript with timestamps, identify the ${Math.ceil(300/clipLength)} most engaging segments for short-form video (TikTok/Reels/Shorts).

Transcript:
${text}

For each segment, return JSON array:
[{"start": seconds, "end": seconds, "score": 1-100, "title": "catchy title", "reason": "why engaging"}]

Rules:
- Segments should be ${clipLength} seconds long
- Prioritize: emotional moments, surprising facts, funny parts, key takeaways
- Score based on engagement potential
- Return ONLY valid JSON, no markdown`;

  try {
    const response = await chat([
      { role: 'system', content: 'You are a video content analyst. Return only valid JSON arrays.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 2048 });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).map(h => ({
        startTime: Math.round(h.start),
        endTime: Math.round(h.end),
        score: h.score,
        title: h.title,
        summary: h.reason || '',
      }));
    }
  } catch (err) {
    console.error('[AI] OpenRouter error, fallback ke local:', err.message);
    if (cfg.fallbackLocal) {
      await localAI.initialize();
      return localAI.analyzeHighlights(transcript, { clipLength, numClips: Math.max(3, Math.ceil(300 / clipLength)) });
    }
    throw err;
  }
  return null;
}

// ===== AI Title Generation (fallback ke local) =====
async function generateTitle(transcriptText, style = 'catchy') {
  const cfg = await getConfig();

  if (!cfg.configured) {
    if (!cfg.fallbackLocal) throw new Error('AI tidak dikonfigurasi dan fallback dimatikan');
    await localAI.initialize();
    return localAI.generateTitle(transcriptText, style);
  }

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

  try {
    const response = await chat([{ role: 'user', content: prompt }], { temperature: 0.8, max_tokens: 100 });
    return response.trim().replace(/^["']|["']$/g, '').substring(0, 60);
  } catch (err) {
    console.error('[AI] OpenRouter title error, fallback ke local:', err.message);
    await localAI.initialize();
    return localAI.generateTitle(transcriptText, style);
  }
}

// ===== AI Caption Style Suggestion (fallback ke local) =====
async function suggestCaptionStyle(transcriptText, platform = 'tiktok') {
  const cfg = await getConfig();

  if (!cfg.configured) {
    if (!cfg.fallbackLocal) throw new Error('AI tidak dikonfigurasi dan fallback dimatikan');
    await localAI.initialize();
    const styles = await localAI.getCaptionStyles();
    const match = styles.find(s => s.id === platform || s.platform === platform) || styles[0];
    return match || null;
  }

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

  try {
    const response = await chat([{ role: 'user', content: prompt }], { temperature: 0.5, max_tokens: 300 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[AI] OpenRouter caption error, fallback ke local:', err.message);
    await localAI.initialize();
    const styles = await localAI.getCaptionStyles();
    return styles[0] || null;
  }
  return null;
}

// ===== Batch Title Generation (fallback ke local) =====
async function generateBatchTitles(transcriptText, count = 5) {
  const cfg = await getConfig();

  if (!cfg.configured) {
    if (!cfg.fallbackLocal) throw new Error('AI tidak dikonfigurasi dan fallback dimatikan');
    await localAI.initialize();
    const titles = [];
    for (let i = 0; i < count; i++) titles.push(await localAI.generateTitle(transcriptText, ['catchy', 'funny', 'viral'][i % 3]));
    return [...new Set(titles)];
  }

  const prompt = `Given this transcript excerpt:
"${transcriptText.substring(0, 500)}"

Generate ${count} different short video titles. Each should be unique and engaging.
Return JSON array of strings: ["title1", "title2", ...]

Return ONLY valid JSON.`;

  try {
    const response = await chat([{ role: 'user', content: prompt }], { temperature: 0.8, max_tokens: 500 });
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[AI] OpenRouter batch error, fallback ke local:', err.message);
    await localAI.initialize();
    const titles = [];
    for (let i = 0; i < count; i++) titles.push(await localAI.generateTitle(transcriptText, ['catchy', 'funny', 'viral'][i % 3]));
    return [...new Set(titles)];
  }
  return [];
}

module.exports = { isOpenRouterConfigured, getAIStatus, scoreHighlights, generateTitle, suggestCaptionStyle, generateBatchTitles, chat };
