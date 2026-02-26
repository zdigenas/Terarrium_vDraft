/**
 * Initiative Registry — Root System documentation agent.
 *
 * Tracks non-component system work items (infrastructure, governance,
 * tooling, documentation) with the same append-only JSONL discipline
 * as Decision Memory and Change Registry.
 *
 * Status transitions append new lines (same ID, new event).
 * Current state derived by grouping by ID, taking latest timestamp.
 *
 * Stored as append-only JSONL in src/data/initiatives.jsonl.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const INITIATIVES_FILE = resolve(PROJECT_ROOT, 'src/data/initiatives.jsonl');

let _nextId = null;

/**
 * Determine the next INIT-NNN ID by scanning existing entries.
 *
 * @returns {number}
 */
function getNextIdNum() {
  if (_nextId !== null) return _nextId;

  if (!existsSync(INITIATIVES_FILE)) {
    _nextId = 1;
    return _nextId;
  }

  const lines = readFileSync(INITIATIVES_FILE, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  let max = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const match = entry.id?.match(/^INIT-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    } catch { /* skip malformed lines */ }
  }

  _nextId = max + 1;
  return _nextId;
}

/**
 * Append an initiative event to the Initiative Registry.
 *
 * For 'created' events, auto-generates an INIT-NNN ID.
 * For other events, record.id is required.
 *
 * @param {object} record
 * @param {string} [record.id] - Required for non-created events
 * @param {string} record.event - created|activated|completed|archived|updated
 * @param {string} record.title - Initiative title
 * @param {string} record.category - infrastructure|component|governance|tooling|documentation
 * @param {string} record.status - proposed|active|completed|archived
 * @param {string} record.description - What this initiative is about
 * @param {string} [record.origin] - Where this initiative came from
 * @param {object} [record.links] - Cross-references to decisions, changes, wiki, components, initiatives
 * @param {string} [record.actor] - gardener|system
 * @param {string} [record.notes] - Additional context
 * @returns {object} The appended entry
 */
export function appendInitiative(record) {
  let id = record.id;

  if (record.event === 'created' && !id) {
    const num = getNextIdNum();
    id = `INIT-${String(num).padStart(3, '0')}`;
    _nextId = num + 1;
  }

  if (!id) {
    throw new Error('Initiative ID is required for non-created events');
  }

  const entry = {
    id,
    timestamp: new Date().toISOString(),
    event: record.event || 'created',
    title: record.title,
    category: record.category,
    status: record.status,
    description: record.description || '',
    origin: record.origin || '',
    links: record.links || { decisions: [], changes: [], wiki: [], components: [], initiatives: [] },
    actor: record.actor || 'system',
    notes: record.notes || ''
  };

  appendFileSync(INITIATIVES_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Read all raw events from the JSONL file.
 *
 * @returns {object[]}
 */
function readAllEvents() {
  if (!existsSync(INITIATIVES_FILE)) return [];

  const lines = readFileSync(INITIATIVES_FILE, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  return lines.map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

/**
 * Derive current state from event history.
 * Groups by ID, takes latest event for each.
 *
 * @param {object[]} events - Raw events
 * @returns {object[]} Current state per initiative
 */
function deriveCurrentState(events) {
  const byId = new Map();

  for (const event of events) {
    const existing = byId.get(event.id);
    if (!existing || new Date(event.timestamp) > new Date(existing.timestamp)) {
      byId.set(event.id, event);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    // Sort by ID number
    const aNum = parseInt(a.id.replace('INIT-', ''), 10);
    const bNum = parseInt(b.id.replace('INIT-', ''), 10);
    return aNum - bNum;
  });
}

/**
 * Query initiatives by filter criteria. Returns derived current state.
 *
 * @param {object} filter
 * @param {string} [filter.status] - Filter by status: proposed|active|completed|archived
 * @param {string} [filter.category] - Filter by category
 * @param {string} [filter.id] - Filter by specific initiative ID
 * @returns {object[]}
 */
export function queryInitiatives(filter = {}) {
  const events = readAllEvents();
  let initiatives = deriveCurrentState(events);

  if (filter.status) {
    initiatives = initiatives.filter(i => i.status === filter.status);
  }
  if (filter.category) {
    initiatives = initiatives.filter(i => i.category === filter.category);
  }
  if (filter.id) {
    initiatives = initiatives.filter(i => i.id === filter.id);
  }

  return initiatives;
}

/**
 * Get the full event history for one initiative, chronological.
 *
 * @param {string} id - Initiative ID (e.g. INIT-001)
 * @returns {object[]}
 */
export function getInitiativeHistory(id) {
  const events = readAllEvents();
  return events
    .filter(e => e.id === id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Get a summary of initiatives — counts by status and category.
 *
 * @returns {object}
 */
export function getInitiativeSummary() {
  const initiatives = queryInitiatives();

  const byStatus = {};
  const byCategory = {};

  for (const init of initiatives) {
    byStatus[init.status] = (byStatus[init.status] || 0) + 1;
    byCategory[init.category] = (byCategory[init.category] || 0) + 1;
  }

  return {
    total: initiatives.length,
    byStatus,
    byCategory
  };
}
