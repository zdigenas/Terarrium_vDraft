/**
 * Terarrium — API Proxy Server
 *
 * Minimal Express server that:
 *   1. Proxies Anthropic API calls (CORS + key security)
 *   2. Serves governance review endpoints
 *   3. Serves pipeline state and data endpoints
 *
 * Run: node src/server/proxy.mjs
 * Env: ANTHROPIC_API_KEY loaded from .env via dotenv
 *
 * Endpoints:
 *   POST /api/chat                    — Streaming governance chat (SSE)
 *   POST /api/governance-review       — Full orchestrator review cycle
 *   POST /api/governance-review/agent — Single agent review
 *   GET  /api/pipeline                — Current pipeline state
 *   POST /api/pipeline/promote/:id    — Promote component
 *   POST /api/pipeline/create         — Create new component
 *   GET  /api/wiki                    — Wiki entries
 *   GET  /api/seed-vault              — Seed vault entries
 *   GET  /api/decisions               — Recent decisions (last 20)
 *   GET  /api/activity                — Recent activity log (last 50)
 *   GET  /api/health                  — Health check + API key validation
 */

// ── Load .env FIRST — before any other imports that might read process.env ───
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── API Key validation state (set at startup, cached for health endpoint) ────

let apiKeyStatus = {
  present: false,
  formatValid: false,
  verified: false,
  lastVerifiedAt: null,
  error: null
};

/**
 * Validate the Anthropic API key at startup.
 * Checks format and optionally tests connectivity.
 */
async function validateApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;

  // Check presence
  if (!key || key === 'your-api-key-here' || key === 'sk-ant-your-key-here') {
    apiKeyStatus = {
      present: false,
      formatValid: false,
      verified: false,
      lastVerifiedAt: null,
      error: 'ANTHROPIC_API_KEY not set. Add it to .env file.'
    };
    return apiKeyStatus;
  }

  apiKeyStatus.present = true;

  // Check format (Anthropic keys start with sk-ant-)
  if (!key.startsWith('sk-ant-')) {
    apiKeyStatus.formatValid = false;
    apiKeyStatus.error = `Key format unexpected — expected sk-ant-... prefix, got ${key.slice(0, 7)}...`;
    return apiKeyStatus;
  }

  apiKeyStatus.formatValid = true;

  // Test connectivity with a minimal API call
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });

    // Use a minimal message to verify the key works
    // count_tokens is lightweight but not available in all SDK versions,
    // so we use a tiny messages.create call instead
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    });

    if (response?.id) {
      apiKeyStatus.verified = true;
      apiKeyStatus.lastVerifiedAt = new Date().toISOString();
      apiKeyStatus.error = null;
    }
  } catch (err) {
    apiKeyStatus.verified = false;
    apiKeyStatus.error = `API connectivity test failed: ${err.message}`;
  }

  return apiKeyStatus;
}

// ── Lazy imports (avoid crashing if modules have issues) ─────────────────────

let orchestrator = null;
async function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = await import('../governance/orchestrator.mjs');
  }
  return orchestrator;
}

let pipelineMod = null;
async function getPipeline() {
  if (!pipelineMod) {
    pipelineMod = await import('../governance/pipeline.mjs');
  }
  return pipelineMod;
}

let agentRunner = null;
async function getAgentRunner() {
  if (!agentRunner) {
    agentRunner = await import('../governance/agent-runner.mjs');
  }
  return agentRunner;
}

// ── Data helpers ─────────────────────────────────────────────────────────────

function readJSON(relPath) {
  const full = resolve(PROJECT_ROOT, relPath);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf-8'));
  } catch {
    return null;
  }
}

function readJSONL(relPath, limit = 50) {
  const full = resolve(PROJECT_ROOT, relPath);
  if (!existsSync(full)) return [];
  try {
    const lines = readFileSync(full, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));

// ── Static file serving — storybook at http://localhost:3001 ─────────────────
// Primary root: src/library/ — serves storybook.html, shell.css, storybook.css,
//   terrarium.css, storybook.js, foundation.css, utilities.css
const LIBRARY_DIR = join(__dirname, '..', 'library');
app.use(express.static(LIBRARY_DIR));

// Component CSS: terrarium.css uses @import '../components/button/button.css'
// The browser resolves this to /components/button/button.css.
// We mount src/components/ at /components/ so only CSS files are reachable —
// governance source, server code, and data files remain unexposed.
const COMPONENTS_DIR = join(__dirname, '..', 'components');
app.use('/components', express.static(COMPONENTS_DIR));

// Root redirect → storybook.html
app.get('/', (req, res) => res.redirect('/storybook.html'));

// ── Health check (enhanced with API key validation) ──────────────────────────

app.get('/api/health', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const hasKey = !!key && key !== 'your-api-key-here' && key !== 'sk-ant-your-key-here';

  res.json({
    status: 'ok',
    anthropicKeyPresent: hasKey,
    anthropicKeyFormat: !hasKey ? 'missing' : (key.startsWith('sk-ant-') ? 'valid' : 'invalid'),
    anthropicKeyVerified: apiKeyStatus.verified,
    anthropicLastVerifiedAt: apiKeyStatus.lastVerifiedAt,
    anthropicError: apiKeyStatus.error,
    timestamp: new Date().toISOString()
  });
});

// ── Pipeline endpoints ───────────────────────────────────────────────────────

app.get('/api/pipeline', async (req, res) => {
  try {
    const { loadPipeline } = await getPipeline();
    res.json(loadPipeline());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/create', async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name || !type || !description) {
      return res.status(400).json({ error: 'name, type, and description are required' });
    }
    const { createComponent } = await getPipeline();
    const component = createComponent(name, type, description);
    res.json({ success: true, component });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/promote/:id', async (req, res) => {
  try {
    const { promoteComponent } = await getPipeline();
    const result = promoteComponent(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/seed-vault/:id', async (req, res) => {
  try {
    const { reason } = req.body;
    const { seedVaultComponent } = await getPipeline();
    const result = seedVaultComponent(req.params.id, reason || 'Archived by gardener');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data endpoints ───────────────────────────────────────────────────────────

app.get('/api/wiki', (req, res) => {
  const wiki = readJSON('src/data/wiki.json');
  if (!wiki) return res.status(404).json({ error: 'wiki.json not found' });
  res.json(wiki);
});

app.get('/api/seed-vault', (req, res) => {
  const vault = readJSON('src/data/seed-vault.json');
  if (!vault) return res.status(404).json({ error: 'seed-vault.json not found' });
  res.json(vault);
});

app.get('/api/decisions', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(readJSONL('src/data/decisions.jsonl', limit));
});

app.get('/api/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(readJSONL('src/data/activity-log.jsonl', limit));
});

app.get('/api/changes', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(readJSONL('src/data/changes.jsonl', limit));
});

// ── Gardener config endpoints ───────────────────────────────────────────────

app.get('/api/gardener-config', (req, res) => {
  const config = readJSON('src/data/gardener-config.json');
  if (!config) return res.status(404).json({ error: 'gardener-config.json not found' });
  res.json(config);
});

app.post('/api/gardener-config', async (req, res) => {
  try {
    const config = req.body;
    config.lastModified = new Date().toISOString();
    const configPath = resolve(PROJECT_ROOT, 'src/data/gardener-config.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    // Reload cached config in orchestrator
    try {
      const { reloadGardenerConfig } = await getOrchestrator();
      reloadGardenerConfig();
    } catch { /* orchestrator may not be loaded yet — non-fatal */ }

    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Governance review endpoint ───────────────────────────────────────────────

app.post('/api/governance-review', async (req, res) => {
  try {
    const { componentId, zone } = req.body;
    if (!componentId) {
      return res.status(400).json({ error: 'componentId is required' });
    }

    const { runGovernanceReview } = await getOrchestrator();
    const result = await runGovernanceReview(componentId, { zone });
    res.json(result);
  } catch (err) {
    console.error('[proxy] governance-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Single agent review
app.post('/api/governance-review/agent', async (req, res) => {
  try {
    const { agentId, componentId } = req.body;
    if (!agentId || !componentId) {
      return res.status(400).json({ error: 'agentId and componentId are required' });
    }

    const { runSingleAgentReview } = await getOrchestrator();
    const result = await runSingleAgentReview(agentId, componentId);
    res.json(result);
  } catch (err) {
    console.error('[proxy] single-agent-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Tool deps builder for agentic chat ────────────────────────────────────────

async function buildToolDeps() {
  const { loadPipeline, findComponent, createComponent, promoteComponent, seedVaultComponent, logActivity } = await getPipeline();
  const { runGovernanceReview, runSingleAgentReview } = await getOrchestrator();
  const { appendChange } = await import('../governance/root-system/change-registry.mjs');
  const { addEntry: addWikiEntry } = await import('../governance/root-system/living-reference.mjs');
  const { validateWritePath, validateReadPath } = await import('../governance/file-safety.mjs');
  return {
    loadPipeline, findComponent, createComponent, promoteComponent, seedVaultComponent,
    runGovernanceReview, runSingleAgentReview,
    readJSON, readJSONL,
    logActivity, appendChange, addWikiEntry, validateWritePath, validateReadPath,
    projectRoot: PROJECT_ROOT
  };
}

function summarizeToolResult(toolName, parsed) {
  if (parsed.error) return parsed.error;
  switch (toolName) {
    case 'get_pipeline_state': {
      const zones = ['nursery', 'workshop', 'canopy', 'stable'];
      return zones.map(z => `${z}: ${(parsed[z] || []).length}`).join(', ');
    }
    case 'get_component_details':
      return `${parsed.name || parsed.id} (${parsed.zone}, ${parsed.maturity})`;
    case 'get_recent_decisions':
      return `${Array.isArray(parsed) ? parsed.length : 0} decisions`;
    case 'get_activity_log':
      return `${Array.isArray(parsed) ? parsed.length : 0} entries`;
    case 'get_wiki':
      return `${Object.keys(parsed).length} entries`;
    case 'run_governance_review':
      return `${parsed.component}: ${parsed.zoneVerdict?.passed ? 'PASSED' : 'NEEDS WORK'}`;
    case 'run_single_agent_review':
      return `${parsed.agent}: ${parsed.verdict} (${parsed.score}/100)`;
    case 'promote_component':
      return parsed.component ? `${parsed.component.name}: ${parsed.from} → ${parsed.to}` : 'promoted';
    case 'create_component':
      return `${parsed.name} created (${parsed.id})`;
    case 'seed_vault_component':
      return `archived${parsed.name ? ': ' + parsed.name : ''}`;
    case 'read_file':
      return `read ${parsed.path} (${parsed.lines} lines)`;
    case 'write_component_css':
    case 'write_component_spec':
    case 'patch_css':
      return `${parsed.action || 'wrote'} ${parsed.path}`;
    case 'write_token_file':
      return `${parsed.action || 'wrote'} ${parsed.path}`;
    case 'update_wiki':
      return `updated wiki: ${parsed.key}`;
    case 'update_terrarium_css':
      return `${parsed.action || 'updated'} import for ${parsed.name}`;
    default:
      return 'done';
  }
}

// ── Session store for chat persistence ────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * @type {Map<string, { messages: object[], createdAt: number, lastAccessedAt: number }>}
 */
const sessions = new Map();

// Periodic session cleanup (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(id);
      console.log(`[proxy] Session ${id.slice(0, 8)}... expired after 30m inactivity`);
    }
  }
}, 5 * 60 * 1000);

// ── Governance chat endpoint (SSE streaming with tool use + sessions) ─────────

app.post('/api/chat', async (req, res) => {
  const { messages, context, sessionId, message } = req.body;

  // Determine conversation messages — session mode or legacy mode
  let conversationMessages;
  let activeSessionId = sessionId || null;

  if (sessionId && message) {
    // Session mode: append new message to server-side session
    let session = sessions.get(sessionId);
    if (!session) {
      session = { messages: [], createdAt: Date.now(), lastAccessedAt: Date.now() };
      sessions.set(sessionId, session);
    }
    session.lastAccessedAt = Date.now();
    session.messages.push({ role: 'user', content: message });
    conversationMessages = session.messages;
  } else if (messages && Array.isArray(messages)) {
    // Legacy mode: full messages array from client
    conversationMessages = messages;
  } else {
    return res.status(400).json({ error: 'Either {sessionId, message} or {messages} is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { agenticChatResponse, buildChatSystemPrompt } = await getAgentRunner();

    // Load live context for the system prompt
    let pipelineState = null;
    try {
      const { loadPipeline } = await getPipeline();
      pipelineState = loadPipeline();
    } catch { /* non-fatal */ }

    // Load wiki and recent decisions for richer chat context
    const wikiEntries = readJSON('src/data/wiki.json') || {};
    const recentDecisions = readJSONL('src/data/decisions.jsonl', 10);

    const systemPrompt = buildChatSystemPrompt({
      currentPage: context?.currentPage,
      currentComponent: context?.currentComponent,
      pipelineState,
      wikiEntries,
      recentDecisions
    });

    // Build tool dependencies
    const deps = await buildToolDeps();

    const { finalMessages } = await agenticChatResponse({
      systemPrompt,
      messages: conversationMessages,
      deps,
      onToken: (token) => {
        sendEvent({ type: 'token', token });
      },
      onToolStart: ({ toolName, toolInput, toolUseId }) => {
        sendEvent({ type: 'tool_start', toolName, toolInput, toolUseId });
      },
      onToolResult: ({ toolName, toolUseId, success, result }) => {
        const preview = summarizeToolResult(toolName, result);
        sendEvent({
          type: 'tool_result', toolName, toolUseId, success,
          preview, fullResult: result,
          error: success ? undefined : (result.error || undefined)
        });
      },
      onDone: (fullText) => {
        sendEvent({ type: 'done', fullText, sessionId: activeSessionId });
        res.end();
      },
      onError: (err) => {
        sendEvent({ type: 'error', message: err.message });
        res.end();
      }
    });

    // Persist finalMessages to session if session mode is active
    if (activeSessionId && finalMessages.length > 0) {
      const session = sessions.get(activeSessionId);
      if (session) {
        session.messages = finalMessages;
        session.lastAccessedAt = Date.now();
      }
    }
  } catch (err) {
    console.error('[proxy] chat error:', err);
    sendEvent({ type: 'error', message: err.message });
    res.end();
  }
});

// ── Clear chat session ────────────────────────────────────────────────────────

app.post('/api/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    res.json({ success: true, cleared: true });
  } else {
    res.json({ success: true, cleared: false, note: 'Session not found or already expired' });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const hasKey = !!key && key !== 'your-api-key-here' && key !== 'sk-ant-your-key-here';

  console.log(`\n🌿 Terarrium API proxy running on http://localhost:${PORT}`);
  console.log(`   .env loaded: ✓`);

  if (!hasKey) {
    console.log(`   Anthropic API key: ✗ MISSING`);
    console.log(`   → Add your key to .env: ANTHROPIC_API_KEY=sk-ant-...`);
    console.log(`   → Agents will return api-unavailable until key is set.\n`);
  } else {
    const formatOk = key.startsWith('sk-ant-');
    console.log(`   Anthropic API key: ✓ present (format: ${formatOk ? '✓ valid' : '⚠ unexpected prefix'})`);
    console.log(`   Verifying API connectivity...`);

    const status = await validateApiKey();
    if (status.verified) {
      console.log(`   API connectivity: ✓ verified — agents are LIVE 🟢`);
    } else {
      console.log(`   API connectivity: ✗ failed — ${status.error}`);
      console.log(`   → Agents will return api-unavailable until this is resolved.`);
    }
  }

  console.log(`\n   Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     GET  /api/pipeline`);
  console.log(`     POST /api/pipeline/create`);
  console.log(`     POST /api/pipeline/promote/:id`);
  console.log(`     POST /api/governance-review`);
  console.log(`     POST /api/chat  (SSE streaming + sessions)`);
  console.log(`     POST /api/chat/clear`);
  console.log(`     GET  /api/wiki`);
  console.log(`     GET  /api/seed-vault`);
  console.log(`     GET  /api/decisions`);
  console.log(`     GET  /api/activity\n`);
});
