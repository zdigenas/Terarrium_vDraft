/**
 * Decision Memory — Root System documentation agent.
 *
 * Every governance decision with full context: what was decided,
 * what alternatives existed, who dissented, what the gardener said.
 * Stored as append-only JSONL in src/data/decisions.jsonl.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DECISIONS_FILE = resolve(PROJECT_ROOT, 'src/data/decisions.jsonl');

/**
 * Append a decision record to the Decision Memory.
 *
 * @param {object} record
 * @param {string} record.type - e.g. 'agent_review', 'promotion', 'gardener_override', 'veto', 'spark_capture'
 * @param {string} record.zone - nursery | workshop | canopy
 * @param {string} record.componentId - e.g. 'toast', 'button'
 * @param {string} record.decision - The decision made
 * @param {object} [record.agents] - Agent verdicts: { agentId: { verdict, rationale, citations } }
 * @param {object} [record.gardener] - Gardener input: { words, overrides }
 * @param {string[]} [record.alternatives] - Other options considered
 * @param {object} [record.dissent] - Any dissenting opinions: { agentId: rationale }
 */
export function appendDecision(record) {
  const entry = {
    id: `DEC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...record
  };

  appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Query decisions by filter criteria.
 *
 * @param {object} filter
 * @param {string} [filter.componentId] - Filter by component
 * @param {string} [filter.type] - Filter by decision type
 * @param {string} [filter.zone] - Filter by zone
 * @param {string} [filter.agentId] - Filter by participating agent
 * @returns {object[]}
 */
export function queryDecisions(filter = {}) {
  if (!existsSync(DECISIONS_FILE)) return [];

  const lines = readFileSync(DECISIONS_FILE, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  let decisions = lines.map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);

  if (filter.componentId) {
    decisions = decisions.filter(d => d.componentId === filter.componentId);
  }
  if (filter.type) {
    decisions = decisions.filter(d => d.type === filter.type);
  }
  if (filter.zone) {
    decisions = decisions.filter(d => d.zone === filter.zone);
  }
  if (filter.agentId) {
    decisions = decisions.filter(d =>
      d.agents && d.agents[filter.agentId]
    );
  }

  return decisions;
}

/**
 * Trace the decision chain for a component — all decisions in chronological order.
 *
 * @param {string} componentId
 * @returns {object[]}
 */
export function getDecisionChain(componentId) {
  return queryDecisions({ componentId }).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
}

/**
 * Get the most recent decision for a component.
 *
 * @param {string} componentId
 * @returns {object|null}
 */
export function getLatestDecision(componentId) {
  const chain = getDecisionChain(componentId);
  return chain.length > 0 ? chain[chain.length - 1] : null;
}
