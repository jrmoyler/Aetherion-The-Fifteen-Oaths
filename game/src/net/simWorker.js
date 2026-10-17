// Web Worker wrapper around simHost: the offline simulation runs off the main thread.
// Protocol with the page: page -> worker {t:'__boot', seed, bots} then client messages;
// worker -> page arrays of server messages (plus {t:'__save'} persistence requests).
import { createHost } from './simHost.js';

let host = null;
self.onmessage = (ev) => {
  const d = ev.data;
  if (d && d.t === '__boot') {
    host?.stop();
    host = createHost({ seed: d.seed, bots: d.bots, emit: (batch) => self.postMessage(batch) });
    self.postMessage([{ t: '__ready' }]);
    return;
  }
  if (d && d.t === '__stop') { host?.stop(); host = null; return; }
  host?.receive(d);
};
