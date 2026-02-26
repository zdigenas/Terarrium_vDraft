#!/usr/bin/env node

// Load .env before anything else reads process.env
import 'dotenv/config';

/**
 * BRRR Mode — Overnight Agent-Governed Build
 *
 * This script runs the Terarrium governance agents autonomously:
 * 1. Ingests ungoverned components into the Nursery
 * 2. Promotes them through the pipeline
 * 3. Runs real Anthropic API governance reviews at each zone
 * 4. Auto-promotes components that meet zone thresholds
 * 5. Logs every decision to BRRR_SESSION_LOG.md
 * 6. Snapshots state at every zone transition
 *
 * Safety:
 * - AG absolute veto is respected (never overridden)
 * - Honesty Paradigm enforced (no fake verdicts)
 * - Save-state snapshots at every major change
 * - Full audit trail in BRRR_SESSION_LOG.md
 *
 * Usage:
 *   # API key loaded from .env automatically, or set manually:
 *   # export ANTHROPIC_API_KEY=sk-ant-...
 *   node scripts/brrr-mode.mjs
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── Imports from governance system ───────────────────────────────────────────

const { createComponent, loadPipeline, savePipeline, promoteComponent, logActivity } =
  await import(resolve(PROJECT_ROOT, 'src/governance/pipeline.mjs'));

const { runGovernanceReview } =
  await import(resolve(PROJECT_ROOT, 'src/governance/orchestrator.mjs'));

const { checkZoneApproval } =
  await import(resolve(PROJECT_ROOT, 'src/governance/zone-rules.mjs'));

// ── Configuration ────────────────────────────────────────────────────────────

const LOG_FILE = resolve(PROJECT_ROOT, 'plans/BRRR_SESSION_LOG.md');
const SNAPSHOTS_DIR = resolve(PROJECT_ROOT, 'snapshots');

const MAX_API_ERRORS = 5;       // Stop if too many API failures
const REVIEW_DELAY_MS = 2000;   // Delay between agent reviews to avoid rate limiting
const MAX_REVIEW_CYCLES = 3;    // Max re-review attempts per component per zone

// Components to ingest (those with CSS but no pipeline entry)
const COMPONENTS_TO_INGEST = [
  { name: 'Button',   type: 'primitive',  description: 'Submit actions, trigger operations, and navigate between views. The primary interactive element for user-initiated actions. JTBD: When I need to perform an action, I want a clearly interactive element that responds to my click/tap, so I can trigger operations with confidence.' },
  { name: 'Input',    type: 'primitive',  description: 'Capture user text input with real-time validation feedback. The foundational form element for data entry. JTBD: When I need to enter text data, I want a clearly writable field with validation feedback, so I can submit correct information without guessing.' },
  { name: 'Badge',    type: 'primitive',  description: 'Convey status, category, or count at a glance. A compact visual indicator that communicates metadata without requiring interaction. JTBD: When I need to understand the state of an item, I want a visible status indicator, so I can assess priority without reading details.' },
  { name: 'Avatar',   type: 'primitive',  description: 'Represent a person or entity visually. Display a profile image, initials fallback, or placeholder icon at consistent sizes. JTBD: When I see a user reference, I want a visual representation, so I can quickly identify who is involved.' },
  { name: 'Card',     type: 'composite',  description: 'Group related content with clear visual boundaries. A container that establishes content hierarchy through elevation and structure. JTBD: When I encounter related information, I want it visually grouped, so I can process it as a unit without cognitive overhead.' },
  { name: 'Dialog',   type: 'composite',  description: 'Focus user attention on a critical decision or information that requires acknowledgment. Trap keyboard focus within the dialog until dismissed. JTBD: When the system needs my decision, I want focused attention on the choice, so I can respond without distraction.' },
  { name: 'Tabs',     type: 'composite',  description: 'Organize content into switchable views within a single context. Allow users to navigate between related content sections without leaving the page. JTBD: When I have multiple related content sections, I want to switch between them in place, so I can explore without losing context.' },
  { name: 'Tooltip',  type: 'primitive',  description: 'Provide supplementary information about an element on hover or focus. Non-essential context that helps but is not required for the primary task. JTBD: When I am unsure what an element does, I want on-demand clarification, so I can proceed with confidence.' },
  { name: 'Dropdown', type: 'composite',  description: 'Present a list of options on demand. Allow users to select from a set of actions or choices without cluttering the interface. JTBD: When I need to choose from multiple options, I want them presented on demand, so the interface stays clean until I need them.' }
];

// ── Logging ──────────────────────────────────────────────────────────────────

let apiErrorCount = 0;

function log(message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function logSection(title) {
  const divider = '\n---\n';
  const section = `${divider}## ${title}\n**Time:** ${new Date().toISOString()}\n\n`;
  appendFileSync(LOG_FILE, section);
  console.log(`\n=== ${title} ===`);
}

function logAgentVerdict(agentId, agentTitle, verdict, score, analysis) {
  const emoji = verdict === 'approved' ? '✅' : verdict === 'vetoed' ? '🚫' : '⚠️';
  const line = `| ${emoji} ${agentTitle} (${agentId}) | ${verdict} | ${score}/100 | ${(analysis || '').slice(0, 120).replace(/\n/g, ' ')} |\n`;
  appendFileSync(LOG_FILE, line);
  console.log(`  ${emoji} ${agentTitle}: ${verdict} (${score}/100)`);
}

function logTable(headers) {
  const headerLine = `| ${headers.join(' | ')} |\n`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |\n`;
  appendFileSync(LOG_FILE, headerLine + dividerLine);
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

function snapshot(label) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${ts}_${label}`;

  mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  const files = [
    'src/data/pipeline-state.json',
    'src/data/decisions.jsonl',
    'src/data/activity-log.jsonl'
  ];

  for (const f of files) {
    const src = resolve(PROJECT_ROOT, f);
    if (existsSync(src)) {
      const name = f.split('/').pop().replace('.', `_${prefix}.`);
      copyFileSync(src, resolve(SNAPSHOTS_DIR, name));
    }
  }

  log(`📸 Snapshot saved: ${prefix}`);
}

// ── Delay helper ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Phase 1: Ingest components into Nursery ──────────────────────────────────

async function phaseIngest() {
  logSection('Phase 1: Ingest Components into Nursery');

  const pipeline = loadPipeline();
  const existingNames = [
    ...pipeline.nursery,
    ...pipeline.workshop,
    ...pipeline.canopy,
    ...pipeline.stable
  ].map(c => c.name.toLowerCase());

  let ingested = 0;

  for (const comp of COMPONENTS_TO_INGEST) {
    if (existingNames.includes(comp.name.toLowerCase())) {
      log(`⏭️  ${comp.name} already in pipeline — skipping`);
      continue;
    }

    const created = createComponent(comp.name, comp.type, comp.description);
    log(`🌱 ${comp.name} (${created.id}) entered Nursery as ${comp.type} draft`);
    ingested++;
  }

  log(`\n✅ Phase 1 complete: ${ingested} components ingested into Nursery`);
  snapshot('post-ingest');
  return ingested;
}

// ── Phase 2: Promote Nursery → Workshop ──────────────────────────────────────

async function phasePromoteToWorkshop() {
  logSection('Phase 2: Promote Nursery → Workshop');

  const pipeline = loadPipeline();
  const nurseryComponents = [...pipeline.nursery]; // Copy to avoid mutation issues
  let promoted = 0;

  appendFileSync(LOG_FILE, '\nPer Nursery exit criteria: JTBD articulated, concrete path forward (CSS exists), pain documented.\n\n');

  for (const comp of nurseryComponents) {
    // Check if component has CSS (concrete path forward)
    const cssPath = resolve(PROJECT_ROOT, 'src/components', comp.name.toLowerCase(), `${comp.name.toLowerCase()}.css`);
    const hasCss = existsSync(cssPath);

    // Check if component has spec (JTBD articulated)
    const specPath = resolve(PROJECT_ROOT, 'src/components', comp.name.toLowerCase(), `${comp.name.toLowerCase()}.spec.json`);
    const hasSpec = existsSync(specPath);

    if (hasCss && hasSpec) {
      const result = promoteComponent(comp.id);
      if (result.success) {
        log(`🔧 ${comp.name} (${comp.id}) promoted: Nursery → Workshop`);
        promoted++;
      } else {
        log(`❌ ${comp.name} promotion failed: ${result.reason}`);
      }
    } else {
      log(`⏸️  ${comp.name} stays in Nursery — missing: ${!hasCss ? 'CSS' : ''} ${!hasSpec ? 'spec' : ''}`);
    }
  }

  log(`\n✅ Phase 2 complete: ${promoted} components promoted to Workshop`);
  snapshot('post-workshop-promotion');
  return promoted;
}

// ── Phase 3: Workshop Governance Reviews ─────────────────────────────────────

async function phaseWorkshopReviews() {
  logSection('Phase 3: Workshop Governance Reviews');

  const pipeline = loadPipeline();
  const workshopComponents = [...pipeline.workshop];

  appendFileSync(LOG_FILE, `\nReviewing ${workshopComponents.length} components in Workshop zone.\n`);
  appendFileSync(LOG_FILE, 'Workshop threshold: 3/5 majority approval.\n\n');

  const results = [];

  for (const comp of workshopComponents) {
    if (apiErrorCount >= MAX_API_ERRORS) {
      log(`🛑 API error threshold reached (${MAX_API_ERRORS}). Stopping reviews.`);
      break;
    }

    logSection(`Workshop Review: ${comp.name} (${comp.id})`);
    logTable(['Agent', 'Verdict', 'Score', 'Analysis']);

    try {
      const review = await runGovernanceReview(comp.id, { zone: 'workshop' });

      // Log each agent's verdict
      for (const [agentId, agentReview] of Object.entries(review.agentReviews || review.reviews || {})) {
        logAgentVerdict(
          agentId,
          agentReview.agentTitle || agentId,
          agentReview.verdict,
          agentReview.score,
          agentReview.analysis
        );

        if (agentReview.verdict === 'api-unavailable') {
          apiErrorCount++;
        }
      }

      // Log zone verdict
      const passed = review.zoneVerdict?.passed || review.overallVerdict === 'approved';
      appendFileSync(LOG_FILE, `\n**Zone Verdict:** ${passed ? '✅ PASSED' : '❌ FAILED'} — ${review.zoneVerdict?.reason || review.summary}\n`);
      log(`${comp.name}: ${passed ? 'PASSED' : 'FAILED'} — ${review.zoneVerdict?.reason || review.summary}`);

      results.push({ component: comp, review, passed });

      // Delay between components to avoid rate limiting
      await delay(REVIEW_DELAY_MS);

    } catch (err) {
      log(`❌ Review failed for ${comp.name}: ${err.message}`);
      apiErrorCount++;
      results.push({ component: comp, review: null, passed: false, error: err.message });
    }
  }

  log(`\n✅ Phase 3 complete: ${results.filter(r => r.passed).length}/${results.length} passed Workshop review`);
  snapshot('post-workshop-reviews');
  return results;
}

// ── Phase 4: Promote Workshop → Canopy ───────────────────────────────────────

async function phasePromoteToCanopy(workshopResults) {
  logSection('Phase 4: Promote Workshop → Canopy');

  let promoted = 0;
  const passed = workshopResults.filter(r => r.passed);

  if (passed.length === 0) {
    log('No components passed Workshop review. Skipping Canopy promotion.');
    return 0;
  }

  for (const { component } of passed) {
    const result = promoteComponent(component.id);
    if (result.success) {
      log(`🌳 ${component.name} (${component.id}) promoted: Workshop → Canopy`);
      promoted++;
    } else {
      log(`❌ ${component.name} Canopy promotion failed: ${result.reason}`);
    }
  }

  log(`\n✅ Phase 4 complete: ${promoted} components promoted to Canopy`);
  snapshot('post-canopy-promotion');
  return promoted;
}

// ── Phase 5: Canopy Governance Reviews ───────────────────────────────────────

async function phaseCanopyReviews() {
  logSection('Phase 5: Canopy Governance Reviews (Full Rigor)');

  const pipeline = loadPipeline();
  const canopyComponents = [...pipeline.canopy];

  if (canopyComponents.length === 0) {
    log('No components in Canopy. Skipping.');
    return [];
  }

  appendFileSync(LOG_FILE, `\nReviewing ${canopyComponents.length} components in Canopy zone.\n`);
  appendFileSync(LOG_FILE, 'Canopy threshold: 5/5 UNANIMOUS approval. AG absolute veto active.\n\n');

  const results = [];

  for (const comp of canopyComponents) {
    if (apiErrorCount >= MAX_API_ERRORS) {
      log(`🛑 API error threshold reached. Stopping reviews.`);
      break;
    }

    logSection(`Canopy Review: ${comp.name} (${comp.id})`);
    logTable(['Agent', 'Verdict', 'Score', 'Analysis']);

    try {
      const review = await runGovernanceReview(comp.id, { zone: 'canopy' });

      for (const [agentId, agentReview] of Object.entries(review.agentReviews || review.reviews || {})) {
        logAgentVerdict(
          agentId,
          agentReview.agentTitle || agentId,
          agentReview.verdict,
          agentReview.score,
          agentReview.analysis
        );

        if (agentReview.verdict === 'api-unavailable') {
          apiErrorCount++;
        }
      }

      const passed = review.zoneVerdict?.passed || review.overallVerdict === 'approved';
      appendFileSync(LOG_FILE, `\n**Zone Verdict:** ${passed ? '✅ UNANIMOUS APPROVAL' : '❌ FAILED'} — ${review.zoneVerdict?.reason || review.summary}\n`);

      // Check for AG veto specifically
      const agReview = (review.agentReviews || review.reviews || {}).ag;
      if (agReview?.verdict === 'vetoed') {
        appendFileSync(LOG_FILE, `\n⚠️ **ACCESSIBILITY GUARDIAN ABSOLUTE VETO** — ${agReview.analysis?.slice(0, 200)}\n`);
        appendFileSync(LOG_FILE, `This veto cannot be overridden by any agent. Only the Gardener can override.\n`);
      }

      results.push({ component: comp, review, passed });
      await delay(REVIEW_DELAY_MS);

    } catch (err) {
      log(`❌ Canopy review failed for ${comp.name}: ${err.message}`);
      apiErrorCount++;
      results.push({ component: comp, review: null, passed: false, error: err.message });
    }
  }

  log(`\n✅ Phase 5 complete: ${results.filter(r => r.passed).length}/${results.length} achieved unanimous Canopy approval`);
  snapshot('post-canopy-reviews');
  return results;
}

// ── Phase 6: Promote Canopy → Stable ─────────────────────────────────────────

async function phasePromoteToStable(canopyResults) {
  logSection('Phase 6: Promote Canopy → Stable');

  let promoted = 0;
  const passed = canopyResults.filter(r => r.passed);

  if (passed.length === 0) {
    log('No components achieved unanimous Canopy approval. None promoted to Stable.');
    return 0;
  }

  for (const { component } of passed) {
    const result = promoteComponent(component.id);
    if (result.success) {
      // Shield the component
      const pipeline = loadPipeline();
      const stableComp = pipeline.stable.find(c => c.id === component.id);
      if (stableComp) {
        stableComp.shielded = true;
        savePipeline(pipeline);
      }

      log(`🏆 ${component.name} (${component.id}) promoted to STABLE and SHIELDED`);
      appendFileSync(LOG_FILE, `\n### 🏆 ${component.name} — STABLE\nShielded from re-review. Full lifecycle complete.\n`);
      promoted++;
    } else {
      log(`❌ ${component.name} Stable promotion failed: ${result.reason}`);
    }
  }

  log(`\n✅ Phase 6 complete: ${promoted} components reached Stable`);
  snapshot('post-stable-promotion');
  return promoted;
}

// ── Phase 7: H-Index Foundation ──────────────────────────────────────────────

function phaseHIndex() {
  logSection('Phase 7: H-Index Foundation');

  const decisionsPath = resolve(PROJECT_ROOT, 'src/data/decisions.jsonl');
  if (!existsSync(decisionsPath)) {
    log('No decisions.jsonl found. Skipping H-Index calculation.');
    return;
  }

  const decisions = readFileSync(decisionsPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  // Count verdicts per agent
  const agentStats = {};
  for (const dec of decisions) {
    if (!dec.agents) continue;
    for (const [agentId, review] of Object.entries(dec.agents)) {
      if (!agentStats[agentId]) {
        agentStats[agentId] = { approved: 0, needsWork: 0, vetoed: 0, total: 0, totalScore: 0 };
      }
      agentStats[agentId].total++;
      agentStats[agentId].totalScore += (review.score || 0);
      if (review.verdict === 'approved') agentStats[agentId].approved++;
      else if (review.verdict === 'vetoed') agentStats[agentId].vetoed++;
      else agentStats[agentId].needsWork++;
    }
  }

  appendFileSync(LOG_FILE, '\n### Agent H-Index Foundation\n\n');
  logTable(['Agent', 'Reviews', 'Approved', 'Needs-Work', 'Vetoed', 'Avg Score']);

  for (const [agentId, stats] of Object.entries(agentStats)) {
    const avgScore = stats.total > 0 ? Math.round(stats.totalScore / stats.total) : 0;
    const line = `| ${agentId} | ${stats.total} | ${stats.approved} | ${stats.needsWork} | ${stats.vetoed} | ${avgScore} |\n`;
    appendFileSync(LOG_FILE, line);
    log(`  ${agentId}: ${stats.total} reviews, avg score ${avgScore}`);
  }

  log('\n✅ Phase 7 complete: H-Index foundation data logged');
}

// ── Phase 8: Final Summary ───────────────────────────────────────────────────

function phaseFinalSummary() {
  logSection('BRRR Mode — Final Summary');

  const pipeline = loadPipeline();

  appendFileSync(LOG_FILE, '\n### Pipeline State at End of BRRR Mode\n\n');
  logTable(['Zone', 'Count', 'Components']);

  const zones = ['stable', 'canopy', 'workshop', 'nursery'];
  for (const zone of zones) {
    const comps = pipeline[zone] || [];
    const names = comps.map(c => c.name).join(', ') || '(empty)';
    const emoji = zone === 'stable' ? '🏆' : zone === 'canopy' ? '🌳' : zone === 'workshop' ? '🔧' : '🌱';
    appendFileSync(LOG_FILE, `| ${emoji} ${zone} | ${comps.length} | ${names} |\n`);
  }

  appendFileSync(LOG_FILE, `\n### API Error Count: ${apiErrorCount}/${MAX_API_ERRORS}\n`);
  appendFileSync(LOG_FILE, `\n### Session End: ${new Date().toISOString()}\n`);
  appendFileSync(LOG_FILE, '\n---\n\n*BRRR Mode complete. The Gardener can review this log and all snapshots in the `snapshots/` directory.*\n');
  appendFileSync(LOG_FILE, '*To rollback: copy any snapshot from `snapshots/` back to `src/data/`.*\n');

  log('\n🏁 BRRR Mode complete!');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Check API key — warn but don't exit. Pipeline operations work without it.
  // Per Honesty Paradigm: agents return api-unavailable, never fake verdicts.
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasApiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set. Agent reviews will return api-unavailable.');
    console.warn('   Pipeline operations (ingest, promote) will still execute.');
    console.warn('   Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    console.warn('');
  }

  // Initialize session log
  const header = `# BRRR Mode — Session Log

> **Started:** ${new Date().toISOString()}
> **Mode:** Autonomous agent governance — Gardener pre-approved all promotions
> **Safety:** Snapshots at every zone transition. AG absolute veto respected.
> **Philosophy:** Push the limits. Agents are opinionated. The system governs by its written principles.

`;
  writeFileSync(LOG_FILE, header);

  console.log('🔥 BRRR MODE ACTIVATED');
  console.log('   Agents will govern autonomously.');
  console.log('   AG absolute veto is real.');
  console.log('   Honesty Paradigm enforced.');
  console.log('   Save states at every transition.');
  console.log('');

  try {
    // Phase 1: Ingest
    await phaseIngest();

    // Phase 2: Nursery → Workshop
    await phasePromoteToWorkshop();

    // Phase 3: Workshop reviews
    const workshopResults = await phaseWorkshopReviews();

    // Phase 4: Workshop → Canopy (for those that passed)
    await phasePromoteToCanopy(workshopResults);

    // Phase 5: Canopy reviews
    const canopyResults = await phaseCanopyReviews();

    // Phase 6: Canopy → Stable (for those that passed unanimously)
    await phasePromoteToStable(canopyResults);

    // Phase 7: H-Index
    phaseHIndex();

    // Phase 8: Summary
    phaseFinalSummary();

  } catch (err) {
    log(`\n💥 BRRR Mode crashed: ${err.message}`);
    log(`Stack: ${err.stack}`);
    snapshot('crash-recovery');
    appendFileSync(LOG_FILE, `\n## ⚠️ CRASH\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    appendFileSync(LOG_FILE, '\nBRRR Mode terminated unexpectedly. Check snapshots for recovery.\n');
    process.exit(1);
  }
}

main();
