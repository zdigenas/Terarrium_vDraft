/**
 * Pipeline — Component lifecycle management.
 *
 * Components travel: Spark Queue → Nursery → Workshop → Canopy → Stable (or Seed Vault)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const PIPELINE_FILE = resolve(PROJECT_ROOT, 'src/data/pipeline-state.json');
const ACTIVITY_LOG = resolve(PROJECT_ROOT, 'src/data/activity-log.jsonl');

/**
 * Load the current pipeline state.
 *
 * @returns {{ nursery: object[], workshop: object[], canopy: object[], stable: object[], nextId: number }}
 */
export function loadPipeline() {
  if (!existsSync(PIPELINE_FILE)) {
    return { nursery: [], workshop: [], canopy: [], stable: [], nextId: 1 };
  }
  try {
    return JSON.parse(readFileSync(PIPELINE_FILE, 'utf-8'));
  } catch {
    return { nursery: [], workshop: [], canopy: [], stable: [], nextId: 1 };
  }
}

/**
 * Save the pipeline state.
 *
 * @param {object} state
 */
export function savePipeline(state) {
  writeFileSync(PIPELINE_FILE, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Create a new component entry for the pipeline.
 *
 * @param {string} name - Component name
 * @param {'primitive'|'composite'} type
 * @param {string} description - JTBD description
 * @returns {object}
 */
export function createComponent(name, type, description) {
  const state = loadPipeline();
  const component = {
    id: `COMP-${String(state.nextId++).padStart(3, '0')}`,
    name,
    type,
    description,
    zone: 'nursery',
    maturity: 'draft',
    createdAt: new Date().toISOString(),
    movedAt: new Date().toISOString(),
    agentReviews: {},
    proposals: [],
    shielded: false
  };

  state.nursery.push(component);
  savePipeline(state);
  logActivity('submitted', component.id, name, 'gardener', `Entered Nursery as ${type} draft`);

  return component;
}

/**
 * Find a component by ID across all zones.
 *
 * @param {string} componentId
 * @returns {{ component: object, zone: string } | null}
 */
export function findComponent(componentId) {
  const state = loadPipeline();
  for (const zone of ['nursery', 'workshop', 'canopy', 'stable']) {
    const comp = state[zone].find(c => c.id === componentId || c.name.toLowerCase() === componentId.toLowerCase());
    if (comp) return { component: comp, zone };
  }
  return null;
}

/**
 * Promote a component to the next zone.
 *
 * @param {string} componentId
 * @returns {{ success: boolean, from: string, to: string, component: object } | { success: boolean, reason: string }}
 */
export function promoteComponent(componentId) {
  const state = loadPipeline();
  const zoneOrder = ['nursery', 'workshop', 'canopy', 'stable'];

  for (let i = 0; i < zoneOrder.length - 1; i++) {
    const zone = zoneOrder[i];
    const idx = state[zone].findIndex(c => c.id === componentId);
    if (idx === -1) continue;

    const comp = state[zone].splice(idx, 1)[0];
    const nextZone = zoneOrder[i + 1];

    comp.zone = nextZone;
    comp.maturity = nextZone === 'workshop' ? 'candidate' : nextZone === 'canopy' ? 'candidate' : 'stable';
    comp.movedAt = new Date().toISOString();

    state[nextZone].push(comp);
    savePipeline(state);
    logActivity('promoted', comp.id, comp.name, 'gardener', `Moved from ${zone} to ${nextZone}`);

    return { success: true, from: zone, to: nextZone, component: comp };
  }

  return { success: false, reason: `Component ${componentId} not found or already stable.` };
}

/**
 * Move a component to the Seed Vault.
 *
 * @param {string} componentId
 * @param {string} reason
 * @returns {{ success: boolean, component?: object }}
 */
export function seedVaultComponent(componentId, reason) {
  const state = loadPipeline();

  for (const zone of ['nursery', 'workshop', 'canopy']) {
    const idx = state[zone].findIndex(c => c.id === componentId);
    if (idx === -1) continue;

    const comp = state[zone].splice(idx, 1)[0];
    savePipeline(state);
    logActivity('seed-vaulted', comp.id, comp.name, 'gardener', reason || 'Preserved in Seed Vault');

    return { success: true, component: comp };
  }

  return { success: false };
}

/**
 * Log an activity to the append-only activity log.
 *
 * @param {string} action
 * @param {string} componentId
 * @param {string} componentName
 * @param {string} actor
 * @param {string} detail
 */
export function logActivity(action, componentId, componentName, actor, detail) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    componentId,
    componentName,
    actor,
    detail
  };

  if (existsSync(ACTIVITY_LOG)) {
    appendFileSync(ACTIVITY_LOG, JSON.stringify(entry) + '\n');
  }
}
