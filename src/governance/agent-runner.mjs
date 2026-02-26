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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// Models: haiku for batch reviews (fast/cheap), sonnet for chat (nuanced)
export const REVIEW_MODEL = 'claude-haiku-4-5-20251001';
export const CHAT_MODEL = 'claude-sonnet-4-5-20250929';

// Token budgets
const REVIEW_MAX_TOKENS = 2048;  // Increased from 1024 — complex ORPA + analysis needs room
const CHAT_MAX_TOKENS = 4096;

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

// ── Tool-use definitions for agentic chat ────────────────────────────────────

export const CHAT_TOOLS = [
  // Read-only tools
  {
    name: 'get_pipeline_state',
    description: 'Get the current pipeline state — which components are in each zone (nursery, workshop, canopy, stable) with their maturity and review status.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_component_details',
    description: 'Get detailed information about a specific component including its CSS, spec, and pipeline entry.',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID (e.g. COMP-002) or name (e.g. toggle)' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'get_recent_decisions',
    description: 'Get recent governance decisions from the decision log. Optionally filter by component.',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Optional component ID to filter by' },
        limit: { type: 'number', description: 'Max decisions to return (default 10)' }
      },
      required: []
    }
  },
  {
    name: 'get_activity_log',
    description: 'Get recent activity log entries showing what has happened in the system.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 20)' }
      },
      required: []
    }
  },
  {
    name: 'get_wiki',
    description: 'Get wiki entries from the Living Reference — terminology, patterns, and system documentation.',
    input_schema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Optional term to look up. If omitted, returns all entries.' }
      },
      required: []
    }
  },
  // Action tools
  {
    name: 'run_governance_review',
    description: 'Run a full 5-agent governance review cycle on a component. This calls all domain agents (Token Steward, A11y Guardian, Pattern Librarian, Component Architect, Product Liaison) and records the decision. Takes 15-30 seconds.',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID (e.g. COMP-002) or name (e.g. toggle)' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'run_single_agent_review',
    description: 'Run a review by a single domain agent on a component.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID: ts (Token Steward), ag (A11y Guardian), pl (Pattern Librarian), ca (Component Architect), px (Product Liaison)' },
        componentId: { type: 'string', description: 'Component ID or name' }
      },
      required: ['agentId', 'componentId']
    }
  },
  {
    name: 'promote_component',
    description: 'Promote a component to the next zone (nursery→workshop, workshop→canopy, canopy→stable).',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to promote' }
      },
      required: ['componentId']
    }
  },
  {
    name: 'create_component',
    description: 'Create a new component and plant it in the Nursery.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (e.g. Slider)' },
        type: { type: 'string', description: 'Component type: ui-component, pattern, or layout' },
        description: { type: 'string', description: 'JTBD description — what job does this component do?' }
      },
      required: ['name', 'type', 'description']
    }
  },
  {
    name: 'seed_vault_component',
    description: 'Archive a component to the Seed Vault. Nothing truly dies — full context is preserved for potential revival.',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', description: 'Component ID to archive' },
        reason: { type: 'string', description: 'Reason for archiving' }
      },
      required: ['componentId', 'reason']
    }
  },
  // File read/write tools
  {
    name: 'read_file',
    description: 'Read any project file under src/. Path is relative to project root (e.g. src/components/toggle/toggle.css).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_component_css',
    description: 'Create or overwrite a component CSS file at src/components/{name}/{name}.css. Creates the directory if it does not exist.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (lowercase, e.g. slider)' },
        css: { type: 'string', description: 'Full CSS content for the component' }
      },
      required: ['name', 'css']
    }
  },
  {
    name: 'write_component_spec',
    description: 'Create or overwrite a component spec JSON file at src/components/{name}/{name}.spec.json.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (lowercase, e.g. slider)' },
        spec: { type: 'object', description: 'Component specification object (anatomy, JTBD, tokens, accessibility, etc.)' }
      },
      required: ['name', 'spec']
    }
  },
  {
    name: 'patch_css',
    description: 'Find-and-replace within a CSS file. Works on component CSS and foundation.css. This is the ONLY tool that can modify foundation.css. Each patch is a {find, replace} pair applied sequentially.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'CSS file path relative to project root (e.g. src/components/toggle/toggle.css or src/library/foundation.css)' },
        patches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Exact string to find in the file' },
              replace: { type: 'string', description: 'Replacement string' }
            },
            required: ['find', 'replace']
          },
          description: 'Array of {find, replace} pairs to apply sequentially'
        }
      },
      required: ['path', 'patches']
    }
  },
  {
    name: 'write_token_file',
    description: 'Create or update a DTCG token file in src/tokens/. Filename must end in .tokens.json.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Token filename (e.g. color.tokens.json)' },
        tokens: { type: 'object', description: 'DTCG-format token object' }
      },
      required: ['filename', 'tokens']
    }
  },
  {
    name: 'update_wiki',
    description: 'Add or update a Living Reference wiki entry.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Kebab-case identifier (e.g. spark-gardening)' },
        term: { type: 'string', description: 'Display name' },
        category: { type: 'string', description: 'Grouping category (e.g. Ecosystem, Philosophy)' },
        definition: { type: 'string', description: 'Full definition text' },
        source: { type: 'string', description: 'Where this concept originated' },
        rule: { type: 'string', description: 'Optional governance rule associated with this concept' }
      },
      required: ['key', 'term', 'category', 'definition', 'source']
    }
  },
  {
    name: 'update_terrarium_css',
    description: 'Add or remove a component @import line in terrarium.css.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name (lowercase, e.g. slider)' },
        action: { type: 'string', enum: ['add', 'remove'], description: 'Whether to add or remove the import' }
      },
      required: ['name', 'action']
    }
  }
];

/**
 * Execute a tool call from the agentic chat loop.
 *
 * @param {string} toolName - Name of the tool to execute
 * @param {object} toolInput - Tool input parameters
 * @param {object} deps - Dependency object injected from proxy.mjs
 * @returns {Promise<string>} JSON string for tool_result content
 */
export async function executeTool(toolName, toolInput, deps) {
  try {
    switch (toolName) {
      case 'get_pipeline_state': {
        const state = deps.loadPipeline();
        const summary = {};
        for (const zone of ['nursery', 'workshop', 'canopy', 'stable']) {
          summary[zone] = (state[zone] || []).map(c => ({
            id: c.id, name: c.name, maturity: c.maturity,
            zone: c.zone, description: c.description,
            reviewStatus: c.agentReviews ? Object.entries(c.agentReviews).map(([k, v]) => `${k}:${v.verdict}`).join(', ') : 'none'
          }));
        }
        return JSON.stringify(summary);
      }

      case 'get_component_details': {
        const comp = deps.findComponent(toolInput.componentId);
        if (!comp) return JSON.stringify({ error: `Component '${toolInput.componentId}' not found` });
        const css = loadComponentCSS(comp.name);
        const spec = loadComponentSpec(comp.name);
        const result = { ...comp };
        if (css) result.css = css.length > 4000 ? css.slice(0, 4000) + '\n/* ... truncated ... */' : css;
        if (spec) result.spec = spec;
        return JSON.stringify(result);
      }

      case 'get_recent_decisions': {
        const limit = toolInput.limit || 10;
        let decisions = deps.readJSONL('src/data/decisions.jsonl', limit);
        if (toolInput.componentId) {
          decisions = decisions.filter(d =>
            d.componentId === toolInput.componentId || d.componentName?.toLowerCase() === toolInput.componentId.toLowerCase()
          );
        }
        return JSON.stringify(decisions);
      }

      case 'get_activity_log': {
        const limit = toolInput.limit || 20;
        const entries = deps.readJSONL('src/data/activity-log.jsonl', limit);
        return JSON.stringify(entries);
      }

      case 'get_wiki': {
        const wiki = deps.readJSON('src/data/wiki.json') || {};
        if (toolInput.term) {
          const key = Object.keys(wiki).find(k =>
            k.toLowerCase() === toolInput.term.toLowerCase() ||
            (wiki[k].term || '').toLowerCase() === toolInput.term.toLowerCase()
          );
          return key ? JSON.stringify({ [key]: wiki[key] }) : JSON.stringify({ error: `No wiki entry for '${toolInput.term}'` });
        }
        return JSON.stringify(wiki);
      }

      case 'run_governance_review': {
        const result = await deps.runGovernanceReview(toolInput.componentId);
        // Truncate analysis fields to keep token usage reasonable
        const summary = {
          component: result.component?.name || toolInput.componentId,
          zone: result.zone,
          zoneVerdict: result.zoneVerdict,
          agentReviews: {},
          decisionId: result.decisionId,
          timestamp: result.timestamp
        };
        for (const [id, review] of Object.entries(result.agentReviews || {})) {
          summary.agentReviews[id] = {
            verdict: review.verdict,
            score: review.score,
            orpa: review.orpa,
            analysis: (review.analysis || '').slice(0, 500),
            conditionalApproval: review.conditionalApproval
          };
        }
        return JSON.stringify(summary);
      }

      case 'run_single_agent_review': {
        const result = await deps.runSingleAgentReview(toolInput.agentId, toolInput.componentId);
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({
          agent: toolInput.agentId,
          verdict: result.verdict,
          score: result.score,
          orpa: result.orpa,
          analysis: (result.analysis || '').slice(0, 500),
          conditionalApproval: result.conditionalApproval
        });
      }

      case 'promote_component': {
        const result = deps.promoteComponent(toolInput.componentId);
        return JSON.stringify(result);
      }

      case 'create_component': {
        const result = deps.createComponent(toolInput.name, toolInput.type, toolInput.description);
        return JSON.stringify(result);
      }

      case 'seed_vault_component': {
        const result = deps.seedVaultComponent(toolInput.componentId, toolInput.reason);
        return JSON.stringify(result);
      }

      // ── File read/write tools ──────────────────────────────────────────

      case 'read_file': {
        const check = deps.validateReadPath(toolInput.path);
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, toolInput.path);
        if (!existsSync(fullPath)) return JSON.stringify({ error: `File not found: ${toolInput.path}` });
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').length;
        const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n/* ... truncated (8000 char limit) ... */' : content;
        return JSON.stringify({ path: toolInput.path, lines, content: truncated });
      }

      case 'write_component_css': {
        const name = toolInput.name.toLowerCase();
        const relPath = `src/components/${name}/${name}.css`;
        const check = deps.validateWritePath(relPath);
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, relPath);
        mkdirSync(resolve(deps.projectRoot, `src/components/${name}`), { recursive: true });
        writeFileSync(fullPath, toolInput.css);
        deps.appendChange({
          file: relPath, changeType: 'css-edit',
          description: `Chat agent wrote component CSS: ${relPath}`,
          breakageRisk: 'low'
        });
        deps.logActivity('file-write', null, name, 'chat-agent', `Wrote ${relPath}`);
        return JSON.stringify({ success: true, path: relPath, action: 'wrote' });
      }

      case 'write_component_spec': {
        const name = toolInput.name.toLowerCase();
        if (!toolInput.spec || typeof toolInput.spec !== 'object') {
          return JSON.stringify({ error: 'spec must be a JSON object' });
        }
        const relPath = `src/components/${name}/${name}.spec.json`;
        const check = deps.validateWritePath(relPath);
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, relPath);
        mkdirSync(resolve(deps.projectRoot, `src/components/${name}`), { recursive: true });
        writeFileSync(fullPath, JSON.stringify(toolInput.spec, null, 2) + '\n');
        deps.appendChange({
          file: relPath, changeType: 'spec-update',
          description: `Chat agent wrote component spec: ${relPath}`,
          breakageRisk: 'low'
        });
        deps.logActivity('file-write', null, name, 'chat-agent', `Wrote ${relPath}`);
        return JSON.stringify({ success: true, path: relPath, action: 'wrote' });
      }

      case 'patch_css': {
        const relPath = toolInput.path;
        const check = deps.validateWritePath(relPath, 'patch');
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, relPath);
        if (!existsSync(fullPath)) return JSON.stringify({ error: `File not found: ${relPath}` });
        let content = readFileSync(fullPath, 'utf-8');
        const applied = [];
        const failed = [];
        for (const patch of toolInput.patches) {
          if (content.includes(patch.find)) {
            content = content.replace(patch.find, patch.replace);
            applied.push(patch.find.slice(0, 60));
          } else {
            failed.push(patch.find.slice(0, 60));
          }
        }
        if (failed.length > 0) {
          return JSON.stringify({ error: `Find string not found in file: ${failed.join('; ')}` });
        }
        writeFileSync(fullPath, content);
        deps.appendChange({
          file: relPath, changeType: 'css-edit',
          description: `Chat agent patched CSS (${applied.length} replacements): ${relPath}`,
          breakageRisk: 'low'
        });
        deps.logActivity('file-patch', null, null, 'chat-agent', `Patched ${relPath} (${applied.length} changes)`);
        return JSON.stringify({ success: true, path: relPath, action: 'patched', patchesApplied: applied.length });
      }

      case 'write_token_file': {
        const filename = toolInput.filename;
        if (!filename.endsWith('.tokens.json')) {
          return JSON.stringify({ error: 'Filename must end in .tokens.json' });
        }
        const relPath = `src/tokens/${filename}`;
        const check = deps.validateWritePath(relPath);
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, relPath);
        const existed = existsSync(fullPath);
        writeFileSync(fullPath, JSON.stringify(toolInput.tokens, null, 2) + '\n');
        deps.appendChange({
          file: relPath, changeType: 'token-edit',
          description: `Chat agent ${existed ? 'updated' : 'created'} token file: ${relPath}`,
          breakageRisk: 'medium'
        });
        deps.logActivity('file-write', null, null, 'chat-agent', `${existed ? 'Updated' : 'Created'} ${relPath}`);
        return JSON.stringify({ success: true, path: relPath, action: existed ? 'updated' : 'created' });
      }

      case 'update_wiki': {
        const { key, term, category, definition, source, rule } = toolInput;
        deps.addWikiEntry(key, { term, category, def: definition, source, rule });
        deps.logActivity('wiki-update', null, null, 'chat-agent', `Updated wiki entry: ${term}`);
        return JSON.stringify({ success: true, key, term });
      }

      case 'update_terrarium_css': {
        const name = toolInput.name.toLowerCase();
        const relPath = 'src/library/terrarium.css';
        const check = deps.validateWritePath(relPath);
        if (!check.allowed) return JSON.stringify({ error: check.reason });
        const fullPath = resolve(deps.projectRoot, relPath);
        let content = readFileSync(fullPath, 'utf-8');
        const importLine = `@import '../components/${name}/${name}.css';`;
        if (toolInput.action === 'add') {
          if (content.includes(importLine)) {
            return JSON.stringify({ success: true, path: relPath, action: 'already present', name });
          }
          // Insert before utilities.css line
          const utilsLine = "@import './utilities.css';";
          if (content.includes(utilsLine)) {
            content = content.replace(utilsLine, importLine + '\n' + utilsLine);
          } else {
            // Append if no utilities line
            content = content.trimEnd() + '\n' + importLine + '\n';
          }
          writeFileSync(fullPath, content);
          deps.appendChange({
            file: relPath, changeType: 'css-edit',
            description: `Chat agent added @import for ${name} component`,
            breakageRisk: 'low'
          });
          deps.logActivity('file-write', null, name, 'chat-agent', `Added @import for ${name} in terrarium.css`);
          return JSON.stringify({ success: true, path: relPath, action: 'added', name });
        } else if (toolInput.action === 'remove') {
          if (!content.includes(importLine)) {
            return JSON.stringify({ success: true, path: relPath, action: 'not present', name });
          }
          content = content.replace(importLine + '\n', '').replace(importLine, '');
          writeFileSync(fullPath, content);
          deps.appendChange({
            file: relPath, changeType: 'css-edit',
            description: `Chat agent removed @import for ${name} component`,
            breakageRisk: 'medium'
          });
          deps.logActivity('file-write', null, name, 'chat-agent', `Removed @import for ${name} from terrarium.css`);
          return JSON.stringify({ success: true, path: relPath, action: 'removed', name });
        }
        return JSON.stringify({ error: 'action must be "add" or "remove"' });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[agent-runner] executeTool(${toolName}) failed:`, err.message);
    return JSON.stringify({ error: err.message });
  }
}

/**
 * Agentic chat response with tool-use capability.
 * Uses non-streaming API with an agentic loop to handle tool calls.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt - Full system context
 * @param {object[]} opts.messages - Conversation history [{role, content}]
 * @param {object} opts.deps - Dependency object for tool execution
 * @param {function} opts.onToken - Called with text chunks (simulated streaming)
 * @param {function} opts.onToolStart - Called when model invokes a tool
 * @param {function} opts.onToolResult - Called when tool execution completes
 * @param {function} opts.onDone - Called with full response text when complete
 * @param {function} [opts.onError] - Called with error if request fails
 * @returns {Promise<void>}
 */
export async function agenticChatResponse(opts) {
  const { systemPrompt, messages, deps, onToken, onToolStart, onToolResult, onDone, onError } = opts;
  const MAX_TOOL_TURNS = 5;

  try {
    const client = getClient();
    let loopMessages = [...messages];
    let finalText = '';

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        system: systemPrompt,
        messages: loopMessages,
        tools: CHAT_TOOLS
      });

      // Check if model wants to use tools
      if (response.stop_reason === 'tool_use') {
        // Process all content blocks — there may be text + tool_use blocks
        const assistantContent = response.content;
        const toolResults = [];

        for (const block of assistantContent) {
          if (block.type === 'text' && block.text) {
            // Stream intermediate text
            const text = block.text;
            for (let i = 0; i < text.length; i += 8) {
              onToken(text.slice(i, i + 8));
            }
            finalText += text;
          }
          if (block.type === 'tool_use') {
            // Notify client that a tool is being called
            onToolStart({ toolName: block.name, toolInput: block.input, toolUseId: block.id });

            // Execute the tool
            const resultStr = await executeTool(block.name, block.input, deps);
            let success = true;
            let parsed;
            try {
              parsed = JSON.parse(resultStr);
              if (parsed.error) success = false;
            } catch { parsed = resultStr; }

            onToolResult({
              toolName: block.name,
              toolUseId: block.id,
              success,
              result: parsed
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: resultStr
            });
          }
        }

        // Append assistant message + tool results and continue loop
        loopMessages.push({ role: 'assistant', content: assistantContent });
        loopMessages.push({ role: 'user', content: toolResults });
      } else {
        // Model produced a final text response — stream it out
        const textBlock = response.content.find(b => b.type === 'text');
        if (textBlock?.text) {
          const text = textBlock.text;
          for (let i = 0; i < text.length; i += 8) {
            onToken(text.slice(i, i + 8));
          }
          finalText += text;
        }
        break;
      }

      // If we've hit max turns, force a final text-only call
      if (turn === MAX_TOOL_TURNS - 1) {
        const finalResponse = await client.messages.create({
          model: CHAT_MODEL,
          max_tokens: CHAT_MAX_TOKENS,
          system: systemPrompt,
          messages: loopMessages
          // No tools — forces text response
        });
        const textBlock = finalResponse.content.find(b => b.type === 'text');
        if (textBlock?.text) {
          const text = textBlock.text;
          for (let i = 0; i < text.length; i += 8) {
            onToken(text.slice(i, i + 8));
          }
          finalText += text;
        }
      }
    }

    onDone(finalText);
  } catch (err) {
    console.error('[agent-runner] agentic chat failed:', err.message);
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

TOOLS:
You have tools available to query live data, take governance actions, and write code files. Use them!

READ TOOLS: get_pipeline_state, get_component_details, get_recent_decisions, get_activity_log, get_wiki, read_file
- Use these to answer questions with current data instead of relying solely on context.
- Use read_file to inspect any file under src/ before modifying it.

GOVERNANCE TOOLS: run_governance_review, run_single_agent_review, promote_component, create_component, seed_vault_component
- Use when the Gardener requests a governance action.

FILE WRITING TOOLS: write_component_css, write_component_spec, patch_css, write_token_file, update_wiki, update_terrarium_css
- Use to create or modify component CSS, specs, tokens, wiki entries, and terrarium.css imports.
- Every write is auto-logged to changes.jsonl and activity-log.jsonl.

WRITING RULES:
- Components MUST use semantic tokens only (--t-{context}-{property}) — never reference --t-raw-* primitives.
- CSS must follow BEM naming: t-{component}__{element}--{modifier}.
- Always read_file before modifying (know what you are changing).
- Prefer patch_css for small targeted edits; use write_component_css for full rewrites.
- After creating a new component CSS, add its @import to terrarium.css via update_terrarium_css.
- patch_css is the ONLY tool that can modify foundation.css — full overwrite is blocked.

GENERAL RULES:
- When using action or file tools, briefly explain what you are about to do before calling the tool, then report the results.
- If a tool returns an error, report it honestly — never fabricate results.
- For questions about specific components, use get_component_details to get the latest data.

Be direct, specific, and honest. Reference wiki entries, prior decisions, and agent domain rules when relevant. Never fabricate verdicts or scores.`;

  return prompt;
}
