import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectGraph, seedGraph, getOverview, getInvestigation, setIncidentStatus, setActionStatus, closeGraph } from './graph.js';
import { investigate } from './agent.js';

const port = Number(process.env.PORT || 4173);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
};

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

async function parseBody(req) {
  let content = '';
  for await (const chunk of req) {
    content += chunk;
    if (content.length > 16384) throw new Error('Request body is too large');
  }
  return content ? JSON.parse(content) : {};
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && staticFiles[url.pathname]) {
      const [file, type] = staticFiles[url.pathname];
      const body = await readFile(join(publicDir, file));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      send(res, 200, { ok: true, graph: process.env.FALKORDB_GRAPH || 'release_radar' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/overview') {
      send(res, 200, await getOverview());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/investigate') {
      const body = await parseBody(req);
      if (typeof body.releaseId !== 'string') {
        send(res, 400, { error: 'releaseId is required' });
        return;
      }
      const result = await investigate(body.releaseId);
      if (!result) {
        send(res, 404, { error: 'Release not found' });
        return;
      }
      send(res, 200, result);
      return;
    }
    if (req.method === 'POST' && /^\/api\/investigations\/[^/]+\/actions\/[^/]+$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      const body = await parseBody(req);
      if (!['todo', 'done'].includes(body.status)) {
        send(res, 400, { error: 'status must be todo or done' });
        return;
      }
      const action = await setActionStatus(parts[3], parts[5], body.status);
      send(res, action ? 200 : 404, action || { error: 'Action not found' });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/investigations/')) {
      const id = url.pathname.split('/')[3];
      const result = await getInvestigation(id);
      send(res, result ? 200 : 404, result || { error: 'Investigation not found' });
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/incidents/')) {
      const parts = url.pathname.split('/');
      if (parts.length !== 5 || !['resolve', 'reopen'].includes(parts[4])) {
        send(res, 404, { error: 'Endpoint not found' });
        return;
      }
      const incident = await setIncidentStatus(parts[3], parts[4] === 'resolve' ? 'resolved' : 'open');
      send(res, incident ? 200 : 404, incident || { error: 'Incident not found' });
      return;
    }
    send(res, 404, { error: 'Endpoint not found' });
  } catch (error) {
    console.error(error);
    send(res, error instanceof SyntaxError ? 400 : 500, {
      error: error instanceof SyntaxError ? 'Invalid JSON' : 'Request failed',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

async function start() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await connectGraph();
      await seedGraph();
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      console.error('FalkorDB connection attempt ' + attempt + ': ' + error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  if (lastError) throw lastError;
  http.createServer(handler).listen(port, '0.0.0.0', () => {
    console.log('ReleaseRadar running at http://localhost:' + port);
  });
}

process.on('SIGINT', async () => {
  await closeGraph();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeGraph();
  process.exit(0);
});

start().catch(error => {
  console.error(error);
  process.exit(1);
});
