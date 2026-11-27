/* =========================================================================
 * ds.js — Hand-written data structures used by the simulator
 *   1. ProcessArray   (Array)          – process table / results table
 *   2. LinkedList     (Singly linked)  – dynamic list of processes
 *   3. Queue          (Linked queue)   – Ready Queue for FCFS & Round Robin
 *   4. MinHeap        (Array heap)     – SJF / SRTF (shortest burst / remaining)
 *   5. PriorityQueue  (built on heap)  – Priority scheduling
 * Every structure records the operations performed on it in `ops`, so the UI
 * can show students exactly what happened inside the data structure.
 * ========================================================================= */

/* ---------- 1. Array: Process Table ---------- */
class ProcessArray {
  constructor(items = []) { this.items = items.slice(); }
  add(p) { this.items.push(p); return this.items.length - 1; }
  get(i) { return this.items[i]; }
  set(i, p) { this.items[i] = p; }
  indexOf(pid) { for (let i = 0; i < this.items.length; i++) if (this.items[i].pid === pid) return i; return -1; }
  get length() { return this.items.length; }
  sortBy(fn) { this.items.sort(fn); return this; }
  map(fn) { return this.items.map(fn); }
  forEach(fn) { this.items.forEach(fn); }
  toArray() { return this.items.slice(); }
}

/* ---------- 2. Singly Linked List ---------- */
class ListNode {
  constructor(value) { this.value = value; this.next = null; }
}

class LinkedList {
  constructor() { this.head = null; this.tail = null; this.size = 0; }

  append(value) {
    const node = new ListNode(value);
    if (!this.head) this.head = this.tail = node;
    else { this.tail.next = node; this.tail = node; }
    this.size++;
    return node;
  }

  /** Remove the first node whose value matches `pred`. Returns the removed value or null. */
  remove(pred) {
    let prev = null, cur = this.head;
    while (cur) {
      if (pred(cur.value)) {
        if (prev) prev.next = cur.next; else this.head = cur.next;
        if (cur === this.tail) this.tail = prev;
        this.size--;
        return cur.value;
      }
      prev = cur; cur = cur.next;
    }
    return null;
  }

  find(pred) {
    for (let cur = this.head; cur; cur = cur.next) if (pred(cur.value)) return cur.value;
    return null;
  }

  clear() { this.head = this.tail = null; this.size = 0; }

  toArray() {
    const out = [];
    for (let cur = this.head; cur; cur = cur.next) out.push(cur.value);
    return out;
  }

  *[Symbol.iterator]() { for (let cur = this.head; cur; cur = cur.next) yield cur.value; }
}

/* ---------- 3. Queue (FIFO, linked-node implementation, O(1) ops) ---------- */
class Queue {
  constructor(label = 'value') { this.front = null; this.rear = null; this.length = 0; this.ops = []; this.label = label; }

  enqueue(x) {
    const node = new ListNode(x);
    if (!this.rear) this.front = this.rear = node;
    else { this.rear.next = node; this.rear = node; }
    this.length++;
    this.ops.push(`enqueue(${x.pid}) → added at REAR`);
  }

  dequeue() {
    if (!this.front) return null;
    const x = this.front.value;
    this.front = this.front.next;
    if (!this.front) this.rear = null;
    this.length--;
    this.ops.push(`dequeue() → ${x.pid} removed from FRONT`);
    return x;
  }

  peek() { return this.front ? this.front.value : null; }
  isEmpty() { return this.length === 0; }
  size() { return this.length; }
  toArray() { const out = []; for (let c = this.front; c; c = c.next) out.push(c.value); return out; }
  drainOps() { const o = this.ops; this.ops = []; return o; }
}

/* ---------- 4. Min-Heap (array based binary heap) ---------- */
class MinHeap {
  /**
   * @param {(a,b)=>number} compare  negative if a should be above b
   * @param {(x)=>string} describe   short label used in the operation log
   */
  constructor(compare, describe = x => String(x)) {
    this.a = []; this.cmp = compare; this.describe = describe; this.ops = [];
    this.trace = null; // set to [] to record every intermediate array state (used for step-by-step animation)
  }

  size() { return this.a.length; }
  isEmpty() { return this.a.length === 0; }
  peek() { return this.a.length ? this.a[0] : null; }
  toArray() { return this.a.slice(); }

  push(x) {
    this.a.push(x);
    this.ops.push(`insert(${this.describe(x)}) at index ${this.a.length - 1}`);
    this._snap();
    this._siftUp(this.a.length - 1);
  }

  pop() {
    if (!this.a.length) return null;
    const top = this.a[0];
    const last = this.a.pop();
    this.ops.push(`extractMin() → ${this.describe(top)}`);
    if (this.a.length) {
      this.a[0] = last;
      this._snap();
      this.ops.push(`move last ${this.describe(last)} to root, then sift-down`);
      this._siftDown(0);
    }
    return top;
  }

  /** Rebuild the heap after keys changed (e.g. priority aging). O(n). */
  heapify() {
    for (let i = (this.a.length >> 1) - 1; i >= 0; i--) this._siftDown(i, true);
    this.ops.push('heapify() → heap rebuilt after key change');
  }

  _snap() { if (this.trace) this.trace.push(this.a.slice()); }
  _swap(i, j) { const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t; this._snap(); }

  _siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.a[i], this.a[p]) < 0) {
        this.ops.push(`  sift-up: swap ${this.describe(this.a[i])} ↔ parent ${this.describe(this.a[p])}`);
        this._swap(i, p); i = p;
      } else break;
    }
  }

  _siftDown(i, quiet = false) {
    const n = this.a.length;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && this.cmp(this.a[l], this.a[m]) < 0) m = l;
      if (r < n && this.cmp(this.a[r], this.a[m]) < 0) m = r;
      if (m === i) break;
      if (!quiet) this.ops.push(`  sift-down: swap ${this.describe(this.a[i])} ↔ child ${this.describe(this.a[m])}`);
      this._swap(i, m); i = m;
    }
  }

  drainOps() { const o = this.ops; this.ops = []; return o; }
}

/* ---------- 5. Priority Queue (min-heap on priority number) ---------- */
/* Convention: a LOWER priority number means a HIGHER priority (like Linux nice values). */
class PriorityQueue extends MinHeap {
  constructor(keyFn = p => p.priority, describe) {
    super((a, b) => (keyFn(a) - keyFn(b)) || (a.arrival - b.arrival) || (a.idx - b.idx), describe);
  }
  enqueue(x) { this.push(x); }
  dequeue() { return this.pop(); }
}

if (typeof module !== 'undefined') module.exports = { ProcessArray, ListNode, LinkedList, Queue, MinHeap, PriorityQueue };
