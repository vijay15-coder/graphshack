const state = { overview: null, report: null, selectedMemory: null };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const stamp = value => new Date(value).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function tab(name) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + name));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
  $('breadcrumb-page').textContent = { overview: 'Command center', memory: 'Agent memory', graph: 'Graph explorer' }[name];
}

function renderStats(data) {
  const open = data.incidents.filter(i => i.status === 'open').length;
  const values = [
    [data.services.length, 'Connected services', '⌘'],
    [data.dependencies.length, 'Dependency edges', '↗'],
    [open, 'Open incidents', '⚑'],
    [data.history.length, 'Agent investigations', '✦']
  ];
  $('stats').innerHTML = values.map(item =>
    '<div class="stat"><div><strong>' + item[0] + '</strong><span>' + item[1] + '</span></div><div class="stat-icon">' + item[2] + '</div></div>'
  ).join('');
}

function renderRelease(data) {
  const release = data.releases[0];
  if (!release) return;
  $('release-name').textContent = release.name;
  $('release-version').textContent = 'v' + release.version;
  $('release-summary').textContent = release.summary;
  $('release-dependency-count').textContent = data.dependencies.length + ' dependency relationships';
}

function renderIncidents(data) {
  const open = data.incidents.filter(i => i.status === 'open').length;
  $('incident-count').textContent = open + ' open';
  $('incident-list').innerHTML = data.incidents.map(item => {
    const owner = data.owners.find(p => p.serviceId === item.serviceId);
    const action = item.status === 'open' ? 'resolve' : 'reopen';
    return '<div class="incident"><div><strong>' + esc(item.id) + ' · ' + esc(item.title) +
      '</strong><small>' + esc(owner?.name || 'Unassigned') + ' · ' + esc(item.serviceId) +
      ' · ' + esc(item.status) + '</small></div><div class="incident-controls"><span class="severity ' +
      esc(item.severity) + '">' + esc(item.severity) + '</span><button data-incident="' +
      esc(item.id) + '" data-action="' + action + '">' + (action === 'resolve' ? 'Resolve' : 'Reopen') +
      '</button></div></div>';
  }).join('');
  document.querySelectorAll('[data-incident]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('/api/incidents/' + encodeURIComponent(button.dataset.incident) + '/' + button.dataset.action, { method: 'POST' });
      await refresh();
      toast(button.dataset.incident + ' updated. Run the agent again to compare verdicts.');
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  }));
}

function renderVerdict(report) {
  if (!report) return;
  $('verdict-panel').className = 'verdict-result';
  $('verdict-panel').innerHTML = '<span class="verdict-badge ' + esc(report.verdict) + '">' +
    esc(report.verdict) + '</span><p>' + esc(report.summary) + '</p>';
  $('last-run').textContent = 'Assessed ' + stamp(report.createdAt);
  const findings = report.blockers || report.findings || [];
  const findingsHtml = findings.map(item =>
    '<div class="finding"><strong>' + esc(item.id && item.id.startsWith('INC-') ? item.id : item.incidentId) +
    ' · ' + esc(item.title) + '</strong><small>' + esc(item.severity) + ' risk · ' +
    esc(item.ownerName) + '</small><div class="path">' +
    esc(Array.isArray(item.path) ? item.path.join(' → ') : item.path) +
    ' → ' + esc(item.incidentId || item.id) + '</div></div>'
  ).join('');
  const actionsHtml = (report.actions || []).map(action =>
    '<div class="action ' + (action.status === 'done' ? 'done' : '') + '"><span>' + esc(action.text) + ' <b>— ' + esc(action.owner) + '</b></span><button data-task="' + esc(action.id) + '" data-run="' + esc(report.id) + '" data-next="' + (action.status === 'done' ? 'todo' : 'done') + '">' + (action.status === 'done' ? 'Undo' : 'Mark done') + '</button></div>'
  ).join('');
  $('agent-output').innerHTML =
    (findingsHtml || '<p>No active incident found along this release\'s dependency paths.</p>') +
    '<div class="action-list"><h3>Recommended actions</h3>' + actionsHtml + '</div>' +
    (report.toolCalls || report.toolTrace ? '<div class="tool-trace">AGENT TOOLS &nbsp; ' + esc(report.toolTrace || report.toolCalls.map(call => call.tool).join(' → ')) + '</div>' : '');
}

function renderHistory(data) {
  $('history-list').innerHTML = data.history.length
    ? data.history.map(item =>
      '<button class="history-item ' + (state.selectedMemory === item.id ? 'selected' : '') +
      '" data-memory="' + esc(item.id) + '"><span><strong>' + esc(item.releaseId) +
      '</strong><small>' + stamp(item.createdAt) + ' · ' + item.blockerCount +
      ' blocker(s)</small></span><b class="' + esc(item.verdict) + '">' + esc(item.verdict) +
      '</b></button>'
    ).join('')
    : '<div class="placeholder"><span>◷</span><strong>No memory yet</strong><p>Run the investigation to create the first snapshot.</p></div>';
  document.querySelectorAll('[data-memory]').forEach(button =>
    button.addEventListener('click', () => loadMemory(button.dataset.memory))
  );
}

async function loadMemory(id) {
  try {
    const record = await api('/api/investigations/' + encodeURIComponent(id));
    state.selectedMemory = id;
    renderHistory(state.overview);
    $('memory-detail').innerHTML =
      '<span class="verdict-badge ' + esc(record.verdict) + '">' + esc(record.verdict) + '</span>' +
      '<div class="memory-meta">' + stamp(record.createdAt) + ' · ' + esc(record.releaseName) + '</div>' +
      '<h3>Decision</h3><p>' + esc(record.summary) + '</p><h3>Evidence paths</h3>' +
      (record.findings.length ? record.findings.map(f =>
        '<div class="finding"><strong>' + esc(f.incidentId) + ' · ' + esc(f.title) +
        '</strong><small>' + esc(f.ownerName) + '</small><div class="path">' +
        esc(f.path) + ' → ' + esc(f.incidentId) + '</div></div>'
      ).join('') : '<p>No open incident paths at this point in time.</p>') +
      '<div class="action-list"><h3>Actions saved in graph</h3>' +
      record.actions.map(a => '<div class="action ' + (a.status === 'done' ? 'done' : '') + '"><span>' + esc(a.text) + ' <b>— ' + esc(a.owner) + '</b></span><button data-task="' + esc(a.id) + '" data-run="' + esc(record.id) + '" data-next="' + (a.status === 'done' ? 'todo' : 'done') + '">' + (a.status === 'done' ? 'Undo' : 'Mark done') + '</button></div>').join('') +
      '</div>' + (record.toolTrace ? '<div class="tool-trace">AGENT TOOLS &nbsp; ' + esc(record.toolTrace) + '</div>' : '');
  } catch (error) { toast(error.message); }
}

const positions = {
  'checkout-web': [85,185],
  'checkout-api': [240,185],
  'feature-flags': [240,350],
  'payments-api': [410,100],
  'notification-worker': [410,290],
  'fraud-engine': [585,45],
  'ledger-db': [585,175]
};

function renderGraph(data) {
  const openServices = new Set(data.incidents.filter(i => i.status === 'open').map(i => i.serviceId));
  const arrows = data.dependencies.map(edge => {
    const a = positions[edge.from], b = positions[edge.to];
    if (!a || !b) return '';
    return '<line class="graph-line" x1="' + (a[0]+62) + '" y1="' + (a[1]+22) +
      '" x2="' + (b[0]-9) + '" y2="' + (b[1]+22) + '" marker-end="url(#arrow)"/>';
  }).join('');
  const nodes = data.services.map(service => {
    const pos = positions[service.id];
    if (!pos) return '';
    return '<g class="graph-node ' + (openServices.has(service.id) ? 'problem' : '') +
      '" data-service="' + esc(service.id) + '"><rect x="' + pos[0] + '" y="' + pos[1] +
      '" width="125" height="45" rx="10"/><text x="' + (pos[0]+11) + '" y="' +
      (pos[1]+20) + '">' + esc(service.name) + '</text><text class="node-sub" x="' +
      (pos[0]+11) + '" y="' + (pos[1]+35) + '">' + esc(service.tier) + '</text></g>';
  }).join('');
  $('graph-canvas').innerHTML = '<svg viewBox="0 0 740 420" role="img" aria-label="Checkout service dependency graph"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="graph-arrow" d="M0,0 L0,6 L7,3 z"/></marker></defs>' + arrows + nodes + '</svg>';
  document.querySelectorAll('[data-service]').forEach(node =>
    node.addEventListener('click', () => selectService(node.dataset.service))
  );
  selectService('checkout-web');
}

function selectService(id) {
  const data = state.overview;
  const service = data.services.find(item => item.id === id);
  if (!service) return;
  document.querySelectorAll('[data-service]').forEach(node =>
    node.classList.toggle('active', node.dataset.service === id)
  );
  $('selected-service-name').textContent = service.name;
  const owner = data.owners.find(p => p.serviceId === id);
  const direct = data.dependencies.filter(d => d.from === id).map(d =>
    data.services.find(s => s.id === d.to)?.name || d.to
  );
  const incidents = data.incidents.filter(i => i.serviceId === id);
  $('selected-service-detail').innerHTML =
    '<p>' + esc(service.description) + '</p>' +
    '<div class="service-fact"><small>Owner</small><strong>' + esc(owner?.name || 'Unassigned') + '</strong></div>' +
    '<div class="service-fact"><small>Direct dependencies</small><strong>' + esc(direct.join(', ') || 'None') + '</strong></div>' +
    '<div class="service-fact"><small>Incidents</small><strong>' +
    esc(incidents.map(i => i.id + ' (' + i.status + ')').join(', ') || 'None') + '</strong></div>';
}

async function refresh() {
  const overview = await api('/api/overview');
  state.overview = overview;
  renderStats(overview);
  renderRelease(overview);
  renderIncidents(overview);
  renderHistory(overview);
  renderGraph(overview);
  return overview;
}

async function runInvestigation() {
  const button = $('investigate-btn');
  button.disabled = true;
  button.textContent = '✦   Following graph paths...';
  try {
    const release = state.overview.releases[0];
    if (!release) throw new Error('No release found in FalkorDB');
    const report = await api('/api/investigate', {
      method: 'POST',
      body: JSON.stringify({ releaseId: release.id })
    });
    state.report = report;
    renderVerdict(report);
    await refresh();
    toast('Investigation saved to FalkorDB memory.');
  } catch (error) { toast(error.message); }
  finally {
    button.disabled = false;
    button.innerHTML = '✦ &nbsp; Investigate release <span>↗</span>';
  }
}

document.querySelectorAll('[data-tab]').forEach(button =>
  button.addEventListener('click', () => tab(button.dataset.tab))
);
document.querySelectorAll('[data-tab-link]').forEach(button =>
  button.addEventListener('click', () => tab(button.dataset.tabLink))
);
$('investigate-btn').addEventListener('click', runInvestigation);
$('view-memory').addEventListener('click', () => tab('memory'));

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-task]');
  if (!button) return;
  button.disabled = true;
  try {
    await api('/api/investigations/' + encodeURIComponent(button.dataset.run) + '/actions/' + encodeURIComponent(button.dataset.task), {
      method: 'POST', body: JSON.stringify({ status: button.dataset.next })
    });
    const record = await api('/api/investigations/' + encodeURIComponent(button.dataset.run));
    if (state.report?.id === record.id) renderVerdict(record);
    if (state.selectedMemory === record.id) await loadMemory(record.id);
    toast('Action status saved in FalkorDB.');
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

refresh().then(async data => {
  if (data.history.length) {
    const latest = await api('/api/investigations/' + encodeURIComponent(data.history[0].id));
    state.report = latest;
    renderVerdict(latest);
  }
}).catch(error => {
  document.querySelector('.connection strong').textContent = 'FalkorDB unavailable';
  document.querySelector('.status-dot').style.background = '#ed9c7a';
  toast(error.message);
});
