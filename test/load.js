#!/usr/bin/env node
'use strict';

const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT = parseInt(process.env.CONCURRENT || '10');
const DURATION = parseInt(process.env.DURATION || '30'); // seconds

let total = 0, errors = 0, latency = [];

function request(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        latency.push(ms);
        total++;
        if (res.statusCode >= 400) errors++;
        resolve();
      });
    }).on('error', () => {
      errors++;
      total++;
      resolve();
    });
  });
}

async function run() {
  console.log(`Load test: ${CONCURRENT} concurrent, ${DURATION}s duration`);
  console.log(`Target: ${BASE}`);
  console.log('---');

  const end = Date.now() + DURATION * 1000;
  const workers = [];

  for (let i = 0; i < CONCURRENT; i++) {
    workers.push((async () => {
      const paths = ['/', '/api/health', '/login.html', '/api/payment/plans', '/api/templates/captions'];
      while (Date.now() < end) {
        const path = paths[Math.floor(Math.random() * paths.length)];
        await request(path);
      }
    })());
  }

  await Promise.all(workers);

  // Stats
  latency.sort((a, b) => a - b);
  const avg = Math.round(latency.reduce((s, v) => s + v, 0) / latency.length);
  const p50 = latency[Math.floor(latency.length * 0.5)];
  const p95 = latency[Math.floor(latency.length * 0.95)];
  const p99 = latency[Math.floor(latency.length * 0.99)];

  console.log('---');
  console.log(`Results:`);
  console.log(`  Total requests: ${total}`);
  console.log(`  Errors: ${errors} (${(errors/total*100).toFixed(1)}%)`);
  console.log(`  RPS: ${(total/DURATION).toFixed(1)}`);
  console.log(`  Latency: avg=${avg}ms, p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);
}

run().catch(console.error);
