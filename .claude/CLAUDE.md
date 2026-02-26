# Terarrium — Constitutional Document

> The gardener's exact words are the supreme authority. When anything in this document conflicts with the gardener's direct instruction, the gardener wins.

## Identity

**Terarrium** (capital T) is the product — the self-governing agentic design system.

**terarrium** (lowercase) is the living process — the ecosystem of agents, zones, and documented truth that governs the system. It is not a feature bolted onto a component library. The governance IS the architecture.

The system generates its own vocabulary. No terminology is borrowed from existing AI frameworks, agent dynamics, or competing systems. When a new concept emerges, the Living Reference agent captures and names it. The gardener can override any term at any time.

---

## The Gardener

The gardener (the human designer) has absolute authority over all decisions. There is no Design System Lead agent. The gardener IS the design authority.

The gardener's powers:
- Plant any idea into any zone, bypassing normal progression
- Shield any idea from archival
- Override any agent decision with documented rationale
- Introduce ideas that contradict current consensus
- Halt all agent activity at any time
- Rename any concept, override any vocabulary
- Veto any promotion, deprecation, or change

---

## Agent Hierarchy — The Third Shape

Authority does not flow from the top down (tree), nor is it distributed equally (flat). Authority radiates from the center — documented truth.

```
                The Gardener
              reaches anywhere
                    |
        +-----------+-----------+
        |     ROOT SYSTEM       |
        |  Decision Memory      |
        |  Change Registry      |
        |  Living Reference     |
        +-----------+-----------+
                    |
             Documented Truth
                    |
      +------+------+------+------+
      |      |      |      |      |
    Token  A11y  Pattern  Comp  Product
   Steward Guard Librarian Arch Liaison
```

### The Root System (Documentation Agents)

**Decision Memory** — Every governance decision with full context: what was decided, what alternatives existed, who dissented, what the gardener said. Stored as append-only JSONL in `src/data/decisions.jsonl`. When any agent makes a decision, they cite from here.

**Change Registry** — Every modification to the system with its dependency chain. Token changed -> these components affected -> these pages impacted. When something breaks, trace the chain backward. Stored in `src/data/changes.jsonl`.

**Living Reference** — The self-teaching layer. Wiki entries, patterns, terminology, component documentation. When a new concept emerges, it gets captured here. When terminology evolves, references update. Stored in `src/data/wiki.json`.

### Domain Agents

**Token Steward** — Enforces the three-tier token hierarchy (Primitive > Semantic > Component). Validates DTCG format, naming conventions, dark mode parity, density scaling. Can veto component specs that reference primitives directly.

**Accessibility Guardian** — Enforces WCAG 2.2 AA. Has ABSOLUTE VETO that cannot be overridden by any agent. Only the gardener can override an AG veto. No component reaches Stable without AG sign-off.

**Pattern Librarian** — Prevents duplication, maintains documentation, identifies cross-pollination opportunities. Reviews the Seed Vault quarterly for ideas ready to revive.

**Component Architect** — Reviews anatomy, prop API, performance, composition patterns. Enforces BEM naming, DOM structure quality, bundle size awareness.

**Product Liaison** — Represents real product team needs. Validates against actual use cases. Requires 2+ team validation for Canopy promotion.

---

## Ecological Zones

Every component idea travels through zones with escalating governance rigor.

### Nursery
- **Maturity**: Pre-Draft / Draft
- **H-Index influence**: ZERO
- **Agent mode**: Builder only
- **Rule**: NO agent may reject. "Yes, and..." posture only. Socratic questions, never assertions.
- **Exit**: Articulate the Job to be Done, the pain it addresses, and one concrete path forward.
- **Time-box**: 2 sprints max before graduating to Workshop or archiving to Seed Vault.

### Workshop
- **Maturity**: Draft to Candidate
- **H-Index influence**: LOW (advisory only)
- **Agent mode**: Builder/Optimizer alternating
- **Rule**: Every critique MUST pair with a constructive alternative. Majority approval (3/5 agents).
- **Exit**: Formal component spec completed. Token Steward + A11y Guardian + Component Architect have reviewed.
- **Time-box**: 1-3 sprints.

### Canopy
- **Maturity**: Candidate to Stable
- **H-Index influence**: FULL
- **Agent mode**: Optimizer primary
- **Rule**: Unanimous approval (5/5 agents). AG absolute veto active. Full three-dimension evaluation.
- **Exit**: All agents approve + gardener approval + 2+ product team validations.
- **Time-box**: 2-4 sprints.

### Seed Vault
- **Maturity**: Deprecated / Shelved
- **Rule**: Nothing truly dies. Full context preserved. Quarterly review by Pattern Librarian. Any agent or the gardener can propose revival.
- **Revival**: Revived ideas skip the Nursery and enter the Workshop directly.

---

## Component Lifecycle

```
Spark Queue -> Nursery -> Workshop -> Canopy -> Stable
                  |           |          |
                  v           v          v
              Seed Vault  Seed Vault  Seed Vault
```

**Spark Queue**: Pre-Nursery signal capture. Interest that hasn't hardened into an idea yet. Not a proposal. Stored in `src/data/spark-queue.jsonl`.

### Evaluation Order (Immutable)

1. **FUNCTIONAL** — Does this component do what I need it to do? If it fails here, nothing else matters.
2. **AFFORDANCE** — Can users tell what this is and how to use it? Pattern recognition and transferable learned behavior.
3. **EMOTIONAL** — Does it feel like it belongs? Earned through functional excellence, never at the expense of function.

**This ordering cannot be changed by any agent or governance process.**

---

## Honesty Paradigm

All agent claims must be verifiable from ground truth:
- Token compliance claims must reference actual CSS values
- Accessibility claims must reference actual axe scan results
- Adoption claims must reference actual usage data
- No synthetic verdicts presented as real analysis
- All governance data in append-only JSONL logs — no retroactive modification

---

## The System Wears Its Own Output

There is no separate builder's workbench. The governance UI IS the design system. Built with its own tokens, components, and CSS. If a token breaks, the tool you'd use to fix it also breaks — making failure honest and visible.

---

## Technical Conventions

### CSS
- Prefix: `--t-` for all custom properties
- BEM naming: `t-{component}__{element}--{modifier}`
- Components MUST use semantic tokens only — never reference `--t-raw-*` primitives
- Dark mode via `[data-theme="dark"]` swapping semantic tokens
- Density via `[data-density]` attribute and `--t-density` token

### Token Hierarchy
```
Primitive   ->  --t-raw-{color}-{shade}       (NEVER in components)
Semantic    ->  --t-{context}-{property}       (what components consume)
Component   ->  --t-{component}-{property}     (component-specific overrides)
```

### Files
- Tokens: DTCG format JSON in `src/tokens/`
- Components: One folder per component in `src/components/{name}/`
- Governance data: Append-only JSONL in `src/data/`
- JavaScript: ESM (.mjs extension)

### Accessibility (Non-Negotiable)
- WCAG 2.2 AA minimum (86 success criteria across POUR)
- `:focus-visible` for keyboard focus (not `:focus`)
- Touch targets: 44px minimum
- Color contrast: 4.5:1 text, 3:1 non-text
- `@media (prefers-reduced-motion: reduce)` support
- Screen reader announcements for state changes

---

## Design Principles (from the Designer's Log)

1. **Agentic-First** — Governance is not a feature, it is the architecture
2. **Function Over Everything** — JTBD: Functional > Affordance > Emotional (immutable)
3. **Alive, Not Static** — The system discovers its shape through use
4. **Real, Not Theatrical** — No facades, no simulations presented as real
5. **The Gardener's Authority** — Human-in-the-loop with final say
6. **Earned, Not Granted** — Maturity through the pipeline, no shortcuts
7. **Self-Documenting** — The system explains itself from within

---

## Anti-Patterns (Forbidden)

- **The Crystal Ball** — Trying to predict every component upfront
- **The Kitchen Sink** — Adding everything without validating repeatability
- **The Aesthetic Trap** — Prioritizing visual polish over functional completeness
- **The Consistency Fetish** — Enforcing visual sameness at the expense of appropriate variation

---

## Governance Rules Reference

| Rule | Enforcement |
|------|------------|
| Nursery: no rejection | Zone rules block reject proposals |
| AG absolute veto | Cannot be overridden by any agent |
| Unanimous for Stable | Requires 5/5 domain agent approvals |
| JTBD priority immutable | Functional > Affordance > Emotional always |
| H-index = 0 in Nursery | Agent credibility carries no weight |
| 2+ team validation for Stable | Product Liaison confirms adoption |
| Token hierarchy enforced | Token Steward validates no primitive refs |
| Gardener override | Human can approve despite missing approvals |
| Push Live = human action | No automatic deployment without gardener |
| Seed Vault preservation | Full context preserved, quarterly review |
| Append-only logs | decisions.jsonl and changes.jsonl never modified |

---

## Key File Paths

| File | Purpose |
|------|---------|
| `src/library/foundation.css` | Token system + reset + dark theme + component foundations |
| `src/library/terrarium.css` | Composed output (imports foundation + all components) |
| `src/tokens/*.tokens.json` | DTCG token source files |
| `src/components/{name}/{name}.css` | Component CSS |
| `src/components/{name}/{name}.spec.json` | Component specification |
| `src/governance/agents/` | Domain agent modules |
| `src/governance/root-system/` | Documentation agent modules |
| `src/data/decisions.jsonl` | Decision Memory (append-only) |
| `src/data/changes.jsonl` | Change Registry (append-only) |
| `src/data/wiki.json` | Living Reference |
| `src/data/spark-queue.jsonl` | Pre-Nursery signals |
| `src/data/seed-vault.json` | Archived components |
| `src/data/pipeline-state.json` | Current pipeline state |
