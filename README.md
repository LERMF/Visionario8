# PatriciaX 🎭

**Visual Diagnostics Worker** powered by Cloudflare Playwright + Durable Objects

Automated screenshot capture, visual regression testing, and comprehensive diagnostics for UniTeiaAI.

---

## 🚀 Features

- **Browser Automation**: Playwright on Cloudflare Workers (edge-deployed browser testing)
- **Parallel Processing**: Up to 10 concurrent pages with intelligent rate limiting
- **Stateful Sessions**: Durable Objects for real-time progress tracking
- **Cloud Storage**: R2 for screenshots + KV for session indexing
- **Queue-Based**: Async job processing with automatic retries
- **Webhook Integration**: Auto-trigger on Cloudflare Pages deployments
- **Comprehensive Checks**:
  - Element visibility & dimensions
  - Color contrast (WCAG AA/AAA)
  - Broken images
  - Performance metrics (LCP, FID, CLS)
  - Layout diagnostics

---

## 📁 Project Structure

```
PatriciaX/
├── src/
│   ├── index.ts                           # Main worker entry
│   ├── types.ts                           # TypeScript types
│   ├── routes/
│   │   ├── api.ts                         # HTTP API endpoints
│   │   └── webhook.ts                     # Deployment webhooks
│   ├── services/
│   │   ├── playwright-executor.ts         # Browser management
│   │   ├── screenshot-capture.ts          # Screenshot logic
│   │   ├── visibility-diagnostics.ts      # Visual checks
│   │   ├── storage.ts                     # R2/KV operations
│   │   └── auth.ts                        # API key auth
│   ├── durable-objects/
│   │   └── DiagnosticSession.ts           # Stateful session manager
│   └── utils/
│       ├── logger.ts                      # Structured logging
│       ├── rate-limiter.ts                # Browser rate limits
│       ├── contrast-calculator.ts         # WCAG contrast
│       └── schema.ts                      # Zod validation
├── wrangler.toml                          # Worker configuration
├── package.json                           # Dependencies
└── README.md                              # This file
```

---

## 🛠️ Setup

### 1. Install Dependencies

```bash
cd /home/lermf/PROJETOS-2026-SOTA/PatriciaX
bun install
```

### 2. Create Cloudflare Resources

```bash
# Create R2 bucket for screenshots
wrangler r2 bucket create uniteia-diagnostics

# Create KV namespace for session indexing
wrangler kv namespace create DIAGNOSTICS_INDEX
# Copy the returned ID to wrangler.toml (line 38)

# Create queue for async processing
wrangler queues create uniteia-diagnostics-queue
wrangler queues create uniteia-diagnostics-dlq  # Dead-letter queue
```

### 3. Set Secrets

```bash
# Generate a secure API key
openssl rand -hex 32

# Set the API key
wrangler secret put API_KEY
# Paste the generated key when prompted

# (Optional) Set observability secrets
wrangler secret put DATADOG_API_KEY
wrangler secret put SENTRY_DSN
```

### 4. Configure Environment

Copy `.dev.vars` template and add your secrets for local development:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys
```

### 5. Deploy

```bash
# Deploy to staging
bun run deploy:staging

# Deploy to production
bun run deploy:production
```

---

## 📡 API Endpoints

### Base URL
- **Production**: `https://patriciax.uniteia.workers.dev`
- **Staging**: `https://patriciax-staging.uniteia.workers.dev`

### Authentication
All endpoints (except `/health` and `/webhook/*`) require API key:

```bash
# Via header (recommended)
curl -H "X-API-Key: your-api-key" https://patriciax.uniteia.workers.dev/api/run

# Via Bearer token
curl -H "Authorization: Bearer your-api-key" https://patriciax.uniteia.workers.dev/api/run
```

---

### `POST /api/run`

Start a new diagnostic session.

**Request Body**:
```json
{
  "pages": [
    {
      "path": "/comparativos",
      "name": "comparativos",
      "viewport": { "width": 1920, "height": 1080 },
      "waitUntil": "networkidle",
      "timeout": 60000
    }
  ],
  "options": {
    "parallelPages": 5,
    "timeout": 60000,
    "retries": 2,
    "checks": {
      "visibility": true,
      "contrast": true,
      "brokenImages": true,
      "performance": true
    }
  },
  "metadata": {
    "deploymentId": "abc123",
    "environment": "production",
    "branch": "main"
  }
}
```

**Response**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "reportUrl": "https://diagnostics.uniteia.com/550e8400.../report.json",
  "result": { ... }
}
```

---

### `GET /api/status/:sessionId`

Get real-time session progress.

**Response**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "capturing",
  "startedAt": 1706481234567,
  "pages": [
    {
      "path": "/comparativos",
      "status": "running",
      "screenshots": [],
      "diagnostics": null
    }
  ]
}
```

---

### `GET /api/report/:sessionId`

Get completed diagnostic report.

**Response**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "completed",
  "summary": {
    "totalPages": 5,
    "completedPages": 5,
    "totalScreenshots": 15,
    "totalIssues": 3,
    "duration": 45230
  },
  "pages": [ ... ]
}
```

---

### `GET /api/screenshot/:sessionId/:page/:type`

Download specific screenshot.

**Parameters**:
- `sessionId`: Session UUID
- `page`: Page name (e.g., `comparativos`)
- `type`: Screenshot type (`full`, `header`, `content`, `footer`)

**Response**: PNG image (Content-Type: `image/png`)

---

### `GET /api/latest`

Get the most recent diagnostic report.

---

### `DELETE /api/session/:sessionId`

Delete session data (screenshots + report).

---

### `GET /api/health`

Health check endpoint (no authentication required).

**Response**:
```json
{
  "status": "healthy",
  "service": "patriciax",
  "version": "1.0.0",
  "environment": "production"
}
```

---

## 🔗 Webhook Integration

### Cloudflare Pages Deployment Hook

Automatically trigger diagnostics after every production deployment.

**Setup**:
1. Go to Cloudflare Pages → `uniteia-web` → Settings → Webhooks
2. Click **Add Webhook**
3. **URL**: `https://patriciax.uniteia.workers.dev/webhook/deployment`
4. **Secret**: (optional, not currently validated)
5. **Trigger**: On deployment success

**Payload Example**:
```json
{
  "id": "abc123-deployment-id",
  "environment": "production",
  "deployment_trigger": {
    "metadata": {
      "branch": "main",
      "commit_hash": "a1b2c3d4",
      "commit_message": "Fix: CSS bug"
    }
  },
  "url": "https://abc123.uniteia-web.pages.dev",
  "production_branch": "main"
}
```

---

## 🧪 Usage Examples

### Example 1: On-Demand Diagnostics

```bash
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      { "path": "/comparativos" },
      { "path": "/reviews" },
      { "path": "/guias" }
    ]
  }'
```

### Example 2: Check Session Status

```bash
SESSION_ID="550e8400-e29b-41d4-a716-446655440000"

curl https://patriciax.uniteia.workers.dev/api/status/$SESSION_ID \
  -H "X-API-Key: $API_KEY"
```

### Example 3: Download Screenshot

```bash
curl https://patriciax.uniteia.workers.dev/api/screenshot/$SESSION_ID/comparativos/full \
  > comparativos-full.png
```

### Example 4: Get Latest Report

```bash
curl https://patriciax.uniteia.workers.dev/api/latest \
  -H "X-API-Key: $API_KEY" | jq '.summary'
```

---

## 🏗️ Development

### Local Development

```bash
# Start local dev server
bun run dev

# Test API locally
curl http://localhost:8787/api/health
```

### Type Checking

```bash
bun run typecheck
```

### Linting

```bash
bun run lint
bun run lint:fix
```

### Testing

```bash
bun test
bun test:watch
```

---

## 📊 Monitoring & Logs

### View Live Logs

```bash
wrangler tail patriciax-production
```

### Check Queue Status

```bash
wrangler queues list
wrangler queues consumer describe uniteia-diagnostics-queue
```

### Inspect R2 Storage

```bash
wrangler r2 object list uniteia-diagnostics --limit 20
```

---

## 🔒 Security

1. **API Key Protection**: Never commit API keys to git. Use `wrangler secret put`.
2. **CORS**: Only allows requests from `uniteia.com` domain.
3. **Rate Limiting**: Respects Cloudflare Browser Rendering limits (10 concurrent, 10/min).
4. **Secret Management**: All sensitive configs stored in Cloudflare Secrets.

---

## 💰 Cost Estimation

**Cloudflare Browser Rendering Pricing**: $5/million browser seconds

**Estimated Usage** (10 diagnostic runs/day × 5 pages × 30s per page):
- **Monthly browser time**: 45,000 seconds
- **Monthly cost**: ~$0.23

**Additional Services** (included in Workers Paid plan):
- R2 storage: ~50MB/month (negligible)
- KV reads: ~3,000/month (free tier covers 100K)
- Queue messages: ~300/month (free tier covers 1M)

**Total Estimated Cost**: < $1/month

---

## 🛟 Troubleshooting

### "Failed to launch browser"

**Cause**: Rate limit exceeded (10 concurrent browsers)

**Solution**: Reduce `parallelPages` in request options or wait 1 minute

### "Timeout waiting for navigation"

**Cause**: Page takes >60s to load

**Solution**: Increase `timeout` in page config or use `waitUntil: "load"` instead of `"networkidle"`

### "Screenshot not found"

**Cause**: R2 bucket not configured correctly

**Solution**: Check `wrangler.toml` binding and verify bucket exists

### "Unauthorized" on webhook

**Cause**: Webhook requests don't include API key

**Solution**: Webhooks use special authentication (no key required for `/webhook/*` endpoints)

---

## 📚 Resources

- [Cloudflare Browser Rendering Docs](https://developers.cloudflare.com/browser-rendering/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)

---

## 🤝 Contributing

PatriciaX is part of the UniTeiaAI SOTA 2026 stack.

**Project Location**: `/home/lermf/PROJETOS-2026-SOTA/PatriciaX/`

**Related Projects**:
- UniTeiaAI Gateway: `/home/lermf/PROJETOS-2026-SOTA/UniTeiaAI/apps/gateway/`
- UniTeiaAI Web: `/home/lermf/PROJETOS-2026-SOTA/UniTeiaAI/apps/web/`

---

## 📝 License

MIT License - UniTeiaAI Team © 2026

---

## 🎯 Roadmap

- [ ] Visual regression detection (pixel diff)
- [ ] AI-powered diagnostics (Workers AI integration)
- [ ] Performance budgets & alerts
- [ ] Slack/Discord notifications
- [ ] Historical trend charts
- [ ] Multi-viewport testing (mobile, tablet, desktop)
- [ ] Accessibility audits (WCAG full compliance)

---

**Built with ❤️ by the UniTeiaAI Team**

For questions or support, check the [AGENTS.md](../AGENTS.md) playbook or contact the development team.
