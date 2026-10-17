import { FalkorDB } from 'falkordb';
import { services, dependencies, people, ownership, incidents, release } from './data.js';

let client;
let graph;

export async function connectGraph() {
  if (graph) return graph;
  const options = {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: Number(process.env.FALKORDB_PORT || 6379)
  };
  if (process.env.FALKORDB_PASSWORD) options.password = process.env.FALKORDB_PASSWORD;
  client = await FalkorDB.connect(options);
  graph = client.selectGraph(process.env.FALKORDB_GRAPH || 'release_radar');
  return graph;
}

export async function closeGraph() {
  if (client) await client.close();
}

export async function query(cypher, params = {}) {
  const result = await graph.query(cypher, { params });
  return result.data || [];
}

export async function seedGraph() {
  for (const s of services) {
    await query('MERGE (s:Service {id: $id}) ON CREATE SET s.name = $name, s.tier = $tier, s.description = $description', s);
  }
  for (const p of people) {
    await query('MERGE (p:Person {id: $id}) ON CREATE SET p.name = $name, p.role = $role', p);
  }
  for (const [from, to] of dependencies) {
    await query('MATCH (a:Service {id: $from}), (b:Service {id: $to}) MERGE (a)-[:DEPENDS_ON]->(b)', { from, to });
  }
  for (const [person, service] of ownership) {
    await query('MATCH (p:Person {id: $person}), (s:Service {id: $service}) MERGE (p)-[:OWNS]->(s)', { person, service });
  }
  for (const i of incidents) {
    await query('MERGE (i:Incident {id: $id}) ON CREATE SET i.title = $title, i.severity = $severity, i.status = $status, i.detail = $detail', i);
    await query('MATCH (i:Incident {id: $incident}), (s:Service {id: $service}) MERGE (i)-[:AFFECTS]->(s)', { incident: i.id, service: i.affected });
  }
  await query('MERGE (r:Release {id: $id}) ON CREATE SET r.name = $name, r.version = $version, r.summary = $summary', release);
  await query('MATCH (r:Release {id: $release}), (s:Service {id: $service}) MERGE (r)-[:CHANGES]->(s)', { release: release.id, service: release.serviceId });
}

export async function getOverview() {
  const [serviceRows, dependencyRows, incidentRows, ownerRows, releaseRows, historyRows] = await Promise.all([
    query('MATCH (s:Service) RETURN s.id AS id, s.name AS name, s.tier AS tier, s.description AS description ORDER BY s.name'),
    query('MATCH (a:Service)-[:DEPENDS_ON]->(b:Service) RETURN a.id AS from, b.id AS to'),
    query('MATCH (i:Incident)-[:AFFECTS]->(s:Service) RETURN i.id AS id, i.title AS title, i.severity AS severity, i.status AS status, i.detail AS detail, s.id AS serviceId ORDER BY i.id'),
    query('MATCH (p:Person)-[:OWNS]->(s:Service) RETURN p.id AS id, p.name AS name, p.role AS role, s.id AS serviceId'),
    query('MATCH (r:Release)-[:CHANGES]->(s:Service) RETURN r.id AS id, r.name AS name, r.version AS version, r.summary AS summary, s.id AS serviceId'),
    query('MATCH (v:Investigation)-[:FOR_RELEASE]->(r:Release) RETURN v.id AS id, v.createdAt AS createdAt, v.verdict AS verdict, v.blockerCount AS blockerCount, r.id AS releaseId ORDER BY v.createdAt DESC LIMIT 8')
  ]);
  return {
    services: serviceRows,
    dependencies: dependencyRows,
    incidents: incidentRows,
    owners: ownerRows,
    releases: releaseRows,
    history: historyRows
  };
}

export async function getRelease(id) {
  return (await query('MATCH (r:Release {id: $id})-[:CHANGES]->(s:Service) RETURN r.id AS id, r.name AS name, r.version AS version, r.summary AS summary, s.id AS serviceId, s.name AS serviceName', { id }))[0];
}

export async function getImpactPaths(serviceId) {
  const rows = await query('MATCH p=(root:Service {id: $serviceId})-[:DEPENDS_ON*1..4]->(dependency:Service) RETURN dependency.id AS id, dependency.name AS name, dependency.tier AS tier, p AS path ORDER BY dependency.name', { serviceId });
  return rows.map(row => ({
    id: row.id, name: row.name, tier: row.tier,
    path: row.path.nodes.map(node => node.properties.name)
  }));
}

export async function getOpenIncidentPaths(serviceId) {
  const rows = await query("MATCH p=(root:Service {id: $serviceId})-[:DEPENDS_ON*0..4]->(affected:Service) MATCH (i:Incident)-[:AFFECTS]->(affected) WHERE i.status = 'open' OPTIONAL MATCH (owner:Person)-[:OWNS]->(affected) RETURN i.id AS id, i.title AS title, i.severity AS severity, i.detail AS detail, affected.id AS serviceId, affected.name AS serviceName, owner.id AS ownerId, owner.name AS ownerName, p AS path", { serviceId });
  return rows.map(row => ({
    id: row.id, title: row.title, severity: row.severity,
    detail: row.detail, serviceId: row.serviceId,
    serviceName: row.serviceName, ownerId: row.ownerId,
    ownerName: row.ownerName,
    path: row.path.nodes.map(node => node.properties.name)
  }));
}

export async function setIncidentStatus(id, status) {
  if (!['open', 'resolved'].includes(status)) throw new Error('Invalid status');
  const rows = await query('MATCH (i:Incident {id: $id}) SET i.status = $status RETURN i.id AS id, i.title AS title, i.status AS status', { id, status });
  return rows[0];
}

export async function saveInvestigation(report) {
  await query('MATCH (r:Release {id: $releaseId}) CREATE (v:Investigation {id: $id, createdAt: $createdAt, verdict: $verdict, blockerCount: $blockerCount, summary: $summary, toolTrace: $toolTrace})-[:FOR_RELEASE]->(r)', {
    releaseId: report.release.id,
    id: report.id,
    createdAt: report.createdAt,
    verdict: report.verdict,
    blockerCount: report.blockers.length,
    summary: report.summary,
    toolTrace: report.toolCalls.map(call => call.tool).join(' → ')
  });
  for (const finding of report.blockers) {
    await query('MATCH (v:Investigation {id: $investigationId}), (i:Incident {id: $incidentId}) CREATE (f:Finding {id: $id, title: $title, severity: $severity, path: $path, ownerName: $ownerName, serviceName: $serviceName}) CREATE (v)-[:FOUND]->(f) CREATE (f)-[:EVIDENCED_BY]->(i)', {
      investigationId: report.id,
      incidentId: finding.id,
      id: report.id + ':' + finding.id,
      title: finding.title,
      severity: finding.severity,
      path: finding.path.join(' → '),
      ownerName: finding.ownerName || 'Unassigned',
      serviceName: finding.serviceName
    });
  }
  for (const action of report.actions) {
    await query("MATCH (v:Investigation {id: $investigationId}) CREATE (a:Action {id: $id, text: $text, owner: $owner, status: 'todo', incidentId: $incidentId}) CREATE (v)-[:RECOMMENDS]->(a)", {
      investigationId: report.id,
      id: action.id,
      text: action.text,
      owner: action.owner,
      incidentId: action.incidentId || ''
    });
  }
}

export async function getInvestigation(id) {
  const rows = await query('MATCH (v:Investigation {id: $id})-[:FOR_RELEASE]->(r:Release) RETURN v.id AS id, v.createdAt AS createdAt, v.verdict AS verdict, v.blockerCount AS blockerCount, v.summary AS summary, v.toolTrace AS toolTrace, r.id AS releaseId, r.name AS releaseName', { id });
  if (!rows.length) return undefined;
  const [findings, actions] = await Promise.all([
    query('MATCH (v:Investigation {id: $id})-[:FOUND]->(f:Finding)-[:EVIDENCED_BY]->(i:Incident) RETURN f.id AS id, f.title AS title, f.severity AS severity, f.path AS path, f.ownerName AS ownerName, f.serviceName AS serviceName, i.id AS incidentId ORDER BY f.severity, i.id', { id }),
    query('MATCH (v:Investigation {id: $id})-[:RECOMMENDS]->(a:Action) RETURN a.id AS id, a.text AS text, a.owner AS owner, a.status AS status, a.incidentId AS incidentId ORDER BY a.id', { id })
  ]);
  return { ...rows[0], findings, actions };
}

export async function getLatestInvestigation(releaseId) {
  const rows = await query('MATCH (v:Investigation)-[:FOR_RELEASE]->(r:Release {id: $releaseId}) RETURN v.id AS id, v.createdAt AS createdAt, v.verdict AS verdict, v.blockerCount AS blockerCount ORDER BY v.createdAt DESC LIMIT 1', { releaseId });
  return rows[0];
}

export async function getServiceOwner(serviceId) {
  return (await query('MATCH (p:Person)-[:OWNS]->(s:Service {id: $serviceId}) RETURN p.id AS id, p.name AS name, p.role AS role LIMIT 1', { serviceId }))[0];
}

export async function setActionStatus(investigationId, actionId, status) {
  if (!['todo', 'done'].includes(status)) throw new Error('Invalid action status');
  return (await query('MATCH (v:Investigation {id: $investigationId})-[:RECOMMENDS]->(a:Action {id: $actionId}) SET a.status = $status RETURN a.id AS id, a.text AS text, a.owner AS owner, a.status AS status', { investigationId, actionId, status }))[0];
}
