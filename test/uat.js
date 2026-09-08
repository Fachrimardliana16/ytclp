#!/usr/bin/env node
'use strict';

const http = require('http');
const BASE = 'http://localhost:3000';
let TOKEN = '', API_KEY = '';

function req(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json', ...headers } };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    r.on('error', () => resolve({ status: 0, body: 'error' }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function ok(label, condition) { console.log(`  ${condition ? '✅' : '❌'} ${label}`); return condition; }

async function run() {
  console.log('=========================================');
  console.log('  UAT: YT Clipper Phase 1-8');
  console.log('=========================================\n');

  let pass = 0, fail = 0;
  function check(label, result) { result ? pass++ : fail++; ok(label, result); }

  // Phase 1
  console.log('--- Phase 1: MVP Core ---');
  let r = await req('GET', '/');
  check('Landing page', r.status === 200);

  r = await req('POST', '/api/auth/register', { email: 'uat@test.com', password: '123456', name: 'UAT User' });
  check('Register', r.status === 200 && r.body.user?.name === 'UAT User');
  TOKEN = r.body.token;
  API_KEY = r.body.user?.api_key;
  check('API key generated', !!API_KEY);

  r = await req('POST', '/api/auth/login', { email: 'uat@test.com', password: '123456' });
  check('Login', r.status === 200 && r.body.user?.plan === 'free');

  r = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${TOKEN}` });
  check('Get /me', r.status === 200 && r.body.name === 'UAT User');

  r = await req('GET', '/app.html');
  check('App page', r.status === 200);

  r = await req('POST', '/api/analyze', { videoId: 'dQw4w9WgXcQ', clipLength: 30, numClips: 2 });
  check('Analyze', r.status === 200 && Array.isArray(r.body.suggestions));

  // Phase 2
  console.log('\n--- Phase 2: Payment ---');
  r = await req('GET', '/api/payment/plans');
  check('Plans', r.status === 200 && r.body.plans?.length === 3);

  r = await req('POST', '/api/payment/checkout', { plan: 'pro' }, { Authorization: `Bearer ${TOKEN}` });
  check('Checkout (no Stripe)', r.body.error?.includes('belum dikonfigurasi'));

  r = await req('POST', '/api/coupon/create', { code: 'UAT100', discount_type: 'amount', discount_value: 0, credits_bonus: 50 }, { Authorization: `Bearer ${TOKEN}` });
  check('Create coupon', r.status === 200 && r.body.ok);

  r = await req('POST', '/api/coupon/apply', { code: 'UAT100' }, { Authorization: `Bearer ${TOKEN}` });
  check('Apply coupon', r.status === 200 && r.body.credits > 0);

  // Phase 3
  console.log('\n--- Phase 3: AI ---');
  r = await req('GET', '/api/ai/status');
  check('AI status', r.status === 200 && r.body.model);

  r = await req('POST', '/api/ai/smart-crop', { videoPath: '/tmp/test.mp4' }, { Authorization: `Bearer ${TOKEN}` });
  check('Smart crop', r.status === 200 && r.body.method);

  // Phase 4
  console.log('\n--- Phase 4: Templates ---');
  r = await req('GET', '/api/templates/captions');
  check('Captions', r.status === 200 && r.body.presets?.length >= 10);

  r = await req('GET', '/api/templates/resolutions');
  check('Resolutions', r.status === 200 && r.body.resolutions?.length === 3);

  r = await req('GET', '/api/templates/formats');
  check('Formats', r.status === 200 && r.body.formats?.length === 2);

  r = await req('GET', '/api/templates/platforms');
  check('Platforms', r.status === 200 && r.body.platforms?.length === 4);

  // Phase 5
  console.log('\n--- Phase 5: Analytics ---');
  r = await req('GET', '/api/analytics/stats', null, { Authorization: `Bearer ${TOKEN}` });
  check('Stats', r.status === 200 && r.body.credits > 0);

  r = await req('GET', '/api/analytics/history', null, { Authorization: `Bearer ${TOKEN}` });
  check('History', r.status === 200 && Array.isArray(r.body.clips));

  r = await req('GET', '/api/analytics/activity', null, { Authorization: `Bearer ${TOKEN}` });
  check('Activity', r.status === 200 && Array.isArray(r.body.activity));

  // Phase 6
  console.log('\n--- Phase 6: API v1 ---');
  r = await req('GET', '/api/v1/docs');
  check('API docs', r.status === 200 && r.body.endpoints?.length >= 5);

  // Wait for MemStore to settle
  await new Promise(resolve => setTimeout(resolve, 500));
  r = await req('GET', '/api/v1/key', null, { 'X-API-Key': API_KEY });
  check('API key valid', r.status === 200 && r.body.apiKey === API_KEY);

  r = await req('GET', '/api/v1/projects', null, { 'X-API-Key': 'invalid' });
  check('Invalid API key rejected', r.status === 401);

  r = await req('GET', '/api/v1/projects');
  check('No API key rejected', r.status === 401);

  // Phase 7
  console.log('\n--- Phase 7: PWA ---');
  r = await req('GET', '/manifest.json');
  check('Manifest', r.status === 200 && r.body.name === 'YT Clipper');

  r = await req('GET', '/sw.js');
  check('Service Worker', r.status === 200);

  // Phase 8
  console.log('\n--- Phase 8: Scale ---');
  r = await req('GET', '/api/health');
  check('Health', r.status === 200 && r.body.status === 'ok');

  // Security
  console.log('\n--- Security ---');
  const headers = await new Promise(resolve => {
    http.get(`${BASE}/`, res => {
      resolve(res.headers);
      res.resume();
    });
  });
  check('X-Content-Type-Options', headers['x-content-type-options'] === 'nosniff');
  check('X-Frame-Options', headers['x-frame-options'] === 'DENY');
  check('X-XSS-Protection', headers['x-xss-protection'] === '1; mode=block');
  check('Referrer-Policy', headers['referrer-policy'] === 'strict-origin-when-cross-origin');

  // Summary
  console.log('\n=========================================');
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log('=========================================');

  process.exit(fail > 0 ? 1 : 0);
}

run();
