/* =========================================================================
 * algorithms.js — Discrete-time (1 unit per tick) scheduling engine.
 * Supports 10 algorithms: FCFS, SJF, SRTF, PRIORITY_NP, PRIORITY_P, RR,
 * HRRN, MLQ, MLFQ, and LOTTERY.
 * simulate() returns a list of frames; each frame is a full snapshot of the
 * system at the decision point of time t (what runs during [t, t+1)).
 * ========================================================================= */
if (typeof module !== 'undefined' && typeof Queue === 'undefined') {
  // eslint-disable-next-line no-global-assign
  ({ ProcessArray, LinkedList, Queue, MinHeap, PriorityQueue } = require('./ds.js'));
}

const ALGORITHMS = {
  FCFS: {
    id: 'FCFS', name: 'First Come First Serve', short: 'FCFS', preemptive: false,
    ds: 'queue', dsName: 'Queue (FIFO)', keyLabel: null, key: null,
  },
  SJF: {
    id: 'SJF', name: 'Shortest Job First', short: 'SJF', preemptive: false,
    ds: 'heap', dsName: 'Min-Heap (key = Burst Time)', keyLabel: 'BT', key: p => p.burst,
  },
  SRTF: {
    id: 'SRTF', name: 'Shortest Remaining Time First', short: 'SRTF', preemptive: true,
    ds: 'heap', dsName: 'Min-Heap (key = Remaining Time)', keyLabel: 'Rem', key: p => p.remaining,
  },
  PRIORITY_NP: {
    id: 'PRIORITY_NP', name: 'Priority (Non-Preemptive)', short: 'Priority-NP', preemptive: false,
    ds: 'pq', dsName: 'Priority Queue (key = Priority)', keyLabel: 'Pri', key: p => p.effPriority, usesPriority: true,
  },
  PRIORITY_P: {
    id: 'PRIORITY_P', name: 'Priority (Preemptive)', short: 'Priority-P', preemptive: true,
    ds: 'pq', dsName: 'Priority Queue (key = Priority)', keyLabel: 'Pri', key: p => p.effPriority, usesPriority: true,
  },
  RR: {
    id: 'RR', name: 'Round Robin', short: 'RR', preemptive: true,
    ds: 'queue', dsName: 'Circular Queue (FIFO + time quantum)', keyLabel: null, key: null, usesQuantum: true,
  },
  HRRN: {
    id: 'HRRN', name: 'Highest Response Ratio Next', short: 'HRRN', preemptive: false,
    ds: 'queue', dsName: 'Dynamic Array / Queue (key = Response Ratio)', keyLabel: 'RR',
    key: p => Number(((p.curWait + p.burst) / p.burst).toFixed(2)),
  },
  MLQ: {
    id: 'MLQ', name: 'Multilevel Queue', short: 'MLQ', preemptive: true,
    ds: 'queue', dsName: '3-Level Priority Queues (Q0:RR, Q1:RR2, Q2:FCFS)', keyLabel: 'Q',
    key: p => p.queueLevel, usesPriority: true, usesQuantum: true,
  },
  MLFQ: {
    id: 'MLFQ', name: 'Multilevel Feedback Queue', short: 'MLFQ', preemptive: true,
    ds: 'queue', dsName: '3-Level Feedback Queues (demotion + optional aging)', keyLabel: 'Q',
    key: p => p.queueLevel, usesQuantum: true, supportsAging: true,
  },
  LOTTERY: {
    id: 'LOTTERY', name: 'Lottery Scheduling', short: 'Lottery', preemptive: true,
    ds: 'queue', dsName: 'Ticket Pool (proportional-share)', keyLabel: 'Tkt',
    key: p => p.tickets, usesPriority: true, usesQuantum: true,
  },
};

const DEFAULT_OPTIONS = { quantum: 2, aging: false, agingInterval: 4, starvationThreshold: 10, seed: 42 };

function hasIO(p) { return p.ioTime > 0 && p.ioAt > 0 && p.ioAt < p.burst; }

function createSeededRng(seed = 42) {
  let state = (seed >>> 0) || 1;
  return (limit) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return limit > 0 ? state % limit : 0;
  };
}

function simulate(input, algoId, userOpts = {}) {
  const A = ALGORITHMS[algoId];
  if (!A) throw new Error('Unknown algorithm ' + algoId);
  const opts = { ...DEFAULT_OPTIONS, ...userOpts };
  const useAging = !!(opts.aging && (A.usesPriority || A.supportsAging));
  const rng = createSeededRng(opts.seed);

  // Array of runtime process records (the "process table")
  const table = new ProcessArray(input.map((p, idx) => ({
    pid: p.pid, color: p.color, idx,
    arrival: p.arrival, burst: p.burst, priority: p.priority,
    ioAt: p.ioAt || 0, ioTime: p.ioTime || 0,
    remaining: p.burst, executed: 0, effPriority: p.priority, ageCounter: 0,
    state: 'New', start: null, completion: null,
    ioPending: hasIO(p), ioReturn: null,
    curWait: 0, maxWait: 0, starved: false, starvedAt: null,
    queueLevel: algoId === 'MLFQ' ? 0 : (p.priority <= 1 ? 0 : (p.priority <= 3 ? 1 : 2)),
    tickets: Math.max(1, 10 - (p.priority ?? 1)),
  })));
  const procs = table.toArray();
  const n = procs.length;
  const byArrival = procs.slice().sort((a, b) => a.arrival - b.arrival || a.idx - b.idx);

  const describe = p => A.key ? `${p.pid}(${A.keyLabel}=${A.key(p)})` : p.pid;
  const isMultiQueue = algoId === 'MLQ' || algoId === 'MLFQ';

  let ready = null;
  let queues = null;
  if (isMultiQueue) {
    queues = [new Queue('Q0'), new Queue('Q1'), new Queue('Q2')];
  } else if (A.ds === 'queue') {
    ready = new Queue();
  } else if (A.ds === 'pq') {
    ready = new PriorityQueue(A.key, describe);
  } else {
    ready = new MinHeap((a, b) => (A.key(a) - A.key(b)) || (a.arrival - b.arrival) || (a.idx - b.idx), describe);
  }

  const frames = [];
  const gantt = [];
  let pending = [];
  let t = 0, current = null, qUsed = 0, done = 0;
  const LIMIT = 5000;

  const readyArray = () => {
    if (isMultiQueue) return [...queues[0].toArray(), ...queues[1].toArray(), ...queues[2].toArray()];
    return ready.toArray();
  };
  const readyEmpty = () => (isMultiQueue ? queues.every(q => q.isEmpty()) : ready.isEmpty());
  const drainAllOps = () => {
    if (!isMultiQueue) return ready.drainOps();
    const out = [];
    queues.forEach((q, idx) => q.drainOps().forEach(op => out.push(`Q${idx}: ${op}`)));
    return out;
  };

  const toReady = (p, events, kind, text) => {
    p.state = 'Ready'; p.curWait = 0;
    if (isMultiQueue) queues[p.queueLevel].enqueue(p);
    else if (ready.push) ready.push(p);
    else ready.enqueue(p);
    events.push({ type: kind, pid: p.pid, text });
  };

  const removeFromQueue = (q, target) => {
    const items = q.toArray();
    while (!q.isEmpty()) q.dequeue();
    for (const item of items) if (item !== target) q.enqueue(item);
    q.drainOps(); // avoid noisy rebuild logs
  };

  const takeReady = () => {
    if (isMultiQueue) {
      for (let lvl = 0; lvl < 3; lvl++) if (!queues[lvl].isEmpty()) return queues[lvl].dequeue();
      return null;
    }
    if (algoId === 'HRRN') {
      const items = ready.toArray();
      let best = items[0];
      let bestRatio = (best.curWait + best.burst) / best.burst;
      for (let i = 1; i < items.length; i++) {
        const ratio = (items[i].curWait + items[i].burst) / items[i].burst;
        if (ratio > bestRatio || (Math.abs(ratio - bestRatio) < 1e-9 && (items[i].arrival < best.arrival || (items[i].arrival === best.arrival && items[i].idx < best.idx)))) {
          best = items[i];
          bestRatio = ratio;
        }
      }
      removeFromQueue(ready, best);
      ready.ops.push(`selectHRRN() → ${best.pid} (RR=${bestRatio.toFixed(2)})`);
      return best;
    }
    if (algoId === 'LOTTERY') {
      const items = ready.toArray();
      const totalTickets = items.reduce((s, p) => s + p.tickets, 0);
      const win = rng(totalTickets);
      let acc = 0, chosen = items[0];
      for (const p of items) {
        acc += p.tickets;
        if (win < acc) { chosen = p; break; }
      }
      removeFromQueue(ready, chosen);
      ready.ops.push(`drawTicket(${win}/${totalTickets}) → ${chosen.pid} (${chosen.tickets} tickets)`);
      return chosen;
    }
    return ready.pop ? ready.pop() : ready.dequeue();
  };

  const snapshot = (events) => ({
    t,
    running: current ? current.pid : null,
    ready: readyArray().map(p => ({ pid: p.pid, key: A.key ? A.key(p) : null })),
    procs: procs.map(p => ({
      pid: p.pid, state: p.state, remaining: p.remaining, executed: p.executed,
      effPriority: p.effPriority, curWait: p.curWait, starved: p.starved,
      ioReturn: p.ioReturn, completion: p.completion, start: p.start,
    })),
    qUsed,
    events,
    dsOps: drainAllOps(),
    gantt: gantt.map(b => ({ ...b })),
  });

  for (;;) {
    const events = pending; pending = [];

    // 1. New arrivals: New -> Ready
    for (const p of byArrival) {
      if (p.arrival === t) {
        const extra = algoId === 'LOTTERY' ? `, Tickets=${p.tickets}` : (A.usesPriority ? `, Priority=${p.priority}` : '');
        toReady(p, events, 'arrive', `${p.pid} arrives (BT=${p.burst}${extra}) → New → Ready queue`);
      }
    }
    // 2. I/O completion: Waiting -> Ready
    for (const p of procs) {
      if (p.state === 'Waiting' && p.ioReturn === t) toReady(p, events, 'ioreturn', `${p.pid} finished I/O → Waiting → Ready queue`);
    }
    // 3. Time-quantum expiry (RR / LOTTERY / MLQ / MLFQ)
    if (current && (algoId === 'RR' || algoId === 'LOTTERY') && qUsed >= opts.quantum) {
      if (!readyEmpty()) {
        const p = current; current = null;
        toReady(p, events, 'quantum', `Time quantum (${opts.quantum}) of ${p.pid} expired → moved back to Ready queue (remaining ${p.remaining})`);
      } else {
        events.push({ type: 'info', pid: current.pid, text: `Quantum of ${current.pid} expired, Ready queue empty → ${current.pid} continues` });
        qUsed = 0;
      }
    }
    if (current && isMultiQueue) {
      const lvl = current.queueLevel;
      const lvlQ = lvl === 0 ? opts.quantum : (lvl === 1 ? opts.quantum * 2 : null);
      const higherWaiting = queues.slice(0, lvl).some(q => !q.isEmpty());
      if (higherWaiting) {
        const p = current; current = null;
        toReady(p, events, 'preempt', `Higher-priority queue non-empty → ${p.pid} (Q${lvl}) preempted back to Q${lvl}`);
      } else if (lvlQ !== null && qUsed >= lvlQ) {
        if (!queues[lvl].isEmpty()) {
          const p = current; current = null;
          if (algoId === 'MLFQ' && p.queueLevel < 2) p.queueLevel++;
          toReady(p, events, 'quantum', `Q${lvl} quantum (${lvlQ}) expired for ${p.pid} → moved to Q${p.queueLevel}`);
        } else {
          qUsed = 0;
        }
      }
    }
    // 4. Preemption check (SRTF / Preemptive Priority)
    if (current && A.preemptive && A.ds !== 'queue' && !readyEmpty()) {
      const top = ready.peek();
      if (A.key(top) < A.key(current)) {
        const p = current; current = null;
        const why = A.id === 'SRTF'
          ? `remaining ${top.remaining} < ${p.remaining}`
          : `priority ${top.effPriority} is higher than ${p.effPriority}`;
        toReady(p, events, 'preempt', `${top.pid} preempts ${p.pid} (${why}) → ${p.pid} goes back to Ready`);
      }
    }
    // 5. All done?
    if (done === n) {
      events.push({ type: 'end', text: `All processes terminated at t=${t}. Simulation complete.` });
      frames.push(snapshot(events));
      break;
    }
    // 6. Dispatch
    if (!current && !readyEmpty()) {
      current = takeReady();
      current.state = 'Running'; qUsed = 0;
      let txt = `Dispatcher selects ${current.pid}`;
      if (A.id === 'FCFS' || A.id === 'RR') txt += ' (front of the queue)';
      else if (A.id === 'SJF') txt += ` (shortest burst = ${current.burst})`;
      else if (A.id === 'SRTF') txt += ` (shortest remaining = ${current.remaining})`;
      else if (A.id === 'HRRN') txt += ` (highest response ratio = ${((current.curWait + current.burst) / current.burst).toFixed(2)})`;
      else if (A.id === 'MLQ' || A.id === 'MLFQ') txt += ` (from Queue Q${current.queueLevel})`;
      else if (A.id === 'LOTTERY') txt += ` (winning lottery ticket holder, ${current.tickets} tickets)`;
      else txt += ` (highest priority = ${current.effPriority})`;
      txt += ' → Running';
      if (current.start === null) { current.start = t; txt += ` · first response at t=${t}`; }
      events.push({ type: 'dispatch', pid: current.pid, text: txt });
    }
    if (!current) events.push({ type: 'idle', text: 'Ready queue is empty → CPU is IDLE' });

    // Gantt chart (merge consecutive units of the same process)
    const gpid = current ? current.pid : null;
    const last = gantt[gantt.length - 1];
    if (last && last.pid === gpid) last.end = t + 1;
    else gantt.push({ pid: gpid, start: t, end: t + 1 });

    frames.push(snapshot(events));

    // 7. Execute one time unit
    if (current) { current.remaining--; current.executed++; qUsed++; }

    // 8. Waiting statistics, starvation detection & aging for processes in Ready
    let changed = false;
    for (const p of readyArray()) {
      p.curWait++;
      if (p.curWait > p.maxWait) p.maxWait = p.curWait;
      if (!p.starved && p.curWait >= opts.starvationThreshold) {
        p.starved = true; p.starvedAt = t + 1;
        pending.push({ type: 'starve', pid: p.pid, text: `⚠ Possible STARVATION: ${p.pid} has waited ${p.curWait} units continuously in the Ready queue` });
      }
      if (useAging) {
        if (A.usesPriority && (A.id === 'PRIORITY_NP' || A.id === 'PRIORITY_P')) {
          p.ageCounter++;
          if (p.ageCounter >= opts.agingInterval) {
            p.ageCounter = 0;
            if (p.effPriority > 0) {
              p.effPriority--; changed = true;
              pending.push({ type: 'aging', pid: p.pid, text: `Aging: ${p.pid} waited ${opts.agingInterval} units → priority ${p.effPriority + 1} → ${p.effPriority}` });
            }
          }
        } else if (A.id === 'MLFQ' && p.queueLevel > 0) {
          p.ageCounter++;
          if (p.ageCounter >= opts.agingInterval) {
            p.ageCounter = 0;
            const oldLvl = p.queueLevel;
            removeFromQueue(queues[oldLvl], p);
            p.queueLevel = 0;
            queues[0].enqueue(p);
            pending.push({ type: 'aging', pid: p.pid, text: `MLFQ Boost: ${p.pid} waited ${opts.agingInterval} units in Q${oldLvl} → boosted to Q0` });
          }
        }
      }
    }
    if (changed && ready && ready.heapify) ready.heapify();

    t++;

    // 9. Completion / I/O request at end of the tick
    if (current) {
      if (current.remaining === 0) {
        current.state = 'Terminated'; current.completion = t; done++;
        pending.push({ type: 'complete', pid: current.pid, text: `${current.pid} completed at t=${t} → Terminated` });
        current = null;
      } else if (current.ioPending && current.executed === current.ioAt) {
        current.ioPending = false; current.state = 'Waiting'; current.ioReturn = t + current.ioTime;
        pending.push({ type: 'io', pid: current.pid, text: `${current.pid} requests I/O for ${current.ioTime} units → Running → Waiting (back at t=${current.ioReturn})` });
        current = null;
      }
    }
    if (t > LIMIT) throw new Error('Simulation exceeded time limit');
  }

  // ---------- Results ----------
  const results = procs.map(p => {
    const tat = p.completion - p.arrival;
    return {
      pid: p.pid, color: p.color, arrival: p.arrival, burst: p.burst, priority: p.priority,
      finalPriority: p.effPriority, ioTime: hasIO(p) ? p.ioTime : 0,
      start: p.start, completion: p.completion, tat,
      wt: tat - p.burst - (hasIO(p) ? p.ioTime : 0),
      rt: p.start - p.arrival, maxWait: p.maxWait, starved: p.starved,
    };
  });
  const avg = k => results.reduce((s, r) => s + r[k], 0) / (n || 1);
  const minArrival = Math.min(...procs.map(p => p.arrival));
  const makespan = Math.max(...procs.map(p => p.completion));
  const busy = gantt.filter(b => b.pid !== null).reduce((s, b) => s + b.end - b.start, 0);
  const span = makespan - minArrival;
  const runBlocks = gantt.filter(b => b.pid !== null);
  let contextSwitches = 0;
  for (let i = 1; i < runBlocks.length; i++) if (runBlocks[i].pid !== runBlocks[i - 1].pid) contextSwitches++;

  const metrics = {
    avgWT: avg('wt'), avgTAT: avg('tat'), avgRT: avg('rt'),
    cpuUtil: span > 0 ? (busy / span) * 100 : 100,
    throughput: span > 0 ? n / span : n,
    makespan, busy, idle: span - busy, contextSwitches,
    starvedCount: results.filter(r => r.starved).length,
    maxWait: Math.max(...results.map(r => r.maxWait)),
  };

  return { algo: A, opts, frames, gantt, results, metrics };
}

if (typeof module !== 'undefined') module.exports = { ALGORITHMS, DEFAULT_OPTIONS, simulate, hasIO };
