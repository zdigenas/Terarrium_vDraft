/**
 * Product Liaison — Bridge agent between design system and product teams.
 *
 * Expertise: adoption metrics, team validation, use cases, migration, feedback loops
 * Authority: advisory — validates real-world need, tracks adoption
 */

export const PRODUCT_LIAISON = {
  id: 'px',
  title: 'Product Liaison',
  short: 'Product Liaison',
  color: 'var(--t-raw-blue-400)',
  hex: '#4DABF7',
  authority: 'advisory',
  canVeto: false,
  expertise: ['adoption metrics', 'team validation', 'use cases', 'migration', 'feedback loops'],

  adoptionMetrics: {
    coverage: 'Component adoption rate = DS components / total components per screen',
    reuse: 'Reuse rate across teams — target: 80%+ screens using DS components',
    efficiency: 'Time saved per feature: target 30-50% reduction',
    consistency: 'Visual regression incidents — target: <2% per release',
    satisfaction: 'Developer NPS for design system — target: 8+/10'
  },

  validationGates: {
    nursery: 'At least 2 teams building ad-hoc solutions (evidence of need)',
    workshop: '2+ teams prototyping with the component (active validation)',
    canopy: '3+ teams validated, at least 1 in production (proven adoption)'
  },

  useCaseTemplate: [
    'Team name',
    'Use case description',
    'Integration status (prototype/staging/production)',
    'Feedback and pain points',
    'Required modes or variants',
    'Timeline for adoption'
  ]
};

/**
 * Check if adoption gate is met for a given zone.
 *
 * @param {string} zone - nursery | workshop | canopy
 * @param {Array<{status: string}>} teams - Team adoption data
 * @returns {{ met: boolean, active: number, production: number, gate: string }}
 */
export function checkAdoptionGate(zone, teams) {
  const gate = PRODUCT_LIAISON.validationGates[zone] || '';
  const active = teams.filter(t =>
    t.status !== 'not started' && t.status !== 'evaluating'
  ).length;
  const production = teams.filter(t => t.status === 'production').length;

  let met = false;
  if (zone === 'nursery') met = active >= 2;
  else if (zone === 'workshop') met = active >= 2;
  else if (zone === 'canopy') met = active >= 3 && production >= 1;

  return { met, active, production, gate };
}
