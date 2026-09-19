# PatriciaX (Visionario8)

> **Edge-native visual regression testing and automated rendering diagnostics powered by Cloudflare Workers, Playwright, and Durable Objects.**

```
   Cloudflare Pages / Vercel Deploy Webhook
                     │
                     ▼
       ┌───────────────────────────┐
       │   PatriciaX Hono Worker   │ ── API Key Authorization
       └─────────────┬─────────────┘
                     │
                     ▼
       ┌───────────────────────────┐
       │     DiagnosticSession     │ ── Durable Object (Stateful Coordinator)
       │    (Real-time Status)     │
       └─────────────┬─────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 ┌──────────────┐          ┌──────────────┐
 │  Playwright  │          │   WCAG & LCP │
 │Edge Execution│          │Diagnostics   │
 └──────┬───────┘          └──────┬───────┘
        │                         │
        └────────────┬────────────┘
                     ▼
       ┌───────────────────────────┐
       │  R2 Screenshots + KV Index│
       └───────────────────────────┘
```

Visual bugs slip into production because traditional CI pipelines rely exclusively on DOM assertion tests. Headless unit checks cannot detect misaligned layouts, unreadable contrast ratios, or broken dynamic renders under real browser viewports.

`PatriciaX` transforms visual QA into an autonomous edge microservice. Built on Cloudflare Workers and Playwright, it executes parallel viewport capture, evaluates WCAG AA/AAA accessibility contrast compliance, tracks Core Web Vitals (LCP, FID, CLS), and maintains session state in Durable Objects.

---

## ✦ System Architecture & Capabilities

- **Edge-Hosted Playwright**: Runs headless Chromium sessions directly at Cloudflare edge nodes with intelligent concurrency pooling.
- **Stateful Durable Objects**: `DiagnosticSession` tracks execution lifecycles (`initializing` $\to$ `capturing` $\to$ `diagnosing` $\to$ `completed`).
- **Automated Deploy Hooks**: Webhooks trigger instant full-site visual regression audits upon git push or Cloudflare Pages deployments.
- **WCAG Accessibility Engine**: Computes relative luminance and contrast ratios across rendered text elements in accordance with WCAG 2.1 guidelines.
- **Zero-Trust Storage Tier**: High-resolution screenshots persist in Cloudflare R2, indexed by cryptographic hash in Cloudflare KV.

---

## ✦ API Contract & Usage

### 1. Trigger Visual Diagnostic Run
```bash
curl -X POST https://diagnostics.uniteia.workers.dev/api/run \
  -H "Authorization: Bearer $PATRICIAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewports": ["mobile", "desktop"],
    "checkContrast": true,
    "measureVitals": true
  }'
```

### 2. Poll Diagnostic Session Status
```bash
curl https://diagnostics.uniteia.workers.dev/api/status/session_8f3a12bc \
  -H "Authorization: Bearer $PATRICIAX_API_KEY"
```

### Response Schema
```json
{
  "sessionId": "session_8f3a12bc",
  "status": "completed",
  "metrics": {
    "lcpMs": 842,
    "cls": 0.012,
    "wcagViolations": 0
  },
  "artifacts": {
    "desktopScreenshot": "https://r2.uniteia.workers.dev/screenshots/desktop_8f3a.png",
    "mobileScreenshot": "https://r2.uniteia.workers.dev/screenshots/mobile_8f3a.png"
  }
}
```

---

## ✦ Local Development & Deployment

```bash
# Install dependencies with Bun:
bun install

# Verify configuration and TypeScript types:
bun run check

# Deploy directly to Cloudflare Edge:
wrangler deploy
```

---

## ✦ License
[MIT](LICENSE) © LERMF
