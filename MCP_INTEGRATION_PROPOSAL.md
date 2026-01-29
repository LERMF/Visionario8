# PatriciaX MCP Server Integration Proposal

## Executive Summary

This document proposes integrating **PatriciaX** as an MCP (Model Context Protocol) server for OpenCode, enabling AI agents to perform automated visual diagnostics, accessibility audits, and post-deployment verification directly from within coding sessions.

---

## Motivation

### Current Pain Points
1. **Manual Visual Testing**: Developers must manually trigger browser tests after deployments
2. **Context Switching**: Switching between IDE and browser to verify visual changes
3. **No AI-Assisted QA**: AI agents cannot currently perform visual regression checks
4. **Post-Deployment Blindness**: No automated way to verify production deployments

### PatriciaX Solution
- **On-Demand Diagnostics**: AI agents can trigger visual audits via MCP tools
- **Inline Results**: Diagnostic reports returned directly to OpenCode context
- **Automated Post-Deploy**: Trigger diagnostics automatically after git push
- **Proactive Quality**: AI can suggest running diagnostics when it detects visual changes

---

## Proposed MCP Tools

### 1. `patriciax_run_audit`

**Description**: Run comprehensive visual diagnostic on specified URLs/paths

**Parameters**:
```typescript
{
  pages: Array<{
    path: string                    // URL path (e.g., "/comparativos")
    name?: string                   // Identifier for report
    viewport?: { width, height }    // Browser viewport (default: 1920x1080)
    waitUntil?: 'load' | 'networkidle' // Navigation strategy
    timeout?: number                // Max wait time (ms, default: 60000)
  }>
  options?: {
    parallelPages?: number          // Concurrent pages (1-5, default: 3)
    checks?: {
      visibility?: boolean          // Element visibility checks
      contrast?: boolean            // WCAG color contrast
      brokenImages?: boolean        // Image loading verification
      performance?: boolean         // Core Web Vitals
    }
  }
  metadata?: {
    deploymentId?: string           // Link to deployment
    environment?: string            // staging | production
    branch?: string                 // Git branch name
  }
}
```

**Returns**:
```typescript
{
  sessionId: string                 // UUID for tracking
  status: 'running' | 'completed' | 'failed'
  reportUrl?: string                // URL to full report (if completed)
  summary?: {
    totalPages: number
    completedPages: number
    totalScreenshots: number
    totalIssues: number
    duration: number                // milliseconds
  }
  issues?: Array<{
    page: string
    type: 'visibility' | 'contrast' | 'broken-image' | 'performance'
    severity: 'error' | 'warning' | 'info'
    message: string
    element?: string                // CSS selector
    details?: object
  }>
}
```

**Use Cases**:
- Agent detects CSS changes → suggests running visual audit
- Post-deployment verification (triggered via git hook)
- On-demand audits when user asks "check if the homepage looks correct"
- Accessibility compliance checks

---

### 2. `patriciax_get_report`

**Description**: Retrieve diagnostic report for a completed session

**Parameters**:
```typescript
{
  sessionId: string                 // UUID from run_audit
  includeScreenshots?: boolean      // Include base64 screenshots (default: false)
}
```

**Returns**:
```typescript
{
  sessionId: string
  state: 'capturing' | 'diagnosing' | 'completed' | 'failed'
  startedAt: number                 // Unix timestamp
  completedAt?: number
  summary: { ... }                  // Same as run_audit
  pages: Array<{
    path: string
    status: 'completed' | 'failed'
    screenshots: Array<{
      type: 'full' | 'header' | 'content' | 'footer'
      url: string                   // R2 URL
      base64?: string               // If includeScreenshots=true
    }>
    diagnostics: {
      visibility: { ... }
      contrast: { ... }
      brokenImages: { ... }
      performance: { ... }
    }
    issues: Array<{ ... }>
  }>
}
```

**Use Cases**:
- Poll for status after async audit starts
- Retrieve detailed diagnostics for specific pages
- Embed screenshots in agent responses

---

### 3. `patriciax_check_quota`

**Description**: Check current storage quota before running audit

**Parameters**: None

**Returns**:
```typescript
{
  allowed: boolean
  currentUsage: {
    totalSessions: number
    totalScreenshots: number
    totalSize: number               // bytes
  }
  limits: {
    maxScreenshotsPerSession: number
    maxSizePerSession: number       // bytes
    maxTotalSize: number            // bytes
    maxSessions: number
  }
  availableCapacity: {
    sessions: number
    screenshots: number
    storage: number                 // bytes
  }
  reason?: string                   // If quota exceeded
}
```

**Use Cases**:
- Pre-flight check before starting expensive audits
- Display quota warnings to user
- Trigger cleanup when approaching limits

---

### 4. `patriciax_get_screenshot` (Optional)

**Description**: Download specific screenshot from a session

**Parameters**:
```typescript
{
  sessionId: string
  page: string                      // Page name
  type: 'full' | 'header' | 'content' | 'footer'
}
```

**Returns**:
```typescript
{
  url: string                       // R2 public URL
  base64: string                    // Base64-encoded PNG
  contentType: 'image/png'
  size: number                      // bytes
}
```

**Use Cases**:
- Visual comparison in agent responses
- Inline image display in OpenCode UI
- Screenshot-based debugging

---

## Integration Architecture

### MCP Server Implementation

```typescript
// patriciax-mcp/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio'

const server = new Server(
  {
    name: 'patriciax',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Tool: patriciax_run_audit
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'patriciax_run_audit') {
    const { pages, options, metadata } = request.params.arguments
    
    // Call PatriciaX API
    const response = await fetch('https://patriciax.uniteia.workers.dev/api/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.PATRICIAX_API_KEY,
      },
      body: JSON.stringify({ pages, options, metadata }),
    })
    
    const result = await response.json()
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  }
  
  // Handle other tools...
})

const transport = new StdioServerTransport()
server.connect(transport)
```

### OpenCode Configuration

```json
// .opencode/mcp-configs/patriciax.json
{
  "mcpServers": {
    "patriciax": {
      "command": "node",
      "args": ["/path/to/patriciax-mcp/dist/server.js"],
      "env": {
        "PATRICIAX_API_KEY": "${PATRICIAX_API_KEY}"
      }
    }
  }
}
```

### Agent Usage Examples

#### Example 1: Post-Deployment Verification
```typescript
// User: "I just deployed to production, check if the site looks correct"

// Agent reasoning:
// 1. Detect deployment event (git push detected)
// 2. Use patriciax_run_audit to trigger diagnostics
// 3. Wait for completion
// 4. Report issues to user

const result = await tools.patriciax_run_audit({
  pages: [
    { path: '/', name: 'homepage' },
    { path: '/comparativos', name: 'comparativos' },
    { path: '/reviews', name: 'reviews' },
  ],
  options: {
    parallelPages: 3,
    checks: { visibility: true, contrast: true, performance: true },
  },
  metadata: {
    deploymentId: 'abc123',
    environment: 'production',
    branch: 'main',
  },
})

// Response to user:
"Diagnostics completed! ✅
- Homepage: No issues
- Comparativos: 2 warnings (low contrast on footer links)
- Reviews: 1 error (broken image in review card)

Full report: https://patriciax.uniteia.workers.dev/api/report/{sessionId}"
```

#### Example 2: Accessibility Audit
```typescript
// User: "Check if our site meets WCAG AA standards"

const quota = await tools.patriciax_check_quota()
if (!quota.allowed) {
  return "Cannot run audit: quota exceeded. Please run cleanup first."
}

const result = await tools.patriciax_run_audit({
  pages: [{ path: '/comparativos' }],
  options: {
    checks: { contrast: true, visibility: true },
  },
})

// Parse results and report WCAG violations
```

#### Example 3: Visual Regression Detection
```typescript
// User: "Did my CSS changes break anything visually?"

// Agent detects recent CSS commits
const changedFiles = await git.diff('HEAD~1', 'HEAD')
const hasCssChanges = changedFiles.some(f => f.endsWith('.css'))

if (hasCssChanges) {
  await tools.patriciax_run_audit({
    pages: [{ path: '/comparativos' }],
    options: { checks: { visibility: true, brokenImages: true } },
  })
  
  // Compare against previous session screenshots
}
```

---

## Implementation Roadmap

### Phase 1: Basic MCP Server (1-2 days)
- [ ] Create `patriciax-mcp` Node package
- [ ] Implement `patriciax_run_audit` tool
- [ ] Implement `patriciax_get_report` tool
- [ ] Implement `patriciax_check_quota` tool
- [ ] Add API key authentication
- [ ] Write integration tests

### Phase 2: OpenCode Integration (1 day)
- [ ] Add MCP config to `.opencode/mcp-configs/patriciax.json`
- [ ] Document tool usage in AGENTS.md
- [ ] Create example prompts for agents
- [ ] Test with `@plan` and `@build` agents

### Phase 3: Enhanced Features (2-3 days)
- [ ] Screenshot comparison (pixel diff)
- [ ] Historical trend analysis
- [ ] Smart recommendations (AI suggests when to run audits)
- [ ] Auto-trigger on git push (via git hooks)
- [ ] Slack/Discord notifications integration

### Phase 4: Advanced Use Cases (future)
- [ ] Visual regression baselines
- [ ] Performance budgets & alerts
- [ ] Multi-viewport testing (mobile/tablet/desktop)
- [ ] A/B testing visual comparison

---

## Security Considerations

1. **API Key Management**: Store `PATRICIAX_API_KEY` in `.VAULT/secrets.json` (never commit)
2. **Rate Limiting**: MCP server should respect PatriciaX's rate limits (20/hour, 100/day)
3. **Quota Checks**: Always call `check_quota` before expensive operations
4. **CORS**: PatriciaX restricts CORS to `uniteia.com` (MCP server is server-side, so no issue)

---

## Cost Estimation

**Cloudflare Browser Rendering**: $5/million browser seconds

**Typical Agent Usage** (5 audits/day × 3 pages × 10s per page):
- **Monthly browser time**: 4,500 seconds
- **Monthly cost**: ~$0.02

**With MCP Integration** (10 audits/day × 5 pages × 10s per page):
- **Monthly browser time**: 15,000 seconds
- **Monthly cost**: ~$0.08

**Total Estimated Cost**: <$0.10/month

---

## Future Enhancements

1. **AI-Powered Insights**: Use Workers AI (LLaVA vision model) to analyze screenshots and suggest improvements
2. **Visual Regression ML**: Train model to detect layout shifts and visual regressions
3. **Smart Scheduling**: Agent learns optimal times to run audits (after deployments, before merges)
4. **Integration with UniTeiaAI Gateway**: Trigger audits on content updates via API
5. **Real-Time Monitoring**: Continuous visual monitoring with alerts

---

## Success Metrics

- **Developer Efficiency**: Reduce time spent on manual visual testing by 80%
- **Bug Detection**: Catch visual regressions before production (target: 90% detection rate)
- **Accessibility Compliance**: Maintain WCAG AA compliance across all pages
- **Agent Adoption**: 50% of deployments trigger automatic diagnostics within 3 months

---

## Conclusion

Integrating PatriciaX as an MCP server unlocks powerful visual diagnostics capabilities for AI agents in OpenCode. By enabling automated audits, accessibility checks, and post-deployment verification, we can significantly improve development velocity and code quality.

**Next Steps**:
1. Review proposal with team
2. Prioritize Phase 1 implementation (basic MCP server)
3. Create `patriciax-mcp` repository
4. Begin development following SOTA 2026 standards

---

**Document Version**: 1.0  
**Created**: 2026-01-29  
**Author**: UniTeiaAI Team  
**Status**: Draft for Review
