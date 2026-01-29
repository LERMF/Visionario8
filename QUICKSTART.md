# PatriciaX - Quick Start Guide

## 🚀 5-Minute Setup

Follow these steps to get PatriciaX running:

### Step 1: Install Dependencies (30 seconds)

```bash
cd /home/lermf/PROJETOS-2026-SOTA/PatriciaX
bun install
```

### Step 2: Create Cloudflare Resources (2 minutes)

```bash
# Create R2 bucket
wrangler r2 bucket create uniteia-diagnostics

# Create KV namespace
wrangler kv namespace create DIAGNOSTICS_INDEX
# IMPORTANT: Copy the ID from output and paste into wrangler.toml line 38

# Create queues
wrangler queues create uniteia-diagnostics-queue
wrangler queues create uniteia-diagnostics-dlq
```

**Edit `wrangler.toml` line 38**:
```toml
# Replace this line:
id = "<REPLACE_WITH_ACTUAL_ID>"

# With the ID from the KV create command:
id = "abc123def456..."  # Your actual KV namespace ID
```

### Step 3: Set API Key (30 seconds)

```bash
# Generate secure API key
API_KEY=$(openssl rand -hex 32)
echo "Your API key: $API_KEY"

# Save to Cloudflare Secrets
echo $API_KEY | wrangler secret put API_KEY

# Save to local .dev.vars for testing
echo "API_KEY=$API_KEY" > .dev.vars
```

### Step 4: Deploy (1 minute)

```bash
# Type check
bun run typecheck

# Deploy to production
bun run deploy
```

### Step 5: Test (1 minute)

```bash
# Set your API key
export PATRICIAX_API_KEY="<paste-your-key-here>"

# Test health endpoint
curl https://patriciax.uniteia.workers.dev/api/health

# Test diagnostic run
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $PATRICIAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      { "path": "/comparativos", "name": "comparativos" }
    ]
  }'
```

---

## 🎯 Next Steps

### Configure Cloudflare Pages Webhook

1. Go to: https://dash.cloudflare.com → Pages → `uniteia-web` → Settings → Webhooks
2. Click **Add Webhook**
3. Fill in:
   - **Name**: PatriciaX Visual Diagnostics
   - **URL**: `https://patriciax.uniteia.workers.dev/webhook/deployment`
   - **Trigger**: ✅ On deployment success
4. Click **Save**

Now PatriciaX will automatically run diagnostics after every production deployment!

### Set Up R2 Public Access (Optional)

To make screenshots publicly accessible:

```bash
wrangler r2 bucket update uniteia-diagnostics --public
```

Or configure custom domain:
1. R2 → `uniteia-diagnostics` → Settings → Public Access
2. Add custom domain: `diagnostics.uniteia.com`

---

## 🧪 Test Commands

```bash
# Health check
curl https://patriciax.uniteia.workers.dev/api/health

# Run diagnostics
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $PATRICIAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d @test-payload.json

# Check status
curl https://patriciax.uniteia.workers.dev/api/status/SESSION_ID \
  -H "X-API-Key: $PATRICIAX_API_KEY"

# Get latest report
curl https://patriciax.uniteia.workers.dev/api/latest \
  -H "X-API-Key: $PATRICIAX_API_KEY" | jq '.'
```

### Sample Test Payload (`test-payload.json`)

```json
{
  "pages": [
    { "path": "/", "name": "homepage" },
    { "path": "/comparativos", "name": "comparativos" },
    { "path": "/reviews", "name": "reviews" }
  ],
  "options": {
    "parallelPages": 3,
    "checks": {
      "visibility": true,
      "contrast": true,
      "brokenImages": true,
      "performance": true
    }
  },
  "metadata": {
    "environment": "production",
    "triggeredBy": "manual-test"
  }
}
```

---

## 🐛 Troubleshooting

### Error: "KV namespace not found"

**Fix**: Make sure you updated `wrangler.toml` line 38 with the actual KV namespace ID from Step 2.

### Error: "API_KEY secret not set"

**Fix**: Run `wrangler secret put API_KEY` and paste your key.

### Error: "Failed to launch browser"

**Fix**: You might have hit the rate limit. Wait 60 seconds and try again.

### Local Development Issues

```bash
# Use --remote flag to test with real browser
wrangler dev --remote

# Check logs
wrangler tail patriciax
```

---

## 📊 Monitoring

```bash
# View live logs
wrangler tail patriciax

# Check queue depth
wrangler queues consumer describe uniteia-diagnostics-queue

# List R2 objects
wrangler r2 object list uniteia-diagnostics --limit 10
```

---

## 🎉 You're Ready!

PatriciaX is now deployed and ready to capture screenshots and diagnose visual issues automatically.

For detailed documentation, see [README.md](./README.md).
