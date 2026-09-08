'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const db = require('../db');

const router = express.Router();

// ===== Apply Coupon =====
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Kode coupon required' });

    const coupon = await db.findBy('coupons', 'code', code.toUpperCase());
    if (!coupon || !coupon.active) return res.status(404).json({ error: 'Coupon tidak valid' });

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Coupon sudah expired' });
    }

    // Check max uses
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'Coupon sudah habis digunakan' });
    }

    const user = await db.findById('users', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Apply coupon
    const updates = {};
    if (coupon.plan_override) {
      const credits = coupon.plan_override === 'business' ? 500 : coupon.plan_override === 'pro' ? 100 : 10;
      updates.plan = coupon.plan_override;
      updates.credits = credits;
      updates.credits_used = 0;
      updates.credits_reset_at = new Date(Date.now() + 30 * 86400000);
    }
    if (coupon.credits_bonus > 0) {
      updates.credits = (user.credits || 0) + coupon.credits_bonus;
    }

    if (Object.keys(updates).length > 0) {
      await db.update('users', user.id, updates);
    }

    // Increment usage
    await db.update('coupons', coupon.id, { used_count: (coupon.used_count || 0) + 1 });

    // Log
    await db.insert('usage_log', { user_id: user.id, action: 'coupon_applied', credits_used: 0, metadata: { code: coupon.code, plan_override: coupon.plan_override, credits_bonus: coupon.credits_bonus } });

    res.json({
      ok: true,
      message: coupon.plan_override ? `Plan diupgrade ke ${coupon.plan_override}` : `+${coupon.credits_bonus} credits`,
      plan: updates.plan || user.plan,
      credits: updates.credits || user.credits,
    });
  } catch (err) {
    console.error('Coupon error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== List active coupons (admin) =====
router.get('/list', requireAuth, async (req, res) => {
  try {
    const coupons = await db.findMany('coupons', 'active', true, 50);
    res.json({ coupons: coupons.map(c => ({ code: c.code, discount_type: c.discount_type, discount_value: c.discount_value, plan_override: c.plan_override, credits_bonus: c.credits_bonus, max_uses: c.max_uses, used_count: c.used_count })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Create coupon (admin) =====
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { code, discount_type, discount_value, max_uses, plan_override, credits_bonus, expires_at } = req.body;
    if (!code || !discount_type) return res.status(400).json({ error: 'code & discount_type required' });

    const coupon = await db.insert('coupons', {
      code: code.toUpperCase(),
      discount_type,
      discount_value: discount_value || 0,
      max_uses: max_uses || 0,
      plan_override: plan_override || null,
      credits_bonus: credits_bonus || 0,
      expires_at: expires_at || null,
      active: true,
    });

    res.json({ ok: true, coupon: { code: coupon.code, plan_override: coupon.plan_override, credits_bonus: coupon.credits_bonus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
