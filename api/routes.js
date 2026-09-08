'use strict';

const express = require('express');
const { apiKeyAuth, apiRateLimit } = require('./middleware');
const { validateClipRange } = require('../validate');
const db = require('../db');

const router = express.Router();

// ===== API docs (public) =====
router.get('/docs', (req, res) => {
  res.json({
    name: 'YT Clipper API',
    version: '1.0.0',
    auth: 'X-API-Key header',
    rateLimit: { free: '20/hour', pro: '200/hour', business: '2000/hour' },
    endpoints: [
      { method: 'POST', path: '/api/v1/clips/create', desc: 'Create clip from YouTube URL', body: { videoId: 'string', start: 'number', end: 'number', format: 'landscape|portrait', withSubtitles: 'boolean', title: 'string' } },
      { method: 'GET', path: '/api/v1/clips/:id', desc: 'Get clip status' },
      { method: 'GET', path: '/api/v1/clips/:id/file', desc: 'Download clip file' },
      { method: 'GET', path: '/api/v1/projects', desc: 'List projects' },
      { method: 'GET', path: '/api/v1/key', desc: 'Get your API key' },
    ],
  });
});

// Apply auth + rate limit to all other /api/v1 routes
router.use(apiKeyAuth);
router.use(apiRateLimit);

// ===== Create clip =====
router.post('/clips/create', async (req, res) => {
  try {
    const { videoId, start, end, format = 'landscape', withSubtitles = true, title = 'clip' } = req.body;
    const v = validateClipRange({ videoId, start, end });
    if (!v.ok) return res.status(400).json({ error: v.errors.join('; ') });

    // Credit check
    if (req.user.credits <= 0) {
      return res.status(403).json({ error: 'Credits exhausted' });
    }
    await db.update('users', req.user.id, { credits: req.user.credits - 1, credits_used: (req.user.credits_used || 0) + 1 });

    // Delegate to internal job system via HTTP call to localhost
    const http = require('http');
    const postData = JSON.stringify({ videoId: v.videoId, start: v.start, end: v.end, title, format, withSubtitles, transcript: [] });

    const jobRes = await new Promise((resolve, reject) => {
      const r = http.request({
        hostname: '127.0.0.1', port: process.env.PORT || 3000,
        path: '/api/job/start', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      }, (res2) => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('Parse error')); } }); });
      r.on('error', reject);
      r.write(postData);
      r.end();
    });

    // Save to DB
    await db.insert('clips', {
      user_id: req.user.id, start_time: v.start, end_time: v.end,
      title, format, with_subtitles: withSubtitles, status: 'exporting',
    });

    res.json({ id: jobRes.jobId, status: 'processing', message: 'Clip is being processed' });
  } catch (err) {
    console.error('API create clip error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Get clip status =====
router.get('/clips/:id', (req, res) => {
  // Delegate to internal job endpoint
  const http = require('http');
  http.get(`http://127.0.0.1:${process.env.PORT || 3000}/api/job/${req.params.id}`, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res.json(JSON.parse(d)); } catch { res.status(500).json({ error: 'Parse error' }); } });
  }).on('error', () => res.status(500).json({ error: 'Internal error' }));
});

// ===== Download clip file =====
router.get('/clips/:id/file', (req, res) => {
  const http = require('http');
  http.get(`http://127.0.0.1:${process.env.PORT || 3000}/api/job/${req.params.id}/file`, (r) => {
    if (r.statusCode !== 200) { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res.status(r.statusCode).json(JSON.parse(d)); } catch { res.status(r.statusCode).end(); } }); return; }
    res.setHeader('Content-Type', r.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', r.headers['content-disposition'] || 'attachment');
    r.pipe(res);
  }).on('error', () => res.status(500).json({ error: 'Internal error' }));
});

// ===== List projects =====
router.get('/projects', async (req, res) => {
  try {
    const clips = await db.findMany('clips', 'user_id', req.user.id, 50);
    res.json({ clips: clips.map(c => ({ id: c.id, title: c.title, status: c.status, format: c.format, created_at: c.created_at })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Get API key =====
router.get('/key', (req, res) => {
  res.json({ apiKey: req.user.api_key || null, plan: req.plan });
});

// ===== API docs =====
router.get('/docs', (req, res) => {
  res.json({
    name: 'YT Clipper API',
    version: '1.0.0',
    auth: 'X-API-Key header',
    rateLimit: { free: '20/hour', pro: '200/hour', business: '2000/hour' },
    endpoints: [
      { method: 'POST', path: '/api/v1/clips/create', desc: 'Create clip from YouTube URL', body: { videoId: 'string', start: 'number', end: 'number', format: 'landscape|portrait', withSubtitles: 'boolean', title: 'string' } },
      { method: 'GET', path: '/api/v1/clips/:id', desc: 'Get clip status' },
      { method: 'GET', path: '/api/v1/clips/:id/file', desc: 'Download clip file' },
      { method: 'GET', path: '/api/v1/projects', desc: 'List projects' },
      { method: 'GET', path: '/api/v1/key', desc: 'Get your API key' },
    ],
  });
});

module.exports = router;
