/**
 * Governance Orchestrator — Full review cycle coordinator.
 *
 * This is the single entry point for running a governance review.
 * It wires all agents, the pipeline, and the root system together.
 *
 * Flow:
 *   1. Load component from pipeline-state.json
 *   2. Load component CSS + spec from src/components/{name}/
 *   3. Load prior decisions from decisions.jsonl
 *   4. Run static analysis (token compliance, BEM validation)
 *   5. Run each agent's real Anthropic API review
 *   6. Aggregate verdicts via checkZoneApproval()
 *   7. Write to decisions.jsonl and activity-log.jsonl
 *   8. Return structured result for UI rendering
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── Imports ──────────────────────────────────────────────────────────────────

import { runAgentReview, loadComponentCSS, loadComponentSpec } from './agent-runner.mjs';
import { findComponent, logActivity, loadPipeline, savePipeline } from './pipeline.mjs';
import { checkZoneApproval } from './zone-rules.mjs';
import { auditTokenCompliance } from './agents/token-steward.mjs';
import { getAriaPattern } from './agents/a11y-guardian.mjs';

import { buildSystemStewardPrompt } from './agents/system-steward.mjs';
import { buildPersonalityBlock } from './agent-voices.mjs';
import { TOKEN_STEWARD } from './agents/token-steward.mjs';
import { A11Y_GUARDIAN } from './agents/a11y-guardian.mjs';
import { PATTERN_LIBRARIAN } from './agents/pattern-librarian.mjs';
import { COMPONENT_ARCHITECT } from './agents/component-architect.mjs';
import { PRODUCT_LIAISON } from './agents/product-liaison.mjs';

// ── Agent registry ───────────────────────────────────────────────────────────

const AGENTS = [TOKEN_STEWARD, A11Y_GUARDIAN, PATTERN_LIBRARIAN, COMPONENT_ARCHITECT, PRODUCT_LIAISON];

const AGENT_MAP = {
  ts: TOKEN_STEWARD,
  ag: A11Y_GUARDIAN,
  pl: PATTERN_LIBRARIAN,
  ca: COMPONENT_ARCHITECT,
  px: PRODUCT_LIAISON
};

// ── Data helpers ─────────────────────────────────────────────────────────────

function readJSONL(relPath, limit = 10) {
  const full = resolve(PROJECT_ROOT, relPath);
  if (!existsSync(full)) return [];
  try {
    return readFileSync(full, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .slice(-limit);
  } catch {
    return [];
  }
}

// ── Gardener config loader ──────────────────────────────────────────────────

let _gardenerConfig = null;

function loadGardenerConfig() {
  if (_gardenerConfig) return _gardenerConfig;
  const configPath = resolve(PROJECT_ROOT, 'src/data/gardener-config.json');
  if (!existsSync(configPath)) return null;
  try {
    _gardenerConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    return _gardenerConfig;
  } catch {
    return null;
  }
}

/** Invalidate cached config (call after gardener updates config via API). */
export function reloadGardenerConfig() {
  _gardenerConfig = null;
  return loadGardenerConfig();
}

function appendJSONL(relPath, entry) {
  const full = resolve(PROJECT_ROOT, relPath);
  try {
    appendFileSync(full, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error(`[orchestrator] Failed to append to ${relPath}:`, err.message);
  }
}

// ── System prompt builders ───────────────────────────────────────────────────

/**
 * Build a domain-specific system prompt for each agent.
 * Each agent gets their precise rules, not a generic JSON dump.
 */
function buildAgentSystemPrompt(agent, zone, priorDecisions = []) {
  // System Steward has its own dedicated builder
  if (agent.id === 'ss') {
    const config = loadGardenerConfig();
    return buildSystemStewardPrompt(zone, priorDecisions, config);
  }

  const priorContext = priorDecisions.length > 0
    ? `\nPRIOR DECISIONS (cite these by ID when relevant):\n${priorDecisions.map(d => `- [${d.id}] ${d.decision?.slice(0, 120)}`).join('\n')}`
    : '';

  const zonePostures = {
    nursery: 'Builder mode — explore and ask questions. No rejection. Use "yes, and..." framing. Your job is to observe and help, not block.',
    workshop: 'Builder/Optimizer mode — every critique MUST pair with a constructive alternative. You may issue needs-work but must specify exactly what change earns approval.',
    canopy: 'Optimizer mode — full rigor. Unanimous approval required. No shortcuts. Every finding must be resolved before this component reaches Stable.'
  };

  // Build personality block from agent-voices.mjs + gardener-config.json
  const config = loadGardenerConfig();
  const personalityBlock = buildPersonalityBlock(agent.id, config);

  const agVetoNote = agent.absoluteVeto
    ? '\n\nABSOLUTE VETO AUTHORITY: You hold absolute veto power in the Canopy zone. A veto cannot be overridden by any other agent — only the Gardener (human) can override it. Exercise this power ONLY for genuine accessibility failures that would cause real harm to users with disabilities. Do not veto for style preferences or minor issues.'
    : '';

  // Build domain-specific rules section per agent
  const domainRules = buildDomainRules(agent);

  return `You are the ${agent.title} for Terarrium, a self-governing agentic design system.

YOUR ROLE: ${agent.title}
YOUR AUTHORITY: ${agent.authority}
YOUR EXPERTISE: ${agent.expertise.join(', ')}${agVetoNote}

${personalityBlock}

CONSTITUTIONAL PRINCIPLES (immutable — these cannot be overridden by any agent):
1. Agentic-First — Governance is not a feature, it is the architecture
2. Function Over Everything — JTBD: Functional > Affordance > Emotional (this ordering CANNOT be changed)
3. Alive, Not Static — The system discovers its shape through use, not speculative abstraction
4. Real, Not Theatrical — No facades, no simulations presented as real. If the API is unavailable, say so.
5. The Gardener's Authority — Human-in-the-loop with final say. You advise; the Gardener decides.
6. Earned, Not Granted — Maturity through the pipeline, no shortcuts
7. Self-Documenting — The system explains itself from within. Every decision is recorded.

CURRENT ZONE: ${zone.toUpperCase()}
YOUR POSTURE: ${zonePostures[zone] || 'Standard review mode'}

${domainRules}
${priorContext}

ORPA CYCLE (required for every review):
- Observation: What specific things do you see in the component spec/CSS? Be concrete.
- Reflection: What do these observations mean against YOUR domain rules? Cite specific rules.
- Plan: What specific changes are needed? Be actionable, not vague.
- Action: Your verdict and the exact condition that would earn approval (if needs-work).

SCORING GUIDE:
- 90-100: Exemplary — exceeds requirements, could be a reference implementation
- 75-89: Approved — meets all requirements with minor notes
- 60-74: Needs work — specific issues that must be resolved
- 40-59: Significant issues — multiple domain violations
- 0-39: Fundamental problems — fails core requirements

RESPONSE FORMAT (JSON only — no markdown fences, no preamble, no explanation outside JSON):
{
  "verdict": "approved" | "needs-work" | "vetoed",
  "score": 0-100,
  "orpa": {
    "observation": "Concrete observations about the component",
    "reflection": "What these mean against your domain rules",
    "plan": "Specific changes needed",
    "action": "Your verdict and exact approval condition"
  },
  "analysis": "Full analysis (2-4 paragraphs, domain-specific)",
  "citations": ["DEC-xxx or wiki-key or WCAG-criterion-id"],
  "conditionalApproval": "Exact change that earns approval, or null if approved/vetoed"
}`;
}

/**
 * Build domain-specific rules for each agent type.
 * This replaces the generic JSON.stringify(agent) dump.
 */
function buildDomainRules(agent) {
  switch (agent.id) {
    case 'ts':
      return `YOUR DOMAIN RULES — TOKEN STEWARD:
DTCG COMPLIANCE:
- All tokens use $value, $type, $description fields per W3C DTCG spec
- Three-tier hierarchy is MANDATORY: Primitive (--t-raw-*) → Semantic (--t-*) → Component
- Components NEVER reference primitive tokens directly (--t-raw-* in component CSS = violation)
- Semantic tokens carry contextual meaning: --t-interactive-default, NOT --t-raw-blue-600

WHAT TO CHECK IN CSS:
1. Any var(--t-raw-*) in component CSS = primitive token violation (flag each one)
2. Any hard-coded hex colors (#xxx) = violation
3. Any hard-coded px values in margin/padding/gap = spacing token violation
4. Any font-family not using var(--t-font-*) = typography token violation
5. Any border-radius: Npx = radius token violation
6. Dark mode: every color token must have a [data-theme="dark"] counterpart

SCORING: Deduct 10 points per primitive token reference, 15 per hard-coded hex, 5 per spacing violation.`;

    case 'ag':
      return `YOUR DOMAIN RULES — ACCESSIBILITY GUARDIAN:
WCAG 2.2 AA REQUIREMENTS (non-negotiable):
- 1.1.1: All non-text content has text alternative
- 1.3.1: Semantic HTML structure conveys meaning (correct roles)
- 1.4.3: Text contrast >= 4.5:1 (normal), >= 3:1 (large text)
- 1.4.11: UI component contrast >= 3:1 against adjacent colors
- 2.1.1: ALL functionality operable via keyboard alone
- 2.1.2: No keyboard trap (except modals with Escape)
- 2.4.7: Keyboard focus indicator visible (minimum 3px)
- 2.4.11 (WCAG 2.2): Focused item not fully hidden by sticky content
- 2.5.8 (WCAG 2.2): Touch targets >= 24x24 CSS px (recommend 44px minimum)
- 4.1.2: All UI components have accessible name + role + state

ARIA PATTERNS TO VERIFY:
- button: role=button, Space/Enter activates, aria-pressed for toggle state
- toggle/switch: role=switch, aria-checked, linked label via for/id or aria-labelledby
- dialog: role=dialog, aria-modal=true, aria-labelledby, focus trapped, Escape closes
- tabs: role=tablist/tab/tabpanel, aria-selected, aria-controls, arrow key navigation
- toast: role=alert (assertive) or role=status (polite), aria-live

VETO CONDITIONS (Canopy only — use sparingly):
- Missing keyboard access for interactive elements
- Touch target < 24px on mobile-critical components
- Missing accessible name on interactive elements
- Color as sole means of conveying information

SCORING: Deduct 20 points per WCAG A violation, 10 per AA violation, 5 per best-practice gap.`;

    case 'pl':
      return `YOUR DOMAIN RULES — PATTERN LIBRARIAN:
DOCUMENTATION REQUIREMENTS:
Required for Workshop exit: component name, JTBD statement, API surface (props/events/slots), 3+ usage examples, Do/Don't guidelines, accessibility notes, token dependencies, related components, changelog.

DEDUPLICATION CHECKS:
- Does this component overlap with any existing primitive or composite?
- Is there a Seed Vault entry that should be revived instead of creating new?
- Could this be composed from existing primitives rather than built from scratch?

API DESIGN PRINCIPLES:
- Minimal API surface — fewer props, more composable
- Sensible defaults for every prop (zero-config usable)
- Consistent naming: on[Event] for callbacks, is[State] for booleans
- Composability over configuration — prefer children/slots over mega-props
- No prop that could be a slot

CROSS-POLLINATION:
- Check if this pattern exists in other teams' ad-hoc implementations
- Identify opportunities to extract shared behavior into primitives
- Flag any patterns that could be generalized for broader use

SCORING: Deduct 15 points for missing required docs, 10 for API violations, 20 for clear duplication.`;

    case 'ca':
      return `YOUR DOMAIN RULES — COMPONENT ARCHITECT:
ATOMIC DESIGN TIER COMPLIANCE:
- Atom: Button, Input, Badge, Avatar, Icon, Label — single-purpose, no composition
- Molecule: Input Group, Search Bar, Form Field — 2-3 atoms combined
- Organism: Card, Dialog, Navigation — complex, multiple molecules
- Components must be placed in the correct tier — no tier-skipping

ARCHITECTURE RULES (all mandatory):
1. Inward dependency direction — composites depend on primitives, NEVER reverse
2. No circular dependencies between components
3. Single responsibility — one component, one job (no scope creep)
4. Composition over inheritance — use slots/children, not extends
5. Bundle size budget: individual component < 5KB gzipped
6. Tree-shakeable: unused components must not appear in bundle
7. SSR compatible: no window/document access at import time
8. Framework-agnostic: styles via CSS custom properties only
9. Zero external runtime dependencies beyond design system core

BEM NAMING VALIDATION:
- Block: t-[component-name] (e.g., t-button, t-toast)
- Element: t-[block]__[element] (e.g., t-toast__icon)
- Modifier: t-[block]--[modifier] (e.g., t-button--primary)
- No class names that don't follow this pattern

COMPOSITION PATTERNS:
- Compound: Parent provides context, children consume (Tabs+TabPanel)
- Slot: Named slots for flexible content (header, body, footer)
- Controlled: Parent manages state via value+onChange
- Uncontrolled: Component manages own state with optional defaultValue

SCORING: Deduct 15 per architecture rule violation, 10 per BEM violation, 20 for wrong atomic tier.`;

    case 'px':
      return `YOUR DOMAIN RULES — PRODUCT LIAISON:
ADOPTION VALIDATION GATES:
- Nursery: Evidence that 2+ teams are building ad-hoc solutions (proves real need)
- Workshop: 2+ teams actively prototyping with this component
- Canopy: 3+ teams validated, at least 1 in production or staging

REAL-WORLD VALIDATION CRITERIA:
1. Does this solve a problem that 2+ product teams actually have right now?
2. Is the JTBD statement validated by real usage data, not speculation?
3. Are there concrete use cases from real product screens?
4. Does the API surface match how teams actually want to use it?
5. Are there migration paths for teams currently using ad-hoc solutions?

ADOPTION METRICS TO CONSIDER:
- Coverage: DS components / total components per screen (target: 80%+)
- Reuse rate across teams (target: 80%+ screens using DS components)
- Time saved per feature (target: 30-50% reduction)
- Developer NPS for this component (target: 8+/10)

ANTI-PATTERNS TO FLAG:
- Component built for one team's specific use case (not generalizable)
- API designed around implementation details, not user needs
- Missing migration guide for teams with existing solutions
- No evidence of real adoption interest from product teams

SCORING: Deduct 20 for no adoption evidence, 15 for single-team use case, 10 for missing migration path.`;

    default:
      return `YOUR DOMAIN KNOWLEDGE:\n${JSON.stringify(agent, null, 2).slice(0, 1500)}`;
  }
}

// ── Static analysis (no LLM needed) ─────────────────────────────────────────

/**
 * Run static pre-analysis before LLM reviews.
 * Returns structured findings that get injected into agent prompts.
 */
function runStaticAnalysis(component, cssContent, spec) {
  const findings = {
    tokenCompliance: null,
    ariaPattern: null,
    specPresent: !!spec,
    cssPresent: !!cssContent
  };

  if (cssContent) {
    findings.tokenCompliance = auditTokenCompliance(cssContent, component.name);
  }

  findings.ariaPattern = getAriaPattern(component.name);

  return findings;
}

// ── Decision ID generator ────────────────────────────────────────────────────

function generateDecisionId(zone, componentName) {
  const ts = Date.now().toString(36);
  const name = componentName.toLowerCase().replace(/\s+/g, '-');
  return `DEC-${zone}-${name}-${ts}`;
}

// ── Core: run a full governance review ──────────────────────────────────────

/**
 * Run a full governance review cycle for a component.
 *
 * @param {string} componentId - Component ID (e.g. 'COMP-002') or name (e.g. 'toggle')
 * @param {object} [options]
 * @param {string} [options.zone] - Override zone (defaults to component's current zone)
 * @returns {Promise<{
 *   component: object,
 *   zone: string,
 *   staticAnalysis: object,
 *   agentReviews: Record<string, object>,
 *   zoneVerdict: { passed: boolean, reason: string },
 *   decisionId: string,
 *   timestamp: string
 * }>}
 */
export async function runGovernanceReview(componentId, options = {}) {
  // 1. Load component
  const found = findComponent(componentId);
  if (!found) {
    throw new Error(`Component not found: ${componentId}`);
  }
  const { component } = found;
  const zone = options.zone || component.zone;

  console.log(`[orchestrator] Starting ${zone} review for ${component.name} (${component.id})`);

  // 2. Load CSS + spec
  const cssContent = loadComponentCSS(component.name);
  const spec = loadComponentSpec(component.name);

  // 3. Load prior decisions (last 5 for this component)
  const allDecisions = readJSONL('src/data/decisions.jsonl', 50);
  const priorDecisions = allDecisions
    .filter(d => d.componentId?.toLowerCase() === component.name.toLowerCase() ||
                 d.componentId === component.id)
    .slice(-5);

  // 4. Static analysis
  const staticAnalysis = runStaticAnalysis(component, cssContent, spec);

  console.log(`[orchestrator] Static analysis complete. Token issues: ${staticAnalysis.tokenCompliance?.issues?.length ?? 'N/A'}`);

  // 5. Run agent reviews sequentially (not parallel — avoid overwhelming context)
  const agentReviews = {};

  for (const agent of AGENTS) {
    console.log(`[orchestrator] Running ${agent.title} review...`);

    const systemPrompt = buildAgentSystemPrompt(agent, zone, priorDecisions);

    // Inject static analysis findings into the component object for context
    const enrichedComponent = {
      ...component,
      staticAnalysis: staticAnalysis.tokenCompliance
        ? {
            tokenIssues: staticAnalysis.tokenCompliance.issues,
            tokenPasses: staticAnalysis.tokenCompliance.passes,
            ariaPattern: staticAnalysis.ariaPattern
          }
        : null
    };

    const review = await runAgentReview({
      agentId: agent.id,
      systemPrompt,
      component: enrichedComponent,
      zone,
      cssContent,
      spec,
      priorDecisions
    });

    agentReviews[agent.id] = {
      ...review,
      agentTitle: agent.title,
      agentColor: agent.hex,
      timestamp: new Date().toISOString()
    };

    console.log(`[orchestrator] ${agent.title}: ${review.verdict} (score: ${review.score})`);
  }

  // 6. Aggregate verdicts
  const verdictMap = {};
  for (const [agentId, review] of Object.entries(agentReviews)) {
    verdictMap[agentId] = review.verdict;
  }
  const zoneVerdict = checkZoneApproval(zone, verdictMap);

  console.log(`[orchestrator] Zone verdict: ${zoneVerdict.passed ? 'PASSED' : 'FAILED'} — ${zoneVerdict.reason}`);

  // 6b. Persist agentReviews back to pipeline-state.json so UI chips reflect real verdicts
  try {
    const pipelineState = loadPipeline();
    for (const z of ['nursery', 'workshop', 'canopy', 'stable']) {
      const idx = pipelineState[z]?.findIndex(c => c.id === component.id);
      if (idx !== undefined && idx !== -1) {
        // Store compact review summaries (verdict + score + orpa action) — not full text
        pipelineState[z][idx].agentReviews = {};
        for (const [agentId, review] of Object.entries(agentReviews)) {
          pipelineState[z][idx].agentReviews[agentId] = {
            verdict: review.verdict,
            score: review.score,
            action: review.orpa?.action || '',
            conditionalApproval: review.conditionalApproval || null,
            timestamp: review.timestamp
          };
        }
        pipelineState[z][idx].lastReviewedAt = new Date().toISOString();
        pipelineState[z][idx].lastZoneVerdict = zoneVerdict;
        savePipeline(pipelineState);
        console.log(`[orchestrator] Persisted agentReviews to pipeline-state.json for ${component.name}`);
        break;
      }
    }
  } catch (persistErr) {
    console.error('[orchestrator] Failed to persist agentReviews:', persistErr.message);
    // Non-fatal — review result still returned to UI
  }

  // 7. Write decision record
  const decisionId = generateDecisionId(zone, component.name);
  const timestamp = new Date().toISOString();

  const decisionEntry = {
    id: decisionId,
    timestamp,
    type: `${zone}_review`,
    zone,
    componentId: component.name.toLowerCase(),
    componentPipelineId: component.id,
    decision: `${component.name} ${zone} review: ${zoneVerdict.passed ? 'PASSED' : 'FAILED'}. ${zoneVerdict.reason}`,
    agents: Object.fromEntries(
      Object.entries(agentReviews).map(([id, r]) => [id, {
        verdict: r.verdict,
        score: r.score,
        analysis: r.analysis?.slice(0, 300),
        conditionalApproval: r.conditionalApproval
      }])
    ),
    zoneVerdict,
    staticAnalysis: {
      tokenIssues: staticAnalysis.tokenCompliance?.issues ?? [],
      tokenPasses: staticAnalysis.tokenCompliance?.passes ?? []
    }
  };

  appendJSONL('src/data/decisions.jsonl', decisionEntry);

  // 8. Log activity
  logActivity(
    'governance-review',
    component.id,
    component.name,
    'orchestrator',
    `${zone} review complete: ${zoneVerdict.passed ? 'passed' : 'failed'} — ${zoneVerdict.reason}`
  );

  return {
    component,
    zone,
    staticAnalysis,
    agentReviews,
    // Fix 15: UI aliases — storybook.js reads these keys
    reviews: agentReviews,
    zoneVerdict,
    overallVerdict: zoneVerdict.passed ? 'approved' : 'needs-work',
    summary: zoneVerdict.reason,
    decisionId,
    timestamp
  };
}

// ── Single agent review ──────────────────────────────────────────────────────

/**
 * Run a single agent's review for a component.
 * Used by the "Ask agent" feature in the storybook chat panel.
 *
 * @param {string} agentId - 'ts' | 'ag' | 'pl' | 'ca' | 'px'
 * @param {string} componentId - Component ID or name
 * @returns {Promise<object>}
 */
export async function runSingleAgentReview(agentId, componentId) {
  const agent = AGENT_MAP[agentId];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}. Valid: ${Object.keys(AGENT_MAP).join(', ')}`);
  }

  const found = findComponent(componentId);
  if (!found) {
    throw new Error(`Component not found: ${componentId}`);
  }
  const { component } = found;
  const zone = component.zone;

  const cssContent = loadComponentCSS(component.name);
  const spec = loadComponentSpec(component.name);

  const allDecisions = readJSONL('src/data/decisions.jsonl', 50);
  const priorDecisions = allDecisions
    .filter(d => d.componentId?.toLowerCase() === component.name.toLowerCase())
    .slice(-5);

  const systemPrompt = buildAgentSystemPrompt(agent, zone, priorDecisions);

  const review = await runAgentReview({
    agentId: agent.id,
    systemPrompt,
    component,
    zone,
    cssContent,
    spec,
    priorDecisions
  });

  return {
    agentId,
    agentTitle: agent.title,
    agentColor: agent.hex,
    component,
    zone,
    ...review,
    timestamp: new Date().toISOString()
  };
}

// ── Promote with review ──────────────────────────────────────────────────────

/**
 * Promote a component and immediately run a review in the new zone.
 * Convenience wrapper for the UI "Promote & Review" button.
 *
 * @param {string} componentId
 * @returns {Promise<object>}
 */
export async function promoteWithReview(componentId) {
  const { promoteComponent } = await import('./pipeline.mjs');
  const result = promoteComponent(componentId);

  if (!result.success) {
    throw new Error(result.reason || 'Promotion failed');
  }

  const reviewResult = await runGovernanceReview(componentId, { zone: result.to });

  return {
    promotion: result,
    review: reviewResult
  };
}
