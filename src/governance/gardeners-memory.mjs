/**
 * Gardener's Memory — Persistent session memory for the gardener.
 *
 * Inspired by Fauction's SOUL.md pattern. Captures:
 *   - Recent decisions and their context
 *   - Open sparks awaiting attention
 *   - Current focus areas
 *   - The gardener's exact words on key topics
 *
 * Read on session start, written on session end.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const MEMORY_FILE = resolve(PROJECT_ROOT, 'src/data/gardeners-memory.json');

const DEFAULT_MEMORY = {
  lastSession: null,
  recentDecisions: [],
  openSparks: [],
  currentFocus: [],
  gardenersWords: {},
  sessionCount: 0
};

/**
 * Load the gardener's memory from disk.
 *
 * @returns {object}
 */
export function loadMemory() {
  if (!existsSync(MEMORY_FILE)) return { ...DEFAULT_MEMORY };
  try {
    return JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

/**
 * Save the gardener's memory to disk.
 *
 * @param {object} memory
 */
export function saveMemory(memory) {
  memory.lastSession = new Date().toISOString();
  memory.sessionCount = (memory.sessionCount || 0) + 1;
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2) + '\n');
}

/**
 * Record the gardener's exact words on a topic.
 *
 * @param {string} topic - e.g. 'agent-hierarchy', 'terminology', 'naming'
 * @param {string} words - The gardener's exact words
 */
export function recordGardenersWords(topic, words) {
  const memory = loadMemory();
  memory.gardenersWords[topic] = {
    words,
    recordedAt: new Date().toISOString()
  };
  saveMemory(memory);
}

/**
 * Add a recent decision summary to memory.
 *
 * @param {string} summary - Brief description of what was decided
 * @param {string} decisionId - Reference to Decision Memory entry
 */
export function addRecentDecision(summary, decisionId) {
  const memory = loadMemory();
  memory.recentDecisions.unshift({
    summary,
    decisionId,
    timestamp: new Date().toISOString()
  });
  // Keep only last 20
  memory.recentDecisions = memory.recentDecisions.slice(0, 20);
  saveMemory(memory);
}

/**
 * Set the current focus areas.
 *
 * @param {string[]} focusAreas
 */
export function setFocus(focusAreas) {
  const memory = loadMemory();
  memory.currentFocus = focusAreas;
  saveMemory(memory);
}

/**
 * Get the gardener's memory summary for session start.
 *
 * @returns {string}
 */
export function getSessionBrief() {
  const memory = loadMemory();
  let brief = '';

  if (memory.lastSession) {
    brief += `Last session: ${memory.lastSession} (session #${memory.sessionCount})\n`;
  }

  if (memory.currentFocus.length > 0) {
    brief += `\nCurrent focus: ${memory.currentFocus.join(', ')}\n`;
  }

  if (memory.recentDecisions.length > 0) {
    brief += `\nRecent decisions:\n`;
    memory.recentDecisions.slice(0, 5).forEach(d => {
      brief += `  - ${d.summary} [${d.decisionId}]\n`;
    });
  }

  if (Object.keys(memory.gardenersWords).length > 0) {
    brief += `\nGardener's words on:\n`;
    for (const [topic, record] of Object.entries(memory.gardenersWords)) {
      brief += `  - ${topic}: "${record.words}"\n`;
    }
  }

  return brief || 'No previous session data. This is the first session.';
}
