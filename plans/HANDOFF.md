<!-- ARCHIVED: Ingested into Initiative Registry as INIT-004. See src/data/initiatives.jsonl. -->
# Terarrium — MVP Handoff Document

**Built:** 2026-02-26  
**Status:** ✅ All 10 phases complete — ready to open in browser

---

## What Was Built

The full multi-file architecture described in `MVP_PLAN.md` is now implemented. The POC single-file prototype (`poc/library/index.html`) has been superseded by a proper `src/` structure with real Anthropic API integration.

---

## How to Start (Every Morning)

```bash
cd /Users/zacharydigena-segal/Terarrium_vDraft

# 1. Set your Anthropic API key (required for agent reviews + chat)
export ANTHROPIC_API_KEY=sk-ant-...

# 2. Start the API proxy server
node src/server/proxy.mjs

# 3. Open the storybook in your browser
open src/library/storybook.html
```

The server runs on **http://localhost:3001**. The storybook is a static HTML file — open it directly (no build step needed).

---

## File Map

```
src/
├── server/
│   └── proxy.mjs              ← Express API server (port 3001)
├── governance/
│   ├── orchestrator.mjs       ← Full review cycle coordinator
│   ├── agent-runner.mjs       ← Anthropic API calls + SSE streaming
│   ├── pipeline.mjs           ← Zone state machine (load/save/promote)
│   ├── proposals.mjs          ← Proposal CRUD
│   ├── zone-rules.mjs         ← Zone approval thresholds
│   └── agents/
│       ├── system-steward.mjs  ← System Steward (strategic memory + prompt builder)
│       ├── token-steward.mjs  ← Token compliance auditor
│       ├── a11y-guardian.mjs  ← Accessibility checker (absolute veto)
│       ├── pattern-librarian.mjs
│       ├── component-architect.mjs
│       └── product-liaison.mjs
├── library/
│   ├── storybook.html         ← Main storybook UI (open this)
│   ├── storybook.css          ← Storybook-specific styles
│   ├── storybook.js           ← All JavaScript (nav, API, chat, review)
│   ├── terrarium.css          ← Component styles (imports foundation.css)
│   ├── foundation.css         ← Full token system (358 lines)
│   └── shell.css              ← Shell layout (307 lines)
├── components/
│   └── toggle/
│       └── toggle.spec.json   ← Toggle component specification
└── data/
    ├── pipeline-state.json    ← Live zone state (Toast=stable, Toggle=workshop)
    ├── decisions.jsonl        ← Append-only agent decision log
    ├── activity-log.jsonl     ← 30 seeded entries (full Toast journey)
    ├── changes.jsonl          ← 10 seeded file change entries
    ├── wiki.json              ← 25 Living Reference entries
    └── seed-vault.json        ← 5 archived components
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server status + API key check |
| `GET` | `/api/pipeline` | All zones + components |
| `POST` | `/api/pipeline/create` | Create new component |
| `POST` | `/api/pipeline/promote/:id` | Promote to next zone |
| `POST` | `/api/pipeline/seed-vault/:id` | Archive to seed vault |
| `GET` | `/api/wiki` | All 25 Living Reference entries |
| `GET` | `/api/seed-vault` | Archived components |
| `GET` | `/api/decisions` | All agent decisions (JSONL) |
| `GET` | `/api/activity` | Activity log (JSONL) |
| `GET` | `/api/changes` | Change registry (JSONL) |
| `POST` | `/api/governance-review` | Run full 5-agent review |
| `POST` | `/api/governance-review/agent` | Single agent review |
| `POST` | `/api/chat` | SSE streaming governance chat |

---

## Current Pipeline State

### 🏆 Stable
| Component | ID | Agents |
|-----------|-----|--------|
| Toast | COMP-001 | ts✅ ag✅ pl✅ ca✅ px✅ (shielded) |

### 🔧 Workshop
| Component | ID | Agents |
|-----------|-----|--------|
| Toggle | COMP-002 | ts⚠️ ag⚠️ pl✅ ca⚠️ px✅ |

Toggle needs 3/5 approvals to promote to Canopy. Currently 2/5 (pl + px approved). The A11y Guardian has an **absolute veto** — if ag vetoes, Toggle cannot advance regardless of other votes.

---

## Running a Governance Review

### From the browser
1. Navigate to **Primitives → Toggle** in the storybook sidebar
2. Scroll to the "Governance Journey" section
3. Click **"Run Governance Review"**
4. Wait 15–30 seconds for all 5 agents to respond
5. Results appear inline with ORPA reasoning per agent

### From the terminal
```bash
curl -X POST http://localhost:3001/api/governance-review \
  -H "Content-Type: application/json" \
  -d '{"componentId": "COMP-002"}'
```

### Single agent
```bash
curl -X POST http://localhost:3001/api/governance-review/agent \
  -H "Content-Type: application/json" \
  -d '{"agentId": "ag", "componentId": "COMP-002"}'
```

---

## Governance Rules (Quick Reference)

| Zone | Promotion Threshold | Notes |
|------|---------------------|-------|
| Nursery | No rejection (Builder mode) | Any component can enter |
| Workshop | 3/5 agents approve | Majority rule |
| Canopy | 5/5 unanimous | AG absolute veto applies |
| Stable | Canopy → Stable | Shielded from re-review |

**A11y Guardian veto is absolute** — a single `vetoed` verdict from `ag` blocks promotion from Workshop or Canopy regardless of other votes.

**Honesty Paradigm** — if the Anthropic API is unavailable, agents return `api-unavailable` verdict (never synthetic approval).

---

## The Five Domain Agents

| ID | Name | Emoji | Color | Specialty |
|----|------|-------|-------|-----------|
| `ts` | Token Steward | 🪙 | `#F59F00` | CSS custom property compliance |
| `ag` | A11y Guardian | ♿ | `#2F9E44` | WCAG 2.1 AA, ARIA patterns (absolute veto) |
| `pl` | Pattern Librarian | 📚 | `#E03131` | Consistency with existing patterns |
| `ca` | Component Architect | 🏗️ | `#495057` | BEM structure, composability |
| `px` | Product Liaison | 🤝 | `#4DABF7` | User value, JTBD alignment |

Every agent review follows the **ORPA cycle**: Observation → Reflection → Plan → Action.

---

## Governance Chat

The chat panel (top-right button, or `Cmd+K`) connects to `claude-sonnet-4-5-20250929` with full system context:
- All 25 wiki entries
- Current pipeline state
- Zone rules
- Recent decisions

Ask it anything: *"What does the Token Steward think about Toggle?"*, *"Why is the A11y Guardian's veto absolute?"*, *"How do I promote Toggle to Canopy?"*

---

## Token System

Three-tier hierarchy (immutable order):

```
Primitive  →  --t-raw-neutral-900   (raw values, never used directly in components)
Semantic   →  --t-fg-primary        (context-aware aliases)
Component  →  --t-toggle-track-bg   (component-specific, references semantic)
```

All tokens follow **DTCG format** (W3C Design Token Community Group). Dark mode is handled entirely via `[data-theme="dark"]` overrides in `foundation.css` — no JavaScript required.

---

## Known Issues / Next Steps

1. **Toggle CSS** — `src/components/toggle/toggle.css` doesn't exist yet. The storybook renders Toggle using inline styles from `terrarium.css`. A proper component CSS file with full token coverage is the next build task.

2. **More components** — Button, Input, Badge, Avatar, Card, Dialog, Tabs all render from `terrarium.css` but don't have individual spec files in `src/components/`. Each needs a `{name}.spec.json` and `{name}.css`.

3. **ANTHROPIC_API_KEY** — Must be set in the environment before starting the server. Without it, the storybook still works (all static content renders), but governance reviews and chat return `api-unavailable`.

4. **H-Index system** — Not yet implemented. The `decisions.jsonl` log is the foundation; the H-Index would aggregate agent approval rates per component over time.

5. **Push Live** — The "Push Live" workflow (Canopy → production) is not yet wired. The pipeline supports it conceptually but there's no deployment target.

---

## Critical Bug to Never Repeat

**Never put `</script>` inside a JavaScript template literal.** The browser's HTML parser terminates the `<script>` block at the first `</script>` it encounters, even inside a string. Use `'</' + 'script>'` or `'<\\/script>'` if you need to generate that string in JS.

---

## Architecture Diagram

```
Browser (storybook.html)
    │
    ├── storybook.css    (visual styles)
    ├── storybook.js     (navigation, API calls, SSE chat)
    ├── terrarium.css    (component styles)
    │       └── foundation.css  (token system)
    └── shell.css        (layout)
         │
         ▼ HTTP (localhost:3001)
    proxy.mjs  (Express)
         │
         ├── /api/pipeline  ──→  pipeline.mjs  ──→  pipeline-state.json
         ├── /api/wiki      ──→  wiki.json
         ├── /api/activity  ──→  activity-log.jsonl
         ├── /api/decisions ──→  decisions.jsonl
         │
         └── /api/governance-review
                  │
                  └── orchestrator.mjs
                           │
                           ├── token-steward.mjs  (static analysis)
                           ├── a11y-guardian.mjs  (static analysis)
                           │
                           └── agent-runner.mjs  ──→  Anthropic API
                                    │                  claude-haiku-4-5
                                    └── /api/chat ──→  claude-sonnet-4-5 (SSE)
```

---

*Built by Roo (Claude Sonnet) following the Terarrium Constitutional Document and MVP_PLAN.md.*
