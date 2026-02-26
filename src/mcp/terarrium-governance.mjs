/**
 * Terarrium Governance MCP Server
 *
 * Stdio-based MCP server that gives Claude Code native access to all
 * governance tools. Imports directly from governance modules — no HTTP.
 *
 * Run: node src/mcp/terarrium-governance.mjs
 * Config: .claude/settings.json → mcpServers.terarrium-governance
 */

// ── Redirect stdout to stderr BEFORE any imports ────────────────────────────
// MCP uses stdout exclusively for JSON-RPC. Any console.log hitting stdout
// will corrupt the protocol stream.
const _origLog = console.log;
console.log = console.error;

// ── Load .env — MCP runs as child process, needs its own env ────────────────
import 'dotenv/config';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── Lazy governance module imports ──────────────────────────────────────────

let _deps = null;

async function getDeps() {
  if (_deps) return _deps;

  const { loadPipeline, findComponent, createComponent, promoteComponent, seedVaultComponent, logActivity } =
    await import('../governance/pipeline.mjs');
  const { runGovernanceReview, runSingleAgentReview } =
    await import('../governance/orchestrator.mjs');
  const { appendChange, queryChanges } =
    await import('../governance/root-system/change-registry.mjs');
  const { addEntry: addWikiEntry } =
    await import('../governance/root-system/living-reference.mjs');
  const { validateWritePath, validateReadPath } =
    await import('../governance/file-safety.mjs');
  const { auditTokenCompliance } =
    await import('../governance/agents/token-steward.mjs');
  const { recordGardenersWords } =
    await import('../governance/gardeners-memory.mjs');

  // Data helpers (same as proxy.mjs)
  function readJSON(relPath) {
    const full = resolve(PROJECT_ROOT, relPath);
    if (!existsSync(full)) return null;
    try { return JSON.parse(readFileSync(full, 'utf-8')); }
    catch { return null; }
  }

  function readJSONL(relPath, limit = 50) {
    const full = resolve(PROJECT_ROOT, relPath);
    if (!existsSync(full)) return [];
    try {
      const lines = readFileSync(full, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      return lines.slice(-limit);
    } catch { return []; }
  }

  _deps = {
    loadPipeline, findComponent, createComponent, promoteComponent, seedVaultComponent,
    runGovernanceReview, runSingleAgentReview,
    readJSON, readJSONL,
    logActivity, appendChange, queryChanges, addWikiEntry,
    validateWritePath, validateReadPath,
    auditTokenCompliance, recordGardenersWords,
    projectRoot: PROJECT_ROOT
  };

  return _deps;
}

// ── Import CHAT_TOOLS schemas + executeTool from agent-runner ───────────────

const { CHAT_TOOLS, executeTool, loadComponentCSS } =
  await import('../governance/agent-runner.mjs');

// ── New tool definitions (not in CHAT_TOOLS) ────────────────────────────────

const NEW_TOOLS = [
  {
    name: 'get_changes',
    description: 'Query the Change Registry for file modifications. Filter by file path or change type. Returns the dependency chain for tracing breakage.',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Filter by file path (partial match)' },
        changeType: { type: 'string', description: 'Filter by type: token-edit, css-edit, spec-update, promotion' },
        limit: { type: 'number', description: 'Max entries to return (default 20)' }
      },
      required: []
    }
  },
  {
    name: 'get_seed_vault',
    description: 'Read the Seed Vault — archived components with full context preserved for potential revival.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'audit_tokens',
    description: 'Audit a component CSS file for token compliance. Checks for primitive references, hard-coded hex colors, hard-coded spacing, font, and border-radius values.',
    input_schema: {
      type: 'object',
      properties: {
        componentName: { type: 'string', description: 'Component name (e.g. toggle, toast). Will read src/components/{name}/{name}.css' }
      },
      required: ['componentName']
    }
  },
  {
    name: 'capture_spark',
    description: 'Capture a spark — an interest or idea before it becomes a component proposal. Appends to spark-queue.jsonl.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name for the spark (e.g. Accordion)' },
        description: { type: 'string', description: 'What this idea is about — the interest, not a formal proposal' },
        source: { type: 'string', description: 'Where did this idea come from? (e.g. gardener, product-team, pattern-review)' }
      },
      required: ['name', 'description']
    }
  },
  {
    name: 'record_gardener_words',
    description: "Record the gardener's exact words on a topic. Stored in gardeners-memory.json for persistence across sessions.",
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic key (e.g. agent-hierarchy, naming, terminology)' },
        words: { type: 'string', description: "The gardener's exact words" }
      },
      required: ['topic', 'words']
    }
  }
];

const ALL_TOOLS = [...CHAT_TOOLS, ...NEW_TOOLS];

// ── Convert tool schemas to MCP format ──────────────────────────────────────

function toMCPTools(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema
  }));
}

// ── Handle new tool calls locally ───────────────────────────────────────────

async function executeNewTool(toolName, toolInput, deps) {
  switch (toolName) {
    case 'get_changes': {
      const filter = {};
      if (toolInput.file) filter.file = toolInput.file;
      if (toolInput.changeType) filter.changeType = toolInput.changeType;
      let changes = deps.queryChanges(filter);
      const limit = toolInput.limit || 20;
      changes = changes.slice(-limit);
      return JSON.stringify(changes);
    }

    case 'get_seed_vault': {
      const vault = deps.readJSON('src/data/seed-vault.json');
      return JSON.stringify(vault || { entries: [], note: 'Seed vault is empty' });
    }

    case 'audit_tokens': {
      const name = toolInput.componentName.toLowerCase();
      const css = loadComponentCSS(name);
      if (!css) {
        return JSON.stringify({ error: `No CSS found for component '${name}' at src/components/${name}/${name}.css` });
      }
      const result = deps.auditTokenCompliance(css, name);
      return JSON.stringify({ component: name, ...result });
    }

    case 'capture_spark': {
      const spark = {
        id: `SPARK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: toolInput.name,
        description: toolInput.description,
        source: toolInput.source || 'gardener',
        capturedAt: new Date().toISOString(),
        status: 'open'
      };
      const sparkFile = resolve(PROJECT_ROOT, 'src/data/spark-queue.jsonl');
      appendFileSync(sparkFile, JSON.stringify(spark) + '\n');
      deps.logActivity('spark-captured', null, toolInput.name, spark.source, toolInput.description);
      return JSON.stringify({ success: true, spark });
    }

    case 'record_gardener_words': {
      deps.recordGardenersWords(toolInput.topic, toolInput.words);
      return JSON.stringify({ success: true, topic: toolInput.topic, recorded: true });
    }

    default:
      return JSON.stringify({ error: `Unknown new tool: ${toolName}` });
  }
}

// ── Create MCP server ───────────────────────────────────────────────────────

const server = new Server(
  { name: 'terarrium-governance', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toMCPTools(ALL_TOOLS)
}));

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolInput = args || {};

  try {
    const deps = await getDeps();
    let resultStr;

    // Check if it's a new tool (handled locally) or existing (via executeTool)
    const isNewTool = NEW_TOOLS.some(t => t.name === name);

    if (isNewTool) {
      resultStr = await executeNewTool(name, toolInput, deps);
    } else {
      resultStr = await executeTool(name, toolInput, deps);
    }

    // Parse to check for errors
    let parsed;
    try { parsed = JSON.parse(resultStr); }
    catch { parsed = resultStr; }

    const isError = typeof parsed === 'object' && parsed !== null && !!parsed.error;

    return {
      content: [{ type: 'text', text: resultStr }],
      isError
    };
  } catch (err) {
    console.error(`[mcp] Tool ${name} failed:`, err.message);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
      isError: true
    };
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp] Terarrium governance MCP server running on stdio');
