'use strict';

/**
 * Settings system — DB-backed dengan env fallback
 * Priority: DB settings > env vars > defaults
 */

const db = require('../db');

// ===== Default settings =====
const DEFAULTS = {
  // AI Configuration
  ai_provider: 'openrouter',
  ai_openrouter_key: '',           // kosong = pakai env OPENROUTER_API_KEY
  ai_model: 'meta-llama/llama-3.1-8b-instruct:free',
  ai_fallback_local: true,          // fallback ke rule-based saat AI unavailable
  ai_temperature: 0.7,

  // Payment Gateway
  payment_provider: 'stripe',
  stripe_secret_key: '',           // kosong = pakai env STRIPE_SECRET_KEY
  stripe_webhook_secret: '',
  stripe_price_pro: 'price_pro_monthly',
  stripe_price_business: 'price_business_monthly',
  currency: 'idr',

  // Plans (JSON array — full kontrol dari admin panel)
  plans: [
    { id: 'free',     name: 'Free',     price: 0,      credits: 10,  watermark: true,  max_resolution: '720p', features: ['10 clip/bulan', 'Watermark', '720p output', 'Basic templates'] },
    { id: 'pro',      name: 'Pro',      price: 99000,  credits: 100, watermark: false, max_resolution: '1080p', features: ['100 clip/bulan', 'Tanpa watermark', '1080p output', 'Semua templates', 'Custom captions', 'Priority support'] },
    { id: 'business', name: 'Business', price: 299000, credits: 500, watermark: false, max_resolution: '4k',    features: ['500 clip/bulan', 'Semua fitur Pro', '4K output', 'API access', 'Batch export', 'Team management'] },
  ],

  // Overage pricing (Rp per clip extra, 0 = disable)
  overage_free: 2000,
  overage_pro: 1000,
  overage_business: 500,

  // System
  max_concurrent_jobs: 3,
  rate_limit_per_min: 30,
  watermark_text: 'YT Clipper',
  app_url: '',                      // kosong = pakai env APP_URL atau localhost
  registration_open: true,

  // Lifetime deal
  lifetime_deal_enabled: false,
  lifetime_deal_price: 499000,
  lifetime_deal_credits: 50,
  lifetime_deal_max_users: 100,
};

// Cache untuk menghindari query berulang
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5 detik

// ===== Load all settings dari DB =====
async function loadSettings(force = false) {
  if (!force && cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  const defaults = buildDefaults();

  try {
    // In-memory atau Postgres — sama-sama pakai settings table
    const rows = await db.findMany('settings', 'autoload', true, 500);
    const dbSettings = {};
    for (const r of rows) {
      try {
        dbSettings[r.key] = r.is_json ? JSON.parse(r.value) : parseValue(r.value);
      } catch { dbSettings[r.key] = r.value; }
    }
    cache = { ...defaults, ...dbSettings };
  } catch {
    cache = defaults;
  }
  cacheTime = Date.now();
  return cache;
}

// Defaults + env overrides
function buildDefaults() {
  const s = { ...DEFAULTS };
  if (process.env.OPENROUTER_API_KEY) s.ai_openrouter_key = process.env.OPENROUTER_API_KEY;
  if (process.env.AI_MODEL) s.ai_model = process.env.AI_MODEL;
  if (process.env.STRIPE_SECRET_KEY) s.stripe_secret_key = process.env.STRIPE_SECRET_KEY;
  if (process.env.STRIPE_WEBHOOK_SECRET) s.stripe_webhook_secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (process.env.STRIPE_PRICE_PRO) s.stripe_price_pro = process.env.STRIPE_PRICE_PRO;
  if (process.env.STRIPE_PRICE_BUSINESS) s.stripe_price_business = process.env.STRIPE_PRICE_BUSINESS;
  if (process.env.APP_URL) s.app_url = process.env.APP_URL;
  return s;
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v)) && !v.startsWith('0') && !v.includes('.')) return Number(v);
  if (/^\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

// ===== Get single setting =====
async function getSetting(key, fallback = null) {
  const s = await loadSettings();
  return s[key] !== undefined ? s[key] : fallback;
}

// ===== Get multiple settings =====
async function getSettings(keys = null) {
  const s = await loadSettings();
  if (!keys) return s;
  const out = {};
  for (const k of keys) out[k] = s[k];
  return out;
}

// ===== Set single setting =====
async function setSetting(key, value, isJson = false) {
  const stored = typeof value === 'object' ? JSON.stringify(value) : String(value);

  // Upsert: find by key, update atau insert
  const existing = await db.findBy('settings', 'key', key);
  if (existing) {
    await db.update('settings', existing.id, { value: stored, is_json: isJson || typeof value === 'object' });
  } else {
    await db.insert('settings', { key, value: stored, is_json: isJson || typeof value === 'object', autoload: true });
  }

  // Invalidate cache
  cache = null;
  return getSetting(key);
}

// ===== Set multiple settings =====
async function setSettings(obj) {
  const results = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!(key in DEFAULTS) && !key.startsWith('custom_')) continue; // whitelist
    results[key] = await setSetting(key, value);
  }
  return results;
}

// ===== Reset ke defaults =====
async function resetSetting(key) {
  const existing = await db.findBy('settings', 'key', key);
  if (existing) await db.remove('settings', existing.id);
  cache = null;
  return DEFAULTS[key];
}

// ===== Get plans (helper sering dipakai) =====
async function getPlans() {
  const plans = await getSetting('plans');
  return Array.isArray(plans) ? plans : DEFAULTS.plans;
}

async function getPlan(planId) {
  const plans = await getPlans();
  return plans.find(p => p.id === planId) || null;
}

// ===== Get AI config =====
async function getAIConfig() {
  const s = await loadSettings();
  return {
    provider: s.ai_provider,
    apiKey: s.ai_openrouter_key,
    model: s.ai_model,
    fallbackLocal: s.ai_fallback_local,
    temperature: s.ai_temperature,
    configured: !!s.ai_openrouter_key,
  };
}

// ===== Get Stripe config =====
async function getStripeConfig() {
  const s = await loadSettings();
  return {
    secretKey: s.stripe_secret_key,
    webhookSecret: s.stripe_webhook_secret,
    pricePro: s.stripe_price_pro,
    priceBusiness: s.stripe_price_business,
    currency: s.currency,
    configured: !!s.stripe_secret_key && !s.stripe_secret_key.includes('placeholder'),
  };
}

// ===== Invalidate cache (dipanggil setelah admin update) =====
function invalidateCache() { cache = null; cacheTime = 0; }

module.exports = {
  DEFAULTS,
  loadSettings,
  getSetting,
  getSettings,
  setSetting,
  setSettings,
  resetSetting,
  getPlans,
  getPlan,
  getAIConfig,
  getStripeConfig,
  invalidateCache,
};