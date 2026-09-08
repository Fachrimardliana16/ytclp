'use strict';

// ===== Input validation for yt-clipper endpoints =====
// Reusable across server.js, MCP server, and tests.

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const MAX_CLIP_LENGTH = 300; // seconds
const MIN_CLIP_LENGTH = 5;
const MAX_NUM_CLIPS = 20;
const MIN_NUM_CLIPS = 1;
const ALLOWED_OUTPUT_ROOTS = (() => {
  const os = require('os');
  return [os.homedir(), require('path').join(process.cwd(), '.tmp')];
})();

function extractVideoId(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const patterns = [
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

function validateClipRequest(body) {
  const errors = [];
  const videoId = extractVideoId(body.videoId);
  if (!videoId) errors.push('videoId must be a valid YouTube URL or 11-char ID');

  const clipLength = Number(body.clipLength);
  if (!Number.isFinite(clipLength) || clipLength < MIN_CLIP_LENGTH || clipLength > MAX_CLIP_LENGTH) {
    errors.push(`clipLength must be between ${MIN_CLIP_LENGTH} and ${MAX_CLIP_LENGTH} seconds`);
  }

  const numClips = Number(body.numClips);
  if (!Number.isFinite(numClips) || !Number.isInteger(numClips) || numClips < MIN_NUM_CLIPS || numClips > MAX_NUM_CLIPS) {
    errors.push(`numClips must be an integer between ${MIN_NUM_CLIPS} and ${MAX_NUM_CLIPS}`);
  }

  return { ok: errors.length === 0, errors, videoId, clipLength, numClips };
}

function validateClipRange(body) {
  const errors = [];
  const videoId = extractVideoId(body.videoId);
  if (!videoId) errors.push('videoId must be a valid YouTube URL or 11-char ID');

  const start = Number(body.start);
  const end = Number(body.end);
  if (!Number.isFinite(start) || start < 0) errors.push('start must be a non-negative number');
  if (!Number.isFinite(end) || end < 0) errors.push('end must be a non-negative number');
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    errors.push('end must be greater than start');
  }

  return { ok: errors.length === 0, errors, videoId, start, end };
}

function validateOutputPath(filePath) {
  const path = require('path');
  const resolved = path.resolve(filePath);
  for (const root of ALLOWED_OUTPUT_ROOTS) {
    const rootResolved = path.resolve(root);
    if (resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)) {
      return { ok: true, resolved };
    }
  }
  return { ok: false, resolved, error: 'output path escapes allowed roots' };
}

module.exports = {
  extractVideoId,
  validateClipRequest,
  validateClipRange,
  validateOutputPath,
  MAX_CLIP_LENGTH,
  MIN_CLIP_LENGTH,
  MAX_NUM_CLIPS,
  MIN_NUM_CLIPS
};