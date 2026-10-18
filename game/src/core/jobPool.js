/** Prioritized worker queue with an autonomous, yielding fallback for startup. */
export function createJobPool({ count, makeWorker, runSync, timeoutMs = 45000 }) {
  const workers = [], queue = [], inflight = new Map();
  let nextId = 1, scheduled = null, disposed = false;
  const cancel = (job) => job.cancelled?.();
  function take() {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].prio() < queue[best].prio()) best = i;
    return queue.splice(best, 1)[0];
  }
  function scheduleFallback() {
    if (disposed || workers.length || !queue.length || scheduled !== null) return;
    scheduled = setTimeout(() => { scheduled = null; update(6); scheduleFallback(); }, 0);
  }
  function retire(worker) {
    const idx = workers.indexOf(worker);
    if (idx < 0) return;
    workers.splice(idx, 1); worker.terminate();
    for (const [id, job] of inflight) if (job.worker === worker) {
      clearTimeout(job.timer); inflight.delete(id); queue.push(job);
    }
    pump();
  }
  function pump() {
    if (disposed) return;
    for (const worker of [...workers]) {
      while (workers.includes(worker) && worker.busy < 2 && queue.length) {
        const job = take();
        if (cancel(job)) { job.reject(new Error('cancelled')); continue; }
        const id = nextId++;
        job.worker = worker; job.msg.id = id;
        job.timer = setTimeout(() => retire(worker), timeoutMs);
        inflight.set(id, job); worker.busy++;
        try { worker.postMessage(job.msg); } catch { retire(worker); }
      }
    }
    scheduleFallback();
  }
  for (let i = 0; i < count; i++) {
    try {
      const worker = makeWorker(); worker.busy = 0;
      worker.onmessage = ({ data }) => {
        const job = inflight.get(data.id);
        if (!job || job.worker !== worker) return;
        clearTimeout(job.timer); inflight.delete(data.id); worker.busy--;
        if (cancel(job)) job.reject(new Error('cancelled'));
        else if (data.ok) job.resolve(data.r);
        else job.reject(new Error(data.err || 'Worker job failed'));
        pump();
      };
      worker.onerror = () => retire(worker);
      worker.onmessageerror = () => retire(worker);
      workers.push(worker);
    } catch { break; }
  }
  function run(msg, prio = () => 0, cancelled = null) {
    if (disposed) return Promise.reject(new Error('Pool disposed'));
    return new Promise((resolve, reject) => { queue.push({ msg, prio, cancelled, resolve, reject }); pump(); });
  }
  function update(budgetMs = 6) {
    if (disposed) return;
    if (workers.length) { pump(); return; }
    const start = performance.now();
    while (queue.length && performance.now() - start < budgetMs) {
      const job = take();
      if (cancel(job)) { job.reject(new Error('cancelled')); continue; }
      try { job.resolve(runSync(job.msg)); } catch (error) { job.reject(error); }
    }
    scheduleFallback();
  }
  function dispose() {
    disposed = true; clearTimeout(scheduled); scheduled = null;
    for (const worker of workers) worker.terminate();
    workers.length = 0;
    for (const job of [...queue, ...inflight.values()]) { clearTimeout(job.timer); job.reject(new Error('Pool disposed')); }
    queue.length = 0; inflight.clear();
  }
  return { run, update, dispose, workers, get pending() { return queue.length + inflight.size; }, get threaded() { return workers.length > 0; } };
}
