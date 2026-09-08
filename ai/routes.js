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

// ===== Check AI status =====
router.get('/status', (req, res) => {
  res.json({
    configured: isOpenRouterConfigured(),
    model: process.env.AI_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
  });
});

module.exports = router;
