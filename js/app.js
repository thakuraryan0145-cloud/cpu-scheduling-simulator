/* =========================================================================
 * app.js — User interface, animation engine and tab content.
 * ========================================================================= */
'use strict';

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  if (html !== '') e.innerHTML = html;
  return e;
}
const fmt = x => (Number.isInteger(x) ? String(x) : x.toFixed(2));
const clampInt = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const PALETTE = ['#6c8cff', '#43d9ad', '#ffb547', '#ff6b81', '#b18cff', '#4fc3f7', '#f78fb3', '#9be15d', '#ffd166', '#06d6a0',
  '#ef8354', '#a0c4ff', '#cdb4db', '#80ed99', '#f4a261', '#90e0ef', '#e9c46a', '#ff99c8', '#84dcc6', '#c77dff'];
const STATE_SYMBOL = { New: '·', Ready: 'R', Running: '▶', Waiting: 'W', Terminated: '✓' };
const SELECTION_RULE = {
  FCFS: 'Earliest arrival (front of queue)', SJF: 'Smallest burst time', SRTF: 'Smallest remaining time',
  PRIORITY_NP: 'Highest priority (smallest number)', PRIORITY_P: 'Highest priority (smallest number)', RR: 'Front of queue, runs ≤ q units',
  HRRN: 'Highest response ratio (W + BT) / BT', MLQ: 'Strict 3-level queues (Q0:RR, Q1:RR2, Q2:FCFS)',
  MLFQ: '3-level feedback queues with demotion', LOTTERY: 'Proportional-share lottery ticket draw',
};
const MAX_PROCESSES = 20;
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

/** FLIP animation: elements with [data-flip] glide from their old position to the new one. */
function flip(root, mutate, dur) {
  const first = new Map();
  if (dur > 0) root.querySelectorAll('[data-flip]').forEach(e => first.set(e.dataset.flip, e.getBoundingClientRect()));
  mutate();
  if (dur <= 0) return;
  root.querySelectorAll('[data-flip]').forEach(e => {
    const f = first.get(e.dataset.flip);
    if (!f) { e.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'ease-out' }); return; }
    const l = e.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      e.style.zIndex = 30;
      const a = e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.25,.8,.25,1)' });
      a.onfinish = a.oncancel = () => { e.style.zIndex = ''; };
    }
  });
}

/* ================================================================
 * PROCESS STORE  (Linked List of user processes)
 * ================================================================ */
const store = { list: new LinkedList(), nextId: 1, fresh: null };

function addProcess(data) {
  const num = store.nextId++;
  const p = { pid: 'P' + num, arrival: data.arrival, burst: data.burst, priority: data.priority,
    ioAt: data.ioAt || 0, ioTime: data.ioTime || 0, color: PALETTE[(num - 1) % PALETTE.length] };
  store.list.append(p);
  store.fresh = p.pid;
  return p;
}

function loadProcesses(arr) {
  store.list.clear(); store.nextId = 1;
  arr.forEach(p => addProcess(p));
  store.fresh = null;
  onProcessesChanged();
}

/** Linked list → Array (process table) used by the simulator. */
function getProcesses() { return new ProcessArray(store.list.toArray()).map(p => ({ ...p })); }

function validate(p) {
  const ints = ['arrival', 'burst', 'priority', 'ioAt', 'ioTime'];
  for (const k of ints) if (!Number.isInteger(p[k]) || p[k] < 0) return `${k} must be a non-negative whole number`;
  if (p.burst < 1) return 'Burst time must be at least 1';
  if (p.burst > 50) return 'Keep burst time ≤ 50 so the animation stays readable';
  if (p.arrival > 100) return 'Keep arrival time ≤ 100';
  if (p.ioAt > 0 && p.ioAt >= p.burst) return 'I/O must start before the burst ends (I/O after < Burst)';
  if (p.ioAt > 0 && p.ioTime < 1) return 'Give an I/O duration ≥ 1 (or set "I/O after" to 0)';
  return null;
}

const SAMPLE = [
  { arrival: 0, burst: 6, priority: 3 },
  { arrival: 1, burst: 4, priority: 1, ioAt: 2, ioTime: 3 },
  { arrival: 2, burst: 7, priority: 4 },
  { arrival: 3, burst: 3, priority: 2 },
  { arrival: 5, burst: 5, priority: 5 },
];

function randomProcesses() {
  const n = 4 + Math.floor(Math.random() * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const burst = 1 + Math.floor(Math.random() * 8);
    const io = burst > 2 && Math.random() < 0.25;
    out.push({ arrival: Math.floor(Math.random() * 9), burst, priority: Math.floor(Math.random() * 7),
      ioAt: io ? 1 + Math.floor(Math.random() * (burst - 1)) : 0, ioTime: io ? 1 + Math.floor(Math.random() * 4) : 0 });
  }
  return out;
}

function renderProcessTable() {
  const tb = $('#proc-table tbody');
  tb.innerHTML = '';
  const procs = store.list.toArray();
  if (!procs.length) { tb.innerHTML = '<tr><td colspan="7" class="muted">No processes — add some or load sample data</td></tr>'; return; }
  for (const p of procs) {
    const tr = h('tr');
    tr.innerHTML = `<td><span class="pid-chip" style="--c:${p.color}">${p.pid}</span></td>` +
      ['arrival', 'burst', 'priority', 'ioAt', 'ioTime'].map(f => `<td><input type="number" min="0" data-pid="${p.pid}" data-field="${f}" value="${p[f]}"></td>`).join('') +
      `<td><button class="del-btn" title="Remove ${p.pid}" data-del="${p.pid}">✕</button></td>`;
    tb.append(tr);
  }
}

function renderLinkedList() {
  const v = $('#ll-view');
  v.innerHTML = '<span class="ll-head">HEAD</span><span class="ll-arrow">→</span>';
  for (const p of store.list) {
    const node = h('div', { class: 'll-node' + (p.pid === store.fresh ? ' fresh' : ''), 'data-ll': p.pid, style: `--c:${p.color}`,
      title: `AT=${p.arrival} BT=${p.burst} Pri=${p.priority}` }, `<span class="v">${p.pid}</span><span class="n">•</span>`);
    v.append(node, h('span', { class: 'll-arrow' }, '→'));
  }
  v.append(h('span', { class: 'll-null' }, 'NULL'));
  store.fresh = null;
}

function onProcessesChanged() {
  renderProcessTable();
  renderLinkedList();
  prepare();
}

function initProcessInput() {
  $('#proc-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = {
      arrival: parseInt($('#f-arrival').value, 10), burst: parseInt($('#f-burst').value, 10), priority: parseInt($('#f-priority').value, 10),
      ioAt: parseInt($('#f-ioat').value || '0', 10), ioTime: parseInt($('#f-iotime').value || '0', 10),
    };
    if (p.ioAt === 0) p.ioTime = 0;
    const err = validate(p) || (store.list.size >= MAX_PROCESSES ? `Maximum ${MAX_PROCESSES} processes` : null);
    $('#form-error').textContent = err || '';
    if (err) return;
    addProcess(p);
    onProcessesChanged();
    $('#f-arrival').value = p.arrival + 1;
  });
  $('#btn-sample').onclick = () => loadProcesses(SAMPLE);
  $('#btn-random').onclick = () => loadProcesses(randomProcesses());
  $('#btn-clear').onclick = () => loadProcesses([]);

  $('#proc-table').addEventListener('change', e => {
    const inp = e.target.closest('input[data-pid]');
    if (!inp) return;
    const p = store.list.find(x => x.pid === inp.dataset.pid);
    const trial = { ...p, [inp.dataset.field]: parseInt(inp.value, 10) };
    if (trial.ioAt === 0) trial.ioTime = 0;
    const err = validate(trial);
    $('#form-error').textContent = err ? `${p.pid}: ${err}` : '';
    if (err) { inp.value = p[inp.dataset.field]; return; }
    Object.assign(p, trial);
    onProcessesChanged();
  });
  $('#proc-table').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const pid = b.dataset.del;
    const node = $(`[data-ll="${pid}"]`);
    if (node) node.classList.add('removing');
    setTimeout(() => { store.list.remove(p => p.pid === pid); onProcessesChanged(); }, 280);
  });
}

/* ================================================================
 * SETTINGS
 * ================================================================ */
function currentAlgo() { return $('#algo-select').value; }
function getOpts() {
  return {
    quantum: clampInt($('#quantum').value, 1, 50, 2),
    aging: $('#aging').checked,
    agingInterval: clampInt($('#aging-interval').value, 1, 100, 4),
    starvationThreshold: clampInt($('#starve-th').value, 1, 1000, 10),
  };
}
function setOpts(o = {}) {
  if (o.quantum != null) $('#quantum').value = o.quantum;
  if (o.aging != null) $('#aging').checked = o.aging;
  if (o.agingInterval != null) $('#aging-interval').value = o.agingInterval;
  if (o.starvationThreshold != null) $('#starve-th').value = o.starvationThreshold;
}
function updateOptionVisibility() {
  const A = ALGORITHMS[currentAlgo()];
  $('#opt-quantum').style.display = (A.id === 'RR' || A.usesQuantum) ? '' : 'none';
  $('#opt-aging').style.display = (A.usesPriority || A.supportsAging) ? '' : 'none';
}
function initSettings() {
  const sel = $('#algo-select');
  for (const A of Object.values(ALGORITHMS)) sel.append(h('option', { value: A.id }, `${A.name} (${A.short})`));
  sel.onchange = () => { updateOptionVisibility(); prepare(); };
  ['#quantum', '#aging', '#aging-interval', '#starve-th'].forEach(s => $(s).addEventListener('change', () => prepare()));
  updateOptionVisibility();
}

/* ================================================================
 * PLAYER  (precomputed frames → animation forward & backward)
 * ================================================================ */
const player = { sim: null, idx: 0, playing: false, timer: null, tokens: new Map(), info: new Map(), unit: 30 };

function speedMs() { return Math.round(3000 / clampInt($('#speed').value, 1, 10, 4)); }
function animMs() { return Math.min(650, speedMs() * 0.7); }

function prepare() {
  pause();
  const procs = getProcesses();
  player.tokens.clear();
  ['#zone-new', '#zone-wait', '#zone-term', '#ready-view', '#cpu-box', '#ready-array'].forEach(s => { $(s).innerHTML = ''; });
  if (!procs.length) {
    player.sim = null;
    $('#scrubber').max = 0;
    renderBanner();
    $('#ready-view').innerHTML = '<div class="q-empty">Add processes to start the simulation</div>';
    ['#events', '#ds-ops', '#metrics', '#starvation-report', '#gantt', '#timeline', '#results-table'].forEach(s => { $(s).innerHTML = ''; });
    $('#mini-states').innerHTML = stateDiagramSVG('mini', {});
    return;
  }
  player.sim = simulate(procs, currentAlgo(), getOpts());
  player.info = new Map(player.sim.results.map(r => [r.pid, r]));
  player.idx = 0;
  $('#scrubber').max = player.sim.frames.length - 1;
  renderBanner();
  ganttReset();
  renderFrame(false);
}

function play() {
  if (!player.sim) return;
  if (player.idx >= player.sim.frames.length - 1) goTo(0, false);
  player.playing = true;
  $('#c-play').innerHTML = ICON_PAUSE;
  schedule();
}
function pause() {
  player.playing = false;
  clearTimeout(player.timer);
  $('#c-play').innerHTML = ICON_PLAY;
}
function schedule() {
  clearTimeout(player.timer);
  player.timer = setTimeout(() => {
    if (!player.playing) return;
    if (player.idx < player.sim.frames.length - 1) { goTo(player.idx + 1); schedule(); } else pause();
  }, speedMs());
}
function goTo(i, animate = true) {
  if (!player.sim) return;
  player.idx = Math.max(0, Math.min(player.sim.frames.length - 1, i));
  renderFrame(animate);
}

function initControls() {
  $('#c-play').onclick = () => (player.playing ? pause() : play());
  $('#c-fwd').onclick = () => { pause(); goTo(player.idx + 1); };
  $('#c-back').onclick = () => { pause(); goTo(player.idx - 1); };
  $('#c-reset').onclick = () => { pause(); goTo(0); };
  $('#c-end').onclick = () => { pause(); goTo(Infinity, false); };
  $('#scrubber').oninput = e => { pause(); goTo(parseInt(e.target.value, 10)); };
  $('#speed').oninput = () => { if (player.playing) schedule(); };
  $('#btn-run').onclick = () => { prepare(); play(); $('#stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  document.addEventListener('keydown', e => {
    if (!$('#tab-sim').classList.contains('active') || e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); $('#c-play').click(); }
    else if (e.key === 'ArrowRight') $('#c-fwd').click();
    else if (e.key === 'ArrowLeft') $('#c-back').click();
    else if (e.key === 'Home') $('#c-reset').click();
    else if (e.key === 'End') $('#c-end').click();
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (player.sim) { ganttReset(); renderFrame(false); } }, 200); });
}

/* ---------------- rendering a frame ---------------- */
function renderBanner() {
  const A = ALGORITHMS[currentAlgo()];
  const I = ALGO_INFO[A.id];
  const o = getOpts();
  const badges = [
    `<span class="badge ${A.preemptive ? 'pre' : 'np'}">${A.preemptive ? 'Preemptive' : 'Non-preemptive'}</span>`,
    `<span class="badge">DS: ${A.dsName}</span>`,
    `<span class="badge">Selects: ${SELECTION_RULE[A.id]}</span>`,
  ];
  if (A.id === 'RR') badges.push(`<span class="badge pre">Quantum = ${o.quantum}</span>`);
  if (A.usesPriority) badges.push(`<span class="badge ${o.aging ? 'np' : ''}">Aging: ${o.aging ? 'ON (every ' + o.agingInterval + ')' : 'OFF'}</span>`);
  $('#algo-banner').innerHTML = `<h2>${A.name}</h2><p>${I.tagline}</p><div class="badges">${badges.join('')}</div>`;
  $('#ready-ds').textContent = A.dsName;
}

function getToken(pid) {
  let t = player.tokens.get(pid);
  if (!t) {
    const info = player.info.get(pid);
    t = h('div', { class: 'token', 'data-flip': pid, style: `--c:${info.color}` }, `<b>${pid}</b><small></small>`);
    player.tokens.set(pid, t);
  }
  return t;
}
function setToken(t, sub, extra = '') {
  t.className = 'token ' + extra;
  t.querySelector('small').textContent = sub;
  return t;
}

function renderFrame(animate) {
  const sim = player.sim;
  const f = sim.frames[player.idx];
  const clock = $('#clock');
  clock.textContent = f.t;
  if (animate) { clock.classList.remove('tick'); void clock.offsetWidth; clock.classList.add('tick'); }
  $('#scrubber').value = player.idx;
  flip($('#stage'), () => placeTokens(f), animate ? animMs() : 0);
  renderNarration(f);
  $('#mini-states').innerHTML = stateDiagramSVG('mini', countStates(f), hotEdges(f));
  renderGanttFrame(f);
  renderTimeline();
  renderResults(f);
}

function placeTokens(f) {
  const sim = player.sim, A = sim.algo;
  const zNew = $('#zone-new'), zWait = $('#zone-wait'), zTerm = $('#zone-term');
  zNew.innerHTML = ''; zWait.innerHTML = ''; zTerm.innerHTML = '';
  const fp = new Map(f.procs.map(p => [p.pid, p]));
  const mini = f.ready.length >= 16;

  for (const p of f.procs) {
    const info = player.info.get(p.pid);
    const st = p.starved && p.state !== 'Terminated' ? ' starved' : '';
    if (p.state === 'New') zNew.append(setToken(getToken(p.pid), `AT ${info.arrival}`, 'dim'));
    else if (p.state === 'Waiting') zWait.append(setToken(getToken(p.pid), `→ t=${p.ioReturn}`, st));
    else if (p.state === 'Terminated') zTerm.append(setToken(getToken(p.pid), `CT ${p.completion}`, 'done'));
  }
  if (!zNew.children.length) zNew.innerHTML = '<span class="muted">—</span>';
  if (!zWait.children.length) zWait.innerHTML = '<span class="muted">—</span>';
  if (!zTerm.children.length) zTerm.innerHTML = '<span class="muted">—</span>';

  const readyToken = it => {
    const p = fp.get(it.pid), info = player.info.get(it.pid);
    const aged = A.usesPriority && p.effPriority < info.priority;
    const sub = A.key ? `${A.keyLabel} ${it.key}` : `Rem ${p.remaining}`;
    const t = setToken(getToken(it.pid), sub, (p.starved ? ' starved' : '') + (aged ? ' aged' : '') + (mini ? ' mini' : ''));
    t.title = `${it.pid}: remaining ${p.remaining}, waiting ${p.curWait}` + (A.usesPriority ? `, priority ${p.effPriority}${aged ? ' (aged from ' + info.priority + ')' : ''}` : '');
    return t;
  };
  if (A.ds === 'queue') renderQueue($('#ready-view'), f.ready, readyToken);
  else renderHeap($('#ready-view'), f.ready, readyToken);

  const arr = $('#ready-array');
  if (!f.ready.length) arr.innerHTML = '';
  else if (A.ds === 'queue') arr.innerHTML = `<span class="lbl">Queue (front → rear):</span>` + f.ready.map(r => `<span class="cell">${r.pid}</span>`).join('<span class="ll-arrow">→</span>');
  else arr.innerHTML = `<span class="lbl">Heap stored as Array:</span>` + f.ready.map((r, i) => `<span class="cell"><i>[${i}]</i>${r.pid}·${r.key}</span>`).join('');

  // CPU
  const cpu = $('#cpu-box');
  cpu.innerHTML = '';
  const chip = h('div', { class: 'cpu-chip' + (f.running ? ' busy' : '') });
  cpu.append(chip);
  if (f.running) {
    const p = fp.get(f.running), info = player.info.get(f.running);
    chip.append(setToken(getToken(f.running), `Rem ${p.remaining}`, p.starved ? 'starved' : ''));
    const done = p.executed + 1;
    let html = `<div class="meter">Executing unit ${done} of ${info.burst}<div class="bar"><div style="width:${(done / info.burst) * 100}%"></div></div></div>`;
    if (A.id === 'RR') {
      const q = sim.opts.quantum;
      html += `<div class="meter">Time quantum used ${f.qUsed + 1} / ${q}<div class="bar q"><div style="width:${((f.qUsed + 1) / q) * 100}%"></div></div></div>`;
    }
    if (A.usesPriority) html += `<div class="meter">Priority: <b>${p.effPriority}</b>${p.effPriority < info.priority ? ` (aged from ${info.priority})` : ''}</div>`;
    cpu.insertAdjacentHTML('beforeend', html);
  } else {
    chip.innerHTML = '<span class="cpu-idle">IDLE</span>';
    cpu.insertAdjacentHTML('beforeend', `<div class="meter">${f.events.some(e => e.type === 'end') ? 'All processes finished' : 'No process is ready'}</div>`);
  }
}

function renderQueue(container, items, tokenFor) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="q-empty">Ready queue is empty</div>'; return; }
  const track = h('div', { class: 'queue-track' });
  track.append(h('div', { class: 'q-end' }, 'FRONT'));
  items.forEach((it, i) => {
    const slot = h('div', { class: 'q-slot' + (i === 0 ? ' front' : '') });
    slot.append(tokenFor(it), h('span', { class: 'idx' }, `[${i}]`));
    track.append(slot);
  });
  track.append(h('div', { class: 'q-end' }, 'REAR'));
  container.append(track);
}

function renderHeap(container, items, tokenFor) {
  container.innerHTML = '';
  if (!items.length) { container.innerHTML = '<div class="q-empty">Heap is empty</div>'; return; }
  const levels = Math.floor(Math.log2(items.length)) + 1;
  const LH = levels >= 5 ? 58 : 72;
  const height = levels * LH + 8;
  const W = Math.max(container.clientWidth, 260);
  const pos = i => {
    const lvl = Math.floor(Math.log2(i + 1));
    const k = i - (2 ** lvl - 1);
    return { x: ((k + 0.5) / 2 ** lvl) * W, y: lvl * LH + 6 };
  };
  const tree = h('div', { class: 'heap-tree', style: `height:${height}px` });
  let svg = `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none">`;
  for (let i = 1; i < items.length; i++) {
    const a = pos((i - 1) >> 1), b = pos(i);
    svg += `<line x1="${a.x}" y1="${a.y + 24}" x2="${b.x}" y2="${b.y + 24}"/>`;
  }
  tree.innerHTML = svg + '</svg>';
  items.forEach((it, i) => {
    const p = pos(i);
    const node = h('div', { class: 'heap-node' + (i === 0 ? ' root' : ''), style: `left:${p.x}px; top:${p.y}px` });
    node.append(tokenFor(it), h('span', { class: 'idx' }, i === 0 ? '[0] root' : `[${i}]`));
    tree.append(node);
  });
  container.append(tree);
}

function renderNarration(f) {
  $('#narr-time').textContent = `t = ${f.t}`;
  $('#events').innerHTML = f.events.map((e, i) => `<li class="${e.type}" style="animation-delay:${i * 60}ms">${e.text}</li>`).join('');
  $('#ds-ops').innerHTML = f.dsOps.length
    ? f.dsOps.map((o, i) => `<li style="animation-delay:${i * 50}ms">${o}</li>`).join('')
    : '<li class="none">No changes to the ready structure</li>';
}

/* ---------------- state diagram ---------------- */
function countStates(f) { const c = {}; f.procs.forEach(p => { c[p.state] = (c[p.state] || 0) + 1; }); return c; }
function hotEdges(f) {
  const m = { arrive: 'admit', dispatch: 'dispatch', preempt: 'preempt', quantum: 'preempt', complete: 'exit', io: 'io', ioreturn: 'iodone' };
  return new Set(f.events.map(e => m[e.type]).filter(Boolean));
}
function stateDiagramSVG(id, counts = {}, hot = new Set()) {
  const nodes = { New: [10, 14], Ready: [120, 104], Running: [300, 104], Terminated: [410, 14], Waiting: [210, 184] };
  const W = 100, H = 40;
  const edges = [
    ['admit', 'M100 34 Q150 36 160 102', 'admitted', 168, 66],
    ['dispatch', 'M220 116 L298 116', 'dispatch', 259, 110],
    ['preempt', 'M300 134 L222 134', 'preempt / quantum', 261, 150],
    ['exit', 'M352 102 Q370 40 408 36', 'exit', 392, 70],
    ['io', 'M350 146 Q350 200 312 204', 'I/O wait', 362, 190],
    ['iodone', 'M210 204 Q165 202 165 146', 'I/O done', 160, 192],
  ];
  let s = `<svg class="state-svg" viewBox="0 0 520 236"><defs><marker id="arr-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#7d8bc0"/></marker></defs>`;
  for (const [k, d, label, lx, ly] of edges) {
    s += `<path class="edge ${hot.has(k) ? 'hot' : ''}" d="${d}" marker-end="url(#arr-${id})"/><text class="elabel" x="${lx}" y="${ly}">${label}</text>`;
  }
  const colors = { New: 'var(--s-new)', Ready: 'var(--s-ready)', Running: 'var(--s-running)', Waiting: 'var(--s-waiting)', Terminated: 'var(--s-terminated)' };
  for (const [name, [x, y]] of Object.entries(nodes)) {
    const c = counts[name] || 0;
    s += `<g class="sn ${c ? 'hot' : ''}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" style="stroke:${colors[name]}"/>` +
      `<text x="${x + W / 2}" y="${y + 18}">${name}</text>` +
      (id === 'mini' ? `<text class="cnt" x="${x + W / 2}" y="${y + 33}">${c} process${c === 1 ? '' : 'es'}</text>` : '') + '</g>';
  }
  return s + '</svg>';
}

/* ---------------- gantt ---------------- */
function ganttReset() {
  const g = $('#gantt');
  g.innerHTML = '';
  g.append(h('div', { class: 'g-bars' }), h('div', { class: 'g-axis' }));
  const ms = Math.max(player.sim.metrics.makespan, 1);
  const avail = g.parentElement.clientWidth - 24;
  player.unit = Math.max(26, Math.floor(avail / ms));
  g.style.width = ms * player.unit + 24 + 'px';
  g.style.paddingLeft = '10px';
}
function renderGanttFrame(f) {
  const g = $('#gantt');
  const bars = g.querySelector('.g-bars'), axis = g.querySelector('.g-axis');
  const u = player.unit;
  const final = player.idx === player.sim.frames.length - 1;
  f.gantt.forEach((b, i) => {
    let el = bars.children[i];
    const isNew = !el;
    if (isNew) { el = h('div'); el.style.width = '0px'; bars.append(el); void el.offsetWidth; }
    el.className = 'g-block' + (b.pid ? '' : ' idle') + (!final && i === f.gantt.length - 1 ? ' live' : '');
    if (b.pid) el.style.setProperty('--c', player.info.get(b.pid).color);
    el.textContent = b.pid || 'idle';
    el.title = `${b.pid || 'CPU idle'}: ${b.start} → ${b.end}`;
    el.style.width = (b.end - b.start) * u + 'px';
  });
  while (bars.children.length > f.gantt.length) bars.lastChild.remove();
  const marks = new Set();
  f.gantt.forEach(b => { marks.add(b.start); marks.add(b.end); });
  axis.innerHTML = [...marks].map(t => `<span style="left:${t * u}px">${t}</span>`).join('');
}

function staticGantt(gantt, makespan) {
  const wrap = h('div');
  const bars = h('div', { class: 'g-bars' }), axis = h('div', { class: 'g-axis' });
  const marks = new Set();
  const colorOf = pid => (player.info.get(pid) || {}).color || PALETTE[(parseInt(pid.slice(1), 10) - 1) % PALETTE.length];
  for (const b of gantt) {
    const el = h('div', { class: 'g-block' + (b.pid ? '' : ' idle'), title: `${b.pid || 'idle'}: ${b.start} → ${b.end}`,
      style: `width:${((b.end - b.start) / makespan) * 100}%;${b.pid ? `--c:${colorOf(b.pid)}` : ''}` }, b.pid || '');
    bars.append(el);
    marks.add(b.start); marks.add(b.end);
  }
  axis.innerHTML = [...marks].map(t => `<span style="left:${(t / makespan) * 100}%">${t}</span>`).join('');
  wrap.append(bars, axis);
  return wrap;
}

/* ---------------- timeline ---------------- */
function renderTimeline() {
  const sim = player.sim, ms = sim.metrics.makespan;
  let html = '<table><tr><th></th>';
  for (let t = 0; t < ms; t++) html += `<th>${t}</th>`;
  html += '</tr>';
  sim.results.forEach((r, i) => {
    html += `<tr><th><span class="pid-chip" style="--c:${r.color}">${r.pid}</span></th>`;
    for (let t = 0; t < ms; t++) {
      if (t <= player.idx) {
        const st = sim.frames[t].procs[i].state;
        html += `<td class="cell ${st}${t === player.idx ? ' cur' : ''}" title="${r.pid} @ t=${t}: ${st}">${STATE_SYMBOL[st]}</td>`;
      } else html += '<td class="cell"></td>';
    }
    html += '</tr>';
  });
  html += '</table><div class="legend">' + Object.entries(STATE_SYMBOL).map(([s, c]) =>
    `<span><i class="${s}" style="background:var(--s-${s.toLowerCase()})"></i>${c} ${s}</span>`).join('') + '</div>';
  $('#timeline').innerHTML = html;
}

/* ---------------- results ---------------- */
function metricCards(m, n) {
  return [
    ['Avg Waiting Time', fmt(m.avgWT)], ['Avg Turnaround Time', fmt(m.avgTAT)], ['Avg Response Time', fmt(m.avgRT)],
    ['CPU Utilization', m.cpuUtil.toFixed(1) + '%'], ['Throughput', `${m.throughput.toFixed(3)} <small>proc/unit</small>`],
    ['Total Time', m.makespan], ['Context Switches', m.contextSwitches], ['Starving Processes', `${m.starvedCount} / ${n}`],
  ].map(([k, v]) => `<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('');
}

function renderResults(f) {
  const sim = player.sim, A = sim.algo, t = f.t;
  const final = player.idx === sim.frames.length - 1;
  const n = sim.results.length;
  const finished = sim.results.filter(r => r.completion <= t).length;
  if (final) $('#metrics').innerHTML = metricCards(sim.metrics, n);
  else {
    const busy = f.gantt.filter(b => b.pid && b.start < t).reduce((s, b) => s + Math.min(b.end, t) - b.start, 0);
    $('#metrics').innerHTML = `<div class="metric"><span>Completed</span><b>${finished} / ${n}</b></div>` +
      `<div class="metric"><span>CPU busy so far</span><b>${busy}</b></div>` +
      `<div class="metric"><span>Context switches so far</span><b>${f.gantt.filter(b => b.pid).reduce((c, b, i, a) => c + (i && a[i - 1].pid !== b.pid ? 1 : 0), 0)}</b></div>` +
      `<div class="metric pending"><span>Averages</span><b>shown when simulation finishes…</b></div>`;
  }
  const pr = A.usesPriority;
  let html = `<thead><tr><th>PID</th><th>Arrival</th><th>Burst</th>${pr ? '<th>Priority</th>' : ''}<th>I/O</th><th>Start</th><th>Completion</th><th>Turnaround<br><small>CT−AT</small></th><th>Waiting<br><small>TAT−BT−IO</small></th><th>Response<br><small>Start−AT</small></th><th>Status</th></tr></thead><tbody>`;
  for (const r of sim.results) {
    const done = r.completion <= t;
    const started = r.start !== null && r.start <= t;
    const fpr = f.procs.find(p => p.pid === r.pid);
    const prio = pr ? `<td>${r.priority}${fpr.effPriority !== r.priority ? ` → ${fpr.effPriority}` : ''}</td>` : '';
    const status = `<span class="dot s-${fpr.state.toLowerCase()}"></span> ${fpr.state}${fpr.starved && fpr.state !== 'Terminated' ? ' ⚠' : ''}`;
    html += `<tr class="${r.completion === t ? 'reveal' : ''}"><td><span class="pid-chip" style="--c:${r.color}">${r.pid}</span></td><td>${r.arrival}</td><td>${r.burst}</td>${prio}` +
      `<td>${r.ioTime || '—'}</td><td>${started ? r.start : '—'}</td><td>${done ? r.completion : '—'}</td><td>${done ? r.tat : '—'}</td><td>${done ? r.wt : '—'}</td><td>${started ? r.rt : '—'}</td><td class="left">${status}${r.starved && done ? ' <small>(starved)</small>' : ''}</td></tr>`;
  }
  if (final) {
    html += `<tr><td colspan="${pr ? 7 : 6}" class="left"><b>Average</b></td><td><b>${fmt(sim.metrics.avgTAT)}</b></td><td><b>${fmt(sim.metrics.avgWT)}</b></td><td><b>${fmt(sim.metrics.avgRT)}</b></td><td></td></tr>`;
  }
  $('#results-table').innerHTML = html + '</tbody>';

  const rep = $('#starvation-report');
  if (!final) { rep.innerHTML = ''; return; }
  const starved = sim.results.filter(r => r.starved);
  if (starved.length) {
    let tip = '';
    if (A.usesPriority && !sim.opts.aging) tip = ' Turn on <b>Priority Aging</b> to gradually raise the priority of waiting processes.';
    else if (A.usesPriority) tip = ' Aging is ON — try a smaller aging interval to help them sooner.';
    else if (A.id === 'SJF' || A.id === 'SRTF') tip = ' Long jobs keep losing to shorter ones — this is the classic SJF/SRTF starvation problem.';
    rep.innerHTML = `<div class="callout warn">⚠ <b>Possible starvation detected</b> (waited ≥ ${sim.opts.starvationThreshold} units continuously): ` +
      starved.map(r => `<b>${r.pid}</b> (max wait ${r.maxWait})`).join(', ') + '.' + tip + '</div>';
  } else {
    rep.innerHTML = `<div class="callout ok">✔ No starvation: no process waited ${sim.opts.starvationThreshold}+ units continuously (longest continuous wait = ${sim.metrics.maxWait}).</div>`;
  }
}

/* ================================================================
 * COMPARE TAB
 * ================================================================ */
function runCompare() {
  const out = $('#compare-out');
  const procs = getProcesses();
  if (!procs.length) { out.innerHTML = '<div class="panel muted">Add processes in the Simulator tab first.</div>'; return; }
  const opts = getOpts();
  const runs = Object.keys(ALGORITHMS).map(id => simulate(procs, id, opts));
  const cols = [
    ['avgWT', 'Avg Waiting', 'min', fmt], ['avgTAT', 'Avg Turnaround', 'min', fmt], ['avgRT', 'Avg Response', 'min', fmt],
    ['cpuUtil', 'CPU Util %', 'max', v => v.toFixed(1)], ['throughput', 'Throughput', 'max', v => v.toFixed(3)],
    ['contextSwitches', 'Context Switches', 'min', fmt], ['starvedCount', 'Starving', 'min', fmt],
  ];
  const best = {};
  for (const [k, , dir] of cols) {
    const vals = runs.map(r => r.metrics[k]);
    best[k] = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
  }
  const eq = (a, b) => Math.abs(a - b) < 1e-9;
  out.innerHTML = '';

  const tablePanel = h('div', { class: 'panel' });
  tablePanel.innerHTML = `<h3>Performance table <small>(★ = best; quantum ${opts.quantum}, aging ${opts.aging ? 'on' : 'off'})</small></h3>` +
    `<div class="table-wrap"><table class="data-table"><thead><tr><th class="left">Algorithm</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>` +
    runs.map(r => `<tr><td class="left"><b>${r.algo.name}</b></td>${cols.map(([k, , , f]) => `<td class="${eq(r.metrics[k], best[k]) ? 'best' : ''}">${f(r.metrics[k])}</td>`).join('')}` +
      `<td><button class="btn small" data-animate="${r.algo.id}">▶ Animate</button></td></tr>`).join('') + '</tbody></table></div>';
  out.append(tablePanel);

  const charts = h('div', { class: 'compare-grid' });
  for (const [k, label, dir, f] of cols.slice(0, 6)) {
    const max = Math.max(...runs.map(r => r.metrics[k]), 1e-9);
    const p = h('div', { class: 'panel' }, `<h4 style="margin-top:0">${label} <small>(${dir === 'min' ? 'lower' : 'higher'} is better)</small></h4>`);
    for (const r of runs) {
      const v = r.metrics[k];
      const row = h('div', { class: 'chart-row' + (eq(v, best[k]) ? ' best' : '') },
        `<span>${r.algo.short}</span><div class="track"><div class="fill" data-w="${(v / max) * 100}"></div></div><span class="val">${f(v)}</span>`);
      p.append(row);
    }
    charts.append(p);
  }
  out.append(charts);

  const gp = h('div', { class: 'panel' }, '<h3>Gantt charts side by side</h3>');
  const ms = Math.max(...runs.map(r => r.metrics.makespan));
  for (const r of runs) {
    const m = h('div', { class: 'mini-gantt' });
    m.append(h('div', { class: 'title' }, `<b>${r.algo.name}</b><span class="muted">avg WT ${fmt(r.metrics.avgWT)} · avg TAT ${fmt(r.metrics.avgTAT)}</span>`));
    const g = staticGantt(r.gantt, r.metrics.makespan);
    g.style.width = (r.metrics.makespan / ms) * 100 + '%';
    m.append(g);
    gp.append(m);
  }
  out.append(gp);

  const by = k => runs.filter(r => eq(r.metrics[k], best[k])).map(r => r.algo.short).join(', ');
  const starving = runs.filter(r => r.metrics.starvedCount > 0).map(r => r.algo.short);
  const concl = h('div', { class: 'panel' });
  concl.innerHTML = `<h3>Conclusion for this workload</h3><ul>
    <li>Lowest average <b>waiting time</b>: <b>${by('avgWT')}</b>. Lowest average <b>turnaround</b>: <b>${by('avgTAT')}</b>.</li>
    <li>Best <b>response time</b> (good for interactive users): <b>${by('avgRT')}</b>.</li>
    <li>Fewest <b>context switches</b> (lowest overhead): <b>${by('contextSwitches')}</b>.</li>
    <li>${starving.length ? `Possible <b>starvation</b> with: <b>${starving.join(', ')}</b> (threshold ${opts.starvationThreshold}).` : 'No algorithm caused starvation for this workload.'}</li>
    </ul><div class="callout info">General rule: <b>SRTF</b> minimises average waiting time, <b>Round Robin</b> gives the best fairness &amp; response time, <b>FCFS</b> has the least overhead but suffers from the convoy effect, and <b>Priority</b> scheduling serves important work first but needs <b>aging</b> to avoid starvation.</div>`;
  out.append(concl);

  requestAnimationFrame(() => requestAnimationFrame(() => $$('#compare-out .fill').forEach(e => { e.style.width = e.dataset.w + '%'; })));
}

function openInSimulator(algoId, processes, opts) {
  if (processes) loadProcesses(processes);
  $('#algo-select').value = algoId;
  if (opts) setOpts(opts);
  updateOptionVisibility();
  switchTab('sim');
  prepare();
  setTimeout(() => { play(); $('#stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
}

/* ================================================================
 * LEARN TAB
 * ================================================================ */
function renderLearn() {
  const cards = $('#learn-cards');
  cards.innerHTML = '';
  for (const [id, I] of Object.entries(ALGO_INFO)) {
    const A = ALGORITHMS[id];
    const c = h('div', { class: 'lcard', 'data-algo': id });
    c.innerHTML = `<h4>${I.title}</h4><p>${I.tagline}</p><p class="muted" style="font-size:.8rem">${I.bestFor}</p>
      <div class="badges"><span class="badge ${A.preemptive ? 'pre' : 'np'}">${I.type}</span><span class="badge">${I.ds}</span><span class="badge">Starvation: ${I.starvation.split(' ')[0]}</span></div>`;
    c.onclick = () => showDetail(id);
    cards.append(c);
  }
  $('#learn-table').innerHTML = `<thead><tr><th class="left">Algorithm</th><th>Type</th><th>Data structure</th><th>Selection rule</th><th>Starvation</th><th>Complexity</th><th class="left">Best for</th></tr></thead><tbody>` +
    Object.entries(ALGO_INFO).map(([id, I]) => `<tr><td class="left"><b>${ALGORITHMS[id].name}</b></td><td>${I.type}</td><td>${I.ds}</td><td>${SELECTION_RULE[id]}</td><td>${I.starvation}</td><td>${I.complexity}</td><td class="left">${I.bestFor}</td></tr>`).join('') + '</tbody>';

  // Starvation & aging section
  const S = STARVATION_EXAMPLE;
  const sec = $('#starvation-section');
  const without = simulate(S.processes, S.algo, { aging: false, starvationThreshold: 8 });
  const withA = simulate(S.processes, S.algo, { aging: true, agingInterval: 2, starvationThreshold: 8 });
  const ms = Math.max(without.metrics.makespan, withA.metrics.makespan);
  sec.innerHTML = `<h3>Starvation &amp; Priority Aging</h3>
    <p><b>Starvation</b> (indefinite blocking) happens when a ready process waits for a very long time because the scheduler always prefers other processes —
    low-priority processes in Priority scheduling and long jobs in SJF/SRTF. This simulator flags a process as <i>possibly starving</i> when it waits continuously in the
    Ready queue for at least the <b>starvation threshold</b>.</p>
    <p><b>Aging</b> is the cure: every <i>k</i> time units a waiting process spends in the Ready queue, its priority number is decreased by 1 (its priority increases).
    Eventually even the lowest-priority process becomes the most important one and gets the CPU. Because the keys change, the priority queue is rebuilt with <code>heapify()</code>.</p>
    <p class="muted">${S.note}</p>`;
  const P2 = r => r.results.find(x => x.pid === 'P2');
  for (const [label, r, opts] of [['Without aging', without, { aging: false, starvationThreshold: 8 }], ['With aging (interval 2)', withA, { aging: true, agingInterval: 2, starvationThreshold: 8 }]]) {
    const m = h('div', { class: 'mini-gantt' });
    m.append(h('div', { class: 'title' }, `<b>${label}</b><span class="muted">P2 completes at t=${P2(r).completion}, waits ${P2(r).wt} · starving: ${r.metrics.starvedCount}</span>`));
    const g = staticGantt(r.gantt, r.metrics.makespan);
    g.style.width = (r.metrics.makespan / ms) * 100 + '%';
    m.append(g);
    const b = h('button', { class: 'btn small' }, `▶ Animate ${label.toLowerCase()}`);
    b.onclick = () => openInSimulator(S.algo, S.processes, opts);
    m.append(b);
    sec.append(m);
  }
}

function showDetail(id) {
  const I = ALGO_INFO[id], A = ALGORITHMS[id];
  $$('.lcard').forEach(c => c.classList.toggle('active', c.dataset.algo === id));
  const ex = I.example;
  const r = simulate(ex.processes, id, ex.opts);
  const d = $('#learn-detail');
  d.innerHTML = '';
  const p = h('div', { class: 'panel detail' });
  p.innerHTML = `<h3>${I.title}</h3><p class="muted">${I.tagline}</p>
    <div class="badges"><span class="badge ${A.preemptive ? 'pre' : 'np'}">${I.type}</span><span class="badge">DS: ${I.ds}</span>
      <span class="badge">Starvation: ${I.starvation}</span><span class="badge">${I.complexity}</span></div>
    <h4>Summary</h4><p>${I.summary}</p>
    <div class="key-idea"><b>Key idea:</b> ${I.keyIdea}</div>
    <div class="detail-grid">
      <div><h4>How it works</h4><ol>${I.how.map(s => `<li>${s}</li>`).join('')}</ol>
        <h4>Why this data structure?</h4><p>${I.whyDS}</p></div>
      <div><h4>Pseudocode</h4><pre class="code">${I.pseudocode.replace(/</g, '&lt;')}</pre></div>
    </div>
    <div class="detail-grid">
      <div><h4>Advantages</h4><ul class="pros">${I.pros.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div><h4>Disadvantages</h4><ul class="cons">${I.cons.map(s => `<li>${s}</li>`).join('')}</ul></div>
    </div>
    <h4>Worked example ${ex.opts.quantum ? `<span class="tag">quantum = ${ex.opts.quantum}</span>` : ''}</h4>
    <p class="muted">${ex.note}</p>`;
  const tbl = h('div', { class: 'table-wrap' });
  tbl.innerHTML = `<table class="data-table"><thead><tr><th>PID</th><th>Arrival</th><th>Burst</th>${A.usesPriority ? '<th>Priority</th>' : ''}<th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr></thead><tbody>` +
    r.results.map(x => `<tr><td><b>${x.pid}</b></td><td>${x.arrival}</td><td>${x.burst}</td>${A.usesPriority ? `<td>${x.priority}</td>` : ''}<td>${x.completion}</td><td>${x.tat}</td><td>${x.wt}</td><td>${x.rt}</td></tr>`).join('') +
    `<tr><td colspan="${A.usesPriority ? 5 : 4}" class="left"><b>Average</b></td><td><b>${fmt(r.metrics.avgTAT)}</b></td><td><b>${fmt(r.metrics.avgWT)}</b></td><td><b>${fmt(r.metrics.avgRT)}</b></td></tr></tbody></table>`;
  p.append(tbl);
  const gw = h('div', { class: 'mini-gantt' });
  gw.append(h('div', { class: 'title' }, '<b>Gantt chart</b>'), staticGantt(r.gantt, r.metrics.makespan));
  p.append(gw);
  const btn = h('button', { class: 'btn primary' }, '▶ Animate this example step-by-step in the Simulator');
  btn.onclick = () => openInSimulator(id, ex.processes, { quantum: 2, aging: false, ...ex.opts });
  p.append(btn);
  d.append(p);
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================================================================
 * DSA TAB  (cards + interactive playgrounds)
 * ================================================================ */
function renderDSA() {
  $('#dsa-cards').innerHTML = DS_INFO.map(d => `<div class="dcard"><div class="ic">${d.icon}</div><h4 style="margin-top:.2rem">${d.name}</h4>
    <p><b>Used for:</b> ${d.where}</p><p>${d.text}</p><div class="ops">${d.ops}</div></div>`).join('');
  $('#state-diagram').innerHTML = stateDiagramSVG('big');
  $('#state-list').innerHTML = STATE_INFO.map(s => `<div class="state-item"><b><span class="dot s-${s.state.toLowerCase()}"></span> ${s.state}</b><span>${s.text}</span></div>`).join('');
  $('#formula-table').innerHTML = '<tbody>' + FORMULAS.map(([k, v]) => `<tr><td class="left"><b>${k}</b></td><td class="left"><code>${v}</code></td></tr>`).join('') + '</tbody>';
  initQueuePlayground();
  initHeapPlayground();
}

function playToken(map, item) {
  let t = map.get(item.pid);
  if (!t) { t = h('div', { class: 'token', 'data-flip': 'pg-' + item.pid, style: `--c:${item.color}` }, `<b>${item.pid}</b><small></small>`); map.set(item.pid, t); }
  t.querySelector('small').textContent = item.key != null ? `key ${item.key}` : '';
  return t;
}
function logTo(sel, lines) {
  const box = $(sel);
  lines.forEach(l => box.prepend(h('div', {}, l)));
  while (box.children.length > 40) box.lastChild.remove();
}

function initQueuePlayground() {
  const q = new Queue();
  const tokens = new Map();
  let n = 1;
  const render = () => flip($('#q-play'), () => renderQueue($('#q-play'), q.toArray(), it => playToken(tokens, it)), 500);
  $('#pq-enq').onclick = () => {
    if (q.size() >= 10) return;
    q.enqueue({ pid: 'P' + n, color: PALETTE[(n - 1) % PALETTE.length] });
    n++; $('#q-next').textContent = n;
    render(); logTo('#q-log', q.drainOps());
  };
  for (let i = 0; i < 3; i++) { q.enqueue({ pid: 'P' + n, color: PALETTE[(n - 1) % PALETTE.length] }); n++; }
  $('#q-next').textContent = n; q.drainOps();
  $('#pq-deq').onclick = () => {
    const x = q.dequeue();
    if (x) { tokens.delete(x.pid); logTo('#q-log', q.drainOps().map(s => s + ' → gets the CPU')); } else logTo('#q-log', ['dequeue() → queue is empty']);
    render();
  };
  $('#pq-rot').onclick = () => {
    if (q.isEmpty()) return;
    const x = q.dequeue(); q.enqueue(x);
    logTo('#q-log', [...q.drainOps(), `${x.pid} used its quantum and went to the REAR`]);
    render();
  };
  render();
  $('#q-play').addEventListener('refresh', () => render());
}

function initHeapPlayground() {
  let seq = 0;
  const heap = new MinHeap((a, b) => a.key - b.key || a.seq - b.seq, x => `${x.pid}:${x.key}`);
  const tokens = new Map();
  let busy = false;
  const draw = arr => {
    flip($('#h-play'), () => renderHeap($('#h-play'), arr, it => playToken(tokens, it)), 420);
    $('#h-arr').innerHTML = arr.length ? '<span class="lbl">Array:</span>' + arr.map((x, i) => `<span class="cell"><i>[${i}]</i>${x.pid}·${x.key}</span>`).join('') : '';
  };
  // play every intermediate array state so students see each sift-up / sift-down swap
  const animateTrace = (trace, done) => {
    busy = true;
    let i = 0;
    const step = () => {
      if (i < trace.length) { draw(trace[i++]); setTimeout(step, 520); } else { draw(heap.toArray()); busy = false; if (done) done(); }
    };
    step();
  };
  const insert = key => {
    if (busy || heap.size() >= 15) return;
    seq++;
    heap.trace = [];
    heap.push({ pid: 'J' + seq, key, seq, color: PALETTE[(seq - 1) % PALETTE.length] });
    const tr = heap.trace; heap.trace = null;
    logTo('#h-log', heap.drainOps());
    animateTrace(tr);
  };
  $('#h-ins').onclick = () => insert(clampInt($('#h-val').value, 0, 99, 5));
  $('#h-rand').onclick = () => insert(Math.floor(Math.random() * 20));
  $('#h-ext').onclick = () => {
    if (busy) return;
    if (heap.isEmpty()) { logTo('#h-log', ['extractMin() → heap is empty']); return; }
    heap.trace = [];
    const x = heap.pop();
    const tr = heap.trace; heap.trace = null;
    tokens.delete(x.pid);
    logTo('#h-log', [...heap.drainOps(), `→ ${x.pid} (key ${x.key}) is dispatched to the CPU`]);
    animateTrace(tr);
  };
  [7, 3, 9, 1, 5].forEach(k => { seq++; heap.push({ pid: 'J' + seq, key: k, seq, color: PALETTE[(seq - 1) % PALETTE.length] }); });
  heap.drainOps();
  draw(heap.toArray());
  $('#h-play').addEventListener('refresh', () => { if (!busy) draw(heap.toArray()); });
}

/* ================================================================
 * AUTHENTICATION UI
 * ================================================================ */
function initAuthUI() {
  const bar = $('#user-auth-bar');
  if (!bar) return;

  function renderAuthBar() {
    const user = Auth.getCurrentUser();
    bar.innerHTML = '';

    const adminNav = $('#nav-admin-btn');
    if (adminNav) adminNav.classList.toggle('hidden', !Auth.isAdmin());

    if (user && Auth.isAuthenticated()) {
      const initial = (user.name || user.username || 'U').charAt(0).toUpperCase();
      const pill = document.createElement('div');
      pill.className = 'user-badge-pill';
      pill.title = 'Open Dashboard & Profile';
      pill.innerHTML = `
        <span class="mini-avatar" style="background: ${user.avatarColor || 'var(--accent)'};">${initial}</span>
        <span>${user.name || user.username}</span>
        <span class="badge-role">${user.role}</span>
      `;
      pill.onclick = () => switchTab('dashboard');

      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'btn-nav-logout';
      logoutBtn.textContent = 'Sign Out';
      logoutBtn.onclick = async () => {
        await Auth.logout();
        renderAuthBar();
        if (window.Platform) window.Platform.onAuthChanged();
      };

      bar.appendChild(pill);
      bar.appendChild(logoutBtn);
    } else {
      bar.innerHTML = `
        <a href="login.html" class="btn-nav-login" title="Sign in or create an account">
          <span>Sign In / Register</span>
        </a>
      `;
    }
  }

  renderAuthBar();
  Auth.refreshProfile().then(() => {
    renderAuthBar();
    if (window.Platform) window.Platform.onAuthChanged();
  });
}

/* ================================================================
 * TABS & INIT
 * ================================================================ */
function switchTab(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  const sidebar = $('#app-sidebar');
  if (sidebar) sidebar.classList.remove('open');
  if (name === 'compare') {
    runCompare();
    if (window.Platform) window.Platform.renderCompareCharts();
  }
  if (name === 'dashboard' && window.Platform) window.Platform.loadDashboard();
  if (name === 'admin' && window.Platform) window.Platform.loadAdmin();
  if (name === 'sim' && player.sim) { ganttReset(); renderFrame(false); }
  if (name === 'dsa') { $('#h-play').dispatchEvent(new Event('refresh')); $('#q-play').dispatchEvent(new Event('refresh')); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function init() {
  $$('#tabs button').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });
  $('#btn-compare').onclick = () => {
    runCompare();
    if (window.Platform) window.Platform.renderCompareCharts();
  };
  $('#compare-out').addEventListener('click', e => {
    const b = e.target.closest('[data-animate]');
    if (b) openInSimulator(b.dataset.animate);
  });
  initProcessInput();
  initSettings();
  initControls();
  renderLearn();
  renderDSA();
  loadProcesses(SAMPLE);
  initAuthUI();
}

document.addEventListener('DOMContentLoaded', init);
