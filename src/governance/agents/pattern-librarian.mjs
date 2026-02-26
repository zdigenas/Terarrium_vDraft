/**
 * Pattern Librarian — Domain agent for pattern management and documentation.
 *
 * Expertise: documentation, deduplication, cross-pollination, API design, Seed Vault
 * Authority: domain — screens for duplication, manages knowledge base
 */

export const PATTERN_LIBRARIAN = {
  id: 'pl',
  title: 'Pattern Librarian',
  short: 'Pattern Lib',
  color: 'var(--t-raw-red-500)',
  hex: '#E03131',
  authority: 'domain',
  canVeto: false,
  expertise: ['documentation', 'deduplication', 'cross-pollination', 'API design', 'Seed Vault'],

  docStandard: {
    required: [
      'Component name and description',
      'JTBD statement (Functional need)',
      'API surface: props, events, slots',
      'Usage examples (minimum 3)',
      "Do/Don't guidelines",
      'Accessibility notes',
      'Token dependencies',
      'Related components',
      'Changelog'
    ],
    quality: [
      'Code examples must be copy-pasteable',
      'Props table with type, default, description',
      'Visual examples for all states and variants',
      'Migration guide if replacing existing pattern'
    ]
  },

  crossPollination: {
    seedVaultScan: 'Check every new proposal against all Seed Vault entries for overlap or revival opportunity',
    existingLibrary: 'Check against all existing primitives and composites for composition opportunity',
    patternMining: 'Quarterly review of ad-hoc product patterns for system-level extraction'
  },

  apiPrinciples: [
    'Minimal API surface — fewer props, more composable',
    'Sensible defaults for every prop (zero-config usable)',
    'Consistent naming: on[Event] for callbacks, is[State] for booleans',
    'Render props or slots for customization, not config objects',
    'Composability over configuration — prefer children/slots over mega-props'
  ]
};

/**
 * Check a component name against existing components for deduplication.
 *
 * @param {string} name - Proposed component name
 * @param {string[]} existingComponents - Names of existing components
 * @param {Array<{name: string}>} seedVaultEntries - Seed vault items
 * @returns {{ hasDuplicate: boolean, duplicate?: string, hasSeedVaultMatch: boolean, match?: string }}
 */
export function checkDuplication(name, existingComponents, seedVaultEntries) {
  const lower = name.toLowerCase();

  const duplicate = existingComponents.find(e =>
    lower.includes(e.toLowerCase()) || e.toLowerCase().includes(lower)
  );

  const match = seedVaultEntries.find(v => {
    const vLower = v.name.toLowerCase();
    return vLower.includes(lower.slice(0, 4)) || lower.includes(vLower.slice(0, 4));
  });

  return {
    hasDuplicate: !!duplicate,
    duplicate: duplicate || undefined,
    hasSeedVaultMatch: !!match,
    match: match?.name || undefined
  };
}
