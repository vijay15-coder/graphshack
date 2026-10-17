import { randomUUID } from 'node:crypto';
import {
  getRelease, getImpactPaths, getOpenIncidentPaths,
  getLatestInvestigation, getServiceOwner, saveInvestigation
} from './graph.js';

const severityRank = { high: 3, medium: 2, low: 1 };

export function evaluateEvidence(release, impactPaths, incidentPaths, previous, releaseOwner = 'Unassigned') {
  const byIncident = new Map();
  for (const candidate of incidentPaths) {
    const existing = byIncident.get(candidate.id);
    if (!existing || candidate.path.length < existing.path.length) {
      byIncident.set(candidate.id, candidate);
    }
  }
  const blockers = [...byIncident.values()].sort((a, b) =>
    (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) ||
    a.id.localeCompare(b.id)
  );
  const verdict = blockers.some(item => item.severity === 'high')
    ? 'HOLD'
    : blockers.length ? 'REVIEW' : 'READY';
  const actions = blockers.map((finding, index) => ({
    id: String(index + 1).padStart(2, '0'),
    text: 'Resolve ' + finding.id + ' on ' + finding.serviceName + ' and verify ' + release.name + ' before rollout.',
    owner: finding.ownerName || 'Unassigned',
    incidentId: finding.id
  }));
  if (!blockers.length) {
    actions.push({
      id: '01',
      text: 'Run checkout smoke tests and monitor payment capture during gradual rollout.',
      owner: releaseOwner,
      incidentId: ''
    });
  }
  const prior = previous
    ? ' Previous run: ' + previous.verdict + ' with ' + previous.blockerCount + ' blocker(s).'
    : '';
  const summary = verdict === 'HOLD'
    ? 'Hold ' + release.name + ': ' + blockers.length + ' open incident(s) sit on its dependency paths.' + prior
    : verdict === 'REVIEW'
      ? 'Review ' + release.name + ': ' + blockers.length + ' noncritical incident(s) need owner sign-off.' + prior
      : release.name + ' is ready for a controlled rollout: no open incidents were found on its dependency paths.' + prior;
  return {
    verdict, summary, blockers, actions,
    impact: impactPaths,
    previous: previous ? {
      id: previous.id, verdict: previous.verdict,
      blockerCount: previous.blockerCount,
      createdAt: previous.createdAt
    } : null
  };
}

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
