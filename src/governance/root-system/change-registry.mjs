/**
 * Change Registry — Root System documentation agent.
 *
 * Every modification to the system with its dependency chain.
 * Token changed → these components affected → these pages impacted.
 * When something breaks, trace the chain backward.
 * Stored as append-only JSONL in src/data/changes.jsonl.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CHANGES_FILE = resolve(PROJECT_ROOT, 'src/data/changes.jsonl');

/**
 * Append a change record to the Change Registry.
 *
 * @param {object} record
 * @param {string} record.file - The file that was modified
 * @param {string} record.changeType - e.g. 'token-edit', 'css-edit', 'spec-update', 'promotion'
 * @param {string} record.description - What changed
 * @param {string} [record.decisionId] - Link to the Decision Memory entry
 * @param {object} [record.dependencies] - { upstream: string[], downstream: string[] }
 * @param {string} [record.breakageRisk] - 'none' | 'low' | 'medium' | 'high'
 */
export function appendChange(record) {
  const entry = {
    id: `CHG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    source: 'change-registry',
    ...record
  };

  appendFileSync(CHANGES_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Query changes by filter criteria.
 *
 * @param {object} filter
 * @param {string} [filter.file] - Filter by file path
 * @param {string} [filter.changeType] - Filter by change type
 * @returns {object[]}
 */
export function queryChanges(filter = {}) {
  if (!existsSync(CHANGES_FILE)) return [];

  const lines = readFileSync(CHANGES_FILE, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  let changes = lines.map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);

  if (filter.file) {
    changes = changes.filter(c => c.file === filter.file || c.file?.includes(filter.file));
  }
  if (filter.changeType) {
    changes = changes.filter(c => c.changeType === filter.changeType);
  }

  return changes;
}

/**
 * Trace breakage — find all downstream dependencies of a file or token.
 *
 * @param {string} fileOrToken - A file path or token name
 * @returns {object[]} Changes that reference this as an upstream dependency
 */
export function traceBreakage(fileOrToken) {
  const allChanges = queryChanges({});
  return allChanges.filter(c =>
    c.dependencies?.upstream?.includes(fileOrToken) ||
    c.file === fileOrToken
  );
}

/**
 * Get the full change history for a specific file.
 *
 * @param {string} filePath
 * @returns {object[]}
 */
export function getFileHistory(filePath) {
  return queryChanges({ file: filePath }).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
}
