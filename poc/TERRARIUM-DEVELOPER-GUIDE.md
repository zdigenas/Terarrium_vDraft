# Terrarium — Agentic Design System: Developer Guide

> **Audience**: AI developer agent (Claude, Cursor, Copilot, etc.) operating in VS Code
> **Purpose**: Everything you need to take this POC to a real, production-grade agentic design system
> **Source of truth**: `library/index.html` (3555 lines) + `library/terrarium.css` (1197 lines)

---

## 1. What This Is

Terrarium is a design system that governs itself through AI agents. It is not a component library with an agent layer bolted on — the governance IS the system. Six specialized agents collaboratively review, critique, and approve every component through ecological zones (Nursery → Workshop → Canopy → Seed Vault). A human gardener (the designer) has final authority via HITL approval.

The POC is a single-file interactive storybook (`index.html`) with an external CSS foundation (`terrarium.css`). It contains:

- A complete token system (180+ CSS custom properties)
- 9 production components (5 primitives, 4 composites)
- A real governance engine with proposals, approval queue, and audit log
- 6 agent skill modules with deep domain knowledge
- A visual terrarium simulation
- Undo/redo, theme builder, export, knowledge base (37 wiki entries), seed vault, and designer's log

**The designer's founding directive**: "It needs to be an agentic-first design system. Function over everything. The design system is the terrarium — it's alive, it grows, it governs itself. But the gardener always has the final say."

---

## 2. Architecture Overview

### 2.1 File Structure (Current)

```
library/
├── index.html          # 3555 lines — storybook shell + all JS logic
└── terrarium.css       # 1197 lines — token system + component CSS
```

### 2.2 index.html Internal Structure

```
Lines 1-11      HTML head, Google Fonts (20 typefaces via CSS2 API)
Lines 12-299    <style> block — shell layout, storybook UI, terrarium viz, tooltips, wiki
Lines 300-349   Shell header — brand, theme toggle, density toggle, undo/redo buttons
Lines 350-390   Sidebar navigation — 4 sections: Overview, Foundations, Primitives, Composites, Theme
Lines 391-975   Story sections — 22 nav targets across 21 sections (see §2.3)
Lines 976-978   Right panel (editor), toast container
Lines 979-3555  <script> block — all application logic (see §2.4)
```

### 2.3 Navigation Map

Every page in the storybook is a `<section class="story" id="story-{target}">`. Navigation buttons have `data-target="{target}"` and call `nav(this)`.

**Overview section:**
- `welcome` — System introduction
- `philosophy` — JTBD framework, three dimensions
- `designerlog` — Designer's exact words organized by theme (8 canvases + 7 design principles)
- `agents` — Component Pipeline (submit, review, promote)
- `approvals` — Governance Approval Queue (pending/staged/audit log tabs)
- `seedvault` — Archived components with full context
- `wiki` — Knowledge Base (51 entries across 6 categories)

**Foundations section:**
- `colors`, `typography`, `spacing`, `elevation`

**Primitives section (all stable except Toggle=draft):**
- `button`, `input`, `badge`, `avatar`, `toggle`

**Composites section (all candidate):**
- `card`, `dialog`, `toast`, `tabs`

**Theme section:**
- `theme` — Theme Builder with preset themes
- `export` — Token export (CSS/JSON/SCSS/JS)

### 2.4 JavaScript Architecture

All JS lives in a single `<script>` block starting at line 979. Here's the dependency map:

```
state (line 980)
├── AGENT_META (line 1006) — 6 agent identities
├── ZONE_RULES (line 1015) — nursery/workshop/canopy rule sets
├── governance (line 1021) — proposals, staged, auditLog, pushed
├── AGENT_SKILLS (line 1026) — deep knowledge per agent, each with generateReview()
├── pipeline (line 1409) — nursery[], workshop[], canopy[], promoted[], activityLog[]
├── WIKI (line 3341) — 51 knowledge base entries
├── seedVault (line 3420) — 5 archived components
├── undoStack / redoStack (line 2260) — snapshot-based, MAX_UNDO=80
└── UI rendering functions
```

---

## 3. Token System

### 3.1 Architecture

Three-tier hierarchy enforced by the Token Steward agent:

```
Primitive    →  --t-raw-{color}-{shade}     (never used in components)
Semantic     →  --t-{context}-{property}     (what components consume)
Component    →  --t-{component}-{property}   (component-specific overrides)
```

**Naming convention**: `--t-{category}-{property}-{variant}`
**Prefix**: `--t-` (for Terrarium)

### 3.2 Token Inventory (in terrarium.css `:root`)

**Color primitives** (lines 60-120):
- Neutral: 0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
- Blue: 50-900 (brand)
- Green: 50-900 (success)
- Red: 50-900 (danger)
- Amber: 50-900 (warning)

**Semantic colors** (lines ~130-180):
- Background: `--t-bg-primary`, `--t-bg-secondary`, `--t-bg-brand`, `--t-bg-danger`, `--t-bg-warning`, `--t-bg-success`, `--t-bg-info`
- Foreground: `--t-fg-primary`, `--t-fg-secondary`, `--t-fg-tertiary`, `--t-fg-inverse`, `--t-fg-brand`, `--t-fg-danger`, `--t-fg-success`, `--t-fg-warning`
- Interactive: `--t-interactive-default`, `--t-interactive-hover`, `--t-interactive-active`, `--t-interactive-disabled`
- Border: `--t-border-default`, `--t-border-strong`, `--t-border-focus`, `--t-border-danger`
- Surface: `--t-surface-0` through `--t-surface-4` (tonal elevation)

**Typography** (lines ~190-230):
- Font families: `--t-font-sans` (Inter), `--t-font-mono` (JetBrains Mono)
- Scale: `--t-text-xs` through `--t-text-3xl` (modular ratio, default 1.25)
- Weights: `--t-weight-regular`(400), `--t-weight-medium`(500), `--t-weight-semibold`(600), `--t-weight-bold`(700)
- Line heights: `--t-leading-tight`(1.25), `--t-leading-normal`(1.5), `--t-leading-relaxed`(1.75)
- Variable font axes: `--t-font-opsz`(auto), `--t-font-slnt`(0)

**Spacing** (lines ~240-270):
- Base unit: 4px (`--t-space-base: 4px`)
- Scale: `--t-space-1`(4px) through `--t-space-40`(160px)
- Geometric: each step = base × multiplier

**Radius**: `--t-radius-none`(0), `--t-radius-sm`(4px), `--t-radius-md`(8px), `--t-radius-lg`(12px), `--t-radius-xl`(16px), `--t-radius-full`(9999px)

**Elevation** (shadow + tonal surface):
- `--t-shadow-0` through `--t-shadow-4`
- Combined with `--t-surface-0` through `--t-surface-4`

**Density** (adaptive):
- `--t-density`: `compact` | `default` | `comfortable`
- Applied via `[data-density]` attribute on `<html>`

### 3.3 Dark Mode

Full dark theme defined in `[data-theme="dark"]` selector in terrarium.css (~line 330). Every semantic token has a dark counterpart. Toggled via `data-theme` attribute on `<html>`.

### 3.4 Key JS Functions for Tokens

```javascript
setToken(prop, value)        // Sets CSS custom property + pushes undo snapshot
setTokenDirect(prop, value)  // Sets CSS custom property WITHOUT undo (for batch operations)
getComputed(prop)            // Returns computed value of a CSS custom property
setBrandColor(hex)           // Derives full brand palette from a single hex color
recomputeTypeScale()         // Recalculates all --t-text-* based on state.typeBase + state.typeRatio
recomputeSpacing()           // Recalculates all --t-space-* based on state.spaceBase
```

---

## 4. Component System

### 4.1 CSS Naming Convention

**BEM with `t-` prefix**: `t-{component}__{element}--{modifier}`

Examples:
```css
.t-btn                    /* Block */
.t-btn--primary           /* Modifier: variant */
.t-btn--sm                /* Modifier: size */
.t-btn__icon              /* Element */
.t-btn:disabled           /* State (pseudo-class) */
.t-btn--loading           /* State (modifier) */
```

### 4.2 Component Inventory

**Primitives** (in terrarium.css):

| Component | CSS Class | Variants | Sizes | States | Maturity |
|-----------|-----------|----------|-------|--------|----------|
| Button | `.t-btn` | primary, secondary, ghost, danger, success | sm, default, lg | disabled, loading, icon | Stable |
| Input | `.t-input` | — | — | default, error, success, disabled | Stable |
| Badge | `.t-badge` | brand, success, warning, danger, neutral | sm, default | — | Stable |
| Avatar | `.t-avatar` | — | sm, default, lg, xl | — | Stable |
| Toggle | `.t-toggle` | — | — | checked, disabled | Draft |

**Composites** (in terrarium.css):

| Component | CSS Class | Features | Maturity |
|-----------|-----------|----------|----------|
| Card | `.t-card` | header, body, footer, hoverable | Candidate |
| Dialog | `.t-dialog` | overlay, header, body, footer, close button | Candidate |
| Toast | `.t-toast` | info, success, warning, danger, dismiss | Candidate |
| Tabs | `.t-tabs` | tab list, tab panels, active state | Candidate |

**Additional CSS** (in terrarium.css but not separate story pages):
- `.t-tooltip` — tooltip component
- `.t-dropdown` — dropdown component

### 4.3 Accessibility Requirements (enforced by AG agent)

Every component must satisfy:
- WCAG 2.2 AA (86 success criteria across POUR)
- Focus visible: 3px indicator, `:focus-visible` (not `:focus`)
- Touch targets: ≥24px minimum, 48px recommended
- Color contrast: ≥4.5:1 text, ≥3:1 non-text
- WAI-ARIA APG keyboard patterns (defined in `AGENT_SKILLS.ag.ariaPatterns`)
- Screen reader announcements for state changes

The CSS foundation includes:
```css
:focus-visible { outline: 3px solid var(--t-border-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; } }
```

---

## 5. Governance Engine

This is the core of Terrarium. Every component modification flows through governance.

### 5.1 The Six Agents

```javascript
const AGENT_META = {
  ds: { title: 'Design System Lead',      authority: 'strategic',    canVeto: true  },
  ts: { title: 'Token Steward',           authority: 'domain',       canVeto: false },
  ag: { title: 'Accessibility Guardian',   authority: 'domain+veto', canVeto: true, absoluteVeto: true },
  pl: { title: 'Pattern Librarian',        authority: 'domain',       canVeto: false },
  ca: { title: 'Component Architect',      authority: 'domain',       canVeto: false },
  px: { title: 'Product Liaison',          authority: 'advisory',     canVeto: false }
};
```

Each agent has a full `AGENT_SKILLS[agentId]` object (~380 lines total, starting line 1026) containing:
- `expertise[]` — domain list
- Domain-specific knowledge objects (WCAG checklist, DTCG rules, atomic tiers, etc.)
- `generateReview(comp, zone)` → `{ verdict, analysis, score }` — produces a real review

**Critical**: The AG (Accessibility Guardian) has **absolute veto** in Canopy. This cannot be overridden by any agent or the DS Lead. Only a Steering Committee (not yet implemented) can override it.

### 5.2 Ecological Zones

```javascript
const ZONE_RULES = {
  nursery:  { mode: 'builder_only',      allowReject: false, majority: false, unanimous: false, agVeto: false, hIndex: 0   },
  workshop: { mode: 'builder_optimizer',  allowReject: true,  majority: true,  unanimous: false, agVeto: false, hIndex: 0.3 },
  canopy:   { mode: 'optimizer',          allowReject: true,  majority: false, unanimous: true,  agVeto: true,  hIndex: 1.0 }
};
```

**Nursery** (🌱): Protected incubation. No rejection allowed. All agents in Builder mode. H-index influence = 0. Max 2 sprints before graduating or seed-vaulting.

**Workshop** (🪴): Builder/Optimizer alternating cycles. Majority approval (3/6) suffices. Cross-pollination encouraged. 1-3 sprints.

**Canopy** (🌳): Full governance rigor. Unanimous approval (6/6) required. AG absolute veto active. H-index at full weight.

**Seed Vault**: Archive for ideas that didn't flourish. Full context preserved. Quarterly review by Pattern Librarian. Revivable when conditions change.

### 5.3 Pipeline Data Model

```javascript
const pipeline = {
  nursery: [],      // Components in incubation
  workshop: [],     // Components in active development
  canopy: [],       // Components in final validation
  promoted: [],     // Graduated components (appear in sidebar)
  activityLog: [],  // Timestamped governance events
  nextId: 1
};

// Component shape:
{
  id: 'COMP-001',
  name: 'DatePicker',
  type: 'primitive' | 'composite',
  description: 'JTBD statement',
  zone: 'nursery' | 'workshop' | 'canopy',
  maturity: 'draft' | 'candidate' | 'stable' | 'deprecated',
  createdAt: Date.now(),
  movedAt: Date.now(),
  agentReviews: {
    ds: { status, verdict, comment, score, expertise[], timestamp },
    ts: { ... }, ag: { ... }, pl: { ... }, ca: { ... }, px: { ... }
  },
  proposals: [],     // GOV-IDs linked to this component
  shielded: false,   // Gardener's protection from seed-vaulting
  isLive: false      // Whether it appears in sidebar
}
```

### 5.4 Governance Proposal Flow

```
1. Agent generates proposal → createProposal(opts)
2. Proposal enters queue → submitProposal(proposal) → governance.proposals[]
3. Compliance check → checkCompliance(proposal) enforces zone rules
4. Human approves → approveProposal(id) → moves to governance.staged[]
5. Human pushes live → pushLiveApprovedChanges() → applies all staged changes as one batch
6. Undo available → Ctrl+Z reverts entire batch
```

**Proposal schema:**
```javascript
{
  id: 'GOV-001',
  type: 'token' | 'lifecycle' | 'spec',
  proposedBy: agentId,
  targetZone: 'nursery' | 'workshop' | 'canopy',
  changes: [{ property, oldValue, newValue }],
  rationale: 'ORPA-structured explanation',
  citations: ['Source references'],
  status: 'pending' | 'approved' | 'staged' | 'rejected' | 'vetoed' | 'pushed',
  approvalsNeeded: [],
  approvalsReceived: {},
  vetoedBy: null,
  componentId: 'COMP-xxx' | null
}
```

### 5.5 Key Governance Functions

```javascript
createProposal(opts)                // Creates proposal, returns object
submitProposal(proposal)            // Adds to governance.proposals[], logs audit
checkCompliance(proposal)           // Validates against zone rules, returns { compliant, reason }
approveProposal(id)                 // Moves to staged, logs audit
rejectProposal(id)                  // Logs rejection with rationale
previewProposal(id)                 // Temporarily applies token changes for before/after preview
pushLiveApprovedChanges()           // Applies all staged changes, single undo snapshot
logAudit(action, proposalId, actor, detail)  // Immutable audit log entry
```

### 5.6 Agent Review Generation

Each agent's `generateReview(comp, zone)` is the core intelligence function. Currently these use weighted randomness to simulate decisions. **Your primary job is to replace these with real AI agent calls.**

What each agent reviews:

| Agent | Reviews | Knowledge Base |
|-------|---------|----------------|
| DS Lead | Strategic fit, JTBD alignment, lifecycle decisions | `decisionFramework`, `evaluators` per zone |
| Token Steward | Token naming, semantic usage, dark mode, DTCG compliance | `dtcgRules`, `auditCategories`, `darkModeChecks` |
| A11y Guardian | WCAG 2.2 AA, WAI-ARIA APG patterns, keyboard, contrast | `wcagChecklist` (POUR), `ariaPatterns` (14 component types) |
| Pattern Librarian | Duplication, documentation completeness, API design | `docStandard`, `crossPollination`, `apiPrinciples` |
| Component Architect | Atomic classification, composition, bundle size, SSR | `atomicTiers`, `archRules`, `compositionPatterns` |
| Product Liaison | Adoption metrics, team validation, use cases | `adoptionMetrics`, `validationGates`, `useCaseTemplate` |

---

## 6. Undo/Redo System

Snapshot-based with debounced capture:

```javascript
const undoStack = [];              // Max 80 entries
const redoStack = [];

snapshotState()                    // Captures: tokenOverrides, btn/inp/bdg state, type/space settings, vf axes, cssText
restoreSnapshot(snap)              // Restores all of the above + recomputes derived values
pushUndo()                         // Debounced (400ms) — captures BEFORE state, clears redo stack
undo()                             // Pops undo → restores → pushes to redo
redo()                             // Pops redo → restores → pushes to undo
```

**Keyboard shortcuts**: Ctrl+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo)

**Integration point**: `pushLiveApprovedChanges()` calls `pushUndo()` once before applying a batch of governance changes. Individual token changes within the batch use `setTokenDirect()` (no individual undo entries). This means Ctrl+Z reverts the entire governance batch as one step.

---

## 7. Visual Terrarium (Simulation)

The visual terrarium (`story-agents` section) shows agents arranged around a central component with speech bubbles, connection lines, and phase indicators.

### 7.1 Terrarium DOM Structure

```html
<div class="terrarium">
  <div class="terrarium__zone">          <!-- Zone indicator bar -->
  <div class="terrarium__stage">          <!-- 3-column grid -->
    <div class="terrarium__agent-col">    <!-- Left: DS, TS, AG -->
    <div class="terrarium__center">       <!-- Component being reviewed -->
    <div class="terrarium__agent-col">    <!-- Right: PL, CA, PX -->
  </div>
  <div class="terrarium__log-mini">       <!-- Activity feed -->
</div>
```

### 7.2 Terrarium Functions

```javascript
setZone(zone)                              // Updates zone indicator (nursery/workshop/canopy)
updateAgentStatus(agentId, statusText)     // Updates agent status badge
showBubble(agentId, html, duration)        // Shows speech bubble next to agent
showConnection(fromAgent, toAgent)         // Animates dashed line between agents
showPhase(text)                            // Shows phase pill below component
logMini(text)                              // Appends to mini activity log
updateCenterComponent(stage, name)         // Updates center component display
runAgentSim(componentOverride, zoneOverride) // Runs full scripted simulation
gardenerIntervene(action)                  // HITL override (approve/redirect/halt)
```

### 7.3 Proposal Generation (for simulation)

```javascript
generateTokenProposal(agent, component, zone)     // Creates real token change proposal
generateLifecycleProposal(agent, comp, from, to)   // Creates promotion/demotion proposal
generateSpecProposal(agent, component, zone)        // Creates spec change proposal
```

These generate proposals that reference **actual current computed token values** via `getComputed()`, making the before/after diffs real.

---

## 8. Knowledge Base (WIKI)

37 entries across 6 categories:

```javascript
const WIKI = {
  'key': {
    term: 'Display Name',
    category: 'Ecosystem' | 'Agents' | 'Operational' | 'Philosophy' | 'Lifecycle' | 'Tokens',
    def: 'Definition text',
    source: 'source-file.json',
    rule: 'Enforceable governance rule'
  },
  // ...
};
```

The WIKI powers the tooltip system. Any element with `data-tip="wiki-key"` gets a rich tooltip on hover showing the term definition, source, and rule. Expand this as the system grows — the structure supports unlimited entries.

**Tooltip system** (line 3475): `initTooltips()` binds mouseenter/mouseleave on `[data-tip]` elements, creating floating `.t-tip` elements positioned near the cursor.

---

## 9. Seed Vault

5 initial entries with full decision context:

```javascript
const seedVault = [
  {
    name: 'CalendarGrid',
    archivedDate: '2024-09-15',
    reason: 'Insufficient adoption signal...',
    context: 'Originated from Team Finance...',
    revivable: true,
    reviveReason: 'Now 3 teams have expressed need...',
    agents: { pl: 'Cross-pollination candidate', ag: 'A11y pattern was sound', ca: 'Solid composition model' }
  },
  // ColorPicker (revivable), Carousel (not — AG vetoed), Breadcrumb (not — composition covers it), Skeleton (revivable — blocked on animation tokens)
];
```

`reviveFromVault(index)` creates a governance proposal of type `'revival'` and submits it to the approval queue.

---

## 10. Theme Builder & Export

### Theme Builder
- `setBrandColor(hex)` — derives full brand palette from one color using `adjustBrightness()`
- `applyPresetTheme(name)` — applies named themes: 'midnight', 'forest', 'sunset', 'ocean', 'minimal'
- `resetTheme()` — reverts to defaults (with undo snapshot)

### Export System
- Formats: CSS (custom properties), JSON (DTCG), SCSS (variables), JS (object)
- `renderExport()` generates the export content
- `copyExport()` copies to clipboard
- `exportThemeCSS()` generates standalone CSS file

---

## 11. Designer's Log (The Authority)

Preserved in `story-designerlog`. Contains the designer's exact words as blockquotes, organized by theme:

1. **Origin** — "I need it to be an agentic-first design system"
2. **Philosophy** — JTBD framework, functional > affordance > emotional
3. **Ethos** — "Terrarium. A terrarium. It thrives on its own but you tend to it"
4. **Governance** — "But the human has to approve, obviously" (HITL)
5. **Self-Reference** — "It should build itself in itself"
6. **Integrity** — "This should be like, for real" (no facades)
7. **Agent Intelligence** — "They shouldn't be dumb. They should actually reason"
8. **Foundation Reset** — POC discipline, only what's earned stays

**7 Derived Design Principles:**
1. Agentic-First — Governance is not a feature, it's the architecture
2. Function Over Everything — JTBD: Functional > Affordance > Emotional (immutable)
3. Alive, Not Static — The system discovers its shape through use
4. Real, Not Theatrical — No facades, no simulations presented as real
5. The Gardener's Authority — Human-in-the-loop with final say
6. Earned, Not Granted — Maturity through the pipeline, no shortcuts
7. Self-Documenting — The system explains itself from within

---

## 12. What to Build Next: Making It Actually Agentic

### 12.1 Replace Simulated Reviews with Real Agent Calls

The highest-impact change. Each `AGENT_SKILLS[agentId].generateReview(comp, zone)` currently uses weighted `Math.random()`. Replace with:

```javascript
// Instead of:
generateReview(comp, zone) {
  const pass = Math.random() > 0.2;  // ← fake
  // ...
}

// Build:
async generateReview(comp, zone) {
  const systemPrompt = buildAgentSystemPrompt(agentId, zone);
  const userPrompt = buildReviewPrompt(comp, zone, this.evaluators[zone]);
  const response = await callLLM(systemPrompt, userPrompt);
  return parseAgentResponse(response);
}
```

Each agent's system prompt should include:
- Their full `AGENT_SKILLS[agentId]` knowledge base (it's already structured for this)
- The zone rules from `ZONE_RULES[zone]`
- The ORPA cycle requirement
- The Designer's Log principles as constitutional constraints

### 12.2 Real Token Analysis

The Token Steward should actually read the component's CSS and compare against the token system:
- Parse `terrarium.css` to extract all `--t-` tokens
- Check if a proposed component uses raw hex values instead of semantic tokens
- Validate dark mode coverage by checking `[data-theme="dark"]` definitions

### 12.3 Real Accessibility Audits

The A11y Guardian has the full WCAG 2.2 checklist and WAI-ARIA patterns in `AGENT_SKILLS.ag`. Use these as structured evaluation criteria:
- Run axe-core or similar on rendered component HTML
- Cross-reference with `ariaPatterns[componentType]` for keyboard and ARIA requirements
- The absolute veto in Canopy should be non-overridable programmatically

### 12.4 Persistent State

Currently everything is in-memory. Add:
- File-based persistence for `pipeline`, `governance`, `seedVault`
- Git-backed audit log (every governance decision = a commit)
- Token files in W3C DTCG JSON format (the Token Steward already knows the spec)

### 12.5 Multi-File Architecture

Break `index.html` into:
```
src/
├── tokens/
│   ├── primitives.json       # DTCG format
│   ├── semantic.json         # References primitives
│   └── component.json        # Component-level overrides
├── agents/
│   ├── ds-lead.js            # System prompt + skills + generateReview
│   ├── token-steward.js
│   ├── a11y-guardian.js
│   ├── pattern-librarian.js
│   ├── component-architect.js
│   └── product-liaison.js
├── governance/
│   ├── pipeline.js           # Pipeline state machine
│   ├── proposals.js          # Proposal CRUD + compliance
│   ├── audit-log.js          # Immutable append-only log
│   └── zone-rules.js         # ZONE_RULES + enforcement
├── components/
│   ├── button/               # One folder per component
│   │   ├── button.css
│   │   ├── button.stories.js
│   │   └── button.test.js
│   └── ...
├── wiki/
│   └── entries.json          # All 51 WIKI entries
├── seed-vault/
│   └── vault.json            # Archived components
└── storybook/
    ├── shell.html            # Layout + nav
    ├── shell.css             # Shell-only styles
    └── panels/               # Right-panel editors
```

### 12.6 Agent Communication Protocol

Design an inter-agent message format:

```javascript
{
  from: 'ts',                          // Agent ID
  to: 'ag',                            // Target agent (or 'all')
  type: 'review_request' | 'citation' | 'veto' | 'approval' | 'question',
  componentId: 'COMP-001',
  zone: 'workshop',
  orpaCycle: {
    observation: 'Token Steward found 3 raw hex values in proposed Button variant',
    reflection: 'This violates DTCG rule #3: Components NEVER reference primitives directly',
    plan: 'Request A11y Guardian review contrast ratios of proposed semantic alternatives',
    action: 'Submitting cross-review request with proposed token mappings'
  },
  payload: { /* agent-specific data */ },
  hIndex: { fromCredits: 0.3, citation: 'GOV-042' }
}
```

### 12.7 Implement the H-Index System

Currently defined in WIKI but not computed. Build:
- Citation tracking: when Agent A builds on Agent B's decision, increment B's h-index
- Weight varies by zone (0 in Nursery, 0.3 in Workshop, 1.0 in Canopy)
- Used for tie-breaking only — never grants additional authority

### 12.8 Component Generation

When a component graduates from Canopy to Stable, auto-generate:
- CSS file following BEM convention with `t-` prefix
- All semantic token references (no primitives)
- WAI-ARIA attributes from `AGENT_SKILLS.ag.ariaPatterns`
- Documentation from Pattern Librarian's review
- Test scaffolding from Component Architect's architecture review

---

## 13. Governance Rules Reference

These rules are encoded in the system and MUST be enforced:

| Rule | Source | Current Enforcement |
|------|--------|-------------------|
| Nursery: no rejection | ZONE_RULES.nursery.allowReject=false | `checkCompliance()` blocks reject |
| AG absolute veto | AGENT_META.ag.absoluteVeto=true | Approve button disabled when AG vetoes in Canopy |
| Unanimous for Stable | ZONE_RULES.canopy.unanimous=true | Requires 6/6 approvals |
| JTBD priority immutable | WIKI['jtbd'].rule | Agent system prompts |
| ORPA cycle mandatory | WIKI['orpa-cycle'].rule | Each proposal has ORPA structure |
| H-index = 0 in Nursery | ZONE_RULES.nursery.hIndex=0 | Agent credibility weight zeroed |
| 2+ team validation | AGENT_SKILLS.px.validationGates | PX must confirm adoption |
| Token hierarchy | AGENT_SKILLS.ts.dtcgRules | TS validates no primitive references |
| Gardener override | WIKI['gardeners-hand'] | Human can approve despite missing approvals |
| Gardener's Halt | WIKI['gardenersHalt'] | `gardenerIntervene('halt')` pauses all agents |
| Push Live = human action | WIKI['push-live'] | No automatic deployment |
| Seed Vault preservation | WIKI['seed-vault'] | Full context preserved, quarterly review |

---

## 14. CSS Layers in terrarium.css

```
Layer 0 (lines 17-51):    CSS Reset + baseline
Layer 1 (lines 53-330):   Design tokens as CSS custom properties (:root)
    Dark theme (lines ~330-370): [data-theme="dark"] overrides
Layer 2 (lines ~370-400):  Accessibility + density + reduced motion
Layer 3 (lines ~400-1197): Component styles
    Button (.t-btn)          — all variants, sizes, states, loading animation
    Input (.t-input)         — wrapper, label, helper text, states
    Badge (.t-badge)         — all semantic variants + sizes
    Avatar (.t-avatar)       — sizes, initials, ring
    Card (.t-card)           — header, body, footer, hoverable
    Dialog (.t-dialog)       — overlay, container, sections
    Toast (.t-toast)         — types, dismiss, animation
    Tabs (.t-tabs)           — tab list, items, panels
    Toggle (.t-toggle)       — track, thumb, checked state
    Tooltip (.t-tooltip)     — positioning, arrow
    Dropdown (.t-dropdown)   — trigger, menu, items
    Typography utilities     — .t-display, .t-heading, .t-body, .t-caption, .t-overline, .t-code
```

---

## 15. Critical Implementation Notes

### 15.1 The `</script>` Bug Pattern

**NEVER** put `</script>` inside a JavaScript template literal or string, even in HTML that will be injected via innerHTML. The browser's HTML parser terminates the script block at the first `</script>` it encounters, regardless of JavaScript string context. This was a real bug that broke the entire page. If you need script-like behavior in injected HTML, use init callbacks or event delegation.

### 15.2 Token Override Mechanism

Token changes flow through two paths:
1. **User edits** (theme builder, sliders): `setToken(prop, value)` → pushes undo → sets CSS property
2. **Governance changes** (push live): `setTokenDirect(prop, value)` → no undo → sets CSS property. The caller (`pushLiveApprovedChanges()`) handles the single undo snapshot.

Both update `state.tokenOverrides` which is captured in undo snapshots.

### 15.3 Navigation System

`nav(el)` reads `data-target` from the clicked button, hides all `.story` sections, shows `#story-{target}`, updates active nav state, and calls `updatePanel()` to refresh the right panel editor for the current context.

### 15.4 Panel System

The right panel (`updatePanel()`, line 2405) renders different editor controls based on `state.currentStory`. Each story type has a dedicated panel builder function: `panelButton()`, `panelInput()`, `panelBadge()`, `panelColors()`, `panelTypography()`, `panelSpacing()`, `panelTheme()`.

### 15.5 Toast System

```javascript
showToast(type, title, message)  // type: 'success' | 'warning' | 'info' | 'danger'
dismissToast(id)                 // Removes toast by ID
```

Auto-dismiss after 4 seconds. Used throughout for governance feedback.

---

## 16. Google Fonts Library

20 typefaces loaded via CSS2 API (line 11):

**Variable Sans-Serif** (12): Inter, DM Sans, Space Grotesk, Manrope, Plus Jakarta Sans, Outfit, Sora, Rubik, Nunito, Work Sans, Raleway, IBM Plex Sans

**Classic Sans-Serif** (4): Open Sans, Montserrat, Poppins, Lato

**Monospace** (4): JetBrains Mono, Fira Code, Source Code Pro, IBM Plex Mono

Changed via `--t-font-sans` and `--t-font-mono` tokens. The theme builder panel includes a font family selector.

---

## 17. End-to-End Workflow (Current POC)

Here's exactly what happens when a user submits a component:

1. User fills name + type + description in Pipeline form → `submitToPipeline()`
2. Component object created → pushed to `pipeline.nursery`
3. `autoAgentReview(comp, 'nursery')` runs all 6 agents' `generateReview()` in Builder mode
4. Visual terrarium updates: zone → nursery, component appears in center, agents show statuses
5. Activity log populated with each agent's verdict
6. User clicks "Promote" → `promoteComponent(compId)` moves to next zone, re-runs agent reviews
7. Agents generate real proposals (`generatePipelineProposals()`) → submitted to governance queue
8. User navigates to Approval Queue → sees pending proposals with diffs
9. User approves proposals → moved to Staged tab
10. User clicks "Push Live" → `pushLiveApprovedChanges()`:
    - Captures undo snapshot
    - Applies all token changes via `setTokenDirect()`
    - Updates component maturity badges
    - Logs everything to audit trail
    - Clears staged queue
11. Component appears in sidebar navigation via `addComponentToSidebar()` and `addComponentStory()`
12. Ctrl+Z reverts the entire batch

---

*This guide was generated from the POC codebase as of February 2026. The designer's exact words from the Designer's Log are the ultimate authority. When this guide conflicts with the Designer's Log, the log wins.*
