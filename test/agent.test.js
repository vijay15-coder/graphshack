import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEvidence } from '../src/decision.js';

const release = { id: 'REL-1', name: 'Checkout v2', serviceId: 'checkout-web' };
const impact = [{ id: 'payments-api', path: ['Checkout Web', 'Checkout API', 'Payments API'] }];
const incident = {
  id: 'INC-1042', title: 'Capture retries', severity: 'high',
  serviceName: 'Payments API', ownerName: 'Arjun Rao',
  path: ['Checkout Web', 'Checkout API', 'Payments API']
};

test('high severity incident reached through dependencies blocks release', () => {
  const result = evaluateEvidence(release, impact, [incident], null);
  assert.equal(result.verdict, 'HOLD');
  assert.equal(result.blockers.length, 1);
  assert.equal(result.actions[0].owner, 'Arjun Rao');
  assert.deepEqual(result.blockers[0].path, incident.path);
});

test('duplicate paths keep the shortest evidence path', () => {
  const longer = { ...incident, path: ['Checkout Web', 'Checkout API', 'Payments API', 'Payments API'] };
  const result = evaluateEvidence(release, impact, [longer, incident], null);
  assert.equal(result.blockers.length, 1);
  assert.deepEqual(result.blockers[0].path, incident.path);
});

test('new run becomes ready when open incidents are absent and recalls previous decision', () => {
  const previous = { id: 'old-run', verdict: 'HOLD', blockerCount: 1, createdAt: '2026-10-17T10:00:00Z' };
  const result = evaluateEvidence(release, impact, [], previous, 'Maya Chen');
  assert.equal(result.verdict, 'READY');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.previous.verdict, 'HOLD');
  assert.equal(result.actions[0].owner, 'Maya Chen');
  assert.match(result.summary, /Previous run: HOLD/);
});

test('medium incident asks for review', () => {
  const result = evaluateEvidence(release, impact, [{ ...incident, severity: 'medium' }], null);
  assert.equal(result.verdict, 'REVIEW');
});
