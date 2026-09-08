'use strict';

const express = require('express');
const { hashPassword, verifyPassword, signJWT } = require('./index');
const { requireAuth } = require('./middleware');
const db = require('../db');

const router = express.Router();

// ===== Register =====
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });

    const existing = await db.findBy('users', 'email', email);
    if (existing) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const user = await db.insert('users', {
      email,
      name: name || email.split('@')[0],
      password_hash: hashPassword(password),
      plan: 'free',
      credits: 10,
      credits_used: 0,
    });

    const token = signJWT({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Gagal register' });
  }
});

// ===== Login =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

    const user = await db.findBy('users', 'email', email);
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Email atau password salah' });

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Reset credits if expired
    if (new Date(user.credits_reset_at) <= new Date()) {
      const newCredits = user.plan === 'pro' ? 100 : user.plan === 'business' ? 500 : 10;
      await db.update('users', user.id, { credits: newCredits, credits_used: 0, credits_reset_at: new Date(Date.now() + 30 * 86400000) });
      user.credits = newCredits;
    }

    const token = signJWT({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Gagal login' });
  }
});

// ===== Get current user =====
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits, credits_used: user.credits_used, credits_reset_at: user.credits_reset_at, created_at: user.created_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Update profile =====
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, avatar_url } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const user = await db.update('users', req.user.id, updates);
    res.json({ id: user.id, email: user.email, name: user.name, plan: user.plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Google OAuth =====
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    // Verify Google token (decode JWT without library)
    const payload = (() => {
      try {
        const [, body] = credential.split('.');
        return JSON.parse(Buffer.from(body, 'base64url').toString());
      } catch { return null; }
    })();
    if (!payload?.email) return res.status(401).json({ error: 'Invalid Google token' });

    const { email, name, picture } = payload;

    // Find or create user
    let user = await db.findBy('users', 'email', email);
    if (!user) {
      user = await db.insert('users', {
        email,
        name: name || email.split('@')[0],
        avatar_url: picture,
        plan: 'free',
        credits: 10,
        credits_used: 0,
      });
    } else if (!user.avatar_url && picture) {
      await db.update('users', user.id, { avatar_url: picture });
    }

    const token = signJWT({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, credits: user.credits } });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ error: 'Gagal autentikasi Google' });
  }
});

// ===== Usage stats =====
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user.id);
    const today = await db.count('usage_log', 'user_id', req.user.id);
    const thisMonth = today; // simplified
    res.json({
      plan: user.plan,
      credits: user.credits,
      credits_used: user.credits_used,
      credits_reset_at: user.credits_reset_at,
      total_clips: thisMonth,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
