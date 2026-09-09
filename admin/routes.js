'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../auth/middleware');
const db = require('../db');
const settings = require('./settings');
const { getPlans } = require('./settings');

const router = express.Router();

// ===== GET /settings — semua settings (admin) =====
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const all = await settings.loadSettings(true);
    // Mask sensitive keys (tampil masked, tapi tetap bisa di-update)
    const masked = { ...all };
    if (masked.ai_openrouter_key) masked.ai_openrouter_key = maskKey(masked.ai_openrouter_key);
    if (masked.stripe_secret_key) masked.stripe_secret_key = maskKey(masked.stripe_secret_key);
    if (masked.stripe_webhook_secret) masked.stripe_webhook_secret = maskKey(masked.stripe_webhook_secret);
    res.json({ settings: masked, categories: settingsCategories() });
  } catch (err) {
    console.error('Admin settings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /settings — update settings =====
router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Body object required' });

    // Handle special: plans array
    if (updates.plans) {
      if (!Array.isArray(updates.plans)) return res.status(400).json({ error: 'plans must be array' });
      for (const p of updates.plans) {
        if (!p.id || !p.name || typeof p.price !== 'number' || typeof p.credits !== 'number') {
          return res.status(400).json({ error: 'Plan invalid: butuh id, name, price, credits' });
        }
      }
    }

    // Handle masked keys: skip jika masih masked (tidak berubah)
    const clean = { ...updates };
    for (const k of ['ai_openrouter_key', 'stripe_secret_key', 'stripe_webhook_secret']) {
      if (clean[k] && clean[k].includes('•')) delete clean[k]; // masih masked = tidak diubah
    }

    const results = await settings.setSettings(clean);
    settings.invalidateCache();

    // Re-read untuk response (dengan mask)
    const updated = await settings.loadSettings(true);
    const masked = { ...updated };
    if (masked.ai_openrouter_key) masked.ai_openrouter_key = maskKey(masked.ai_openrouter_key);
    if (masked.stripe_secret_key) masked.stripe_secret_key = maskKey(masked.stripe_secret_key);
    if (masked.stripe_webhook_secret) masked.stripe_webhook_secret = maskKey(masked.stripe_webhook_secret);

    res.json({ ok: true, settings: masked });
  } catch (err) {
    console.error('Admin settings update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /settings/reset/:key — reset 1 setting ke default =====
router.post('/settings/reset/:key', requireAdmin, async (req, res) => {
  try {
    const value = await settings.resetSetting(req.params.key);
    settings.invalidateCache();
    res.json({ ok: true, key: req.params.key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /plans — public: plans dari settings =====
router.get('/plans', async (req, res) => {
  try {
    const plans = await getPlans();
    res.json({ plans });
  } catch {
    res.json({ plans: settings.DEFAULTS.plans });
  }
});

// ===== GET /stats — admin dashboard stats =====
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const users = await db.getAll('users');
    const clips = await db.getAll('clips');
    const payments = await db.getAll('payments');
    const coupons = await db.getAll('coupons');

    const byPlan = { free: 0, pro: 0, business: 0 };
    let totalCredits = 0;
    for (const u of users) {
      if (byPlan[u.plan] !== undefined) byPlan[u.plan]++;
      totalCredits += u.credits || 0;
    }

    res.json({
      users: {
        total: users.length,
        byPlan,
        totalCredits,
        recent: users.slice(0, 10).map(u => ({ id: u.id, email: u.email, name: u.name, plan: u.plan, role: u.role, credits: u.credits, created_at: u.created_at })),
      },
      clips: { total: clips.length, completed: clips.filter(c => c.status === 'completed').length },
      payments: {
        total: payments.length,
        revenue: payments.filter(p => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0),
      },
      coupons: { total: coupons.length, active: coupons.filter(c => c.active).length },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GET /users — list users =====
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.getAll('users');
    res.json({
      users: users.map(u => ({
        id: u.id, email: u.email, name: u.name, plan: u.plan, role: u.role,
        credits: u.credits, credits_used: u.credits_used, api_key: u.api_key,
        created_at: u.created_at, stripe_customer_id: u.stripe_customer_id || null,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PUT /users/:id — update user (plan, role, credits, reset password) =====
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { plan, role, credits, password, name } = req.body;
    const user = await db.findById('users', req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (plan && ['free', 'pro', 'business'].includes(plan)) {
      updates.plan = plan;
      if (credits === undefined) updates.credits = plan === 'business' ? 500 : plan === 'pro' ? 100 : 10;
    }
    if (role && ['user', 'admin'].includes(role)) updates.role = role;
    if (typeof credits === 'number' && credits >= 0) updates.credits = credits;
    if (name) updates.name = name;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
      updates.password_hash = require('../auth/index').hashPassword(password);
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await db.update('users', user.id, updates);
    res.json({ ok: true, user: { id: updated.id, email: updated.email, plan: updated.plan, role: updated.role, credits: updated.credits } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== POST /users/:id/regenerate-key — regenerate API key =====
router.post('/users/:id/regenerate-key', requireAdmin, async (req, res) => {
  try {
    const user = await db.findById('users', req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newKey = 'yc_' + require('crypto').randomBytes(24).toString('hex');
    await db.update('users', user.id, { api_key: newKey });
    res.json({ ok: true, api_key: newKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE /users/:id — delete user =====
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await db.findById('users', req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
    await db.remove('users', user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Coupons management =====
router.get('/coupons', requireAdmin, async (req, res) => {
  try {
    const coupons = await db.getAll('coupons');
    res.json({ coupons: coupons.map(c => ({ id: c.id, code: c.code, discount_type: c.discount_type, discount_value: c.discount_value, max_uses: c.max_uses, used_count: c.used_count || 0, plan_override: c.plan_override, credits_bonus: c.credits_bonus, expires_at: c.expires_at, active: c.active })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /coupons — create (delegate ke payment/coupons.js logic tapi admin-only disini)
router.post('/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, discount_type, discount_value, max_uses, plan_override, credits_bonus, expires_at } = req.body;
    if (!code || !discount_type) return res.status(400).json({ error: 'code & discount_type required' });

    const existing = await db.findBy('coupons', 'code', code.toUpperCase());
    if (existing) return res.status(409).json({ error: 'Coupon code sudah ada' });

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
    res.json({ ok: true, coupon: { code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /coupons/:id — update
router.put('/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const coupon = await db.findById('coupons', req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });

    const updates = {};
    const allowed = ['discount_type', 'discount_value', 'max_uses', 'plan_override', 'credits_bonus', 'expires_at', 'active', 'code'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.code) updates.code = updates.code.toUpperCase();
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await db.update('coupons', coupon.id, updates);
    res.json({ ok: true, coupon: { code: updated.code, active: updated.active } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /coupons/:id
router.delete('/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const coupon = await db.findById('coupons', req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    await db.remove('coupons', coupon.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Helper: mask API keys =====
function maskKey(key) {
  if (!key || key.length < 8) return key ? '••••' : '';
  return key.substring(0, 6) + '••••' + key.substring(key.length - 4);
}

function settingsCategories() {
  return [
    { id: 'ai', name: '🤖 AI Configuration', keys: ['ai_provider', 'ai_openrouter_key', 'ai_model', 'ai_fallback_local', 'ai_temperature'] },
    { id: 'payment', name: '💳 Payment Gateway', keys: ['payment_provider', 'stripe_secret_key', 'stripe_webhook_secret', 'stripe_price_pro', 'stripe_price_business', 'currency'] },
    { id: 'plans', name: '💰 Plans & Pricing', keys: ['plans', 'overage_free', 'overage_pro', 'overage_business'] },
    { id: 'system', name: '⚙️ System', keys: ['max_concurrent_jobs', 'rate_limit_per_min', 'watermark_text', 'app_url', 'registration_open'] },
    { id: 'lifetime', name: '🎁 Lifetime Deal', keys: ['lifetime_deal_enabled', 'lifetime_deal_price', 'lifetime_deal_credits', 'lifetime_deal_max_users'] },
  ];
}

module.exports = router;