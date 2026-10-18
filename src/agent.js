import { randomUUID } from 'node:crypto';
import {
  getRelease, getImpactPaths, getOpenIncidentPaths,
  getLatestInvestigation, getServiceOwner, saveInvestigation
} from './graph.js';
import { evaluateEvidence } from './decision.js';

export async function investigate(releaseId) {
  const release = await getRelease(releaseId);
  if (!release) return undefined;
  const toolCalls = [
    { tool: 'getRelease', detail: 'Find the changed service' },
    { tool: 'getImpactPaths', detail: 'Traverse service dependencies to depth 4' },
    { tool: 'getOpenIncidentPaths', detail: 'Find open incidents and owners on those paths' },
    { tool: 'getLatestInvestigation', detail: 'Recall the previous decision' },
    { tool: 'getServiceOwner', detail: 'Find the owner for rollout verification' }
  ];
  const [impact, incidentPaths, previous, releaseOwner] = await Promise.all([
    getImpactPaths(release.serviceId),
    getOpenIncidentPaths(release.serviceId),
    getLatestInvestigation(release.id),
    getServiceOwner(release.serviceId)
  ]);
  const decision = evaluateEvidence(release, impact, incidentPaths, previous, releaseOwner?.name || 'Unassigned');
  const report = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    release,
    ...decision,
    toolCalls: [
      ...toolCalls,
      { tool: 'saveInvestigation', detail: 'Persist verdict, findings, and action checklist' }
    ]
  };
  await saveInvestigation(report);
  return report;
}
