/* =========================================================================
 * info.js — Learning content: summaries, detailed explanations, pseudocode
 * and ready-made examples for every algorithm and data structure.
 * ========================================================================= */
const P = (pid, arrival, burst, priority = 1, ioAt = 0, ioTime = 0) => ({ pid, arrival, burst, priority, ioAt, ioTime });

const ALGO_INFO = {
  FCFS: {
    title: 'First Come First Serve (FCFS)',
    tagline: 'Whoever arrives first is served first — like a line at a ticket counter.',
    type: 'Non-preemptive', ds: 'Queue (FIFO)', starvation: 'No', complexity: 'O(1) per enqueue / dequeue',
    bestFor: 'Batch systems where simplicity matters more than response time.',
    summary: 'FCFS is the simplest CPU scheduling algorithm. Processes are put in the Ready Queue in the order they arrive and the CPU always picks the process at the FRONT of the queue. Once a process gets the CPU it keeps it until it finishes (or blocks for I/O).',
    how: [
      'When a process arrives, it is ENQUEUED at the REAR of the Ready Queue.',
      'When the CPU becomes free, the dispatcher DEQUEUES the process at the FRONT.',
      'The process runs until its burst finishes — it is never interrupted (non-preemptive).',
      'Repeat until the queue is empty and all processes have terminated.',
    ],
    whyDS: 'A Queue gives O(1) insertion at the rear and O(1) removal from the front, which is exactly the "first in, first out" order FCFS needs.',
    pseudocode: `readyQueue = new Queue()
for t = 0, 1, 2, ...:
    for each process p with p.arrival == t:
        readyQueue.enqueue(p)
    if cpu is idle and not readyQueue.isEmpty():
        running = readyQueue.dequeue()
    run running for 1 time unit
    if running.remaining == 0:
        running.completion = t + 1     // terminated`,
    pros: ['Very easy to understand and implement', 'Fair in the "order of arrival" sense', 'No starvation — every process eventually runs', 'Minimum scheduling overhead (few context switches)'],
    cons: ['Convoy effect: one long job makes all short jobs behind it wait', 'High average waiting time', 'Poor for interactive / time-sharing systems', 'Cannot prioritise important processes'],
    keyIdea: 'Convoy Effect — short processes stuck behind a long process, like cars behind a slow truck.',
    example: { processes: [P('P1', 0, 8), P('P2', 1, 4), P('P3', 2, 9), P('P4', 3, 5)], opts: {}, note: 'P1 is long, so P2, P3 and P4 must wait behind it (convoy effect).' },
  },
  SJF: {
    title: 'Shortest Job First (SJF)',
    tagline: 'Among the waiting processes, run the one that needs the least CPU time.',
    type: 'Non-preemptive', ds: 'Min-Heap (key = Burst Time)', starvation: 'Yes (long jobs)', complexity: 'O(log n) insert / extract-min',
    bestFor: 'Batch systems where burst times are known in advance.',
    summary: 'SJF selects the process with the smallest burst time from the Ready Queue. It is provably optimal for minimising average waiting time when all processes are available together. In this non-preemptive version, a running process is never interrupted even if a shorter job arrives.',
    how: [
      'Arriving processes are INSERTED into a Min-Heap ordered by burst time.',
      'When the CPU is free, EXTRACT-MIN removes the process with the shortest burst (root of the heap).',
      'The chosen process runs to completion (non-preemptive).',
      'Ties are broken by arrival time, then by process order.',
    ],
    whyDS: 'A Min-Heap always keeps the smallest key at the root, so the shortest job is found in O(1) and removed in O(log n) — much faster than scanning an array (O(n)) every time.',
    pseudocode: `heap = new MinHeap(key = burst)
for t = 0, 1, 2, ...:
    for each process p arriving at t:
        heap.insert(p)                 // sift-up
    if cpu is idle and not heap.isEmpty():
        running = heap.extractMin()    // sift-down
    run running for 1 time unit
    if running.remaining == 0: terminate(running)`,
    pros: ['Minimum average waiting time (optimal for non-preemptive)', 'Good throughput — many short jobs finish quickly', 'Simple once burst times are known'],
    cons: ['Burst time must be known / predicted in advance', 'Long processes can STARVE if short ones keep coming', 'Not suitable for interactive systems', 'Not preemptive — a short job arriving late still waits'],
    keyIdea: 'Greedy choice: finishing short jobs first reduces the total time everyone waits.',
    example: { processes: [P('P1', 0, 7), P('P2', 2, 4), P('P3', 4, 1), P('P4', 5, 4)], opts: {}, note: 'P1 starts alone at t=0. When it finishes, the heap picks P3 (BT=1) before P2 and P4.' },
  },
  SRTF: {
    title: 'Shortest Remaining Time First (SRTF)',
    tagline: 'Preemptive SJF — a newly arrived shorter job can kick out the running one.',
    type: 'Preemptive', ds: 'Min-Heap (key = Remaining Time)', starvation: 'Yes (long jobs)', complexity: 'O(log n) per arrival / preemption',
    bestFor: 'Minimising average waiting time when bursts are known.',
    summary: 'SRTF is the preemptive version of SJF. At every time unit the scheduler compares the remaining time of the running process with the root of the Min-Heap. If a waiting process needs less time, the running process is preempted and pushed back into the heap.',
    how: [
      'Every arriving process is INSERTED into a Min-Heap keyed by remaining time.',
      'At each time unit, compare heap.peek().remaining with running.remaining.',
      'If the heap root is smaller, PREEMPT: insert the running process back and extract the root.',
      'Otherwise, continue running the current process for one more unit.',
    ],
    whyDS: 'Preemption checks happen at every time unit, so we need the minimum remaining time instantly. A Min-Heap gives the minimum in O(1) (peek) and updates in O(log n).',
    pseudocode: `heap = new MinHeap(key = remaining)
for t = 0, 1, 2, ...:
    insert arrivals into heap
    if running and heap.peek().remaining < running.remaining:
        heap.insert(running)           // preempt
        running = null
    if running is null and not heap.isEmpty():
        running = heap.extractMin()
    running.remaining -= 1`,
    pros: ['Lowest possible average waiting time', 'Short jobs get very fast response', 'Responsive to newly arriving short processes'],
    cons: ['Needs burst-time knowledge', 'Long jobs may starve', 'More context switches → higher overhead', 'Frequent comparisons at every time unit'],
    keyIdea: 'Preemption: the CPU always works on the job that is closest to finishing.',
    example: { processes: [P('P1', 0, 7), P('P2', 2, 4), P('P3', 4, 1), P('P4', 5, 4)], opts: {}, note: 'Same input as SJF: watch P2 preempt P1 at t=2 and P3 preempt P2 at t=4. Average WT drops from 4 to 3.' },
  },
  PRIORITY_NP: {
    title: 'Priority Scheduling (Non-Preemptive)',
    tagline: 'Each process has a priority; the most important waiting process runs next.',
    type: 'Non-preemptive', ds: 'Priority Queue (binary heap)', starvation: 'Yes (low priority) — fixed by Aging', complexity: 'O(log n) enqueue / dequeue',
    bestFor: 'Systems where some tasks are more important (e.g. system vs. user processes).',
    summary: 'Every process is given a priority number. In this simulator a SMALLER number means a HIGHER priority (priority 0 is the most important). When the CPU becomes free, the process with the highest priority is taken from the Priority Queue and runs until it completes.',
    how: [
      'Arriving processes are ENQUEUED into a Priority Queue (min-heap on priority number).',
      'When the CPU is free, DEQUEUE returns the highest-priority process (smallest number).',
      'The process runs until it finishes — no interruption.',
      'Optional Aging: every k units a waiting process\'s priority improves by 1, so it cannot wait forever.',
    ],
    whyDS: 'A Priority Queue is the natural ADT for "always give me the most important item". Implemented as a binary heap, both enqueue and dequeue are O(log n).',
    pseudocode: `pq = new PriorityQueue(key = priority)   // smaller = higher
for t = 0, 1, 2, ...:
    enqueue arrivals into pq
    if cpu idle and not pq.isEmpty():
        running = pq.dequeue()
    run running for 1 unit
    if aging enabled:
        for p in pq: every k units waited → p.priority -= 1
        pq.heapify()`,
    pros: ['Important processes are served first', 'Flexible — priority can represent anything (deadline, cost, user type)', 'Simple to implement with a heap'],
    cons: ['Indefinite blocking / STARVATION of low-priority processes', 'Choosing good priorities is hard', 'High-priority long job still blocks others (non-preemptive)'],
    keyIdea: 'Starvation & Aging — gradually increase the priority of processes that wait for a long time.',
    example: { processes: [P('P1', 0, 10, 3), P('P2', 1, 1, 1), P('P3', 2, 2, 4), P('P4', 3, 1, 5), P('P5', 4, 5, 2)], opts: {}, note: 'P1 starts first because it is alone. Then the Priority Queue serves P2 (1), P5 (2), P3 (4), P4 (5).' },
  },
  PRIORITY_P: {
    title: 'Priority Scheduling (Preemptive)',
    tagline: 'A higher-priority arrival immediately takes the CPU from a lower-priority process.',
    type: 'Preemptive', ds: 'Priority Queue (binary heap)', starvation: 'Yes (low priority) — fixed by Aging', complexity: 'O(log n) per arrival / preemption',
    bestFor: 'Real-time and interactive systems with urgent tasks.',
    summary: 'Same as priority scheduling, but at every time unit the scheduler checks whether a process in the Priority Queue has a higher priority than the running one. If so, the running process is preempted and put back into the queue.',
    how: [
      'Arriving processes are ENQUEUED into the Priority Queue.',
      'Each time unit: if pq.peek().priority is better (smaller) than running.priority → PREEMPT.',
      'The preempted process goes back into the Priority Queue with its remaining burst.',
      'Aging (optional) prevents low-priority processes from waiting forever.',
    ],
    whyDS: 'Preemption needs the best waiting priority at every tick: the heap root gives it in O(1).',
    pseudocode: `for t = 0, 1, 2, ...:
    enqueue arrivals into pq
    if running and pq.peek().priority < running.priority:
        pq.enqueue(running); running = null      // preempt
    if running is null: running = pq.dequeue()
    run running for 1 unit; apply aging`,
    pros: ['Urgent processes get the CPU immediately', 'Good response time for high-priority work'],
    cons: ['Severe starvation possible for low priorities', 'More context switches', 'Priority inversion problems in real systems'],
    keyIdea: 'Preemption + priorities = fast response for important work, risk of starvation for the rest.',
    example: { processes: [P('P1', 0, 10, 3), P('P2', 1, 1, 1), P('P3', 2, 2, 4), P('P4', 3, 1, 5), P('P5', 4, 5, 2)], opts: {}, note: 'Watch P2 (priority 1) preempt P1 at t=1 and P5 (priority 2) preempt P1 at t=4.' },
  },
  RR: {
    title: 'Round Robin (RR)',
    tagline: 'Everyone gets a fixed slice of CPU time (time quantum), in turns.',
    type: 'Preemptive', ds: 'Circular Queue (FIFO)', starvation: 'No', complexity: 'O(1) per enqueue / dequeue',
    bestFor: 'Time-sharing and interactive systems.',
    summary: 'Round Robin gives each process a small unit of CPU time called the TIME QUANTUM. If a process does not finish within its quantum, it is preempted and moved to the REAR of the Ready Queue, and the next process at the FRONT gets the CPU. The performance depends heavily on the quantum size.',
    how: [
      'Arriving processes are ENQUEUED at the REAR of the Ready Queue.',
      'The process at the FRONT is DEQUEUED and runs for at most q time units.',
      'If it finishes early, it terminates. Otherwise it is preempted and ENQUEUED at the REAR again.',
      'New arrivals at the same instant are enqueued BEFORE the preempted process.',
    ],
    whyDS: 'The cyclic "take from front, put back at rear" pattern is exactly what a (circular) Queue provides in O(1).',
    pseudocode: `q = timeQuantum; readyQueue = new Queue()
for t = 0, 1, 2, ...:
    enqueue arrivals
    if running and used == q:
        readyQueue.enqueue(running); running = null   // quantum expired
    if running is null: running = readyQueue.dequeue(); used = 0
    run running 1 unit; used += 1`,
    pros: ['Fair — every process gets equal CPU share', 'No starvation', 'Good response time for interactive users'],
    cons: ['Performance depends on the quantum: too large → FCFS, too small → too many context switches', 'Higher average turnaround than SJF', 'Context-switch overhead'],
    keyIdea: 'Time Quantum — choose it so that ~80% of CPU bursts finish within one quantum.',
    example: { processes: [P('P1', 0, 5), P('P2', 1, 4), P('P3', 2, 2), P('P4', 4, 1)], opts: { quantum: 2 }, note: 'Quantum = 2. Watch processes cycle from FRONT to CPU to REAR of the queue.' },
  },
  HRRN: {
    title: 'Highest Response Ratio Next (HRRN)',
    tagline: 'Balances short-job preference with waiting time so long jobs never starve.',
    type: 'Non-preemptive', ds: 'Dynamic Queue / Array (key = Response Ratio)', starvation: 'No', complexity: 'O(n) per dispatch',
    bestFor: 'Batch & mixed workloads needing low waiting time without starvation.',
    summary: 'HRRN computes a Response Ratio = (Waiting Time + Burst Time) / Burst Time for every ready process whenever the CPU is free, and selects the process with the highest ratio.',
    how: [
      'Arriving processes are placed in the Ready queue.',
      'When CPU is free, compute RR = (W + BT) / BT for each ready process.',
      'Select the process with the maximum Response Ratio and run it to completion.',
      'As a long job waits, W grows so its Response Ratio increases and it eventually wins.',
    ],
    whyDS: 'Because W increases for all waiting processes on every tick, the relative order changes dynamically; scanning the ready queue at dispatch is simple and O(n).',
    pseudocode: `for t = 0, 1, 2, ...:
    enqueue arrivals
    if cpu is idle and not ready.isEmpty():
        pick p in ready maximizing (p.wait + p.burst) / p.burst
        running = p
    run running for 1 unit; update wait times`,
    pros: ['Eliminates starvation of long jobs', 'Approximates SJF for short jobs', 'Good throughput and balanced waiting times'],
    cons: ['Requires burst-time knowledge in advance', 'Non-preemptive — cannot interrupt a long running job', 'O(n) scan at each dispatch'],
    keyIdea: 'Response Ratio = 1 + (Wait / Burst) — waiting time naturally boosts older jobs.',
    example: { processes: [P('P1', 0, 3), P('P2', 2, 6), P('P3', 4, 4), P('P4', 6, 5), P('P5', 8, 2)], opts: {}, note: 'Watch how waiting time lets shorter or older jobs win the next dispatch.' },
  },
  MLQ: {
    title: 'Multilevel Queue Scheduling (MLQ)',
    tagline: 'Partitions processes into fixed priority queues (System, Interactive, Batch).',
    type: 'Preemptive (across queues)', ds: '3 Priority Queues (Q0: RR, Q1: RR2, Q2: FCFS)', starvation: 'Yes (lower queues)', complexity: 'O(1) per enqueue / dequeue',
    bestFor: 'Systems with clearly separated process classes (foreground vs background).',
    summary: 'Processes are permanently assigned to Queue 0 (Priority ≤ 1, RR quantum q), Queue 1 (Priority 2–3, RR quantum 2q), or Queue 2 (Priority ≥ 4, FCFS). Higher queues strictly preempt lower queues.',
    how: [
      'Assign each arriving process to Q0, Q1, or Q2 based on its priority.',
      'Always dispatch from the highest non-empty queue (Q0 before Q1 before Q2).',
      'If a process arrives in a higher queue than the running process, preempt immediately.',
      'Q0 uses RR(q), Q1 uses RR(2q), and Q2 uses FCFS.',
    ],
    whyDS: 'Using three separate FIFO Queues keeps enqueue and dequeue O(1) while enforcing strict inter-queue priority.',
    pseudocode: `queues = [Queue(RR, q), Queue(RR, 2q), Queue(FCFS)]
for t = 0, 1, 2, ...:
    enqueue arrivals into queues[level(p)]
    if higher queue non-empty: preempt running
    dispatch from first non-empty queue`,
    pros: ['Low scheduling overhead O(1)', 'Immediate response for system/interactive tasks', 'Tailored algorithm per workload class'],
    cons: ['Inflexible — processes cannot move between queues', 'Lower queues (Batch) can starve if Q0/Q1 stay busy'],
    keyIdea: 'Strict queue hierarchy: Q2 only runs when Q0 and Q1 are completely empty.',
    example: { processes: [P('P1', 0, 6, 4), P('P2', 1, 2, 0), P('P3', 2, 4, 2)], opts: { quantum: 2 }, note: 'P1 (Q2) is preempted by P2 (Q0) at t=1 and waits behind P3 (Q1).' },
  },
  MLFQ: {
    title: 'Multilevel Feedback Queue (MLFQ)',
    tagline: 'Learns process behavior dynamically by demoting CPU-bound jobs and boosting waiting ones.',
    type: 'Preemptive', ds: '3 Feedback Queues + Optional Aging Boost', starvation: 'Fixed by Aging Boost', complexity: 'O(1) per queue op',
    bestFor: 'General-purpose OS schedulers (Unix, Linux, Windows variants).',
    summary: 'All new processes start in Q0 (highest priority, quantum q). If a process uses its full quantum without finishing or blocking for I/O, it is demoted to Q1 (quantum 2q), then Q2 (FCFS). Enable Aging to boost starved lower-queue processes back to Q0.',
    how: [
      'All arrivals start in Q0.',
      'If a process finishes or blocks for I/O before quantum expiry, it stays interactive.',
      'If it consumes its full quantum in Q0 or Q1, demote it one level.',
      'Optional Aging Boost moves long-waiting Q1/Q2 jobs back to Q0.',
    ],
    whyDS: 'Three linked FIFO queues give O(1) dispatch while adapting to unknown burst lengths.',
    pseudocode: `for t = 0, 1, 2, ...:
    enqueue arrivals into Q0
    if higher queue non-empty: preempt running
    if quantum expired: demote running to min(level + 1, 2)
    if aging enabled: boost old processes to Q0`,
    pros: ['Needs no prior burst-time knowledge', 'Favors short/interactive I/O jobs automatically', 'Prevents starvation when aging boost is enabled'],
    cons: ['Complex tuning (number of queues, quantums, boost interval)', 'Can game the scheduler without careful accounting'],
    keyIdea: 'Adaptive feedback: CPU hogs sink to lower queues; interactive jobs stay at the top.',
    example: { processes: [P('P1', 0, 7, 1), P('P2', 2, 2, 1), P('P3', 4, 3, 1)], opts: { quantum: 2, aging: true, agingInterval: 5 }, note: 'P1 starts in Q0, gets demoted to Q1 after 2 units, and P2/P3 run first in Q0.' },
  },
  LOTTERY: {
    title: 'Lottery Scheduling',
    tagline: 'Proportional-share CPU allocation using randomized ticket draws.',
    type: 'Preemptive (per quantum)', ds: 'Ticket Pool (Queue + Seeded PRNG)', starvation: 'No (every process holds ≥ 1 ticket)', complexity: 'O(n) per draw',
    bestFor: 'Fair-share systems, virtual machines, and cloud CPU quotas.',
    summary: 'Each process receives lottery tickets proportional to its priority (10 − priority, minimum 1). Every time quantum, a winning ticket is drawn; the holder runs for one quantum.',
    how: [
      'Assign tickets to each process (higher priority = more tickets).',
      'At dispatch or quantum expiry, draw a random ticket from [0, totalTickets).',
      'Walk the ready pool accumulating tickets until the winning ticket is reached.',
      'Over time, CPU share converges to each process\'s ticket fraction.',
    ],
    whyDS: 'A simple list/queue of processes with ticket counts lets us draw a proportional winner in one pass.',
    pseudocode: `tickets(p) = max(1, 10 - p.priority)
for each quantum:
    win = random(0, sum(tickets in ready))
    running = process holding ticket win
    run running for up to q units`,
    pros: ['Proportional CPU share without strict starvation', 'Simple and flexible ticket transfers/inflation', 'Every runnable process has non-zero chance to run'],
    cons: ['Short-term variance due to randomness', 'O(n) linear scan to locate winning ticket'],
    keyIdea: 'Probabilistic fairness: 2x tickets ≈ 2x CPU time over many quanta.',
    example: { processes: [P('P1', 0, 6, 0), P('P2', 0, 6, 5), P('P3', 0, 6, 8)], opts: { quantum: 2 }, note: 'P1 has 10 tickets, P2 has 5, P3 has 2 — watch P1 win most quanta.' },
  },
};

const STARVATION_EXAMPLE = {
  processes: [P('P1', 0, 4, 1), P('P2', 1, 3, 6), P('P3', 3, 4, 1), P('P4', 6, 4, 2), P('P5', 9, 4, 1), P('P6', 12, 4, 2), P('P7', 15, 4, 1)],
  algo: 'PRIORITY_P',
  note: 'P2 has a low priority (6) while high-priority jobs keep arriving. Without aging it waits until t=24. With aging (every 2 units → priority −1) it runs at t=15.',
};

const DS_INFO = [
  {
    name: 'Array', icon: '▦',
    where: 'Process table & results table',
    text: 'Stores every process record (PID, Arrival, Burst, Priority, Completion, Waiting, Turnaround, Response) in contiguous, index-addressable slots. The simulator converts the linked list into an array before simulating, and the results / comparison tables are built from arrays. Access by index is O(1). The Min-Heap itself is also stored inside an array (children of i are 2i+1 and 2i+2).',
    ops: 'access O(1) · append O(1) · search O(n)',
  },
  {
    name: 'Linked List', icon: '⇢',
    where: 'Dynamic list of user processes',
    text: 'The processes you add or delete are kept in a singly linked list. Adding appends a node at the tail in O(1), deleting re-links the previous node to the next one — no shifting of elements is needed. The Queue used for FCFS/RR is also built from linked nodes.',
    ops: 'insert at tail O(1) · delete O(n) search + O(1) unlink',
  },
  {
    name: 'Queue', icon: '⇉',
    where: 'Ready Queue in FCFS & Round Robin',
    text: 'FIFO structure: enqueue at the REAR, dequeue from the FRONT. In Round Robin a preempted process is enqueued at the rear again, giving the circular behaviour.',
    ops: 'enqueue O(1) · dequeue O(1) · peek O(1)',
  },
  {
    name: 'Priority Queue', icon: '★',
    where: 'Ready Queue in Priority scheduling',
    text: 'Abstract data type that always returns the element with the highest priority. Implemented here on top of a binary min-heap (smaller priority number = higher priority). Aging changes keys, so the heap is re-built with heapify().',
    ops: 'enqueue O(log n) · dequeue O(log n) · peek O(1)',
  },
  {
    name: 'Min-Heap', icon: '△',
    where: 'Ready Queue in SJF & SRTF',
    text: 'Complete binary tree where every parent key ≤ its children. The root is always the process with the shortest burst (SJF) or shortest remaining time (SRTF). Insert = add at the end + sift-up. Extract-min = move last element to the root + sift-down.',
    ops: 'insert O(log n) · extract-min O(log n) · peek O(1) · heapify O(n)',
  },
];

const STATE_INFO = [
  { state: 'New', text: 'The process has been created but has not yet been admitted (its arrival time has not been reached).' },
  { state: 'Ready', text: 'The process is in memory and waiting in the Ready Queue for the CPU.' },
  { state: 'Running', text: 'The process\'s instructions are being executed by the CPU. Only one process runs at a time on a single CPU.' },
  { state: 'Waiting', text: 'The process is blocked, waiting for an event such as I/O completion. Add an "I/O at / I/O time" to a process to see this state.' },
  { state: 'Terminated', text: 'The process has finished execution; its Completion Time is recorded.' },
];

const FORMULAS = [
  ['Completion Time (CT)', 'Time at which the process finishes execution'],
  ['Turnaround Time (TAT)', 'TAT = CT − Arrival Time'],
  ['Waiting Time (WT)', 'WT = TAT − Burst Time − I/O Time'],
  ['Response Time (RT)', 'RT = First time on CPU − Arrival Time'],
  ['Response Ratio (HRRN)', 'RR = (Waiting Time + Burst Time) / Burst Time'],
  ['Average WT / TAT', 'Σ WT / n  ,  Σ TAT / n'],
  ['CPU Utilization', '(CPU busy time / total schedule length) × 100%'],
  ['Throughput', 'Number of processes / total schedule length (processes per unit time)'],
];

const PRACTICE_QUESTIONS = [
  {
    q: 'Three processes arrive at t=0 with bursts P1=8, P2=4, P3=2. What is the Average Waiting Time under SJF (Non-Preemptive)?',
    options: ['2.67 units', '4.67 units', '6.00 units', '3.33 units'],
    answer: 0,
    explain: 'SJF runs P3 (2), then P2 (4), then P1 (8). Waiting times: P3=0, P2=2, P1=6 → Avg = (0+2+6)/3 = 2.67.',
  },
  {
    q: 'Which scheduling algorithm is provably optimal for minimizing Average Waiting Time across arbitrary arrival times?',
    options: ['FCFS', 'Round Robin', 'SRTF', 'Multilevel Queue'],
    answer: 2,
    explain: 'Shortest Remaining Time First (SRTF) is the preemptive version of SJF and achieves the minimum possible average waiting time.',
  },
  {
    q: 'How does Multilevel Feedback Queue (MLFQ) prevent starvation of CPU-bound processes in lower queues?',
    options: ['By using FCFS in Q0', 'By periodically boosting waiting processes to Q0 (Aging)', 'By reducing the time quantum to 0', 'By disabling preemption'],
    answer: 1,
    explain: 'Periodic priority boosting (aging) moves long-waiting processes from lower queues back to Q0 so they cannot starve.',
  },
  {
    q: 'In HRRN, a process with Burst Time = 4 has waited 12 units. What is its Response Ratio?',
    options: ['3.0', '4.0', '0.25', '16.0'],
    answer: 1,
    explain: 'Response Ratio = (W + BT) / BT = (12 + 4) / 4 = 4.0.',
  },
];

const VIVA_QA = [
  {
    q: 'What is the difference between Turnaround Time and Waiting Time?',
    a: 'Turnaround Time (CT − AT) is the total time from arrival to completion, including CPU execution and I/O. Waiting Time (TAT − BT − I/O) is only the time spent waiting in the Ready Queue.',
  },
  {
    q: 'What is the Convoy Effect and which algorithm suffers from it?',
    a: 'In FCFS, when one long CPU-bound process arrives first, all shorter processes behind it must wait, causing high average waiting time and poor device utilization.',
  },
  {
    q: 'Why is a Min-Heap used for SJF, SRTF, and Priority Scheduling instead of a plain Array?',
    a: 'A Min-Heap provides O(1) peek for the minimum key and O(log n) insertion/extraction, whereas scanning an unsorted array takes O(n) on every scheduling decision.',
  },
  {
    q: 'What happens in Round Robin if the Time Quantum is too large vs. too small?',
    a: 'If the quantum is very large, Round Robin degenerates into FCFS. If it is too small, frequent context switches add high overhead and reduce effective throughput.',
  },
  {
    q: 'How do MLQ and MLFQ differ?',
    a: 'MLQ permanently assigns processes to fixed queues, which can starve lower queues. MLFQ dynamically moves processes between queues based on CPU burst behavior and aging boosts.',
  },
];

if (typeof module !== 'undefined') module.exports = { ALGO_INFO, STARVATION_EXAMPLE, DS_INFO, STATE_INFO, FORMULAS, PRACTICE_QUESTIONS, VIVA_QA };
