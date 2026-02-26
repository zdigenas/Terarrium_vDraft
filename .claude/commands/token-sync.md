Synchronize and validate the DTCG token source files against the built CSS.

## Process

1. Read all token source files from `src/tokens/*.tokens.json`
2. Read the foundation CSS from `src/library/foundation.css`
3. Extract all `--t-` custom properties defined in `:root`
4. Extract all `--t-` custom properties defined in `[data-theme="dark"]`

## Validation Checks

5. **Source completeness**: Every token path in the DTCG JSON files should have a corresponding CSS custom property
6. **CSS completeness**: Every `--t-` custom property in foundation.css should trace back to a DTCG source
7. **Dark mode coverage**: Every semantic token in `:root` should have a corresponding override in `[data-theme="dark"]`
8. **Primitive isolation**: No component CSS file should reference `--t-raw-*` tokens directly
9. **Naming convention**: All custom properties follow `--t-{category}-{property}-{variant}` pattern

## Component Token Audit

10. Scan all `src/components/**/*.css` files for:
    - Raw hex color values (should use tokens instead)
    - Direct primitive token references (`--t-raw-*`)
    - Hard-coded spacing values (should use `--t-space-*`)
    - Hard-coded font values (should use `--t-font-*`, `--t-text-*`, `--t-weight-*`)

## Report

11. List all discrepancies found
12. Append sync results to `src/data/activity-log.jsonl`
