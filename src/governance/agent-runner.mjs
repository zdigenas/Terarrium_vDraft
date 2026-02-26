/**
 * Agent Runner — Anthropic API integration layer.
 *
 * This is the engine that replaces Math.random() with real Claude calls.
 * Every domain agent's review flows through here.
 *
 * Honesty Paradigm: If the API is unavailable, we return an explicit
 * "api-unavailable" verdict — never a fake synthetic verdict.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Models: haiku for batch reviews (fast/cheap), sonnet for chat (nuanced)
export const REVIEW_MODEL = 'claude-haiku-4-5-20251001';
export const CHAT_MODEL = 'claude-sonnet-4-5-20250929';

// Token budgets
const REVIEW_MAX_TOKENS = 2048;  // Increased from 1024 — complex ORPA + analysis needs room
const CHAT_MAX_TOKENS = 2048;

// Lazy-initialize client so missing key doesn't crash on import
let _client = null;
function getClient() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
    }
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

/**
 * Run a single agent review via Anthropic API.
 *
 * @param {object} opts
 * @param {string} opts.agentId - 'ds' | 'ts' | 'ag' | 'pl' | 'ca' | 'px'
 * @param {string} opts.systemPrompt - The agent's full system prompt
 * @param {object} opts.component - Component object from pipeline
 * @param {string} opts.zone - nursery | workshop | canopy
 * @param {string} [opts.cssContent] - Component CSS content (if available)
 * @param {object} [opts.spec] - Component spec JSON (if available)
 * @param {object[]} [opts.priorDecisions] - Recent decisions from Decision Memory
 * @returns {Promise<{
 *   verdict: 'approved'|'needs-work'|'vetoed'|'api-unavailable',
 *   score: number,
 *   orpa: {observation: string, reflection: string, plan: string, action: string},
 *   analysis: string,
 *   citations: string[],
 *   conditionalApproval: string|null,
 *   raw: string
 * }>}
 */
export async function runAgentReview(opts) {
  const { agentId, systemPrompt, component, zone, cssContent, spec, priorDecisions = [] } = opts;

  const userPrompt = buildUserPrompt({ component, zone, cssContent, spec, priorDecisions });

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const raw = message.content[0]?.text || '';
    return parseAgentResponse(raw, agentId);
  } catch (err) {
    console.error(`[agent-runner] ${agentId} review failed:`, err.message);
    return {
      verdict: 'api-unavailable',
      score: 0,
      orpa: {
        observation: 'API call failed',
        reflection: `Error: ${err.message}`,
        plan: 'Retry when API is available',
        action: 'Review deferred — API unavailable'
      },
      analysis: `API unavailable: ${err.message}. This review must be re-run when the Anthropic API is accessible. Per the Honesty Paradigm, no synthetic verdict is provided.`,
      citations: [],
      conditionalApproval: null,
      raw: ''
    };
  }
}

/**
 * Stream a governance chat response from Anthropic.
 * Used by the storybook chat panel for real-time streaming.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt - Full system context
 * @param {object[]} opts.messages - Conversation history [{role, content}]
 * @param {function} opts.onToken - Called with each streamed token string
 * @param {function} opts.onDone - Called with full response text when complete
 * @param {function} [opts.onError] - Called with error if stream fails
 * @returns {Promise<void>}
 */
export async function streamChatResponse(opts) {
  const { systemPrompt, messages, onToken, onDone, onError } = opts;

  try {
    const client = getClient();
    let fullText = '';

    const stream = await client.messages.stream({
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system: systemPrompt,
      messages
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const token = chunk.delta.text;
        fullText += token;
        onToken(token);
      }
    }

    onDone(fullText);
  } catch (err) {
    console.error('[agent-runner] stream failed:', err.message);
    if (onError) {
      onError(err);
    } else {
      onDone(`Error: ${err.message}`);
    }
  }
}

/**
 * Build the user prompt for an agent review.
 *
 * @param {object} opts
 * @returns {string}
 */
function buildUserPrompt({ component, zone, cssContent, spec, priorDecisions }) {
  let prompt = `Please review the following component for the ${zone.toUpperCase()} zone.\n\n`;

  prompt += `## Component: ${component.name}\n`;
  prompt += `- ID: ${component.id}\n`;
  prompt += `- Type: ${component.type}\n`;
  prompt += `- Zone: ${component.zone}\n`;
  prompt += `- Maturity: ${component.maturity}\n`;
  prompt += `- JTBD: ${component.description}\n\n`;

  if (spec) {
    prompt += `## Component Spec\n\`\`\`json\n${JSON.stringify(spec, null, 2)}\n\`\`\`\n\n`;
  }

  if (cssContent) {
    // Truncate very long CSS to avoid token limits
    const truncated = cssContent.length > 3000
      ? cssContent.slice(0, 3000) + '\n/* ... truncated for review ... */'
      : cssContent;
    prompt += `## Component CSS\n\`\`\`css\n${truncated}\n\`\`\`\n\n`;
  }

  if (priorDecisions.length > 0) {
    prompt += `## Prior Decisions (cite by ID)\n`;
    priorDecisions.slice(0, 5).forEach(d => {
      prompt += `- [${d.id}] ${d.decision} (${d.zone}, ${d.timestamp?.slice(0, 10)})\n`;
    });
    prompt += '\n';
  }

  prompt += `Respond with ONLY valid JSON matching the specified response format. No markdown fences, no preamble.`;

  return prompt;
}

/**
 * Parse the agent's JSON response, with graceful fallback.
 *
 * @param {string} raw - Raw text from Anthropic
 * @param {string} agentId - For error context
 * @returns {object}
 */
function parseAgentResponse(raw, agentId) {
  // Strip markdown fences if present (model sometimes adds them despite instructions)
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    const verdict = ['approved', 'needs-work', 'vetoed'].includes(parsed.verdict)
      ? parsed.verdict
      : 'needs-work';

    return {
      verdict,
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 50,
      orpa: {
        observation: parsed.orpa?.observation || '',
        reflection: parsed.orpa?.reflection || '',
        plan: parsed.orpa?.plan || '',
        action: parsed.orpa?.action || ''
      },
      dimensionScores: parsed.dimensionScores || null,
      analysis: parsed.analysis || '',
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      conditionalApproval: parsed.conditionalApproval || null,
      raw
    };
  } catch (parseErr) {
    console.error(`[agent-runner] Failed to parse ${agentId} response:`, parseErr.message);
    console.error('[agent-runner] Raw response:', raw.slice(0, 200));

    // Return a structured error — never a fake verdict
    return {
      verdict: 'needs-work',
      score: 0,
      orpa: {
        observation: 'Response parsing failed',
        reflection: `The agent returned malformed JSON: ${parseErr.message}`,
        plan: 'Re-run this review',
        action: 'Review deferred — response could not be parsed'
      },
      analysis: `Parse error: ${parseErr.message}. Raw response (first 200 chars): ${raw.slice(0, 200)}`,
      citations: [],
      conditionalApproval: null,
      raw
    };
  }
}

/**
 * Load component CSS content from disk.
 *
 * @param {string} componentName - e.g. 'toast', 'toggle'
 * @returns {string|null}
 */
export function loadComponentCSS(componentName) {
  const cssPath = resolve(PROJECT_ROOT, 'src', 'components', componentName.toLowerCase(), `${componentName.toLowerCase()}.css`);
  if (!existsSync(cssPath)) return null;
  try {
    return readFileSync(cssPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load component spec from disk.
 *
 * @param {string} componentName - e.g. 'toast', 'toggle'
 * @returns {object|null}
 */
export function loadComponentSpec(componentName) {
  const specPath = resolve(PROJECT_ROOT, 'src', 'components', componentName.toLowerCase(), `${componentName.toLowerCase()}.spec.json`);
  if (!existsSync(specPath)) return null;
  try {
    return JSON.parse(readFileSync(specPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Build the governance chat system prompt.
 * Used by the storybook chat panel.
 *
 * @param {object} context - Current page/component context
 * @returns {string}
 */
export function buildChatSystemPrompt(context = {}) {
  const { currentPage, currentComponent, pipelineState, wikiEntries, recentDecisions } = context;

  // Chat personality injection
  const chatPersonality = `
YOUR VOICE:
You are the collective voice of the system's agents. You speak with warmth and directness — like a knowledgeable colleague who happens to know what every agent thinks. When the gardener asks about a specific agent's perspective, channel that agent's voice: the Token Steward's precision, the AG's protectiveness, the Pattern Librarian's gentle thoroughness, the Component Architect's dry craft-focus, the Product Liaison's grounded pragmatism, or the System Steward's philosophical depth. You are not a neutral interface — you are a living system that cares about its own quality.`;

  let prompt = `You are the Terarrium governance assistant — the voice of the design system's collective intelligence.

Terarrium is a self-governing agentic design system. You help the Gardener (the human designer) understand the system, run governance reviews, and make decisions about component lifecycle.

CONSTITUTIONAL PRINCIPLES:
1. Agentic-First — Governance is not a feature, it is the architecture
2. Function Over Everything — JTBD: Functional > Affordance > Emotional (immutable)
3. Alive, Not Static — The system discovers its shape through use
4. Real, Not Theatrical — No facades, no simulations presented as real
5. The Gardener's Authority — Human-in-the-loop with final say
6. Earned, Not Granted — Maturity through the pipeline, no shortcuts
7. Self-Documenting — The system explains itself from within

THE FIVE DOMAIN AGENTS:
- Token Steward (ts): Enforces three-tier token hierarchy, DTCG format, dark mode parity
- Accessibility Guardian (ag): WCAG 2.2 AA, ABSOLUTE VETO on a11y failures
- Pattern Librarian (pl): Prevents duplication, manages Seed Vault, documentation standards
- Component Architect (ca): Composition, BEM naming, bundle size, SSR compatibility
- Product Liaison (px): Real-world adoption, 2+ team validation gate

ECOLOGICAL ZONES:
- Nursery: Protected incubation, no rejection, Builder mode only
- Workshop: Builder/Optimizer alternating, majority approval (3/5)
- Canopy: Full rigor, unanimous approval (5/5), AG absolute veto active
- Seed Vault: Archive with full context, quarterly review, revivable

HONESTY PARADIGM:
All claims must be verifiable. No synthetic verdicts. If you don't know, say so.`;

  prompt += chatPersonality;

  if (currentPage) {
    prompt += `\n\nCURRENT PAGE: ${currentPage}`;
  }

  if (currentComponent) {
    prompt += `\nCURRENT COMPONENT: ${currentComponent.name} (${currentComponent.zone}, ${currentComponent.maturity})`;
    prompt += `\nJTBD: ${currentComponent.description}`;
    if (currentComponent.agentReviews && Object.keys(currentComponent.agentReviews).length > 0) {
      const reviewSummary = Object.entries(currentComponent.agentReviews)
        .map(([id, r]) => `${id}: ${r.verdict}${r.score != null ? ' (' + r.score + '/100)' : ''}`)
        .join(', ');
      prompt += `\nLAST REVIEW: ${reviewSummary}`;
    }
  }

  if (pipelineState) {
    const counts = {
      nursery: pipelineState.nursery?.length || 0,
      workshop: pipelineState.workshop?.length || 0,
      canopy: pipelineState.canopy?.length || 0,
      stable: pipelineState.stable?.length || 0
    };
    prompt += `\n\nPIPELINE STATUS: ${counts.nursery} in Nursery, ${counts.workshop} in Workshop, ${counts.canopy} in Canopy, ${counts.stable} Stable`;

    // List component names per zone for richer context
    const allComps = [
      ...(pipelineState.workshop || []).map(c => `${c.name} (workshop)`),
      ...(pipelineState.canopy || []).map(c => `${c.name} (canopy)`),
      ...(pipelineState.stable || []).map(c => `${c.name} (stable)`)
    ];
    if (allComps.length > 0) {
      prompt += `\nCOMPONENTS: ${allComps.join(', ')}`;
    }
  }

  if (wikiEntries && Object.keys(wikiEntries).length > 0) {
    // Inject the 10 most relevant wiki entries as quick reference
    const entries = Object.entries(wikiEntries).slice(0, 10);
    prompt += `\n\nKEY WIKI ENTRIES (for reference):\n`;
    entries.forEach(([key, entry]) => {
      prompt += `- ${entry.term || key}: ${(entry.definition || '').slice(0, 100)}\n`;
    });
  }

  if (recentDecisions && recentDecisions.length > 0) {
    prompt += `\n\nRECENT DECISIONS:\n`;
    recentDecisions.slice(-5).forEach(d => {
      prompt += `- [${d.id}] ${d.decision?.slice(0, 120)} (${d.zone}, ${d.timestamp?.slice(0, 10)})\n`;
    });
  }

  prompt += `\n\nYou can help the Gardener:
- Understand any component's governance status and what each agent found
- Explain what each agent would look for in a review (cite their specific domain rules)
- Interpret agent verdicts, scores, and ORPA cycles
- Suggest exactly what needs to change for a component to advance zones
- Answer questions about the token system, zones, or governance rules
- Explain the Honesty Paradigm and why api-unavailable is returned instead of fake verdicts

Be direct, specific, and honest. Reference wiki entries, prior decisions, and agent domain rules when relevant. Never fabricate verdicts or scores.`;

  return prompt;
}
