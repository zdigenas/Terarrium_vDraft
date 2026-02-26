#!/usr/bin/env node

/**
 * Post-edit hook for Terarrium governance enforcement.
 * Runs after any file edit via Claude Code.
 *
 * - CSS files in components: run stylelint validation
 * - Token files: validate DTCG structure
 * - All changes: log to Change Registry
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const CHANGES_LOG = resolve(PROJECT_ROOT, 'src/data/changes.jsonl');

// Get the edited file path from environment (Claude Code sets this)
const editedFile = process.env.CLAUDE_FILE_PATH || process.argv[2];

if (!editedFile) {
  process.exit(0);
}

const relPath = relative(PROJECT_ROOT, editedFile);

// Log change to registry
function logChange(changeType, description) {
  if (!existsSync(CHANGES_LOG)) return;

  const record = {
    timestamp: new Date().toISOString(),
    file: relPath,
    changeType,
    description,
    source: 'post-edit-hook'
  };

  appendFileSync(CHANGES_LOG, JSON.stringify(record) + '\n');
}

// Check CSS files in components directory
if (relPath.startsWith('src/components/') && relPath.endsWith('.css')) {
  try {
    execSync(`npx stylelint "${editedFile}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
    logChange('css-edit', `CSS file edited and passed linting: ${relPath}`);
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || 'Stylelint violations found';
    console.error(`Stylelint violations in ${relPath}:\n${output}`);
    logChange('css-edit-violation', `CSS file edited with linting violations: ${relPath}`);
    // Don't block — report only. The agent should fix violations.
  }
}

// Check token files
if (relPath.startsWith('src/tokens/') && relPath.endsWith('.tokens.json')) {
  try {
    const content = JSON.parse(readFileSync(editedFile, 'utf-8'));
    // Basic DTCG validation: check for $value and $type fields at leaf nodes
    function validateDTCG(obj, path = '') {
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue;
        if (typeof value === 'object' && value !== null) {
          if ('$value' in value) {
            if (!('$type' in value)) {
              console.warn(`Missing $type at ${path}.${key}`);
            }
          } else {
            validateDTCG(value, `${path}.${key}`);
          }
        }
      }
    }
    validateDTCG(content);
    logChange('token-edit', `Token file edited: ${relPath}`);
  } catch (err) {
    console.error(`Invalid token file ${relPath}: ${err.message}`);
    logChange('token-edit-error', `Token file edit failed validation: ${relPath}`);
  }
}

// Log any other file changes
if (!relPath.startsWith('src/components/') && !relPath.startsWith('src/tokens/')) {
  logChange('file-edit', `File edited: ${relPath}`);
}
