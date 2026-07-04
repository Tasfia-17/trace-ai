# Trace: Customer Bug to Verified Patch

**UK AI Agent Hackathon EP5 x Conduct**

Trace is a production-ready multi-agent system that compresses enterprise bug resolution from weeks to minutes. A customer report goes in. A verified GitHub PR comes out, autonomously.

```
Customer report
  -> Triage Agent       (OpenAI GPT-4o)
  -> Vision Agent       (Venice.ai TEE - screenshot PII stays in the enclave)
  -> Log Agent          (OpenAI GPT-4o)
  -> Playwright repro   (deterministic browser automation)
  -> Bug report         (structured engineering handoff)
  -> Code Agent         (source localization)
  -> Patch planning     (constrained allowlist, no arbitrary file writes)
  -> Patch verification (Playwright reruns desktop + mobile)
  -> GitHub issue + PR  (real branch, real diff, visual evidence committed)
  -> Maintainer Agent   (final handoff synthesis)
```

**Runtime: 3-5 minutes. Without Trace: 3-6 weeks (enterprise) or 2-8 hours (OSS).**

---

## Sponsor integrations

| Sponsor | Integration | Track |
|---------|-------------|-------|
| OpenAI | GPT-4o as primary reasoning provider across all agents | Ecosystem partner |
| Venice.ai | TEE-encrypted inference for Vision Agent. Customer screenshots never leave the enclave | Gold sponsor |
| Cerebras | Speed provider, selectable in UI for latency comparison | Gold sponsor |
| Conduct AI | Enterprise legacy modernization scenario: SAP-style pricing config causes approval workflow regression | 8000 GBP track |
| BasedAI | Permission-aware artifact memory layer: ACL enforced at retrieval, deterministic (no LLM in permission path), audit logs, lineage propagation, sub-200ms P99 | 3800 USD credits track |
| Fetch.ai | ASI:One-compatible endpoint + Agentverse agent card at `/api/trace/asi-one` | 1000 USDT track |
| GCC | Open-source maintainer support scenario, fully open-source and forkable | 1000 USDT track |
| Gemini | Fourth provider option selectable in UI | - |

---

## Architecture

### Workflow engine

A typed dependency-aware DAG runtime in `trace-workflow-runtime.ts`. Steps run in parallel when their dependencies are satisfied. Triage fans out to Vision and Log simultaneously. No framework black boxes. The dependency graph is visible in the UI.

### Multi-provider layer

Four providers, one interface, in `trace-agent-runtime.ts`:

- `openai`: GPT-4o with `response_format: json_object`. Default provider.
- `venice`: OpenAI-compatible API at `api.venice.ai/api/v1`. TEE inference. Vision Agent auto-routes here when `VENICE_API_KEY` is set.
- `cerebras`: Lowest latency. Selectable in UI for speed comparison.
- `gemini`: Fourth option via raw fetch against the Generative Language API.

### Permission-aware artifact memory

Implements all BasedAI bounty requirements. See `artifact-acl.ts`.

- ACL classified at write time: every artifact gets a sensitivity level (`public`, `internal`, `confidential`, or `restricted`) the moment it is created.
- Enforced at the retrieval layer, not the application layer. `GET /api/trace/artifacts?role=engineer` returns only what that role is allowed to see.
- No LLM in the enforcement path. Pure Map lookup. Measured latency under 1ms.
- Lineage propagation: derived artifacts inherit the most restrictive sensitivity of their sources.
- Audit logs: every access decision is logged with requestId, role, decision, reason, and timestamp. Accessible at `GET /api/trace/audit?role=security-auditor`.
- Temporal rules: the API supports `unlocksAfterMs` for time-gated access.

### Playwright sandbox

Warm browser context reuse. Runs desktop (1280x800) and mobile (390x844) in parallel. Captures before and after screenshots that are committed to the GitHub PR as evidence.

### Constrained patching

Allowlisted operations only. The patch engine applies only pre-defined string replacements to a single target file. The LLM provides rationale. The patch engine does the actual write. No arbitrary code execution is possible.

### GitHub handoff

Creates or reuses a GitHub issue, pushes a fix branch, and opens a PR with before/after visual evidence committed as repository assets.

---

## Demo scenarios

### E-commerce (default)

Checkout CTA disappears on mobile Safari (390x844) after applying coupon `SAVE20`. A classic viewport-dependent CSS bug.

### Enterprise legacy (Conduct AI track)

A SAP-style pricing matrix config change (`TIER_BULK_100`) suppresses the mobile approval CTA in the order management system. This represents the kind of regression that typically takes 3-6 weeks of consultant time to diagnose and fix.

Switch between scenarios using the toggle in the sidebar.

---

## API reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trace/workflow/run` | POST | Run full workflow (SSE stream) |
| `/api/trace/asi-one` | GET | Fetch.ai Agentverse agent card |
| `/api/trace/asi-one` | POST | ASI:One-compatible run endpoint |
| `/api/trace/artifacts` | GET | ACL-filtered artifact retrieval (`?role=engineer`) |
| `/api/trace/audit` | GET | Audit log (`?role=security-auditor`) |
| `/api/trace/audit` | POST | Single permission check |
| `/api/trace/patch/reset` | POST | Restore controlled bug |
| `/api/trace/repro` | POST | Playwright repro only |
| `/api/trace/speed` | GET | Provider speed comparison |

---

## Quick start

```bash
# Install
npm install

# Configure providers (set at least one)
cp .env.example .env.local
# Edit .env.local and add OPENAI_API_KEY at minimum

# Run dev server
npm run dev
# Open http://localhost:3000

# Click "Run Investigation", select a provider, and watch the live overlay.
```

---

## Environment variables

```bash
# Primary provider (set at least one)
OPENAI_API_KEY=
CEREBRAS_API_KEY=
VENICE_API_KEY=
GEMINI_API_KEY=

# GitHub handoff (required for real PR creation)
GITHUB_TOKEN=

# Model overrides (optional)
OPENAI_MODEL=gpt-4o
CEREBRAS_MODEL=gemma-4-31b
VENICE_MODEL=llama-3.3-70b
GEMINI_MODEL=gemini-2.0-flash-exp
```

---

## Bounty submission notes

### Conduct AI: Make Legacy Move (8000 GBP)

The enterprise scenario in `src/lib/enterprise-evidence.ts` and `ScenarioSwitcher.tsx` shows Trace applied to a SAP-style legacy system regression. The workflow that resolves an e-commerce checkout bug applies directly to enterprise config changes that break downstream approval workflows.

The process Trace automates (reproduce, localize, patch, verify, PR) is exactly what enterprise consultants charge for over 3-6 weeks. Trace does it in 3-5 minutes.

### BasedAI: Permission-Aware Memory Layer (3800 USD credits)

All five core requirements implemented:

1. Synchronized with source ACLs via lineage propagation in `classifyArtifact()`
2. Enforced at the retrieval layer via `filterArtifactsForRole()` in `/api/trace/artifacts`
3. No LLM in enforcement path. Pure Map lookup, under 1ms measured.
4. Regulatory-grade audit logs at `/api/trace/audit`
5. Lineage governance: derived artifacts inherit the most restrictive source sensitivity

### Fetch.ai: Build an Agent System (1000 USDT)

- Multi-step planning: 11-step DAG workflow
- Tool use: Playwright, GitHub API, multi-provider LLM routing
- ASI:One compatible: `/api/trace/asi-one` returns structured text and result object
- Agentverse registration: `uagent.json` manifest at repo root

### GCC: AI for Good (1000 USDT)

Open-source maintainer burnout is a documented crisis. Trace removes the worst part: reproducing and verifying bugs autonomously, then opening PRs with real evidence. Fully open-source and forkable. `src/lib/public-goods-evidence.ts` documents impact metrics and counterfactual reasoning.

---

## License

MIT. Fully open-source, forkable, and reusable by any project.
