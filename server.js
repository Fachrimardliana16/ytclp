'use strict';

const { validateClipRequest, validateClipRange } = require('./validate');
const express = require('express');
const path = require('path');
const { execFile, exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const userDownloads = process.env.USER_DOWNLOADS || require('os').homedir() + '/Downloads';
const tmpDir = path.join(__dirname, '.tmp');
const PYTHON_PATH = process.env.PYTHON_PATH || path.join(__dirname, 'venv', 'bin', 'python3');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Security headers =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
});

// ===== Rate limiter =====
const rateLimit = new Map();
function rateLimiter(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const e = rateLimit.get(ip);
  if (!e || now - e.start > 60000) { rateLimit.set(ip, { start: now, count: 1 }); return next(); }
  e.count++;
  if (e.count > 30) return res.status(429).json({ error: 'Terlalu banyak request' });
  next();
}
app.use('/api/', (req, res, next) => {
  // Admin API: lebih longgar (dashboard butuh banyak request, sudah dilindungi requireAdmin)
  if (req.path.startsWith('/api/admin')) return next();
  return rateLimiter(req, res, next);
});

// ===== CORS =====
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ===== Auth =====
const { authMiddleware } = require('./auth/middleware');
const authRoutes = require('./auth/routes');
const paymentRoutes = require('./payment/routes');
const couponRoutes = require('./payment/coupons');
const aiRoutes = require('./ai/routes');
const templateRoutes = require('./templates/routes');
const analyticsRoutes = require('./analytics/routes');
const apiRoutes = require('./api/routes');
const adminRoutes = require('./admin/routes');
app.use(authMiddleware); // must be BEFORE auth routes
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/v1', apiRoutes);
app.use('/api/admin', adminRoutes);

// ===== Transcript cache (avoids re-fetching same video) =====
const transcriptCache = new Map(); // videoId -> {segments, title, ts}
const CACHE_TTL = 3600000; // 1h
function getCachedTranscript(videoId) {
  const c = transcriptCache.get(videoId);
  if (c && Date.now() - c.ts < CACHE_TTL) return Promise.resolve(c);
  return fetchTranscript(videoId).then(r => { transcriptCache.set(videoId, { ...r, ts: Date.now() }); return r; });
}

// ===== Concurrent job limiter =====
let activeJobs = 0;
const MAX_CONCURRENT = 3;
function acquireJob() { if (activeJobs >= MAX_CONCURRENT) throw new Error('Server sibuk, coba lagi nanti'); activeJobs++; }
function releaseJob() { activeJobs = Math.max(0, activeJobs - 1); }

// ===== Startup cleanup =====
function startupCleanup() {
  try {
    const files = fs.readdirSync(tmpDir);
    let cleaned = 0;
    for (const f of files) {
      const fp = path.join(tmpDir, f);
      try { const stat = fs.statSync(fp); if (Date.now() - stat.mtimeMs > 3600000) { fs.unlinkSync(fp); cleaned++; } } catch {}
    }
    if (cleaned) console.log(`  Cleaned ${cleaned} stale temp files`);
  } catch {}
}
startupCleanup();

// ===== Graceful shutdown =====
let httpServer;
function shutdown() {
  console.log('\nShutting down...');
  for (const [, job] of jobs) { if (['downloading', 'processing', 'rendering'].includes(job.status)) job.status = 'cancelled'; }
  if (httpServer) httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ===== Helpers =====
const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const PORTRAIT_CROP = 'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
const SUB_STYLE = 'FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2';

function fmtTimeDL(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtSrt(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function safeName(s) { return (s || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50); }
function fmtTimeRange(start, end) { return `${fmtTimeDL(start)}-${fmtTimeDL(end)}`.replace(/:/g, '-'); }

function ytDlpCmd(section, outFile, url) {
  return `yt-dlp --download-sections "${section}" -f "bv*[vcodec*=avc1]+ba/b[acodec*=mp4a]/bv*+ba/b" --merge-output-format mp4 --restrict-filenames -o "${outFile}" "${url}"`;
}

function findDownloadedFile(prefix, tmpDirPath) {
  const exact = path.join(tmpDirPath, prefix + '.mp4');
  if (fs.existsSync(exact)) return exact;
  const found = fs.readdirSync(tmpDirPath).filter(f => f.includes(prefix) && f.endsWith('.mp4'));
  return found.length > 0 ? path.join(tmpDirPath, found[0]) : null;
}

// ===== Fetch transcript =====
function fetchTranscript(videoId) {
  console.log(`  [${videoId}] Fetching transcript...`);
  return new Promise((resolve, reject) => {
    execFile(PYTHON_PATH, [path.join(__dirname, 'transcript.py'), videoId], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const r = JSON.parse(stdout);
        if (!r.ok) return reject(new Error(r.error || 'Transcript tidak tersedia'));
        console.log(`  Got ${r.count} segments`);
        resolve({ segments: r.segments, title: r.title || 'Unknown' });
      } catch { reject(new Error('Gagal parse output Python')); }
    });
  });
}

// ===== Transcript analysis =====
const KW_EN = ['wow','amazing','incredible','insane','crazy','epic','best','worst','secret','truth','shocking','never','always','actually','literally','wait','listen','look','check','watch','imagine','problem','solution','mistake','fail','success','win','struggle','overcome','suddenly','finally','why','how','did you know','fun fact','turns out','discover','reveal'];
const KW_ID = ['keren','gila','luar biasa','terbaik','rahasia','konyol','parah','penting','perhatikan','dengar','lihat','bayangkan','kenapa','gimana','cara','masalah','solusi','kesalahan','akhirnya','tiba-tiba','ternyata','kisah','pengalaman','momen','pertama','terakhir','suka','benci'];
const ALL_KW = [...KW_EN, ...KW_ID];

function analyzeTranscript(transcript, clipLength, numClips) {
  if (!transcript?.length) return [];
  const valid = transcript.filter(t => t && typeof t.offset === 'number' && typeof t.duration === 'number');
  if (!valid.length) return [];

  const totalDur = (valid[valid.length - 1].offset + valid[valid.length - 1].duration) / 1000;
  const win = Math.max(3, Math.floor(valid.length / 20));
  const scored = [];

  for (let i = 0; i < valid.length; i += win) {
    const chunk = valid.slice(i, Math.min(i + win, valid.length));
    const text = chunk.map(t => t.text || '').join(' ').toLowerCase();
    const st = (chunk[0].offset || 0) / 1000;
    const et = ((chunk[chunk.length - 1].offset || 0) + (chunk[chunk.length - 1].duration || 0)) / 1000;

    let score = 0;
    for (const kw of ALL_KW) if (text.includes(kw)) score += 2;
    score += (text.match(/!/g) || []).length * 3 + (text.match(/\?/g) || []).length * 2;
    score += Math.min(text.split(/\s+/).length / 5, 10);
    if (st < totalDur * 0.1 || st > totalDur * 0.9) score *= 0.3;
    const dur = et - st;
    if (dur >= 15 && dur <= 60) score *= 1.3; else if (dur < 10) score *= 0.5;
    if (i > 0) {
      const prev = new Set(valid.slice(Math.max(0, i - win), i).map(t => t.text || '').join(' ').toLowerCase().split(/\s+/));
      score += [...new Set(text.split(/\s+/))].filter(w => w.length > 3 && !prev.has(w)).length * 0.5;
    }
    scored.push({ startTime: st, endTime: et, score, text: chunk.map(t => t.text).join(' '), title: genTitle(chunk.map(t => t.text).join(' ')) });
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = [], gap = clipLength * 0.5;
  for (const s of scored) {
    if (selected.length >= numClips) break;
    if (selected.some(x => Math.abs(s.startTime - x.startTime) < gap)) continue;
    let start = Math.max(0, s.startTime - 2), end = start + clipLength;
    if (end > totalDur) { end = totalDur; start = Math.max(0, end - clipLength); }
    selected.push({ startTime: Math.round(start), endTime: Math.round(end), score: Math.round(s.score), title: s.title, summary: s.text.substring(0, 120) + (s.text.length > 120 ? '...' : ''), duration: Math.round(end - start) });
  }
  return selected.sort((a, b) => a.startTime - b.startTime);
}

function genTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 10) return clean.substring(0, 40);
  const sents = clean.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (!sents.length) return clean.substring(0, 40);
  let best = sents.reduce((a, b) => a.length > b.length ? a : b).trim();
  best = best.charAt(0).toUpperCase() + best.slice(1);
  return best.length > 60 ? best.substring(0, 57) + '...' : best;
}

// ===== Overlay/subtitle generation =====
function generateOverlay(transcript, start, end) {
  const segs = (transcript || []).filter(s => { const t = s.offset / 1000; return t >= start - 2 && t <= end + 2; });
  const text = segs.map(s => s.text).join(' ');
  const sents = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const hookWords = ['wow','gila','keren','parah','luar biasa','ternyata','rahasia','penting','akhirnya','terbaik'];
  const opening = (sents.find(s => hookWords.some(h => s.toLowerCase().includes(h))) || sents[0] || '').trim().substring(0, 50);

  const freq = {};
  text.split(/\s+/).filter(w => w.length > 4).forEach(w => { const k = w.toLowerCase().replace(/[^a-z]/g, ''); if (k.length > 3) freq[k] = (freq[k] || 0) + 1; });
  const topW = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const top = topW ? topW.charAt(0).toUpperCase() + topW.slice(1) : '';

  const longest = sents.reduce((a, b) => a.length > b.length ? a : b, '').trim();
  const bottom = longest.substring(0, 60) + (longest.length > 60 ? '...' : '');

  return { opening, top, bottom, captions: segs.map(s => s.text.trim()).filter(Boolean) };
}

function buildSrt(captions, transcript, start) {
  return captions.map((cap, i) => {
    const seg = (transcript || []).find(s => s.text.trim() === cap.trim());
    const ss = seg ? seg.offset / 1000 : start + (i * 2);
    const se = ss + (seg ? seg.duration / 1000 : 2);
    return `${i + 1}\n${fmtSrt(ss - start)} --> ${fmtSrt(se - start)}\n${cap}\n`;
  }).join('\n');
}

function buildDrawtextFilters(overlay) {
  const filters = [];
  const esc = t => t.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\\/g, '');
  if (overlay.opening) filters.push(`drawtext=fontfile='${FONT_PATH}':text='${esc(overlay.opening)}':fontsize=64:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3)':alpha='if(lt(t,0.5),t/0.5,if(gt(t,2.5),(3-t)/0.5,1))'`);
  if (overlay.top) filters.push(`drawtext=fontfile='${FONT_PATH}':text='${esc(overlay.top)}':fontsize=44:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=60`);
  if (overlay.bottom) filters.push(`drawtext=fontfile='${FONT_PATH}':text='${esc(overlay.bottom)}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-th-60`);
  return filters;
}

function buildFfmpegCmd(srcFile, destFile, { filters, srtFile, portrait, audioCodec = 'copy' }) {
  const vf = [];
  if (filters.length) vf.push(filters.join(','));
  if (srtFile) {
    // ffmpeg subtitles filter: path with ':' breaks parsing
    // Fix: copy SRT to /tmp/ (no colons in path)
    const tmpSrt = `/tmp/ytclip_${path.basename(srtFile)}`;
    try { fs.copyFileSync(srtFile, tmpSrt); } catch {}
    const escaped = tmpSrt.replace(/'/g, "'\\''");
    vf.push(`subtitles='${escaped}':force_style='${SUB_STYLE}'`);
  }
  if (portrait) vf.push(PORTRAIT_CROP);
  if (vf.length) return `ffmpeg -y -i "${srcFile}" -vf "${vf.join(',')}" -c:v libx264 -preset fast -crf 23 -c:a ${audioCodec === 'aac' ? 'aac -b:a 128k' : 'copy'} "${destFile}"`;
  return `cp "${srcFile}" "${destFile}"`;
}

// ===== API Routes =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeJobs, jobsQueued: [...jobs.values()].filter(j => ['preparing', 'downloading'].includes(j.status)).length, uptime: Math.round(process.uptime()) });
});

app.get('/api/transcript', async (req, res) => {
  try {
    const vid = require('./validate').extractVideoId(req.query.videoId);
    if (!vid) return res.status(400).json({ error: 'Invalid videoId' });
    const t = await fetchTranscript(vid);
    res.json({ transcript: t, videoId: vid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const v = validateClipRequest(req.body);
    if (!v.ok) return res.status(400).json({ error: v.errors.join('; ') });

    // Credit check for logged-in users
    if (req.user) {
      const db = require('./db');
      const user = await db.findById('users', req.user.id);
      if (user && user.credits <= 0) {
        return res.status(403).json({ error: 'Credits habis. Upgrade plan atau tunggu bulan depan.' });
      }
    }

    const result = await getCachedTranscript(v.videoId);
    res.json({ suggestions: analyzeTranscript(result.segments || [], v.clipLength, v.numClips), videoId: v.videoId, totalSegments: result.segments.length, transcript: result.segments || [] });
  } catch (err) { res.status(err.message.includes('transcript') || err.message.includes('Python') ? 400 : 500).json({ error: err.message }); }
});

// ===== Job system =====
const jobs = new Map();

function newJob(type, params) {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, type, status: 'preparing', progress: 0, fileName: '', filePath: '', error: '', createdAt: Date.now(), ...params };
  jobs.set(id, job);
  return job;
}

function dlClip(videoId, start, end, outFile) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const section = `*${fmtTimeDL(start)}-${fmtTimeDL(end)}`;
  return new Promise((resolve, reject) => {
    exec(ytDlpCmd(section, outFile, url), { timeout: 180000 }, (err, _, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      const found = findDownloadedFile(path.basename(outFile, '.mp4'), tmpDir);
      if (!found) return reject(new Error('File tidak ditemukan'));
      resolve(found);
    });
  });
}

function processClip(job, { portrait = false, withSubs = false, audioCodec = 'copy', watermark = false } = {}) {
  const { id, videoId, start, end, transcript } = job;
  const tmpFile = path.join(tmpDir, `job_${id}.mp4`);
  const srtFile = path.join(tmpDir, `cap_${id}.srt`);
  const prefix = safeName(job.title) + '_' + fmtTimeRange(start, end);
  const suffix = (portrait ? '_portrait' : '') + (withSubs ? '_sub' : '') + '.mp4';
  const fileName = prefix + suffix;
  const destFile = path.join(userDownloads, fileName);
  const done = () => { if (job._release) job._release(); };

  // Sync clip record status ke DB (fix UAT#5: history/analytics dashboard)
  async function syncClip(status, extra = {}) {
    try {
      if (job.clip_id) {
        const db = require('./db');
        await db.update('clips', job.clip_id, { status, ...extra });
      }
    } catch (e) { console.error('clip sync error:', e.message); }
  }

  const useOverlay = withSubs && hasDrawtext;
  const useSubs = withSubs && hasSubtitles;
  const useWatermark = watermark && hasDrawtext;

  job.status = 'downloading'; job.progress = 10;

  dlClip(videoId, start, end, tmpFile).then(srcFile => {
    job.progress = 40; job.status = 'processing';
    const overlay = useOverlay ? generateOverlay(transcript, start, end) : { opening: '', top: '', bottom: '', captions: [] };
    let useSrt = null;
    if (useSubs && overlay.captions.length) {
      fs.writeFileSync(srtFile, buildSrt(overlay.captions, transcript, start));
      useSrt = srtFile;
    }
    const filters = useOverlay ? buildDrawtextFilters(overlay) : [];
    if (useWatermark) {
      filters.push(`drawtext=fontfile='${FONT_PATH}':text='YT Clipper':fontsize=20:fontcolor=white@0.5:borderw=1:bordercolor=black@0.3:x=w-tw-20:y=h-th-20`);
    }
    const ffCmd = buildFfmpegCmd(srcFile, destFile, { filters, srtFile: useSrt, portrait, audioCodec });
    job.progress = 60;
    exec(ffCmd, { timeout: 120000 }, async (err2) => {
      try { fs.unlinkSync(srcFile); } catch {} try { fs.unlinkSync(srtFile); } catch {}
      if (err2) { job.status = 'failed'; job.error = 'Export gagal: ' + err2.message; await syncClip('failed'); done(); return; }
      job.progress = 90; job.status = 'rendering';
      setTimeout(async () => { job.progress = 100; job.status = 'completed'; job.fileName = fileName; job.filePath = destFile; await syncClip('completed', { file_url: destFile, file_size: fs.existsSync(destFile) ? fs.statSync(destFile).size : 0 }); done(); }, 300);
    });
  }).catch(async err => { job.status = 'failed'; job.error = err.message; await syncClip('failed'); done(); });
}

app.post('/api/job/start', async (req, res) => {
  try { acquireJob(); } catch (e) { return res.status(429).json({ error: e.message }); }
  const v = validateClipRange(req.body);
  if (!v.ok) { releaseJob(); return res.status(400).json({ error: v.errors.join('; ') }); }

  // Credit check + overage pricing (optional auth)
  if (req.user) {
    const db = require('./db');
    const user = await db.findById('users', req.user.id);
    if (user) {
      let creditsUsed = 1;
      let overage = 0;
      if (user.credits <= 0) {
        // Overage: Rp 2.000/clip for free, Rp 1.000/clip for pro
        overage = user.plan === 'pro' ? 1000 : user.plan === 'business' ? 500 : 2000;
        creditsUsed = 0; // don't deduct from credits, charge overage
      }
      await db.update('users', user.id, {
        credits: Math.max(0, user.credits - creditsUsed),
        credits_used: (user.credits_used || 0) + creditsUsed,
      });
      await db.insert('usage_log', { user_id: user.id, action: 'export', credits_used: creditsUsed, metadata: overage > 0 ? { overage, amount: overage } : null });
    }
  }

  const { videoId, start, end } = v;
  const title = req.body.title || 'clip';
  const withSubs = req.body.withSubtitles !== false;
  const portrait = req.body.format === 'portrait';
  const isFree = !req.user || (req.user && (!req.user.plan || req.user.plan === 'free'));
  const job = newJob('download', { videoId, start, end, title, transcript: req.body.transcript || [] });
  job._release = releaseJob;

  // Persist clip record agar history/analytics terisi (fix UAT#5)
  if (req.user) {
    try {
      const db = require('./db');
      const clip = await db.insert('clips', {
        user_id: req.user.id,
        start_time: start, end_time: end, title,
        status: 'exporting',
        format: portrait ? 'portrait' : 'landscape',
        with_subtitles: withSubs,
      });
      job.clip_id = clip.id;
    } catch (e) { console.error('clip insert error:', e.message); }
  }

  processClip(job, { portrait, withSubs, audioCodec: portrait ? 'aac' : 'copy', watermark: isFree });
  res.json({ jobId: job.id, status: job.status });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ id: job.id, status: job.status, progress: job.progress, completed: job.completed, fileName: job.fileName, error: job.error });
});

app.get('/api/job/:id/file', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'Not completed', status: job.status });
  if (!job.filePath || !fs.existsSync(job.filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(job.filePath, job.fileName);
});

// ===== Zip download =====
app.post('/api/job/zip', (req, res) => {
  const { clips: clipList } = req.body;
  if (!Array.isArray(clipList) || !clipList.length) return res.status(400).json({ error: 'clips array required' });

  const job = newJob('zip', { total: clipList.length, completed: 0 });
  const zipDir = path.join(tmpDir, job.id);
  fs.mkdirSync(zipDir, { recursive: true });

  let idx = 0;
  function next() {
    if (idx >= clipList.length) {
      job.status = 'zipping'; job.progress = 90;
      const zipName = `yt-clipper-${clipList.length}clips.zip`;
      const zipTmp = path.join(tmpDir, zipName);
      const files = fs.readdirSync(zipDir).filter(f => f.endsWith('.mp4'));
      if (!files.length) { job.status = 'failed'; job.error = 'No files'; return; }
      exec(`cd "${zipDir}" && zip -j "${zipTmp}" ${files.map(f => `"${f}"`).join(' ')}`, { timeout: 60000 }, (err) => {
        if (err) { job.status = 'failed'; job.error = 'Zip gagal: ' + err.message; return; }
        const dest = path.join(userDownloads, zipName);
        try { fs.copyFileSync(zipTmp, dest); fs.unlinkSync(zipTmp); fs.rmSync(zipDir, { recursive: true }); }
        catch (e) { job.status = 'failed'; job.error = e.message; return; }
        job.progress = 100; job.status = 'completed'; job.fileName = zipName; job.filePath = dest;
      });
      return;
    }
    const c = clipList[idx];
    const outFile = path.join(zipDir, safeName(c.title) + '_' + fmtTimeRange(c.start, c.end) + '.mp4');
    job.status = 'downloading'; job.progress = Math.round((idx / clipList.length) * 80);
    dlClip(c.videoId, c.start, c.end, outFile).then(() => { job.completed = ++idx; next(); })
      .catch(e => { console.error('Zip clip error:', e.message); job.completed = ++idx; next(); });
  }
  next();
  res.json({ jobId: job.id, status: job.status });
});

// Cleanup jobs >1h
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      if (job.filePath && fs.existsSync(job.filePath)) try { fs.unlinkSync(job.filePath); } catch {}
      jobs.delete(id);
    }
  }
}, 300000);

// ===== Debug =====
app.get('/api/debug', (req, res) => {
  let hasYtdlp = false;
  try { require('child_process').execSync('yt-dlp --version'); hasYtdlp = true; } catch {}
  res.json({ hasYtdlp, hasFfmpeg: !!hasFFmpeg, downloadsDir: userDownloads, tmpDir, jobs: jobs.size });
});

// ===== Request logger =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.url.startsWith('/api/')) {
      console.log(`  ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// ===== Global error handler =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', id: require('crypto').randomBytes(8).toString('hex') });
});

app.get('*', (req, res) => {
  // Serve landing for root, app for /app, auth pages, or 404
  if (req.path === '/') return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  const publicPages = ['/login.html', '/register.html', '/app.html', '/profile.html', '/landing.html'];
  if (publicPages.includes(req.path)) return res.sendFile(path.join(__dirname, 'public', req.path.slice(1)));
  res.status(404).sendFile(path.join(__dirname, 'public', 'landing.html'));
});
httpServer = app.listen(PORT, () => console.log(`\n✂  YT Clipper → http://localhost:${PORT}\n`));

// Check tools
let hasFFmpeg = false, hasDrawtext = false, hasSubtitles = false;
exec('yt-dlp --version', (e) => console.log(e ? '⚠  yt-dlp not found' : '✓  yt-dlp'));
exec('which ffmpeg', (e) => {
  hasFFmpeg = !e;
  if (hasFFmpeg) {
    exec('ffmpeg -filters 2>/dev/null', (e2, out) => {
      hasDrawtext = out.includes('drawtext');
      hasSubtitles = out.includes('subtitles');
      console.log(`✓  ffmpeg${hasDrawtext ? ' +drawtext' : ''}${hasSubtitles ? ' +subtitles' : ''}`);
      if (!hasDrawtext && !hasSubtitles) console.log('⚠  drawtext/subtitles not available - overlay disabled');
    });
  } else console.log('⚠  ffmpeg not found');
});
