/**
 * Zone Rules — Governance rigor per ecological zone.
 *
 * Each zone defines:
 *   - mode: agent interaction posture
 *   - allowReject: whether agents can reject proposals
 *   - majority/unanimous: approval thresholds
 *   - agVeto: whether AG absolute veto is active
 *   - hIndex: weight of citation-based credibility (0–1)
 */

export const ZONE_RULES = {
  nursery: {
    label: 'Nursery',
    mode: 'builder_only',
    allowReject: false,
    majority: false,
    unanimous: false,
    agVeto: false,
    hIndex: 0,
    timeBox: '2 sprints',
    exitCriteria: 'Articulate JTBD, the pain it addresses, and one concrete path forward'
  },
  workshop: {
    label: 'Workshop',
    mode: 'builder_optimizer',
    allowReject: true,
    majority: true,
    unanimous: false,
    agVeto: false,
    hIndex: 0.3,
    timeBox: '1-3 sprints',
    exitCriteria: 'Formal spec completed. TS + AG + CA have reviewed.'
  },
  canopy: {
    label: 'Canopy',
    mode: 'optimizer',
    allowReject: true,
    majority: false,
    unanimous: true,
    agVeto: true,
    hIndex: 1.0,
    timeBox: '2-4 sprints',
    exitCriteria: 'All agents approve + gardener approval + 2+ team validations.'
  }
};

/**
 * Check whether a set of agent verdicts meets the zone's approval threshold.
 *
 * @param {string} zone - nursery | workshop | canopy
 * @param {Record<string, string>} verdicts - agentId → 'approved' | 'rejected' | 'conditional'
 * @returns {{ passed: boolean, reason: string }}
 */
export function checkZoneApproval(zone, verdicts) {
  const rules = ZONE_RULES[zone];
  if (!rules) return { passed: false, reason: `Unknown zone: ${zone}` };

  const agents = Object.keys(verdicts);
  const approved = agents.filter(a => verdicts[a] === 'approved');
  const vetoed = agents.filter(a => verdicts[a] === 'vetoed');

  // AG absolute veto
  if (rules.agVeto && vetoed.includes('ag')) {
    return { passed: false, reason: 'Accessibility Guardian has exercised absolute veto.' };
  }

  // Nursery: everything passes (no rejection allowed)
  if (!rules.allowReject) {
    return { passed: true, reason: 'Nursery: all ideas accepted for exploration.' };
  }

  // Unanimous
  if (rules.unanimous) {
    const missing = agents.filter(a => verdicts[a] !== 'approved');
    if (missing.length > 0) {
      return { passed: false, reason: `Unanimous required. Missing approval from: ${missing.join(', ')}` };
    }
    return { passed: true, reason: 'Unanimous approval achieved.' };
  }

  // Majority
  if (rules.majority) {
    const needed = Math.ceil(agents.length / 2);
    if (approved.length >= needed) {
      return { passed: true, reason: `Majority achieved: ${approved.length}/${agents.length}` };
    }
    return { passed: false, reason: `Majority required: ${approved.length}/${agents.length} (need ${needed})` };
  }

  return { passed: true, reason: 'No approval threshold defined.' };
}
