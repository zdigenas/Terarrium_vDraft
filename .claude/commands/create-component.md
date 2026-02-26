Create a new component and plant it in the Nursery: $ARGUMENTS

Parse the first word as the component name. Everything after is the description (the Job to be Done).

## Process

1. Create the directory `src/components/{name}/`
2. Create `{name}.spec.json` with this structure:
   ```json
   {
     "$schema": "terarrium/component-spec/v1",
     "metadata": {
       "name": "{Name}",
       "version": "0.1.0",
       "maturity": "draft",
       "category": "primitive or composite (infer from description)",
       "zone": "nursery",
       "created": "YYYY-MM-DD"
     },
     "purpose": {
       "description": "{the JTBD description}",
       "useCases": [],
       "antiPatterns": []
     },
     "anatomy": { "parts": {} },
     "variants": [],
     "tokens": {},
     "accessibility": {
       "role": "",
       "minTouchTarget": "44px",
       "keyboard": [],
       "ariaAttributes": []
     }
   }
   ```
3. Create a minimal `{name}.css` file with the BEM root class `t-{name}` and semantic token references only
4. Add the component to `src/data/pipeline-state.json` in the nursery array
5. Log to `src/data/activity-log.jsonl`: timestamp, action "planted", component name, zone "nursery"
6. Log to `src/data/decisions.jsonl`: the creation decision with gardener context

Report: "Component {name} planted in the Nursery. Run /audit-component {name} to begin agent review, or /governance-review {name} for a full zone-appropriate review."
