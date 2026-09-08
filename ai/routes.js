'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { isOpenRouterConfigured, scoreHighlights, generateTitle, suggestCaptionStyle, generateBatchTitles } = require('./openrouter');

const router = express.Router();

// ===== AI-powered highlight scoring =====
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    if (!isOpenRouterConfigured()) {
      return res.status(503).json({ error: 'AI belum dikonfigurasi. Set OPENROUTER_API_KEY.' });
    }

    const { transcript, clipLength = 30 } = req.body;
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: 'transcript array required' });
    }

    const highlights = await scoreHighlights(transcript, clipLength);
    if (!highlights) {
      return res.status(500).json({ error: 'Gagal generate highlights' });
    }

    res.json({ highlights, model: process.env.AI_MODEL || 'meta-llama/llama-3.1-8b-instruct:free' });
  } catch (err) {
    console.error('AI analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== AI title generation =====
router.post('/title', requireAuth, async (req, res) => {
  try {
    if (!isOpenRouterConfigured()) {
      return res.status(503).json({ error: 'AI belum dikonfigurasi' });
    }

    const { text, style = 'catchy' } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const title = await generateTitle(text, style);
    res.json({ title });
  } catch (err) {
    console.error('AI title error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== AI caption style suggestion =====
router.post('/caption-style', requireAuth, async (req, res) => {
  try {
    if (!isOpenRouterConfigured()) {
      return res.status(503).json({ error: 'AI belum dikonfigurasi' });
    }

    const { text, platform = 'tiktok' } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const style = await suggestCaptionStyle(text, platform);
    res.json({ style });
  } catch (err) {
    console.error('AI caption style error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Batch title generation =====
router.post('/titles', requireAuth, async (req, res) => {
  try {
    if (!isOpenRouterConfigured()) {
      return res.status(503).json({ error: 'AI belum dikonfigurasi' });
    }

    const { text, count = 5 } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const titles = await generateBatchTitles(text, count);
    res.json({ titles });
  } catch (err) {
    console.error('AI batch title error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Smart crop analysis =====
router.post('/smart-crop', requireAuth, async (req, res) => {
  try {
    const { videoPath, startTime = 0, endTime = 10, targetWidth = 1080, targetHeight = 1920 } = req.body;
    if (!videoPath) return res.status(400).json({ error: 'videoPath required' });

    // Use ffmpeg to detect face position via cropdetect
    const { execFile } = require('child_process');
    const cmd = `ffmpeg -ss ${startTime} -t ${Math.min(endTime - startTime, 5)} -i "${videoPath}" -vf "cropdetect=24:16:0" -f null - 2>&1 | grep -o 'crop=[^ ]*' | tail -1`;

    execFile('sh', ['-c', cmd], { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        // Fallback: center crop
        return res.json({
          crop: { x: 'iw/2-ih*9/16/2', y: 0, w: 'ih*9/16', h: 'ih' },
          method: 'center',
          ffmpeg: `crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9),scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`,
        });
      }
      const match = stdout.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
      if (match) {
        const [, w, h, x, y] = match.map(Number);
        // Calculate crop for portrait from detected region
        const aspectTarget = targetWidth / targetHeight;
        let cropW = w, cropH = h, cropX = x, cropY = y;
        if (w / h > aspectTarget) {
          cropW = Math.round(h * aspectTarget);
          cropX = x + Math.round((w - cropW) / 2);
        } else {
          cropH = Math.round(w / aspectTarget);
          cropY = y + Math.round((h - cropH) / 2);
        }
        return res.json({
          crop: { x: cropX, y: cropY, w: cropW, h: cropH },
          method: 'face-detected',
          ffmpeg: `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}`,
        });
      }
      res.json({ crop: null, method: 'fallback', ffmpeg: `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2` });
    });
  } catch (err) {
    console.error('Smart crop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Check AI status =====
router.get('/status', (req, res) => {
  res.json({
    configured: isOpenRouterConfigured(),
    model: process.env.AI_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
  });
});

module.exports = router;
