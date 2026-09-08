'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const db = require('../db');

const router = express.Router();

// ===== Usage Stats =====
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user.id);
    const clips = await db.findMany('clips', 'user_id', req.user.id, 1000);
    const usage = await db.findMany('usage_log', 'user_id', req.user.id, 1000);
    const payments = await db.findMany('payments', 'user_id', req.user.id, 50);

    // Calculate stats
    const totalClips = clips.length;
    const completedClips = clips.filter(c => c.status === 'completed').length;
    const totalUsage = usage.length;
    const totalCreditsUsed = usage.reduce((sum, u) => sum + (u.credits_used || 0), 0);

    // Clips by day (last 30 days)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const clipsByDay = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().split('T')[0];
      clipsByDay[key] = 0;
    }
    clips.forEach(c => {
      const key = new Date(c.created_at).toISOString().split('T')[0];
      if (clipsByDay[key] !== undefined) clipsByDay[key]++;
    });

    // Clips by format
    const byFormat = { landscape: 0, portrait: 0 };
    clips.forEach(c => { if (byFormat[c.format] !== undefined) byFormat[c.format]++; });

    res.json({
      plan: user.plan,
      credits: user.credits,
      credits_used: user.credits_used,
      credits_reset_at: user.credits_reset_at,
      totalClips,
      completedClips,
      totalUsage,
      totalCreditsUsed,
      totalPayments: payments.length,
      totalSpent: payments.filter(p => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0),
      clipsByDay,
      byFormat,
      recentClips: clips.slice(0, 10).map(c => ({ id: c.id, title: c.title, status: c.status, format: c.format, created_at: c.created_at })),
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Export History =====
router.get('/history', requireAuth, async (req, res) => {
  try {
    const clips = await db.findMany('clips', 'user_id', req.user.id, 100);
    res.json({
      clips: clips.map(c => ({
        id: c.id,
        title: c.title,
        start_time: c.start_time,
        end_time: c.end_time,
        format: c.format,
        with_subtitles: c.with_subtitles,
        status: c.status,
        file_url: c.file_url,
        file_size: c.file_size,
        created_at: c.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Activity Log =====
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const usage = await db.findMany('usage_log', 'user_id', req.user.id, 50);
    res.json({
      activity: usage.map(u => ({
        id: u.id,
        action: u.action,
        credits_used: u.credits_used,
        metadata: u.metadata,
        created_at: u.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
