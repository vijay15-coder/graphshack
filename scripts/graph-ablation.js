// Integration check: removing one dependency edge must change the agent's verdict.
// Run only against the disposable synthetic demo graph.
import assert from 'node:assert/strict';
import { FalkorDB } from 'falkordb';

const base = process.env.APP_URL || 'http://localhost:4173';
const db = await FalkorDB.connect({
  host: process.env.FALKORDB_HOST || 'localhost',
  port: Number(process.env.FALKORDB_PORT || 6379)
});
const graph = db.selectGraph(process.env.FALKORDB_GRAPH || 'release_radar');
const from = 'checkout-api';
const to = 'payments-api';

async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(path + ': ' + response.status + ' ' + await response.text());
  return response.json();
}

async function investigate() {
  return post('/api/investigate', { releaseId: 'REL-2026-10-18' });
}

try {
  await post('/api/incidents/INC-1042/reopen');
  await post('/api/incidents/INC-1048/reopen');
  const before = await investigate();
  assert.equal(before.verdict, 'HOLD');
  assert.deepEqual(before.blockers.map(b => b.id).sort(), ['INC-1042', 'INC-1048']);

  const edge = await graph.query(
    'MATCH (a:Service {id:$from})-[r:DEPENDS_ON]->(b:Service {id:$to}) RETURN count(r) AS edges',
    { params: { from, to } }
  );
  assert.equal(edge.data[0].edges, 1, 'expected one dependency edge to remove');
  await graph.query(
    'MATCH (a:Service {id:$from})-[r:DEPENDS_ON]->(b:Service {id:$to}) DELETE r',
    { params: { from, to } }
  );

  const withoutEdge = await investigate();
  assert.equal(withoutEdge.verdict, 'READY');
  assert.equal(withoutEdge.blockers.length, 0);
  assert.equal(withoutEdge.previous.verdict, 'HOLD');

  await graph.query(
    'MATCH (a:Service {id:$from}), (b:Service {id:$to}) MERGE (a)-[:DEPENDS_ON]->(b)',
    { params: { from, to } }
  );
  const restored = await investigate();
  assert.equal(restored.verdict, 'HOLD');
  assert.deepEqual(restored.blockers.map(b => b.id).sort(), ['INC-1042', 'INC-1048']);

  const memoryResponse = await fetch(base + '/api/investigations/' + withoutEdge.id);
  assert.equal(memoryResponse.status, 200);
  const memory = await memoryResponse.json();
  assert.equal(memory.verdict, 'READY', 'earlier graph decision must persist');
  console.log('Graph ablation verified: HOLD -> READY -> HOLD, with prior decision preserved.');
} finally {
  // Leave the demo topology intact even if an assertion fails.
  await graph.query(
    'MATCH (a:Service {id:$from}), (b:Service {id:$to}) MERGE (a)-[:DEPENDS_ON]->(b)',
    { params: { from, to } }
  );
  await db.close();
}
