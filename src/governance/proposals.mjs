/**
 * Proposals — Governance proposal management.
 *
 * Proposals are the unit of change in terarrium. Each proposal carries:
 *   - What is being proposed
 *   - Who proposed it and why
 *   - What zone rules apply
 *   - Who has approved and who has vetoed
 *   - Citations to prior decisions
 */

import { ZONE_RULES } from './zone-rules.mjs';

/**
 * Create a new governance proposal.
 *
 * @param {object} opts
 * @param {'token'|'lifecycle'|'spec'} opts.type - Type of proposal
 * @param {string} opts.agent - Agent ID that proposed this
 * @param {string} opts.zone - Target zone
 * @param {string} [opts.targetId] - Component ID this relates to
 * @param {string} opts.rationale - Why this change is proposed
 * @param {object[]} [opts.changes] - Array of change objects
 * @param {string[]} [opts.approvalsNeeded] - Agent IDs that must approve
 * @param {string[]} [opts.citations] - Decision IDs cited
 * @returns {object}
 */
export function createProposal(opts) {
  const zone = opts.zone || 'nursery';
  const rules = ZONE_RULES[zone] || ZONE_RULES.nursery;

  const proposal = {
    id: `GOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type: opts.type,
    proposedBy: opts.agent,
    targetZone: zone,
    targetId: opts.targetId || null,
    rationale: opts.rationale || '',
    changes: opts.changes || [],
    approvalsNeeded: opts.approvalsNeeded || [],
    approvalsReceived: {},
    vetoedBy: null,
    vetoReason: null,
    citations: opts.citations || [],
    status: 'pending',
    zoneRules: { ...rules }
  };

  // Auto-approve by proposing agent
  proposal.approvalsReceived[opts.agent] = true;

  // In nursery, all agents auto-approve (no rejection allowed)
  if (!rules.allowReject) {
    proposal.approvalsNeeded.forEach(a => {
      proposal.approvalsReceived[a] = true;
    });
  }

  return proposal;
}

/**
 * Check compliance of a proposal against its zone rules.
 *
 * @param {object} proposal
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkCompliance(proposal) {
  const rules = proposal.zoneRules;

  // AG absolute veto
  if (proposal.vetoedBy === 'ag' && rules.agVeto) {
    return {
      ok: false,
      reason: 'Accessibility Guardian has exercised absolute veto. Only the gardener can override.'
    };
  }

  // Unanimous check
  if (rules.unanimous) {
    const missing = proposal.approvalsNeeded.filter(a => !proposal.approvalsReceived[a]);
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Unanimous approval required. Missing: ${missing.join(', ')}`
      };
    }
  }

  // Majority check
  if (rules.majority) {
    const count = Object.values(proposal.approvalsReceived).filter(Boolean).length;
    const needed = Math.ceil(proposal.approvalsNeeded.length / 2);
    if (count < needed) {
      return {
        ok: false,
        reason: `Majority required: ${count}/${proposal.approvalsNeeded.length} (need ${needed})`
      };
    }
  }

  return { ok: true, reason: 'Compliance check passed.' };
}

/**
 * Approve a proposal by an agent or the gardener.
 *
 * @param {object} proposal
 * @param {string} actorId - Agent ID or 'gardener'
 * @returns {object} Updated proposal
 */
export function approveProposal(proposal, actorId) {
  proposal.approvalsReceived[actorId] = true;

  const compliance = checkCompliance(proposal);
  if (compliance.ok) {
    proposal.status = 'staged';
  }

  return proposal;
}

/**
 * Veto a proposal.
 *
 * @param {object} proposal
 * @param {string} agentId
 * @param {string} reason
 * @returns {object} Updated proposal
 */
export function vetoProposal(proposal, agentId, reason) {
  proposal.vetoedBy = agentId;
  proposal.vetoReason = reason;

  if (proposal.zoneRules.allowReject) {
    proposal.status = 'rejected';
  } else {
    proposal.status = 'seed-vaulted';
  }

  return proposal;
}
