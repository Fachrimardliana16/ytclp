#!/usr/bin/env node
'use strict';

/**
 * Database Seeder — idempotent (aman dijalankan berulang)
 * Usage: node db/seed.js
 * 
 * Seeds:
 * 1. Default settings (dari admin/settings.js DEFAULTS)
 * 2. Admin user (email dari arg/env, default admin@ytclipper.local)
 * 3. Sample users (free, pro, business)
 * 4. Coupons (welcome, earlybird, dll)
 */

const db = require('./index');
const { hashPassword } = require('../auth/index');
const { DEFAULTS, setSetting } = require('../admin/settings');

const ADMIN_EMAIL = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@ytclipper.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

async function seed() {
  console.log('\n🌱 Seeding database...\n');

  // ===== 1. Default settings =====
  console.log('  [1/4] Settings...');
  const settingKeys = [
    'ai_provider', 'ai_model', 'ai_fallback_local', 'ai_temperature',
    'payment_provider', 'stripe_price_pro', 'stripe_price_business', 'currency',
    'plans', 'overage_free', 'overage_pro', 'overage_business',
    'max_concurrent_jobs', 'rate_limit_per_min', 'watermark_text',
    'registration_open', 'lifetime_deal_enabled', 'lifetime_deal_price',
    'lifetime_deal_credits', 'lifetime_deal_max_users',
  ];
  for (const key of settingKeys) {
    const v = DEFAULTS[key];
    if (v !== '' && v !== null && v !== undefined) {
      await setSetting(key, v);
    }
  }
  console.log(`    ✓ ${settingKeys.length} settings seeded`);

  // ===== 2. Admin user =====
  console.log('  [2/4] Admin user...');
  let admin = await db.findBy('users', 'email', ADMIN_EMAIL);
  if (!admin) {
    admin = await db.insert('users', {
      email: ADMIN_EMAIL,
      name: 'Admin',
      password_hash: hashPassword(ADMIN_PASSWORD),
      plan: 'business',
      role: 'admin',
      credits: 9999,
      credits_used: 0,
      api_key: 'yc_admin_' + require('crypto').randomBytes(20).toString('hex'),
    });
    console.log(`    ✓ Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`    ✓ API key: ${admin.api_key}`);
  } else {
    // Ensure role=admin
    if (admin.role !== 'admin') {
      await db.update('users', admin.id, { role: 'admin' });
      console.log(`    ✓ Existing user promoted to admin: ${ADMIN_EMAIL}`);
    } else {
      console.log(`    • Admin already exists: ${ADMIN_EMAIL}`);
    }
  }

  // ===== 3. Sample users =====
  console.log('  [3/4] Sample users...');
  const samples = [
    { email: 'free@test.com',      name: 'Free User',      plan: 'free',     credits: 10 },
    { email: 'pro@test.com',       name: 'Pro User',       plan: 'pro',      credits: 100 },
    { email: 'business@test.com',  name: 'Business User',  plan: 'business', credits: 500 },
  ];
  for (const s of samples) {
    const existing = await db.findBy('users', 'email', s.email);
    if (!existing) {
      await db.insert('users', {
        email: s.email,
        name: s.name,
        password_hash: hashPassword('Test123!'),
        plan: s.plan,
        role: 'user',
        credits: s.credits,
        credits_used: 0,
        api_key: 'yc_' + require('crypto').randomBytes(24).toString('hex'),
      });
      console.log(`    ✓ ${s.email} (${s.plan})`);
    } else {
      console.log(`    • ${s.email} exists`);
    }
  }

  // ===== 4. Coupons =====
  console.log('  [4/4] Coupons...');
  const coupons = [
    { code: 'WELCOME10',   discount_type: 'percent', discount_value: 10, max_uses: 0,  plan_override: null,  credits_bonus: 5,   expires_at: null },
    { code: 'EARLYBIRD',   discount_type: 'percent', discount_value: 20, max_uses: 100, plan_override: null,  credits_bonus: 0,   expires_at: new Date(Date.now() + 90 * 86400000).toISOString() },
    { code: 'LIFETIME',    discount_type: 'percent', discount_value: 100, max_uses: 50, plan_override: 'pro', credits_bonus: 0,   expires_at: null },
    { code: 'BONUS50',     discount_type: 'percent', discount_value: 0,  max_uses: 200, plan_override: null,  credits_bonus: 50,  expires_at: new Date(Date.now() + 30 * 86400000).toISOString() },
    { code: 'PROFREE',     discount_type: 'percent', discount_value: 100, max_uses: 10,  plan_override: 'pro', credits_bonus: 0,   expires_at: null },
  ];
  for (const c of coupons) {
    const existing = await db.findBy('coupons', 'code', c.code);
    if (!existing) {
      await db.insert('coupons', { ...c, used_count: 0, active: true });
      console.log(`    ✓ Coupon ${c.code}`);
    } else {
      console.log(`    • Coupon ${c.code} exists`);
    }
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Login admin:');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Admin panel: /admin.html\n`);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});