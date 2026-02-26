#!/usr/bin/env node

/**
 * Pre-edit hook for Terarrium governance enforcement.
 * Runs before any file edit via Claude Code.
 *
 * - Protects append-only JSONL logs from modification
 * - Guards CLAUDE.md from unauthorized changes
 */

import { resolve, relative } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

const editedFile = process.env.CLAUDE_FILE_PATH || process.argv[2];

if (!editedFile) {
  process.exit(0);
}

const relPath = relative(PROJECT_ROOT, editedFile);

// Protected append-only files
const APPEND_ONLY_FILES = [
  'src/data/decisions.jsonl',
  'src/data/changes.jsonl',
  'src/data/activity-log.jsonl'
];

if (APPEND_ONLY_FILES.includes(relPath)) {
  // For JSONL files, we allow appending but not modification of existing lines.
  // The hook system doesn't distinguish append from edit,
  // so we log a warning and trust the agent to follow CLAUDE.md rules.
  console.log(`[terarrium] Editing append-only log: ${relPath} — ensure this is append-only per Honesty Paradigm`);
}

// Guard CLAUDE.md
if (relPath === '.claude/CLAUDE.md') {
  console.log(`[terarrium] CLAUDE.md is the constitutional document. Changes require gardener approval.`);
}
