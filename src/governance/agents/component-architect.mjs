/**
 * Component Architect — Domain agent for component structure and composition.
 *
 * Expertise: composition, atomic design, dependencies, bundle size, SSR, performance
 * Authority: domain — can veto composition-violating structures
 */

export const COMPONENT_ARCHITECT = {
  id: 'ca',
  title: 'Component Architect',
  short: 'Comp Architect',
  color: 'var(--t-raw-neutral-700)',
  hex: '#495057',
  authority: 'domain',
  canVeto: false,
  expertise: ['composition', 'atomic design', 'dependencies', 'bundle size', 'SSR', 'performance'],

  atomicTiers: {
    atom: 'Button, Input, Badge, Avatar, Icon, Label',
    molecule: 'Input Group, Search Bar, Form Field, Nav Item',
    organism: 'Card, Dialog, Navigation Bar, Form, Table',
    template: 'Page layouts, Dashboard shells',
    page: 'Concrete instances with real data'
  },

  archRules: [
    'Inward dependency direction — composites depend on primitives, never reverse',
    'No circular dependencies between components',
    'Single responsibility — one component, one job',
    'Composition over inheritance — use slots/children, not extends',
    'Bundle size budget: individual component < 5KB gzipped',
    'Tree-shakeable: unused components should not appear in bundle',
    'SSR compatible: no window/document access at import time',
    'Framework-agnostic tokens: styles via CSS custom properties',
    'Zero external runtime dependencies beyond the design system core'
  ],

  compositionPatterns: {
    compound: 'Parent provides context, children consume (Tabs+TabPanel, Accordion+Panel)',
    render_prop: 'Component accepts render function for custom content',
    slot: 'Named slots for flexible content areas (header, body, footer)',
    controlled: 'Parent manages state via value+onChange props',
    uncontrolled: 'Component manages own state with optional defaultValue'
  }
};

/**
 * Validate BEM naming in CSS content.
 *
 * @param {string} cssContent - Raw CSS content
 * @param {string} componentPrefix - Expected BEM block prefix (e.g. 't-toast')
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function validateBEM(cssContent, componentPrefix) {
  const selectorRegex = /\.(t-[a-z][a-z0-9_-]*)/g;
  const valid = [];
  const invalid = [];
  let match;

  while ((match = selectorRegex.exec(cssContent)) !== null) {
    const selector = match[1];
    // Valid if it starts with the component prefix
    if (selector.startsWith(componentPrefix)) {
      valid.push(selector);
    } else {
      invalid.push(selector);
    }
  }

  return {
    valid: [...new Set(valid)],
    invalid: [...new Set(invalid)]
  };
}
