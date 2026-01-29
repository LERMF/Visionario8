# PatriciaX - Future Use Guide

## Overview

This document outlines how **PatriciaX** can be leveraged in future development sessions, including integration patterns, use cases, and best practices.

---

## Quick Reference

### Project Location
```bash
/home/lermf/PROJETOS-2026-SOTA/PatriciaX/
```

### Production Endpoint
```
https://patriciax.uniteia.workers.dev
```

### API Key Location
```bash
# Retrieve from vault
cat /home/lermf/.VAULT/secrets.json | jq '.PATRICIAX_API_KEY'

# Or from wrangler secrets
wrangler secret list --project-name patriciax-production
```

---

## Common Use Cases

### 1. Standalone Diagnostic Tool

Use PatriciaX to audit **any web project**, not just UniTeiaAI:

```bash
# Audit external site
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $PATRICIAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      { "path": "https://example.com/page1" },
      { "path": "https://example.com/page2" }
    ]
  }'
```

**When to use**:
- Auditing client websites
- Competitor analysis
- Quick visual checks during development
- Pre-migration snapshots

---

### 2. MCP Server Integration (Planned)

Once the MCP server is implemented (see `MCP_INTEGRATION_PROPOSAL.md`), PatriciaX will be callable from OpenCode agents:

```typescript
// Inside OpenCode agent session
const result = await tools.patriciax_run_audit({
  pages: [{ path: '/comparativos' }],
  options: { checks: { contrast: true, performance: true } }
})

// Agent responds with diagnostic summary
```

**When to use**:
- Agent-assisted quality assurance
- Post-deployment verification
- Accessibility compliance checks
- Visual regression detection

---

### 3. Automated Post-Deployment Testing

Integrate PatriciaX into CI/CD pipelines:

#### GitHub Actions Example
```yaml
# .github/workflows/deploy.yml
name: Deploy and Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloudflare Pages
        run: wrangler pages deploy
      
      - name: Run Visual Diagnostics
        run: |
          SESSION=$(curl -X POST https://patriciax.uniteia.workers.dev/api/run \
            -H "X-API-Key: ${{ secrets.PATRICIAX_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"pages":[{"path":"/"}]}' \
            | jq -r '.sessionId')
          
          echo "Diagnostics session: $SESSION"
          
          # Wait for completion
          sleep 30
          
          # Check report
          curl https://patriciax.uniteia.workers.dev/api/report/$SESSION \
            -H "X-API-Key: ${{ secrets.PATRICIAX_API_KEY }}" \
            | jq '.summary'
```

**When to use**:
- After every production deployment
- Pre-merge PR validation
- Scheduled daily audits
- Continuous monitoring

---

### 4. Accessibility Audits (WCAG Compliance)

Run comprehensive accessibility checks:

```bash
# Full WCAG audit
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $PATRICIAX_API_KEY" \
  -d '{
    "pages": [
      { "path": "/comparativos" },
      { "path": "/reviews" },
      { "path": "/guias" }
    ],
    "options": {
      "checks": {
        "visibility": true,
        "contrast": true,
        "brokenImages": true
      }
    }
  }'
```

**Use the report to**:
- Identify low-contrast text (WCAG AA/AAA violations)
- Detect hidden elements (screen reader issues)
- Find broken images (alt text missing)
- Generate compliance reports

**When to use**:
- Before public launches
- After major UI redesigns
- Regular compliance audits (monthly/quarterly)
- Client accessibility reports

---

### 5. Performance Monitoring (Core Web Vitals)

Track page performance over time:

```bash
# Performance-focused audit
curl -X POST https://patriciax.uniteia.workers.dev/api/run \
  -H "X-API-Key: $PATRICIAX_API_KEY" \
  -d '{
    "pages": [{ "path": "/" }],
    "options": {
      "checks": { "performance": true }
    }
  }'
```

**Metrics tracked**:
- **LCP** (Largest Contentful Paint) - Target: <2.5s
- **FID** (First Input Delay) - Target: <100ms
- **CLS** (Cumulative Layout Shift) - Target: <0.1

**When to use**:
- Daily performance checks
- Pre/post optimization comparisons
- SEO audits (Core Web Vitals affect rankings)
- Performance regression detection

---

### 6. Visual Regression Testing (Future)

Once pixel-diff feature is implemented:

```bash
# Baseline capture
BASELINE_SESSION=$(curl -X POST https://patriciax.../api/run \
  -d '{"pages":[{"path":"/comparativos"}]}' | jq -r '.sessionId')

# After code changes
CURRENT_SESSION=$(curl -X POST https://patriciax.../api/run \
  -d '{"pages":[{"path":"/comparativos"}]}' | jq -r '.sessionId')

# Compare (future API)
curl https://patriciax.../api/compare \
  -d '{"baseline":"'$BASELINE_SESSION'","current":"'$CURRENT_SESSION'"}'
```

**When to use**:
- CSS refactoring validation
- Component library updates
- Framework upgrades (e.g., Astro 6 → 7)
- Design system changes

---

## Integration Patterns

### Pattern 1: On-Demand Audits

**Scenario**: Developer asks "check if the homepage looks correct"

**Implementation**:
1. Agent detects intent → triggers `patriciax_run_audit`
2. Polls status every 5s until complete
3. Parses report and summarizes issues
4. Provides actionable recommendations

### Pattern 2: Smart Triggers

**Scenario**: Agent detects CSS changes in git diff

**Implementation**:
```typescript
// Inside OpenCode agent
const changedFiles = await git.diff('HEAD~1', 'HEAD')
const hasCssChanges = changedFiles.some(f => 
  f.endsWith('.css') || f.includes('uno.config')
)

if (hasCssChanges) {
  console.log('⚠️ CSS changes detected. Running visual audit...')
  const result = await tools.patriciax_run_audit({
    pages: [{ path: '/comparativos' }]
  })
  
  if (result.summary.totalIssues > 0) {
    console.warn(`🔴 ${result.summary.totalIssues} visual issues detected!`)
  } else {
    console.log('✅ No visual regressions')
  }
}
```

### Pattern 3: Pre-Merge Validation

**Scenario**: PR requires visual approval before merge

**Implementation**:
```yaml
# .github/workflows/pr-check.yml
on: pull_request

jobs:
  visual-check:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy preview
        run: wrangler pages deploy --branch=${{ github.head_ref }}
      
      - name: Get preview URL
        id: preview
        run: echo "url=$(wrangler pages deployment list | head -1)" >> $GITHUB_OUTPUT
      
      - name: Run diagnostics
        run: |
          curl -X POST https://patriciax.uniteia.workers.dev/api/run \
            -H "X-API-Key: ${{ secrets.PATRICIAX_API_KEY }}" \
            -d '{"pages":[{"path":"${{ steps.preview.outputs.url }}"}]}'
      
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              body: '✅ Visual diagnostics complete! [View Report](link)'
            })
```

---

## Best Practices

### 1. Quota Management

**Always check quota before expensive operations**:
```bash
# Check before running
curl https://patriciax.uniteia.workers.dev/api/storage/usage \
  -H "X-API-Key: $PATRICIAX_API_KEY"

# If approaching limits, cleanup old sessions
curl -X POST https://patriciax.uniteia.workers.dev/api/storage/cleanup \
  -H "X-API-Key: $PATRICIAX_API_KEY"
```

**Limits**:
- 50 screenshots per session
- 100MB per session
- 1GB total storage
- 100 sessions max
- Auto-cleanup after 7 days

### 2. Rate Limiting

Respect Cloudflare Browser Rendering limits:
- **10 concurrent browsers** (PatriciaX automatically queues excess)
- **10 browsers per minute** (use `parallelPages: 3-5` max)

### 3. Cost Optimization

Minimize browser time to reduce costs:
- Use `waitUntil: 'load'` instead of `'networkidle'` for faster pages
- Reduce `parallelPages` if not time-sensitive
- Skip unnecessary checks (e.g., disable performance checks if only auditing layout)

### 4. Error Handling

```typescript
try {
  const result = await patriciax_run_audit({ ... })
  
  if (result.status === 'failed') {
    console.error('Audit failed:', result.error)
    // Retry logic or fallback
  }
} catch (error) {
  if (error.status === 429) {
    console.warn('Rate limit exceeded. Retry in 60s.')
  } else if (error.status === 401) {
    console.error('Invalid API key. Check .VAULT/secrets.json')
  }
}
```

---

## Troubleshooting

### Issue: "Failed to launch browser"
**Cause**: Rate limit exceeded (10 concurrent)  
**Solution**: Wait 1 minute or reduce `parallelPages`

### Issue: "Timeout waiting for navigation"
**Cause**: Page takes >60s to load  
**Solution**: Increase `timeout` or use `waitUntil: 'load'`

### Issue: "Quota exceeded"
**Cause**: Storage limits reached  
**Solution**: Run `/api/storage/cleanup` or delete old sessions

### Issue: "Screenshot not found"
**Cause**: Session expired or R2 bucket issue  
**Solution**: Check session age (>7 days auto-deleted) or verify R2 binding

---

## Monitoring & Observability

### View Live Logs
```bash
wrangler tail patriciax-production
```

### Check Queue Status
```bash
wrangler queues list
wrangler queues consumer describe uniteia-diagnostics-queue
```

### Inspect Storage
```bash
# List all sessions
wrangler r2 object list uniteia-diagnostics --limit 50

# Check specific session
wrangler r2 object get uniteia-diagnostics/{sessionId}/report.json
```

### Health Check
```bash
curl https://patriciax.uniteia.workers.dev/api/health
```

---

## Future Roadmap

### Planned Features (from MCP_INTEGRATION_PROPOSAL.md)
- [ ] **MCP Server**: Enable OpenCode agent integration
- [ ] **Visual Regression**: Pixel-diff comparison between sessions
- [ ] **AI Insights**: Workers AI (LLaVA) to analyze screenshots
- [ ] **Performance Budgets**: Alert when Core Web Vitals exceed thresholds
- [ ] **Multi-Viewport**: Mobile, tablet, desktop testing
- [ ] **Notifications**: Slack/Discord integration
- [ ] **Historical Trends**: Chart performance over time

### Potential Integrations
- **UniTeiaAI Gateway**: Trigger diagnostics on content updates
- **OpenCode Tasks**: Auto-run after code changes
- **Sentry**: Link visual issues to error reports
- **Datadog**: Export metrics for monitoring dashboards

---

## Quick Commands Cheat Sheet

```bash
# Start new audit
curl -X POST https://patriciax.../api/run -H "X-API-Key: $KEY" -d '{"pages":[...]}'

# Check status
curl https://patriciax.../api/status/{sessionId} -H "X-API-Key: $KEY"

# Get report
curl https://patriciax.../api/report/{sessionId} -H "X-API-Key: $KEY"

# Download screenshot
curl https://patriciax.../api/screenshot/{sessionId}/page/full > screenshot.png

# Get latest report
curl https://patriciax.../api/latest -H "X-API-Key: $KEY"

# Check quota
curl https://patriciax.../api/storage/usage -H "X-API-Key: $KEY"

# Cleanup old sessions
curl -X POST https://patriciax.../api/storage/cleanup -H "X-API-Key: $KEY"

# Health check
curl https://patriciax.../api/health
```

---

## References

- **Full Documentation**: [README.md](./README.md)
- **Quick Start Guide**: [QUICKSTART.md](./QUICKSTART.md)
- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **MCP Integration**: [MCP_INTEGRATION_PROPOSAL.md](./MCP_INTEGRATION_PROPOSAL.md)
- **Project Summary**: [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)

---

**Last Updated**: 2026-01-29  
**Maintained By**: UniTeiaAI Team  
**Status**: Living Document (update as new features are added)
