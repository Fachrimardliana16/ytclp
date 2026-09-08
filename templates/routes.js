'use strict';

const express = require('express');
const { CAPTION_PRESETS, RESOLUTIONS, FORMATS, PLATFORMS, getPreset, getPresetsByPlatform } = require('./presets');

const router = express.Router();

// ===== List all caption presets =====
router.get('/captions', (req, res) => {
  const { platform } = req.query;
  const presets = platform ? getPresetsByPlatform(platform) : CAPTION_PRESETS;
  res.json({ presets });
});

// ===== Get single preset =====
router.get('/captions/:id', (req, res) => {
  const preset = getPreset(req.params.id);
  res.json({ preset });
});

// ===== List resolutions =====
router.get('/resolutions', (req, res) => {
  res.json({ resolutions: RESOLUTIONS });
});

// ===== List formats =====
router.get('/formats', (req, res) => {
  res.json({ formats: FORMATS });
});

// ===== List platforms =====
router.get('/platforms', (req, res) => {
  res.json({ platforms: PLATFORMS });
});

// ===== Get all template options =====
router.get('/all', (req, res) => {
  res.json({
    captions: CAPTION_PRESETS,
    resolutions: RESOLUTIONS,
    formats: FORMATS,
    platforms: PLATFORMS,
  });
});

module.exports = router;
