Run a governance review cycle for component: $ARGUMENTS

## Process

1. Read the component's current zone from `src/data/pipeline-state.json`
2. Read the component's spec from `src/components/$ARGUMENTS/$ARGUMENTS.spec.json`
3. Read the component's CSS from `src/components/$ARGUMENTS/$ARGUMENTS.css`

## Zone-Specific Rules

### If Nursery (Builder Mode Only)
- ALL agents operate in Builder mode: "Yes, and..." posture
- NO agent may reject. Only ask clarifying questions.
- Critique limited to "Have you considered..." framing
- H-index influence: ZERO
- Each agent asks ONE clarifying question about their domain:
  - Token Steward: "How might this component's tokens map to the semantic system?"
  - Accessibility Guardian: "How might we ensure this is accessible to all users?"
  - Pattern Librarian: "What differentiates this from existing components?"
  - Component Architect: "What is the minimal anatomy needed?"
  - Product Liaison: "Which teams would use this?"

### If Workshop (Builder/Optimizer Alternating)
- Agents may critique but MUST pair every critique with a constructive alternative
- Run real tools: stylelint, axe scan (if server running), token compliance check
- Majority approval (3/5 agents) required to pass
- Each agent provides: verdict (approve/needs-work), rationale, specific feedback, suggested fix

### If Canopy (Full Governance Rigor)
- Full three-dimension evaluation: Functional, Affordance, Emotional
- Run comprehensive audits: full axe scan, complete token compliance, BEM validation
- Unanimous approval (5/5 agents) required
- Accessibility Guardian absolute veto is active
- Each agent provides: verdict (approve/veto), score (0-100), detailed analysis, citations to prior decisions

## After Review

4. Aggregate verdicts according to zone rules
5. If approval threshold met: recommend promotion to next zone
6. If not: summarize what needs to change, with specific actionable items
7. Log ALL reviews to `src/data/decisions.jsonl` with full context per agent
8. Append to `src/data/activity-log.jsonl`
