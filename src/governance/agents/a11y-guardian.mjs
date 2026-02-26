/**
 * Accessibility Guardian — Domain agent with absolute veto power.
 *
 * Expertise: WCAG 2.2, WAI-ARIA APG, keyboard, screen readers, touch targets, color contrast
 * Authority: domain+veto — ABSOLUTE VETO that only the gardener can override
 */

export const A11Y_GUARDIAN = {
  id: 'ag',
  title: 'Accessibility Guardian',
  short: 'A11y Guardian',
  color: 'var(--t-raw-green-600)',
  hex: '#2F9E44',
  authority: 'domain+veto',
  canVeto: true,
  absoluteVeto: true,
  expertise: ['WCAG 2.2', 'WAI-ARIA APG', 'keyboard', 'screen readers', 'touch targets', 'color contrast'],

  wcagChecklist: {
    perceivable: [
      { id: '1.1.1', name: 'Non-text Content', rule: 'All non-text content has text alternative', level: 'A' },
      { id: '1.3.1', name: 'Info and Relationships', rule: 'Semantic HTML structure conveys meaning', level: 'A' },
      { id: '1.4.1', name: 'Use of Color', rule: 'Color not sole means of conveying info', level: 'A' },
      { id: '1.4.3', name: 'Contrast (Minimum)', rule: 'Text contrast >= 4.5:1 (normal), >= 3:1 (large)', level: 'AA' },
      { id: '1.4.11', name: 'Non-text Contrast', rule: 'UI components & graphics contrast >= 3:1', level: 'AA' },
      { id: '1.4.13', name: 'Content on Hover/Focus', rule: 'Dismissible, hoverable, persistent', level: 'AA' }
    ],
    operable: [
      { id: '2.1.1', name: 'Keyboard', rule: 'All functionality via keyboard', level: 'A' },
      { id: '2.1.2', name: 'No Keyboard Trap', rule: 'Focus never trapped (except modals with Escape)', level: 'A' },
      { id: '2.4.3', name: 'Focus Order', rule: 'Logical, meaningful focus sequence', level: 'A' },
      { id: '2.4.7', name: 'Focus Visible', rule: 'Keyboard focus indicator visible (3px min)', level: 'AA' },
      { id: '2.4.11', name: 'Focus Not Obscured', rule: 'Focused item not fully hidden by other content', level: 'AA', wcag22: true },
      { id: '2.5.7', name: 'Dragging Movements', rule: 'Single-pointer alternative to drag', level: 'AA', wcag22: true },
      { id: '2.5.8', name: 'Target Size (Minimum)', rule: 'Touch targets >= 24x24 CSS px (recommend 44px)', level: 'AA', wcag22: true }
    ],
    understandable: [
      { id: '3.2.1', name: 'On Focus', rule: 'Focus does not trigger context change', level: 'A' },
      { id: '3.2.2', name: 'On Input', rule: 'Input does not auto-trigger unexpected change', level: 'A' },
      { id: '3.3.1', name: 'Error Identification', rule: 'Errors described in text', level: 'A' },
      { id: '3.3.2', name: 'Labels or Instructions', rule: 'Input fields have labels/instructions', level: 'A' },
      { id: '3.3.7', name: 'Redundant Entry', rule: "Don't re-ask for already-provided info", level: 'A', wcag22: true },
      { id: '3.3.8', name: 'Accessible Authentication', rule: 'No cognitive test for login', level: 'AA', wcag22: true }
    ],
    robust: [
      { id: '4.1.2', name: 'Name, Role, Value', rule: 'All UI components have accessible name+role+state', level: 'A' },
      { id: '4.1.3', name: 'Status Messages', rule: 'Status communicated to AT without focus', level: 'AA' }
    ]
  },

  ariaPatterns: {
    button: { role: 'button', keyboard: 'Space/Enter activates', aria: 'aria-pressed for toggle, aria-expanded for menu buttons' },
    input: { role: 'textbox', keyboard: 'Standard text editing keys', aria: 'aria-required, aria-invalid, aria-describedby for helpers' },
    dialog: { role: 'dialog', keyboard: 'Tab trapped, Escape closes, initial focus to first interactive', aria: 'aria-modal=true, aria-labelledby' },
    tabs: { role: 'tablist/tab/tabpanel', keyboard: 'Arrow keys navigate tabs, Tab to content', aria: 'aria-selected, aria-controls, aria-labelledby' },
    toggle: { role: 'switch', keyboard: 'Space toggles', aria: 'aria-checked, linked label' },
    select: { role: 'listbox', keyboard: 'Arrow keys navigate, Enter selects, Escape closes', aria: 'aria-expanded, aria-activedescendant' },
    tooltip: { role: 'tooltip', keyboard: 'Escape dismisses, appears on focus', aria: 'aria-describedby pointing to tooltip' },
    card: { role: 'article or region', keyboard: 'Entire card or specific actions focusable', aria: 'aria-labelledby for card heading' },
    badge: { role: 'status', keyboard: 'N/A (informational)', aria: 'aria-label for dynamic counts' },
    toast: { role: 'alert or status', keyboard: 'Auto-announce, dismiss with action', aria: 'aria-live=polite/assertive, role=alert' },
    avatar: { role: 'img', keyboard: 'N/A (decorative unless actionable)', aria: 'aria-label or alt text for initials' },
    dropdown: { role: 'menu/menuitem', keyboard: 'Arrow keys navigate, Enter selects, Escape closes', aria: 'aria-haspopup, aria-expanded' }
  }
};

/**
 * Get the ARIA pattern for a component type.
 *
 * @param {string} componentName - e.g. 'button', 'toast', 'dialog'
 * @returns {object|null} The matching ARIA pattern or null
 */
export function getAriaPattern(componentName) {
  const lower = componentName.toLowerCase().replace(/\s+/g, '');
  for (const [pattern, info] of Object.entries(A11Y_GUARDIAN.ariaPatterns)) {
    if (lower.includes(pattern)) {
      return { pattern, ...info };
    }
  }
  return null;
}

/**
 * Get all WCAG criteria as a flat array.
 *
 * @returns {Array<{id: string, name: string, rule: string, level: string, principle: string}>}
 */
export function getAllCriteria() {
  const all = [];
  for (const [principle, criteria] of Object.entries(A11Y_GUARDIAN.wcagChecklist)) {
    for (const sc of criteria) {
      all.push({ ...sc, principle });
    }
  }
  return all;
}
