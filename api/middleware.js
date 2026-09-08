'use strict';

const db = require('../db');

// API key auth middleware for /api/v1/* routes
async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'API key required. Set X-API-Key header.' });

  // Find user by API key (stored in users table as api_key field)
  const user = await db.findBy('users', 'api_key', apiKey);
  if (!user) return res.status(401).json({ error: 'Invalid API key' });

  req.user = user;
  req.plan = user.plan || 'free';
  next();
}

// Rate limit per API key (plan-based)
const apiLimits = { free: 20, pro: 200, business: 2000 };
const apiUsage = new Map();

function apiRateLimit(req, res, next) {
  const key = req.user?.id || 'unknown';
  const now = Date.now();
  const limit = apiLimits[req.plan] || 20;
  const entry = apiUsage.get(key);

  if (!entry || now - entry.start > 3600000) {
    apiUsage.set(key, { start: now, count: 1 });
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - 1);
    return next();
  }

  entry.count++;
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - entry.count));
  res.setHeader('X-RateLimit-Reset', new Date(entry.start + 3600000).toISOString());

  if (entry.count > limit) return res.status(429).json({ error: `Rate limit exceeded. Max ${limit}/hour for ${req.plan} plan.` });
  next();
}

module.exports = { apiKeyAuth, apiRateLimit };
