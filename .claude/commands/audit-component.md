Run a full governance audit on the component: $ARGUMENTS

## Process

1. Read the component's CSS file from `src/components/$ARGUMENTS/$ARGUMENTS.css`
2. Read the component's spec from `src/components/$ARGUMENTS/$ARGUMENTS.spec.json`
3. Run stylelint on the CSS file — report BEM naming violations
4. Check that ALL CSS property values reference semantic tokens (`--t-` prefix), never primitive tokens (`--t-raw-`) or raw hex values
5. Check dark mode coverage: verify the component works with both light and dark themes
6. If the local server is running (localhost:3000), use Playwright MCP to read the accessibility tree of the rendered component
7. If the local server is running, use the a11y MCP to scan the rendered component for WCAG 2.2 AA violations
8. Check the component's ARIA attributes against the spec

## Report Findings By Agent Domain

- **Token Steward**: Token compliance, naming, dark mode coverage, primitive token violations
- **Accessibility Guardian**: WCAG violations, ARIA correctness, keyboard patterns, focus management
- **Pattern Librarian**: Documentation completeness, usage examples, differentiation from similar components
- **Component Architect**: DOM structure, BEM compliance, composition rules, performance
- **Product Liaison**: Real-world usage evidence, adoption potential

## Logging

Append all findings to `src/data/activity-log.jsonl` as a JSON object with:
- timestamp, action: "audit", component: "$ARGUMENTS", findings per agent domain
