/**
 * File Safety — Path validation for chat agent file operations.
 *
 * Enforces an allowlist for write operations and a broader allowlist
 * for reads. Blocks governance source, server code, append-only logs,
 * and any path traversal attempts.
 */

import { normalize, resolve } from 'node:path';

// ── Blocked patterns (never writable, most not readable) ──────────────────

const BLOCKED_PREFIXES = [
  'src/governance/',
  'src/server/',
  'node_modules/',
];

const BLOCKED_FILES = [
  'src/data/decisions.jsonl',
  'src/data/activity-log.jsonl',
  'src/data/changes.jsonl',
  'src/data/pipeline-state.json',
  'src/library/storybook.js',
  'src/library/storybook.html',
  'src/library/shell.css',
  '.env',
];

// ── Write allowlist patterns ──────────────────────────────────────────────

/**
 * Validate whether a relative path is allowed for writing.
 *
 * @param {string} relPath - Path relative to project root
 * @param {string} [mode='full'] - 'full' (create/overwrite) or 'patch' (find-and-replace)
 * @returns {{allowed: boolean, reason?: string}}
 */
export function validateWritePath(relPath, mode = 'full') {
  // Normalize and block traversal
  const normalized = normalize(relPath).replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return { allowed: false, reason: 'Path traversal is not allowed' };
  }

  // Check blocked files
  for (const blocked of BLOCKED_FILES) {
    if (normalized === blocked) {
      return { allowed: false, reason: `${blocked} is a protected file and cannot be written` };
    }
  }

  // Check blocked prefixes
  for (const prefix of BLOCKED_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return { allowed: false, reason: `Files under ${prefix} are protected and cannot be written by the chat agent` };
    }
  }

  // foundation.css — patch only, no full overwrite
  if (normalized === 'src/library/foundation.css') {
    if (mode === 'patch') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'foundation.css can only be modified via patch_css, not full overwrite' };
  }

  // Component CSS: src/components/{name}/{name}.css
  const compCssMatch = normalized.match(/^src\/components\/([a-z][a-z0-9-]*)\/\1\.css$/);
  if (compCssMatch) return { allowed: true };

  // Component spec: src/components/{name}/{name}.spec.json
  const compSpecMatch = normalized.match(/^src\/components\/([a-z][a-z0-9-]*)\/\1\.spec\.json$/);
  if (compSpecMatch) return { allowed: true };

  // Token files: src/tokens/*.tokens.json
  const tokenMatch = normalized.match(/^src\/tokens\/[a-z][a-z0-9-]*\.tokens\.json$/);
  if (tokenMatch) return { allowed: true };

  // Wiki: src/data/wiki.json
  if (normalized === 'src/data/wiki.json') return { allowed: true };

  // terrarium.css: src/library/terrarium.css
  if (normalized === 'src/library/terrarium.css') return { allowed: true };

  return { allowed: false, reason: `Path '${normalized}' is not in the write allowlist` };
}

/**
 * Validate whether a relative path is allowed for reading.
 * Broader than write — anything under src/ that isn't in the blocklist.
 *
 * @param {string} relPath - Path relative to project root
 * @returns {{allowed: boolean, reason?: string}}
 */
export function validateReadPath(relPath) {
  const normalized = normalize(relPath).replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return { allowed: false, reason: 'Path traversal is not allowed' };
  }

  // Block .env
  if (normalized === '.env' || normalized.endsWith('/.env')) {
    return { allowed: false, reason: '.env files cannot be read' };
  }

  // Block node_modules
  if (normalized.startsWith('node_modules/')) {
    return { allowed: false, reason: 'node_modules cannot be read' };
  }

  // Allow anything under src/
  if (normalized.startsWith('src/')) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Path '${normalized}' is outside the readable area (src/)` };
}
