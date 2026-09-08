'use strict';

const { verifyJWT } = require('./index');
const db = require('../db');

// Auth middleware: sets req.user if valid token found
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.slice(7);
  const payload = verifyJWT(token);
  if (!payload) return next();

  try {
    const user = await db.findById('users', payload.sub);
    if (user) req.user = user;
  } catch {}
  next();
}

// Required auth: blocks if no user
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login dulu' });
  next();
}

// Optional auth: continues even without user
function optionalAuth(req, res, next) { next(); }

module.exports = { authMiddleware, requireAuth, optionalAuth };
