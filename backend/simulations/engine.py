"""
Python reference implementation of all 10 CPU scheduling algorithms.
Mirrors js/algorithms.js for backend validation, analytics, and unit testing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


ALGORITHMS = {
    'FCFS': {'id': 'FCFS', 'name': 'First Come First Serve', 'preemptive': False},
    'SJF': {'id': 'SJF', 'name': 'Shortest Job First', 'preemptive': False},
    'SRTF': {'id': 'SRTF', 'name': 'Shortest Remaining Time First', 'preemptive': True},
    'PRIORITY_NP': {'id': 'PRIORITY_NP', 'name': 'Priority (Non-Preemptive)', 'preemptive': False, 'uses_priority': True},
    'PRIORITY_P': {'id': 'PRIORITY_P', 'name': 'Priority (Preemptive)', 'preemptive': True, 'uses_priority': True},
    'RR': {'id': 'RR', 'name': 'Round Robin', 'preemptive': True},
    'HRRN': {'id': 'HRRN', 'name': 'Highest Response Ratio Next', 'preemptive': False},
    'MLQ': {'id': 'MLQ', 'name': 'Multilevel Queue', 'preemptive': True, 'uses_priority': True},
    'MLFQ': {'id': 'MLFQ', 'name': 'Multilevel Feedback Queue', 'preemptive': True},
    'LOTTERY': {'id': 'LOTTERY', 'name': 'Lottery Scheduling', 'preemptive': True, 'uses_priority': True},
}


def _has_io(p: dict[str, Any]) -> bool:
    io_time = int(p.get('ioTime', p.get('io_time', 0)) or 0)
    io_at = int(p.get('ioAt', p.get('io_at', 0)) or 0)
    burst = int(p.get('burst', p.get('burst_time', 0)) or 0)
    return io_time > 0 and 0 < io_at < burst


def _seeded_rng(seed: int):
    state = seed & 0xFFFFFFFF

    def next_int(limit: int) -> int:
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state % limit if limit > 0 else 0

    return next_int


@dataclass
class _Proc:
    pid: str
    idx: int
    arrival: int
    burst: int
    priority: int
    io_at: int
    io_time: int
    color: str
    remaining: int
    executed: int = 0
    eff_priority: int = 0
    age_counter: int = 0
    state: str = 'New'
    start: int | None = None
    completion: int | None = None
    io_pending: bool = False
    io_return: int | None = None
    cur_wait: int = 0
    max_wait: int = 0
    starved: bool = False
    queue_level: int = 0
    tickets: int = 1


def simulate(processes: list[dict[str, Any]], algo_id: str, opts: dict[str, Any] | None = None) -> dict[str, Any]:
    if algo_id not in ALGORITHMS:
        raise ValueError(f'Unknown algorithm: {algo_id}')
    if not processes:
        raise ValueError('At least one process is required')

    opts = {
        'quantum': 2,
        'aging': False,
        'agingInterval': 4,
        'starvationThreshold': 10,
        'seed': 42,
        **(opts or {}),
    }
    quantum = max(1, int(opts['quantum']))
    aging = bool(opts['aging'])
    aging_interval = max(1, int(opts['agingInterval']))
    starve_th = max(1, int(opts['starvationThreshold']))
    rng = _seeded_rng(int(opts['seed']))

    procs: list[_Proc] = []
    for idx, raw in enumerate(processes):
        burst = int(raw.get('burst', raw.get('burst_time')))
        arrival = int(raw.get('arrival', raw.get('arrival_time', 0)))
        priority = int(raw.get('priority', 1))
        io_at = int(raw.get('ioAt', raw.get('io_at', 0)) or 0)
        io_time = int(raw.get('ioTime', raw.get('io_time', 0)) or 0)
        if burst < 1:
            raise ValueError('Burst time must be >= 1')
        if arrival < 0:
            raise ValueError('Arrival time must be >= 0')
        procs.append(_Proc(
            pid=str(raw.get('pid', f'P{idx + 1}')),
            idx=idx,
            arrival=arrival,
            burst=burst,
            priority=priority,
            io_at=io_at,
            io_time=io_time,
            color=str(raw.get('color', '#6c8cff')),
            remaining=burst,
            eff_priority=priority,
            io_pending=_has_io(raw),
            queue_level=0 if algo_id == 'MLFQ' else (0 if priority <= 1 else (1 if priority <= 3 else 2)),
            tickets=max(1, 10 - priority),
        ))

    n = len(procs)
    by_arrival = sorted(procs, key=lambda p: (p.arrival, p.idx))
    ready: list[_Proc] = []
    queues: list[list[_Proc]] = [[], [], []]
    gantt: list[dict[str, Any]] = []
    t = 0
    current: _Proc | None = None
    q_used = 0
    done = 0

    def to_ready(p: _Proc):
        p.state = 'Ready'
        p.cur_wait = 0
        if algo_id in ('MLQ', 'MLFQ'):
            queues[p.queue_level].append(p)
        else:
            ready.append(p)

    def all_ready() -> list[_Proc]:
        if algo_id in ('MLQ', 'MLFQ'):
            return queues[0] + queues[1] + queues[2]
        return ready

    while t <= 5000:
        # 1. Arrivals
        for p in by_arrival:
            if p.arrival == t:
                to_ready(p)

        # 2. I/O returns
        for p in procs:
            if p.state == 'Waiting' and p.io_return == t:
                to_ready(p)

        # 3. Quantum expiry for RR, LOTTERY, MLQ, MLFQ
        if current and algo_id == 'RR' and q_used >= quantum:
            if ready:
                p = current
                current = None
                to_ready(p)
            else:
                q_used = 0

        if current and algo_id == 'LOTTERY' and q_used >= quantum:
            if ready:
                p = current
                current = None
                to_ready(p)
            else:
                q_used = 0

        if current and algo_id == 'MLQ':
            lvl = current.queue_level
            lvl_q = quantum if lvl == 0 else (quantum * 2 if lvl == 1 else None)
            higher_non_empty = any(queues[i] for i in range(lvl))
            if higher_non_empty:
                p = current
                current = None
                to_ready(p)
            elif lvl_q is not None and q_used >= lvl_q:
                if queues[lvl]:
                    p = current
                    current = None
                    to_ready(p)
                else:
                    q_used = 0

        if current and algo_id == 'MLFQ':
            lvl = current.queue_level
            lvl_q = quantum if lvl == 0 else (quantum * 2 if lvl == 1 else None)
            higher_non_empty = any(queues[i] for i in range(lvl))
            if higher_non_empty:
                p = current
                current = None
                to_ready(p)
            elif lvl_q is not None and q_used >= lvl_q:
                p = current
                current = None
                if p.queue_level < 2:
                    p.queue_level += 1
                to_ready(p)

        # 4. Preemption for SRTF / PRIORITY_P
        if current and algo_id == 'SRTF' and ready:
            best = min(ready, key=lambda p: (p.remaining, p.arrival, p.idx))
            if best.remaining < current.remaining:
                p = current
                current = None
                to_ready(p)

        if current and algo_id == 'PRIORITY_P' and ready:
            best = min(ready, key=lambda p: (p.eff_priority, p.arrival, p.idx))
            if best.eff_priority < current.eff_priority:
                p = current
                current = None
                to_ready(p)

        # 5. Done?
        if done == n:
            break

        # 6. Dispatch
        if current is None:
            if algo_id in ('MLQ', 'MLFQ'):
                for lvl in range(3):
                    if queues[lvl]:
                        current = queues[lvl].pop(0)
                        break
            elif ready:
                if algo_id in ('FCFS', 'RR'):
                    current = ready.pop(0)
                elif algo_id == 'SJF':
                    best = min(ready, key=lambda p: (p.burst, p.arrival, p.idx))
                    ready.remove(best)
                    current = best
                elif algo_id == 'SRTF':
                    best = min(ready, key=lambda p: (p.remaining, p.arrival, p.idx))
                    ready.remove(best)
                    current = best
                elif algo_id in ('PRIORITY_NP', 'PRIORITY_P'):
                    best = min(ready, key=lambda p: (p.eff_priority, p.arrival, p.idx))
                    ready.remove(best)
                    current = best
                elif algo_id == 'HRRN':
                    best = max(ready, key=lambda p: ((p.cur_wait + p.burst) / p.burst, -p.arrival, -p.idx))
                    ready.remove(best)
                    current = best
                elif algo_id == 'LOTTERY':
                    total_tickets = sum(p.tickets for p in ready)
                    winning = rng(total_tickets)
                    acc = 0
                    chosen = ready[0]
                    for p in ready:
                        acc += p.tickets
                        if winning < acc:
                            chosen = p
                            break
                    ready.remove(chosen)
                    current = chosen
            if current is not None:
                current.state = 'Running'
                q_used = 0
                if current.start is None:
                    current.start = t

        gpid = current.pid if current else None
        if gantt and gantt[-1]['pid'] == gpid:
            gantt[-1]['end'] = t + 1
        else:
            gantt.append({'pid': gpid, 'start': t, 'end': t + 1})

        # 7. Execute 1 tick
        if current:
            current.remaining -= 1
            current.executed += 1
            q_used += 1

        # 8. Wait stats, starvation & aging
        for p in list(all_ready()):
            p.cur_wait += 1
            if p.cur_wait > p.max_wait:
                p.max_wait = p.cur_wait
            if not p.starved and p.cur_wait >= starve_th:
                p.starved = True
            if aging:
                if algo_id in ('PRIORITY_NP', 'PRIORITY_P'):
                    p.age_counter += 1
                    if p.age_counter >= aging_interval:
                        p.age_counter = 0
                        if p.eff_priority > 0:
                            p.eff_priority -= 1
                elif algo_id == 'MLFQ' and p.queue_level > 0:
                    p.age_counter += 1
                    if p.age_counter >= aging_interval:
                        p.age_counter = 0
                        queues[p.queue_level].remove(p)
                        p.queue_level = 0
                        queues[0].append(p)

        t += 1

        # 9. Completion / I/O
        if current:
            if current.remaining == 0:
                current.state = 'Terminated'
                current.completion = t
                done += 1
                current = None
            elif current.io_pending and current.executed == current.io_at:
                current.io_pending = False
                current.state = 'Waiting'
                current.io_return = t + current.io_time
                current = None

    results = []
    for p in procs:
        tat = p.completion - p.arrival
        io_t = p.io_time if _has_io({'ioTime': p.io_time, 'ioAt': p.io_at, 'burst': p.burst}) else 0
        results.append({
            'pid': p.pid,
            'color': p.color,
            'arrival': p.arrival,
            'burst': p.burst,
            'priority': p.priority,
            'finalPriority': p.eff_priority,
            'ioTime': io_t,
            'start': p.start,
            'completion': p.completion,
            'tat': tat,
            'wt': tat - p.burst - io_t,
            'rt': p.start - p.arrival,
            'maxWait': p.max_wait,
            'starved': p.starved,
        })

    min_arrival = min(p.arrival for p in procs)
    makespan = max(p.completion for p in procs)
    busy = sum(b['end'] - b['start'] for b in gantt if b['pid'] is not None)
    span = makespan - min_arrival
    run_blocks = [b for b in gantt if b['pid'] is not None]
    ctx_switches = sum(1 for i in range(1, len(run_blocks)) if run_blocks[i]['pid'] != run_blocks[i - 1]['pid'])

    metrics = {
        'avgWT': sum(r['wt'] for r in results) / n,
        'avgTAT': sum(r['tat'] for r in results) / n,
        'avgRT': sum(r['rt'] for r in results) / n,
        'cpuUtil': (busy / span) * 100 if span > 0 else 100.0,
        'throughput': n / span if span > 0 else float(n),
        'makespan': makespan,
        'busy': busy,
        'idle': span - busy,
        'contextSwitches': ctx_switches,
        'starvedCount': sum(1 for r in results if r['starved']),
        'maxWait': max(r['maxWait'] for r in results),
    }

    return {'algo': ALGORITHMS[algo_id], 'opts': opts, 'gantt': gantt, 'results': results, 'metrics': metrics}
