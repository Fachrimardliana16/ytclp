#!/usr/bin/env node
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { execFile } = require('child_process');
const path = require('path');
const { validateClipRequest, validateClipRange } = require('./validate');

// Reuse shared logic from server.js by requiring it
const serverExports = (() => {
  // Extract functions by running server.js module exports
  // server.js doesn't export, so we inline the minimal needed functions
  const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
  const PORTRAIT_CROP = 'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
  const SUB_STYLE = 'FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2';

  function fmtTimeDL(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function fmtSrt(sec) {
    if (sec < 0) sec = 0;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
  function safeName(s) { return (s || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50); }
  function fmtTimeRange(start, end) { return `${fmtTimeDL(start)}-${fmtTimeDL(end)}`.replace(/:/g, '-'); }

  function fetchTranscript(videoId) {
    return new Promise((resolve, reject) => {
      const py = path.join(__dirname, 'venv', 'bin', 'python3');
      execFile(py, [path.join(__dirname, 'transcript.py'), videoId], { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try {
          const r = JSON.parse(stdout);
          if (!r.ok) return reject(new Error(r.error));
          resolve({ segments: r.segments, title: r.title || 'Unknown' });
        } catch { reject(new Error('Parse error')); }
      });
    });
  }

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

  return { fmtTimeDL, fmtSrt, safeName, fmtTimeRange, fetchTranscript, analyzeTranscript, FONT_PATH, PORTRAIT_CROP, SUB_STYLE };
})();

const { fmtTimeDL, safeName, fmtTimeRange, fetchTranscript, analyzeTranscript } = serverExports;
const fs = require('fs');
const os = require('os');

const server = new Server({ name: 'yt-clipper', version: '1.0.0' }, { capabilities: { tools: {} } });
const jobs = new Map();

const TOOLS = [
  { name: 'analyze_video', description: 'Analyze YouTube video transcript and suggest highlight clips.', inputSchema: { type: 'object', properties: { videoId: { type: 'string', description: 'YouTube URL or 11-char ID' }, clipLength: { type: 'number', default: 30 }, numClips: { type: 'number', default: 8 } }, required: ['videoId'] } },
  { name: 'get_transcript', description: 'Fetch transcript for a YouTube video (auto-detect id/en).', inputSchema: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'] } },
  { name: 'export_clip', description: 'Download and export a clip as MP4 (landscape or portrait with captions).', inputSchema: { type: 'object', properties: { videoId: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' }, title: { type: 'string' }, format: { type: 'string', enum: ['landscape', 'portrait'], default: 'landscape' }, withSubtitles: { type: 'boolean', default: true }, transcript: { type: 'array', items: { type: 'object' } } }, required: ['videoId', 'start', 'end'] } },
  { name: 'get_job_status', description: 'Check status of a job.', inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case 'analyze_video': {
        const v = validateClipRequest(args); if (!v.ok) return { content: [{ type: 'text', text: v.errors.join('; ') }], isError: true };
        const job = { id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'analyze', status: 'processing', createdAt: Date.now() };
        jobs.set(job.id, job);
        fetchTranscript(v.videoId).then(r => {
          job.status = 'completed'; job.suggestions = analyzeTranscript(r.segments, v.clipLength, v.numClips); job.totalSegments = r.segments.length; job.transcript = r.segments;
        }).catch(e => { job.status = 'failed'; job.error = e.message; });
        return { content: [{ type: 'text', text: JSON.stringify({ jobId: job.id, status: 'processing' }) }] };
      }
      case 'get_transcript': {
        const vid = require('./validate').extractVideoId(args.videoId);
        if (!vid) return { content: [{ type: 'text', text: 'Invalid videoId' }], isError: true };
        const r = await fetchTranscript(vid);
        return { content: [{ type: 'text', text: JSON.stringify({ transcript: r.segments, title: r.title }) }] };
      }
      case 'export_clip': {
        const v = validateClipRange(args); if (!v.ok) return { content: [{ type: 'text', text: v.errors.join('; ') }], isError: true };
        const portrait = args.format === 'portrait', withSubs = args.withSubtitles !== false;
        const job = { id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'export', status: 'preparing', progress: 0, fileName: '', filePath: '', error: '', createdAt: Date.now(), videoId: v.videoId, start: v.start, end: v.end, title: args.title || 'clip', transcript: args.transcript || [] };
        jobs.set(job.id, job);
        // Delegate to HTTP API via internal fetch or run inline
        const tmpFile = path.join(os.tmpdir(), `mcp_${job.id}.mp4`);
        const srtFile = path.join(os.tmpdir(), `cap_${job.id}.srt`);
        const prefix = safeName(job.title) + '_' + fmtTimeRange(v.start, v.end);
        const suffix = (portrait ? '_portrait' : '') + (withSubs ? '_sub' : '') + '.mp4';
        job.fileName = prefix + suffix;
        const destFile = path.join(os.homedir(), 'Downloads', job.fileName);
        const url = `https://www.youtube.com/watch?v=${v.videoId}`;
        const section = `*${fmtTimeDL(v.start)}-${fmtTimeDL(v.end)}`;
        job.status = 'downloading'; job.progress = 10;
        const dlCmd = `yt-dlp --download-sections "${section}" -f "bv*[vcodec*=avc1]+ba/b[acodec*=mp4a]/bv*+ba/b" --merge-output-format mp4 --restrict-filenames -o "${tmpFile}" "${url}"`;
        execFile('sh', ['-c', dlCmd], { timeout: 180000 }, (err) => {
          if (err) { job.status = 'failed'; job.error = err.message; return; }
          job.progress = 40; job.status = 'processing';
          // Build ffmpeg
          const vf = [];
          if (portrait) vf.push(serverExports.PORTRAIT_CROP);
          if (withSubs && job.transcript.length) {
            const overlay = (() => { const segs = job.transcript.filter(s => { const t = s.offset / 1000; return t >= v.start - 2 && t <= v.end + 2; }); return { captions: segs.map(s => s.text.trim()).filter(Boolean) }; })();
            if (overlay.captions.length) {
              let srt = ''; overlay.captions.forEach((cap, i) => { const seg = job.transcript.find(s => s.text.trim() === cap.trim()); const ss = seg ? seg.offset / 1000 : v.start + (i * 2); srt += `${i + 1}\n${(ss - v.start).toFixed(3).replace('.', ',')} --> ${((ss + (seg ? seg.duration / 1000 : 2)) - v.start).toFixed(3).replace('.', ',')}\n${cap}\n\n`; });
              fs.writeFileSync(srtFile, srt);
              const srtPath = srtFile.replace(/'/g, "\\'").replace(/:/g, "\\:");
              vf.push(`subtitles='${srtPath}':force_style='${serverExports.SUB_STYLE}'`);
            }
          }
          const ffCmd = vf.length ? `ffmpeg -y -i "${tmpFile}" -vf "${vf.join(',')}" -c:v libx264 -preset fast -crf 23 -c:a ${portrait ? 'aac -b:a 128k' : 'copy'} "${destFile}"` : `cp "${tmpFile}" "${destFile}"`;
          job.progress = 60;
          execFile('sh', ['-c', ffCmd], { timeout: 120000 }, (err2) => {
            try { fs.unlinkSync(tmpFile); } catch {} try { fs.unlinkSync(srtFile); } catch {}
            if (err2) { job.status = 'failed'; job.error = err.message; return; }
            job.progress = 100; job.status = 'completed'; job.filePath = destFile;
          });
        });
        return { content: [{ type: 'text', text: JSON.stringify({ jobId: job.id, status: 'processing' }) }] };
      }
      case 'get_job_status': {
        const job = jobs.get(args.jobId);
        if (!job) return { content: [{ type: 'text', text: 'Not found' }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify({ id: job.id, status: job.status, progress: job.progress, fileName: job.fileName, error: job.error }) }] };
      }
      default: return { content: [{ type: 'text', text: `Unknown: ${name}` }], isError: true };
    }
  } catch (err) { return { content: [{ type: 'text', text: err.message }], isError: true }; }
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    const http = require('http');
    const port = parseInt(process.env.MCP_PORT || '3001', 10);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => Math.random().toString(36).slice(2) });
    server.connect(transport);
    http.createServer(async (req, res) => {
      if (req.url === '/mcp' && req.method === 'POST') await transport.handleRequest(req, res);
      else { res.writeHead(404); res.end(); }
    }).listen(port, '127.0.0.1', () => console.error(`MCP HTTP on :${port}/mcp`));
  } else {
    await server.connect(new StdioServerTransport());
    console.error('MCP stdio connected');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
