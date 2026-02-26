/**
 * Living Reference — Root System documentation agent.
 *
 * The self-teaching layer. Wiki entries, patterns, terminology,
 * component documentation. When a new concept emerges, it gets
 * captured here. When terminology evolves, references update.
 * Stored in src/data/wiki.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WIKI_FILE = resolve(PROJECT_ROOT, 'src/data/wiki.json');

/**
 * Load the full wiki.
 *
 * @returns {Record<string, object>}
 */
export function loadWiki() {
  if (!existsSync(WIKI_FILE)) return {};
  try {
    return JSON.parse(readFileSync(WIKI_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save the wiki back to disk.
 *
 * @param {Record<string, object>} wiki
 */
function saveWiki(wiki) {
  writeFileSync(WIKI_FILE, JSON.stringify(wiki, null, 2) + '\n');
}

/**
 * Add or update an entry in the Living Reference.
 *
 * @param {string} key - Kebab-case identifier (e.g. 'spark-queue')
 * @param {object} entry
 * @param {string} entry.term - Display name
 * @param {string} entry.category - Grouping category
 * @param {string} entry.def - Definition
 * @param {string} entry.source - Where this concept originated
 * @param {string} [entry.rule] - Governance rule associated with this concept
 * @returns {object} The saved entry
 */
export function addEntry(key, entry) {
  const wiki = loadWiki();
  wiki[key] = {
    term: entry.term,
    category: entry.category,
    def: entry.def,
    source: entry.source,
    ...(entry.rule ? { rule: entry.rule } : {}),
    updatedAt: new Date().toISOString()
  };
  saveWiki(wiki);
  return wiki[key];
}

/**
 * Look up a term in the Living Reference.
 *
 * @param {string} key - Kebab-case identifier
 * @returns {object|null}
 */
export function lookupTerm(key) {
  const wiki = loadWiki();
  return wiki[key] || null;
}

/**
 * Search the wiki by text across term, def, and category fields.
 *
 * @param {string} query
 * @returns {Array<{key: string, entry: object}>}
 */
export function searchWiki(query) {
  const wiki = loadWiki();
  const q = query.toLowerCase();

  return Object.entries(wiki)
    .filter(([, entry]) =>
      entry.term.toLowerCase().includes(q) ||
      entry.def.toLowerCase().includes(q) ||
      entry.category.toLowerCase().includes(q)
    )
    .map(([key, entry]) => ({ key, ...entry }));
}

/**
 * Get all entries grouped by category.
 *
 * @returns {Record<string, object[]>}
 */
export function getByCategory() {
  const wiki = loadWiki();
  const categories = {};

  for (const [key, entry] of Object.entries(wiki)) {
    const cat = entry.category || 'Uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, ...entry });
  }

  return categories;
}

/**
 * Generate a markdown glossary from the wiki.
 *
 * @returns {string}
 */
export function generateGlossary() {
  const categories = getByCategory();
  const order = ['Ecosystem', 'Agents', 'Operational', 'Philosophy', 'Lifecycle', 'Tokens'];
  const sorted = [...order.filter(c => categories[c]), ...Object.keys(categories).filter(c => !order.includes(c))];

  let md = '# Terarrium — Living Reference\n\n';

  for (const cat of sorted) {
    md += `## ${cat}\n\n`;
    for (const entry of categories[cat]) {
      md += `### ${entry.term}\n`;
      md += `${entry.def}\n`;
      if (entry.rule) md += `\n> **Rule:** ${entry.rule}\n`;
      md += `\n*Source: ${entry.source}*\n\n`;
    }
  }

  return md;
}
