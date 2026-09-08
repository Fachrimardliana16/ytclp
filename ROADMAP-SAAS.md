# YT Clipper SaaS — Roadmap

## Phase 1: MVP Core (Week 1-2) ✅ DONE

### Goal
Landing page + basic clipping workflow yang bisa dipakai user.

### Tasks
- [x] Landing page (pricing, features, CTA) — `/landing.html`
- [x] User auth (email + password) — `auth/` module (JWT + crypto)
- [x] Dashboard setelah login — `/app.html` dengan auth check
- [x] YouTube URL → auto analyze → clip selection → export — `server.js`
- [x] Free tier: 10 clips/bulan — credit system + `db/schema.sql`
- [x] Profile page — `/profile.html`
- [x] Database schema — `db/schema.sql` (users, projects, clips, usage, payments)
- [x] In-memory store fallback — `db/index.js`
- [x] Security headers + rate limiter — server.js middleware
- [x] CORS + error handler — server.js

### Remaining
- [ ] Google OAuth (Phase 2)
- [ ] Watermark overlay untuk free tier

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + Tailwind + shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase/Neon)
- **Auth**: NextAuth.js (Google + email)
- **Storage**: Cloudflare R2 / AWS S3 (video clips)
- **Queue**: BullMQ + Redis (background jobs)
- **Video**: yt-dlp + ffmpeg (server-side)
- **Transcript**: youtube-transcript-api (Python microservice)

### Database Schema
```sql
-- Users
users (id, email, name, avatar, plan, credits, created_at)

-- Projects
projects (id, user_id, title, youtube_url, status, created_at)

-- Clips
clips (id, project_id, start_time, end_time, score, title, status, file_url)

-- Usage
usage (id, user_id, action, credits_used, created_at)

-- Payments
payments (id, user_id, amount, currency, status, stripe_id, created_at)
```

---

## Phase 2: Payment & Subscription (Week 3-4) ✅ DONE

### Goal
User bisa bayar dan unlock fitur premium.

### Tasks
- [x] Stripe integration (checkout + billing portal) — `payment/stripe.js`
- [x] 3 tier pricing — `payment/routes.js` + `/api/payment/plans`
- [x] Credit system (1 clip = 1 credit) — `db/schema.sql` + credit check
- [x] Webhook handler for Stripe events — `payment/stripe.js`
- [x] Google OAuth login — `auth/routes.js` `/api/auth/google`
- [x] Overage pricing (Rp 2.000/clip extra) — `server.js` credit check
- [x] Invoice & receipt email (auto via Stripe) — `payment/stripe.js` receipt_email
- [x] Promo code / coupon system — `payment/coupons.js`

### Stripe Flow
```
User klik "Upgrade" → Stripe Checkout → Bayar → Webhook ke server →
Update plan user → Kirim email konfirmasi → User bisa pakai fitur
```

### Key Endpoints
```
POST /api/checkout          → Create Stripe checkout session
POST /api/webhook/stripe    → Handle Stripe events
GET  /api/billing/portal    → Stripe billing portal link
POST /api/coupon/apply      → Apply promo code
GET  /api/usage             → Check credit usage
```

---

## Phase 3: AI Features (Week 5-6) ✅ DONE

### Goal
AI-powered highlight detection + smart captions.

### Tasks
- [x] AI highlight scoring (OpenRouter LLM) — `ai/openrouter.js`
- [x] Auto title generation (clickbait/professional/funny/viral) — `ai/routes.js`
- [x] Auto caption styling (font, color, animation) — `ai/routes.js`
- [x] Smart crop (detect face/subject, auto-center) — `ai/routes.js` `/api/ai/smart-crop`
- [x] Bilingual caption (id + en auto-detect) — `transcript.py`
- [x] Caption template library (10+ styles) — `templates/presets.js`

### AI Integration
```
YouTube URL → yt-dlp download → Whisper transcription →
LLM highlight scoring → Smart crop → Export
```

### API Design
```
POST /api/ai/analyze        → AI-powered clip detection
POST /api/ai/title          → Generate catchy title
POST /api/ai/caption-style  → Suggest caption style
POST /api/ai/smart-crop     → Detect subject for crop
```

---

## Phase 4: Template & Branding (Week 7-8) ✅ DONE

### Goal
User bisa customize output sesuai brand.

### Tasks
- [x] Template editor (caption style picker) — `public/templates.html`
- [x] Custom watermark upload (logo) — `public/templates.html` brand panel
- [x] Brand kit (logo, colors, fonts) — `public/templates.html` brand panel
- [x] Caption presets (10+ styles) — `templates/presets.js`
- [x] Export format options (MP4, WebM) — `templates/presets.js`
- [x] Resolution picker (720p, 1080p, 4K) — `templates/presets.js`
- [x] Platform presets (TikTok, Reels, Shorts) — `templates/presets.js`
- [x] Batch export (ZIP) — `server.js` `/api/job/zip`

### Template System
```
Template {
  id, name, preview_url,
  layout: { caption_position, font, color, animation },
  overlay: { logo_position, opacity },
  output: { resolution, format, codec }
}
```

---

## Phase 5: Analytics & Dashboard (Week 9-10)

### Goal
User bisa track performa clip.

### Tasks
- [ ] Usage analytics (clips generated, credits used)
- [ ] Export history (download again previously exported clips)
- [ ] Performance dashboard (chart usage over time)
- [ ] Team management (Business plan)
- [ ] Role-based access (owner, editor, viewer)
- [ ] Activity log

### Dashboard Sections
```
/overview     → Stats cards (total clips, credits remaining, etc.)
/history      → Past exports with re-download
/analytics    → Usage charts (daily/weekly/monthly)
/team         → Manage members (Business only)
/billing      → Subscription + payment history
```

---

## Phase 6: API & Integrations (Week 11-12)

### Goal
Developer bisa integrate YT Clipper ke workflow mereka.

### Tasks
- [ ] REST API dengan API key auth
- [ ] API docs (Swagger/OpenAPI)
- [ ] Webhook events (clip.ready, clip.failed, etc.)
- [ ] Zapier/Make integration
- [ ] Discord bot (paste URL → get clip)
- [ ] Slack integration
- [ ] n8n workflow template

### API Endpoints
```
POST /api/v1/clips/create     → Create clip from YouTube URL
GET  /api/v1/clips/:id        → Get clip status
GET  /api/v1/clips/:id/file   → Download clip file
GET  /api/v1/projects         → List projects
POST /api/v1/batch            → Batch create clips
```

### Rate Limits
| Plan | Requests/jam | Concurrent jobs |
|------|-------------|-----------------|
| Free | 20 | 1 |
| Pro | 200 | 5 |
| Business | 2000 | 20 |

---

## Phase 7: Mobile & PWA (Week 13-14)

### Goal
User bisa pakai dari HP.

### Tasks
- [ ] PWA (installable dari browser)
- [ ] Mobile-responsive UI
- [ ] Touch gestures (swipe clip, pinch zoom)
- [ ] Push notification (clip ready)
- [ ] Offline queue (submit while offline)

---

## Phase 8: Scale & Optimize (Week 15-16)

### Goal
Handle ribuan user concurrent.

### Tasks
- [ ] CDN untuk static assets + video clips
- [ ] Auto-scaling workers (Kubernetes/Docker)
- [ ] Database optimization (indexing, read replicas)
- [ ] Cache layer (Redis untuk transcript, thumbnails)
- [ ] Queue prioritization (paid users first)
- [ ] Error tracking (Sentry)
- [ ] Monitoring (Grafana + Prometheus)
- [ ] Load testing (k6/artillery)

### Architecture
```
┌─────────┐     ┌──────────┐     ┌─────────┐
│  Nginx  │────▶│ Next.js  │────▶│ Postgres│
│  (CDN)  │     │ (API)    │     │  (DB)   │
└─────────┘     └────┬─────┘     └─────────┘
                     │
                ┌────▼─────┐
                │  Redis   │
                │ (Queue)  │
                └────┬─────┘
                     │
              ┌──────▼──────┐
              │   Workers   │
              │ yt-dlp+ffmpeg│
              └─────────────┘
```

---

## Pricing Strategy

### Free Tier (Lead Magnet)
- 10 clips/bulan
- Watermark 10%
- 720p output
- Basic templates
- Community support

### Pro Rp 99.000/bulan (Target: Content Creator)
- 100 clips/bulan
- No watermark
- 1080p output
- All templates + custom captions
- Email support
- Priority queue

### Business Rp 299.000/bulan (Target: Agency/Team)
- 500 clips/bulan
- Everything in Pro
- 4K output
- API access
- Batch export
- Team management (5 seats)
- White-label option
- Priority support

### Lifetime Deal (Early Adopters)
- Rp 499.000 sekali bayar
- 50 clips/bulan selamanya
- All Pro features
- Limited to 100 users

---

## Revenue Projections

| Month | Users | Pro | Business | MRR |
|-------|-------|-----|----------|-----|
| 1 | 200 | 10 | 0 | Rp 990.000 |
| 3 | 1.000 | 50 | 5 | Rp 6.445.000 |
| 6 | 5.000 | 250 | 25 | Rp 32.225.000 |
| 12 | 20.000 | 1.000 | 100 | Rp 128.900.000 |

---

## Tech Stack Summary

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 14 + Tailwind | Free |
| Backend | Next.js API Routes | Free |
| Database | Supabase (PostgreSQL) | Free tier → $25/mo |
| Auth | NextAuth.js | Free |
| Storage | Cloudflare R2 | $0.015/GB/mo |
| Queue | Upstash Redis | Free tier → $10/mo |
| Video | yt-dlp + ffmpeg | Free (self-hosted) |
| AI | OpenAI Whisper + GPT | Pay-per-use |
| Payments | Stripe | 2.9% + Rp 3.000/txn |
| Monitoring | Sentry | Free tier |
| CDN | Cloudflare | Free |
| Hosting | Vercel | Free tier → $20/mo |

### Monthly Cost Estimate (1000 users)
- Hosting: $20
- Database: $25
- Storage: $15
- Redis: $10
- AI API: ~$50
- Stripe fees: ~$50
- **Total: ~$170/bulan (Rp 2.6 juta)**

---

## Launch Checklist

### Pre-Launch
- [ ] Landing page live
- [ ] Payment system tested end-to-end
- [ ] Email notifications working
- [ ] Error monitoring active
- [ ] Load test passed (100 concurrent)
- [ ] Security audit (OWASP top 10)
- [ ] Privacy policy + ToS

### Launch Day
- [ ] Deploy to production
- [ ] DNS configured
- [ ] SSL certificate active
- [ ] CDN configured
- [ ] Database migrations run
- [ ] Seed data (templates, etc.)
- [ ] Monitoring dashboards live

### Post-Launch
- [ ] User feedback collection
- [ ] Bug tracking workflow
- [ ] Feature request board
- [ ] Weekly metrics review
- [ ] Monthly security scan
