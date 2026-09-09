'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { createCheckoutSession, createPortalSession, handleWebhook, isStripeConfigured } = require('./stripe');
const db = require('../db');

const router = express.Router();

// ===== Usage alias (roadmap compatibility: GET /api/payment/usage) =====
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user.id);
    const totalUsage = await db.count('usage_log', 'user_id', req.user.id);
    res.json({
      plan: user.plan,
      credits: user.credits,
      credits_used: user.credits_used,
      credits_reset_at: user.credits_reset_at,
      total_clips: totalUsage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Create Checkout Session =====
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ error: 'Pembayaran belum dikonfigurasi' });
    const { plan } = req.body;
    if (!['pro', 'business'].includes(plan)) return res.status(400).json({ error: 'Plan tidak valid' });
    const session = await createCheckoutSession(req.user.id, plan);
    res.json(session);
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Billing Portal =====
router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ error: 'Pembayaran belum dikonfigurasi' });
    const session = await createPortalSession(req.user.id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Stripe Webhook (raw body needed) =====
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!isStripeConfigured()) return res.sendStatus(200);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.sendStatus(200);

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    await handleWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ===== Get Plans (settings-driven) =====
router.get('/plans', async (req, res) => {
  try {
    const { getPlans } = require('../admin/settings');
    const { getStripeConfig } = require('../admin/settings');
    const plans = await getPlans();
    const stripeCfg = await getStripeConfig();
    res.json({ plans, stripeConfigured: stripeCfg.configured });
  } catch {
    res.json({
      plans: [
        { id: 'free', name: 'Free', price: 0, credits: 10, features: ['10 clip/bulan', 'Watermark', '720p output', 'Basic templates'] },
        { id: 'pro', name: 'Pro', price: 99000, credits: 100, features: ['100 clip/bulan', 'Tanpa watermark', '1080p output', 'Semua templates', 'Priority support'] },
        { id: 'business', name: 'Business', price: 299000, credits: 500, features: ['500 clip/bulan', 'Semua fitur Pro', '4K output', 'API access', 'Batch export'] },
      ],
      stripeConfigured: false,
    });
  }
});

module.exports = router;
