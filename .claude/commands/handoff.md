Generate a current-state handoff document from live Terarrium data.

Use the following tools to gather live data, then format a comprehensive handoff:

1. Call `get_pipeline_state` to get current zone contents
2. Call `get_initiatives` (no filter) to get all initiatives
3. Call `get_wiki` to count wiki entries
4. Call `get_recent_decisions` with limit 5 for recent activity

Format the output as a markdown handoff document with these sections:

## Pipeline Status
List each zone (nursery, workshop, canopy, stable) with component names and review status.

## Initiatives
Group by status: Active first, then Proposed, then Completed (summary only).
For active/proposed, include ID, title, category, and description.

## System Health
- Wiki entry count
- Recent decision count
- Total initiatives by status

## Quick Start
```
cd /Users/zacharydigena-segal/Terarrium_vDraft
node src/server/proxy.mjs
# Open http://localhost:3001
```

## Next Actions
Based on active initiatives and proposed items, suggest 2-3 concrete next steps.
