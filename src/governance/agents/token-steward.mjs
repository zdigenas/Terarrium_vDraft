/**
 * Token Steward — Domain agent for design token governance.
 *
 * Expertise: W3C DTCG, semantic tokens, naming conventions, dark mode, density
 * Authority: domain — can veto components that reference primitives directly
 */

export const TOKEN_STEWARD = {
  id: 'ts',
  title: 'Token Steward',
  short: 'Token Steward',
  color: 'var(--t-raw-amber-600)',
  hex: '#F59F00',
  authority: 'domain',
  canVeto: false,
  expertise: ['W3C DTCG', 'semantic tokens', 'naming conventions', 'dark mode', 'density'],

  dtcgRules: [
    'All tokens use $value, $type, $description fields per DTCG spec',
    'Three-tier hierarchy: Primitive → Semantic → Component',
    'Components NEVER reference primitive tokens directly',
    'Semantic tokens carry contextual meaning (--t-interactive-default, not --t-raw-blue-600)',
    'Naming: [group].[category].[property].[variant].[state]',
    'Dark mode: every semantic token must have light AND dark definitions',
    'Density: tokens scale with --t-density (compact/default/comfortable)',
    'Deprecation: 2-sprint migration window with alias forwarding'
  ],

  auditCategories: {
    color: {
      semantics: ['bg-primary', 'bg-secondary', 'fg-primary', 'fg-secondary', 'interactive-default', 'interactive-hover', 'border-default', 'border-focus'],
      rule: 'All color usage must go through semantic tokens. No hex codes in components.'
    },
    typography: {
      semantics: ['font-sans', 'font-mono', 'text-base', 'text-sm', 'text-lg', 'weight-regular', 'weight-bold'],
      rule: 'Type scale must follow modular ratio. Variable font axes must be documented.'
    },
    spacing: {
      semantics: ['space-1 through space-40'],
      rule: '4px base unit. Geometric scale only. No magic numbers.'
    },
    elevation: {
      semantics: ['shadow-0 through shadow-4', 'surface-0 through surface-4'],
      rule: 'Tonal surface + shadow combined. Material 3-inspired layering.'
    },
    radius: {
      semantics: ['radius-none', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full'],
      rule: 'Component radius must use tokens, never raw px values.'
    }
  },

  darkModeChecks: [
    'Every semantic color has a dark-theme counterpart',
    'Contrast ratio maintained in both themes',
    'Surface tonal values invert correctly',
    'Focus indicators visible on dark backgrounds'
  ]
};

/**
 * Audit a CSS file for token compliance.
 *
 * @param {string} cssContent - The raw CSS content of a component file
 * @param {string} componentName - The component being audited
 * @returns {{ issues: string[], passes: string[] }}
 */
export function auditTokenCompliance(cssContent, componentName) {
  const issues = [];
  const passes = [];

  // Check for primitive token references (--t-raw-*)
  const primitiveRefs = cssContent.match(/var\(--t-raw-[^)]+\)/g) || [];
  if (primitiveRefs.length > 0) {
    issues.push(`Primitive token references found (${primitiveRefs.length}): ${primitiveRefs.slice(0, 3).join(', ')}${primitiveRefs.length > 3 ? '...' : ''}`);
  } else {
    passes.push('No direct primitive token references');
  }

  // Check for hard-coded hex colors
  const hexColors = cssContent.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g) || [];
  if (hexColors.length > 0) {
    issues.push(`Hard-coded hex colors found (${hexColors.length}): ${hexColors.slice(0, 3).join(', ')}`);
  } else {
    passes.push('No hard-coded hex colors');
  }

  // Check for hard-coded pixel values in spacing contexts
  const hardcodedSpacing = cssContent.match(/(?:margin|padding|gap):\s*\d+px/g) || [];
  if (hardcodedSpacing.length > 0) {
    issues.push(`Hard-coded spacing values (${hardcodedSpacing.length}): ${hardcodedSpacing.slice(0, 3).join(', ')}`);
  } else {
    passes.push('All spacing uses token references');
  }

  // Check for hard-coded font values
  const hardcodedFonts = cssContent.match(/font-family:\s*(?!var\()/g) || [];
  if (hardcodedFonts.length > 0) {
    issues.push(`Hard-coded font-family found — should use --t-font-* tokens`);
  } else {
    passes.push('Font families use token references');
  }

  // Check for hard-coded border-radius
  const hardcodedRadius = cssContent.match(/border-radius:\s*\d+px/g) || [];
  if (hardcodedRadius.length > 0) {
    issues.push(`Hard-coded border-radius — should use --t-radius-* tokens`);
  } else {
    passes.push('Border radius uses token references');
  }

  return { issues, passes };
}
