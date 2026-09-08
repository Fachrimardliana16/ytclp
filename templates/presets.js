'use strict';

// ===== Caption Template Presets =====
const CAPTION_PRESETS = [
  {
    id: 'tiktok-bold',
    name: 'TikTok Bold',
    platform: 'tiktok',
    font: 'Impact',
    fontSize: 'large',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    position: 'center',
    animation: 'bounce',
    background: 'none',
  },
  {
    id: 'reels-minimal',
    name: 'Reels Minimal',
    platform: 'instagram',
    font: 'Helvetica Neue',
    fontSize: 'medium',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'center',
    animation: 'fade',
    background: 'none',
  },
  {
    id: 'shorts-clean',
    name: 'Shorts Clean',
    platform: 'youtube',
    font: 'Roboto',
    fontSize: 'medium',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'bottom',
    animation: 'typewriter',
    background: 'blur',
  },
  {
    id: 'viral-red',
    name: 'Viral Red',
    platform: 'tiktok',
    font: 'Impact',
    fontSize: 'large',
    color: '#FF0000',
    strokeColor: '#FFFFFF',
    strokeWidth: 4,
    position: 'top',
    animation: 'bounce',
    background: 'none',
  },
  {
    id: 'neon-glow',
    name: 'Neon Glow',
    platform: 'tiktok',
    font: 'Orbitron',
    fontSize: 'large',
    color: '#00FF88',
    strokeColor: '#003322',
    strokeWidth: 3,
    position: 'center',
    animation: 'fade',
    background: 'none',
  },
  {
    id: 'news-ticker',
    name: 'News Ticker',
    platform: 'youtube',
    font: 'Arial',
    fontSize: 'medium',
    color: '#FFFFFF',
    strokeColor: '#CC0000',
    strokeWidth: 0,
    position: 'bottom',
    animation: 'typewriter',
    background: 'solid',
    bgColor: '#CC0000',
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    platform: 'instagram',
    font: 'Caveat',
    fontSize: 'large',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'center',
    animation: 'fade',
    background: 'none',
  },
  {
    id: 'gaming-neon',
    name: 'Gaming Neon',
    platform: 'tiktok',
    font: 'Press Start 2P',
    fontSize: 'small',
    color: '#FF00FF',
    strokeColor: '#660066',
    strokeWidth: 3,
    position: 'top',
    animation: 'none',
    background: 'none',
  },
  {
    id: 'corporate-pro',
    name: 'Corporate Pro',
    platform: 'linkedin',
    font: 'Montserrat',
    fontSize: 'medium',
    color: '#FFFFFF',
    strokeColor: '#1A1A2E',
    strokeWidth: 2,
    position: 'bottom',
    animation: 'fade',
    background: 'solid',
    bgColor: '#1A1A2E',
  },
  {
    id: 'retro-80s',
    name: 'Retro 80s',
    platform: 'tiktok',
    font: 'Pacifico',
    fontSize: 'large',
    color: '#FF6B6B',
    strokeColor: '#4ECDC4',
    strokeWidth: 3,
    position: 'center',
    animation: 'bounce',
    background: 'none',
  },
];

// ===== Resolution Options =====
const RESOLUTIONS = [
  { id: '720p', label: '720p HD', width: 1280, height: 720, suffix: '_720p' },
  { id: '1080p', label: '1080p Full HD', width: 1920, height: 1080, suffix: '_1080p' },
  { id: '4k', label: '4K Ultra HD', width: 3840, height: 2160, suffix: '_4k' },
];

// ===== Export Format Options =====
const FORMATS = [
  { id: 'mp4', label: 'MP4', extension: '.mp4', codec: 'h264' },
  { id: 'webm', label: 'WebM', extension: '.webm', codec: 'vp9' },
];

// ===== Platform Presets =====
const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok', resolution: '1080p', aspectRatio: '9:16', maxDuration: 60 },
  { id: 'instagram', label: 'Instagram Reels', resolution: '1080p', aspectRatio: '9:16', maxDuration: 90 },
  { id: 'youtube', label: 'YouTube Shorts', resolution: '1080p', aspectRatio: '9:16', maxDuration: 60 },
  { id: 'youtube-landscape', label: 'YouTube Long', resolution: '1080p', aspectRatio: '16:9', maxDuration: 300 },
];

function getPreset(id) {
  return CAPTION_PRESETS.find(p => p.id === id) || CAPTION_PRESETS[0];
}

function getPresetsByPlatform(platform) {
  return CAPTION_PRESETS.filter(p => p.platform === platform);
}

module.exports = { CAPTION_PRESETS, RESOLUTIONS, FORMATS, PLATFORMS, getPreset, getPresetsByPlatform };
