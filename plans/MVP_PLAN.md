# Terarrium — Overnight MVP Plan
> Generated: 2026-02-26 | Session: Architect → Code handoff
> Goal: True, full MVP to react to in the morning — real agent reviews + full storybook UI wearing its own output

---

## What Exists (Honest Inventory)

### ✅ Solid — Keep As-Is
- [`src/library/foundation.css`](../src/library/foundation.css) — Full token system (180+ CSS custom properties, dark mode, density, motion)
- [`src/library/terrarium.css`](../src/library/terrarium.css) — Composed CSS import chain
- [`src/components/toast/toast.css`](../src/components/toast/toast.css) — Stable component CSS
- [`src/components/toast/toast.spec.json`](../src/components/toast/toast.spec.json) — Full spec
- [`src/governance/zone-rules.mjs`](../src/governance/zone-rules.mjs) — Zone rules + `checkZoneApproval()`
- [`src/governance/proposals.mjs`](../src/governance/proposals.mjs) — Proposal CRUD + compliance
- [`src/governance/pipeline.mjs`](../src/governance/pipeline.mjs) — Pipeline state machine
- [`src/governance/root-system/`](../src/governance/root-system/) — All 3 documentation agents
- [`src/governance/agents/a11y-guardian.mjs`](../src/governance/agents/a11y-guardian.mjs) — Full WCAG checklist + ARIA patterns
- [`src/governance/agents/token-steward.mjs`](../src/governance/agents/token-steward.mjs) — Token audit + DTCG rules
- [`src/governance/agents/component-architect.mjs`](../src/governance/agents/component-architect.mjs) — BEM validator + arch rules
- [`src/governance/agents/pattern-librarian.mjs`](../src/governance/agents/pattern-librarian.mjs) — Deduplication + doc standards
- [`src/governance/agents/product-liaison.mjs`](../src/governance/agents/product-liaison.mjs) — Adoption gate checker
- [`src/data/wiki.json`](../src/data/wiki.json) — 25 Living Reference entries
- [`src/data/seed-vault.json`](../src/data/seed-vault.json) — 5 archived components with full context
- [`src/data/pipeline-state.json`](../src/data/pipeline-state.json) — Toast in Stable
- [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) — Constitutional document
- [`.claude/commands/`](../.claude/commands/) — 5 slash commands

### ⚠️ POC-Quality — Needs Rewrite
- [`src/library/index.html`](../src/library/index.html) — Single-page Toast showcase with Ollama/lfm2 hardcoded. Needs to become a full multi-page storybook with Anthropic API.
- [`src/components/toggle/toggle.css`](../src/components/toggle/toggle.css) — CSS exists but no spec, no governance journey
- [`src/components/toggle/index.html`](../src/components/toggle/index.html) — Standalone demo, not integrated
- All other component CSS files — exist but have no specs, no governance records

### ❌ Missing — Must Build
- `src/governance/agents/ds-lead.mjs` — DS Lead agent module (referenced in CLAUDE.md but file doesn't exist)
- `src/governance/agent-runner.mjs` — Anthropic API integration layer for real agent calls
- `src/governance/orchestrator.mjs` — Wires all agents into a single review cycle
- `src/library/storybook.html` — Full multi-page storybook shell
- `src/library/storybook.css` — Storybook shell styles
- `src/data/activity-log.jsonl` — Exists but empty (needs seeding)
- `src/data/decisions.jsonl` — Exists but empty (needs seeding)
- `src/data/changes.jsonl` — Exists but empty (needs seeding)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    STORYBOOK UI (browser)                    │
│  Left: Component showcase  │  Right: Governance chat panel  │
│  - All 9+ components       │  - Agent reviews (streaming)   │
│  - Live demos              │  - Pipeline status             │
│  - Governance journey      │  - Approval queue              │
└──────────────┬─────────────┴──────────────┬─────────────────┘
               │ DOM manipulation            │ fetch() to API
               ▼                             ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│   foundation.css +       │   │   orchestrator.mjs          │
│   terrarium.css          │   │   ├── agent-runner.mjs      │
│   (token system)         │   │   │   └── Anthropic API     │
└──────────────────────────┘   │   ├── ds-lead.mjs           │
                               │   ├── token-steward.mjs     │
                               │   ├── a11y-guardian.mjs     │
                               │   ├── pattern-librarian.mjs │
                               │   ├── component-architect   │
                               │   └── product-liaison.mjs   │
                               │   ├── pipeline.mjs          │
                               │   ├── proposals.mjs         │
                               │   └── zone-rules.mjs        │
                               └──────────────┬──────────────┘
                                              │ read/write
                                              ▼
                               ┌─────────────────────────────┐
                               │   src/data/                 │
                               │   ├── pipeline-state.json   │
                               │   ├── decisions.jsonl       │
                               │   ├── changes.jsonl         │
                               │   ├── activity-log.jsonl    │
                               │   ├── wiki.json             │
                               │   └── seed-vault.json       │
                               └─────────────────────────────┘
```

---

## Phase-by-Phase Build Plan

### PHASE 1: Anthropic API Integration Layer
**File**: `src/governance/agent-runner.mjs`

This is the engine that replaces `Math.random()` with real Claude calls. Every agent's `generateReview()` will call this.

```javascript
// Interface:
export async function runAgentReview(agentId, agentSkills, component, zone, priorDecisions)
// Returns: { verdict, analysis, score, rationale, citations, orpaCycle }
```

**Key design decisions:**
- Use `claude-3-5-haiku-20241022` for speed (agent reviews, not creative work)
- Each agent gets a system prompt built from their `AGENT_SKILLS` object + zone rules + CLAUDE.md principles
- ORPA cycle (Observe, Reflect, Plan, Act) is mandatory in every response
- Responses parsed from structured JSON output (use `response_format` or prompt engineering)
- Streaming for the UI chat panel, non-streaming for batch governance reviews
- Rate limiting: sequential agent calls (not parallel) to avoid overwhelming context
- Error handling: if API call fails, fall back to `{ verdict: 'needs-work', analysis: 'API unavailable', score: 0 }`

**System prompt template per agent:**
```
You are the {agentTitle} for Terarrium, a self-governing agentic design system.

CONSTITUTIONAL AUTHORITY:
{CLAUDE.md principles verbatim}

YOUR DOMAIN EXPERTISE:
{agentSkills object serialized}

ZONE RULES FOR {zone}:
{ZONE_RULES[zone] serialized}

PRIOR DECISIONS (cite these):
{last 5 decisions from decisions.jsonl for this component}

ORPA CYCLE REQUIRED:
Every review must follow: Observation → Reflection → Plan → Action

RESPONSE FORMAT (JSON only):
{
  "verdict": "approved" | "needs-work" | "vetoed",
  "score": 0-100,
  "orpa": {
    "observation": "What I see in the component",
    "reflection": "What this means against my domain rules",
    "plan": "What needs to change",
    "action": "My specific recommendation"
  },
  "analysis": "Full analysis text",
  "citations": ["DEC-xxx", "wiki-key"],
  "conditionalApproval": "If needs-work: what specific change would earn approval"
}
```

---

### PHASE 2: DS Lead Agent Module
**File**: `src/governance/agents/ds-lead.mjs`

This file is referenced in CLAUDE.md but doesn't exist. The DS Lead is the strategic authority — not a veto agent, but the one who evaluates JTBD alignment and lifecycle decisions.

```javascript
export const DS_LEAD = {
  id: 'ds',
  title: 'Design System Lead',
  authority: 'strategic',
  canVeto: false, // Strategic, not domain veto
  expertise: ['JTBD alignment', 'lifecycle decisions', 'strategic fit', 'system coherence'],
  
  evaluators: {
    nursery: { focus: 'Is the JTBD clear? Is there a real pain?', mode: 'builder' },
    workshop: { focus: 'Does the spec serve the JTBD? Is the API minimal?', mode: 'builder_optimizer' },
    canopy: { focus: 'Full three-dimension evaluation: Functional > Affordance > Emotional', mode: 'optimizer' }
  },
  
  decisionFramework: {
    functional: 'Does this component do exactly what it claims? Nothing more, nothing less.',
    affordance: 'Can users recognize what this is and how to use it without instruction?',
    emotional: 'Does it feel like it belongs in the system? Is the quality consistent?'
  }
};
```

---

### PHASE 3: Governance Orchestrator
**File**: `src/governance/orchestrator.mjs`

The single entry point for running a full governance review cycle. Called by the storybook UI.

```javascript
// Interface:
export async function runGovernanceReview(componentId, options = {})
// Returns: { component, zone, agentReviews, verdict, proposals, nextAction }

export async function promoteWithReview(componentId)
// Promotes component and immediately runs review in new zone

export async function runSingleAgentReview(agentId, componentId)
// For the UI "Ask agent" feature
```

**Orchestration flow:**
1. Load component from `pipeline-state.json`
2. Load component CSS + spec from `src/components/{name}/`
3. Load prior decisions from `decisions.jsonl`
4. Run `auditTokenCompliance()` from token-steward (real CSS analysis, no LLM needed)
5. Run `validateBEM()` from component-architect (real CSS analysis)
6. Run `checkDuplication()` from pattern-librarian (real data check)
7. Run `checkAdoptionGate()` from product-liaison (real data check)
8. For each agent: call `runAgentReview()` with real Anthropic API
9. Aggregate verdicts via `checkZoneApproval()`
10. Generate proposals for approved changes
11. Write to `decisions.jsonl` and `activity-log.jsonl`
12. Return structured result for UI rendering

---

### PHASE 4: Toggle Component — Complete Governance Journey
**Files to create/update:**
- `src/components/toggle/toggle.spec.json` — Full spec (currently missing)
- `src/components/toggle/toggle.css` — Audit and fix token compliance
- Add Toggle to `pipeline-state.json` in Workshop zone (it's past Nursery — CSS exists)

**Toggle spec key points:**
- JTBD: Binary state control for settings/preferences that take immediate effect
- ARIA: `role="switch"`, `aria-checked`, linked label
- Keyboard: Space toggles, Tab navigates
- Touch target: 44px minimum on the track
- Tokens: Must use semantic tokens only (audit existing CSS)
- Known issue: Current CSS may use primitive tokens — Token Steward will flag

---

### PHASE 5: Full Storybook UI
**File**: `src/library/storybook.html` (replaces/extends `index.html`)

This is the "system wears its own output" moment. The storybook IS the design system.

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  HEADER: Terarrium logo | Theme toggle | Pipeline status bar │
├──────────────┬───────────────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT AREA                            │
│  Navigation  │  (component showcase or governance view)      │
│  ─────────── │                                               │
│  Overview    │                                               │
│  ─────────── │                                               │
│  Foundations │                                               │
│  Colors      │                                               │
│  Typography  │                                               │
│  Spacing     │                                               │
│  ─────────── │                                               │
│  Primitives  │                                               │
│  Button      │                                               │
│  Input       │                                               │
│  Badge       │                                               │
│  Avatar      │                                               │
│  Toggle ●    │  (● = in Workshop)                            │
│  ─────────── │                                               │
│  Composites  │                                               │
│  Card        │                                               │
│  Dialog      │                                               │
│  Toast ✓     │  (✓ = Stable)                                 │
│  Tabs        │                                               │
│  ─────────── │                                               │
│  Governance  │                                               │
│  Pipeline    │                                               │
│  Approvals   │                                               │
│  Seed Vault  │                                               │
│  Wiki        │                                               │
├──────────────┴───────────────────────────────────────────────┤
│  RIGHT PANEL (360px): Governance chat + agent reviews        │
└──────────────────────────────────────────────────────────────┘
```

**Pages to implement:**
1. **Welcome** — System intro, pipeline status, recent activity
2. **Colors** — Token swatches (primitive + semantic), dark mode preview
3. **Typography** — Type scale, font families, weight samples
4. **Spacing** — Visual spacing scale
5. **Button** — All variants, sizes, states, live demo
6. **Input** — All states, validation, live demo
7. **Badge** — All variants, maturity badges
8. **Avatar** — All sizes, initials, groups
9. **Toggle** — States, keyboard demo, governance journey
10. **Card** — Variants, composition examples
11. **Dialog** — Trigger demo, focus trap demo
12. **Toast** — All severities, live trigger, governance journey (full lifecycle shown)
13. **Tabs** — Keyboard navigation demo
14. **Pipeline** — Live pipeline state, promote/seed-vault actions
15. **Approvals** — Pending proposals, approve/reject UI
16. **Seed Vault** — Archived components, revival proposals
17. **Wiki** — Searchable knowledge base

**Right panel — Governance Chat:**
- Replace Ollama/lfm2 with Anthropic API
- Context-aware: knows which component/page is active
- Can trigger governance reviews: "Review this component"
- Can ask individual agents: "What does the A11y Guardian think?"
- Streams responses token by token
- Shows agent identity (color-coded by agent)

---

### PHASE 6: Anthropic API in the Browser
**Challenge**: Anthropic API calls from the browser require a proxy (CORS + key security).

**Solution**: Simple Node.js proxy server
**File**: `src/server/proxy.mjs`

```javascript
// Minimal Express proxy — runs alongside http-server
// POST /api/chat → forwards to Anthropic API with key from env
// POST /api/governance-review → runs full orchestrator cycle
// GET /api/pipeline → returns current pipeline state
// POST /api/promote/:id → promotes component
// GET /api/wiki → returns wiki entries
// GET /api/seed-vault → returns seed vault
```

**Package additions needed:**
- `@anthropic-ai/sdk` — Official Anthropic SDK
- `express` — Minimal proxy server
- `cors` — CORS headers for browser fetch

**Update `package.json` scripts:**
```json
"dev": "node src/server/proxy.mjs & http-server src/library -p 3000 -c-1 --cors",
"server": "node src/server/proxy.mjs"
```

---

### PHASE 7: Component CSS Audit
All existing component CSS files need a token compliance pass before the storybook goes live. The Token Steward's `auditTokenCompliance()` function already does this — run it programmatically.

**Files to audit:**
- `src/components/button/button.css`
- `src/components/input/input.css`
- `src/components/badge/badge.css`
- `src/components/avatar/avatar.css`
- `src/components/card/card.css`
- `src/components/dialog/dialog.css`
- `src/components/tabs/tabs.css`
- `src/components/toggle/toggle.css`
- `src/components/tooltip/tooltip.css`
- `src/components/dropdown/dropdown.css`

Fix any primitive token references, hard-coded hex values, or magic spacing numbers found.

---

### PHASE 8: Seed the Data Files
The append-only logs are empty. Seed them with the Toast governance journey (it went through the full pipeline) so the UI has real data to show.

**`src/data/decisions.jsonl`** — Seed with:
- Toast Nursery entry decision
- Toast Workshop promotion decision (with agent reviews)
- Toast Canopy promotion decision (with unanimous approval)
- Toast Stable promotion decision (with gardener sign-off)

**`src/data/activity-log.jsonl`** — Seed with:
- All pipeline events for Toast
- The spark capture for Toast

**`src/data/changes.jsonl`** — Seed with:
- Toast CSS creation
- Toast spec creation
- Toast promotion events

---

### PHASE 9: Token Engine Validation
**File**: `src/tokens/token-engine.js` — Currently exists but needs to be a real validator.

Run the token-sync command logic programmatically:
1. Parse all `src/tokens/*.tokens.json` (DTCG format)
2. Extract all `--t-` properties from `foundation.css`
3. Report mismatches
4. Check dark mode coverage
5. Output report to `src/data/activity-log.jsonl`

---

### PHASE 10: Handoff Document
**File**: `plans/HANDOFF.md`

Written at the end of the session so the next Claude instance can pick up exactly where this one ends. Includes:
- What was built
- What's still pending
- Known issues
- Next priorities
- File map of everything changed

---

## File Creation Order (for Code mode)

```
1.  package.json                          — Add @anthropic-ai/sdk, express, cors
2.  src/governance/agents/ds-lead.mjs     — DS Lead agent (missing)
3.  src/governance/agent-runner.mjs       — Anthropic API integration
4.  src/governance/orchestrator.mjs       — Full review cycle orchestrator
5.  src/server/proxy.mjs                  — Node.js API proxy
6.  src/components/toggle/toggle.spec.json — Toggle spec
7.  src/data/decisions.jsonl              — Seed with Toast journey
8.  src/data/activity-log.jsonl           — Seed with Toast events
9.  src/data/changes.jsonl                — Seed with Toast changes
10. src/library/storybook.html            — Full multi-page storybook
11. src/library/storybook.css             — Storybook shell styles
12. [Audit + fix all component CSS files]
13. plans/HANDOFF.md                      — Session handoff document
```

---

## Critical Constraints (Non-Negotiable)

1. **Honesty Paradigm** — No synthetic verdicts. Agent reviews must come from real Anthropic API calls. If the API is unavailable, show "API unavailable" — never fake a verdict.

2. **System wears its own output** — The storybook must use only `t-` BEM classes and `--t-` tokens. No inline styles with raw values.

3. **AG absolute veto** — The Accessibility Guardian's veto cannot be overridden by any agent in the code. Only the gardener (human) can override it.

4. **Append-only logs** — `decisions.jsonl` and `changes.jsonl` are never modified, only appended to.

5. **JTBD order immutable** — Functional > Affordance > Emotional. This ordering cannot be changed by any agent prompt or governance process.

6. **No `</script>` in template literals** — Known bug from POC. Never put `</script>` inside JS strings or template literals.

7. **Dark mode parity** — Every semantic token must have a dark mode counterpart. The storybook theme toggle must work on every page.

---

## What "MVP" Means Here

By morning, the gardener should be able to:

1. **Open `storybook.html`** and see all components rendered with their own tokens
2. **Navigate to Toggle** and see its governance journey (Workshop zone, agent reviews pending)
3. **Click "Run Governance Review"** and watch real Claude agents review Toggle in real-time (streaming)
4. **See agent verdicts** — each agent's ORPA cycle, score, and specific feedback
5. **Navigate to Toast** and see its complete lifecycle — Nursery → Workshop → Canopy → Stable
6. **Use the governance chat panel** to ask questions like "What does the Token Steward think about Toggle's CSS?"
7. **See the Pipeline page** with Toast in Stable and Toggle in Workshop
8. **See the Seed Vault** with all 5 archived components and revival status
9. **Toggle dark mode** and have everything work correctly

---

## Questions Answered

**Can the session auto-switch to lfm2?** No. Claude cannot autonomously switch models. When context limit approaches, a handoff document (`plans/HANDOFF.md`) will be written so the next session can continue seamlessly.

**API key**: `ANTHROPIC_API_KEY` from shell environment, passed to `src/server/proxy.mjs` via `process.env.ANTHROPIC_API_KEY`.

**Model for agent reviews**: `claude-3-5-haiku-20241022` (fast, cost-effective for batch reviews)
**Model for governance chat**: `claude-3-5-sonnet-20241022` (more capable for nuanced conversation)
