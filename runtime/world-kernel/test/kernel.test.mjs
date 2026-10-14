import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorldIndex,
  normalizePosition,
  CellResidency,
  EventInstance,
} from "../index.mjs";
const root =
  process.env.AETHERION_REPO ??
  fileURLToPath(new URL("../../../", import.meta.url));
const read = (name) =>
  JSON.parse(
    readFileSync(
      resolve(root, "AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II", name),
      "utf8",
    ),
  );
const graph = read("WORLD_REGION_GRAPH.json"),
  pois = read("WORLD_POI_REGISTRY.json"),
  events = read("WORLD_EVENT_REGISTRY.json");
const config = {
  schema_version: "1.0.0",
  revision: "test-256",
  axis: "RH_Y_UP_X_EAST_NEGATIVE_Z_NORTH",
  cell_width_m: 256,
};
const position = {
  world_id: "test-world",
  space_id: "exterior",
  cell_x: 0,
  cell_z: 0,
  local_x_m: 0,
  y_m: 12,
  local_z_m: 0,
};
const copy = structuredClone;
function socketsFor(contract) {
  return Object.fromEntries(
    contract.success_predicate.split(" AND ").flatMap((term) => {
      const [name, target] = term.split(" == ");
      return Array.from(
        { length: target === "true" ? 1 : Number(target) },
        (_, i) => [`test-only-${name}-${i}`, name],
      );
    }),
  );
}
function instance(contract = events.records[0]) {
  return new EventInstance(contract, {
    instanceId: `test-${contract.id}`,
    nowMs: 0,
    sockets: socketsFor(contract),
  });
}
function safe(nowMs) {
  return { checkedAtMs: nowMs, catchmentLease: true, protectedRoutes: true };
}
function response(e) {
  e.tick(120000, safe(120000));
  e.tick(150000, safe(150000));
  assert.equal(e.snapshot().phase, "response");
}
function ready(manager, token) {
  for (const stage of ["IO_READY", "DECODED", "COLLISION_READY"])
    manager.advance(token, stage);
  manager.advance(token, "GAMEPLAY_READY", {
    authority: true,
    collision: true,
    navigation: true,
    mandatoryCues: true,
    revision: token.revision,
  });
}

test("entire actual continent resolves all318 POIs, all225 topological region pairs and63baseline identities", () => {
  const world = createWorldIndex(graph, pois);
  assert.deepEqual(world.counts, { regions: 15, pois: 318, edges: 30 });
  for (const poi of pois.records) assert.deepEqual(world.poi(poi.id), poi);
  for (const from of graph.records)
    for (const to of graph.records) {
      const path = world.route(from.id, to.id);
      assert.equal(path[0], from.id);
      assert.equal(path.at(-1), to.id);
      for (let i = 1; i < path.length; i++)
        assert.ok(world.region(path[i - 1]).neighbor_ids.includes(path[i]));
    }
});
test("route ordering independent of record and edge input ordering", () => {
  const a = createWorldIndex(graph, pois),
    b = createWorldIndex(
      {
        ...graph,
        records: [...graph.records].reverse(),
        edges: [...graph.edges].reverse(),
      },
      pois,
    );
  for (const from of graph.records)
    for (const to of graph.records)
      assert.deepEqual(a.route(from.id, to.id), b.route(from.id, to.id));
});
test("unknown region and POI refused; callers cannot mutate indexed canon", () => {
  const world = createWorldIndex(graph, pois);
  for (const action of [
    () => world.region("region-16"),
    () => world.poi("wrong"),
    () => world.poisInRegion("wrong"),
    () => world.route("wrong", "region-01"),
  ])
    assert.throws(action);
  world.region("region-01").neighbor_ids.length = 0;
  assert.equal(world.region("region-01").neighbor_ids.length, 3);
});
for (const [label, mutate] of Object.entries({
  duplicate: (g) => g.records.push(copy(g.records[0])),
  endpoint: (g) => (g.edges[0].to_region_id = "missing"),
  adjacency: (g) => (g.records[0].neighbor_ids = []),
  baseline: (g) => (g.baseline_poi_manifest[0].name = "renamed"),
  schema: (g) => (g.schema_version = "2.0.0"),
}))
  test(`invalid graph rejects ${label}`, () => {
    const g = copy(graph);
    mutate(g);
    assert.throws(() => createWorldIndex(g, pois));
  });
test("POI Oath and capital identity validated", () => {
  for (const field of ["region_id", "oath_id", "kind"]) {
    const p = copy(pois);
    p.records[0][field] = "bad";
    assert.throws(() => createWorldIndex(graph, p));
  }
});
for (const width of [128, 256, 512])
  test(`signed coordinates normalize reversibly at ${width}m hypothesis`, () => {
    for (const x of [-1024.5, -512, -256, -0.25, 0, 255.999, 256, 2048.5])
      for (const z of [-512, -0.5, 0, 1024]) {
        const p = { ...position, local_x_m: x, local_z_m: z },
          c = { ...config, cell_width_m: width },
          n = normalizePosition(p, c);
        assert.equal(n.cell_x * width + n.local_x_m, x);
        assert.equal(n.cell_z * width + n.local_z_m, z);
        assert.deepEqual(normalizePosition(n, c), n);
        assert.deepEqual(p, { ...position, local_x_m: x, local_z_m: z });
      }
  });
test("coordinates reject invalid version, NaN, infinite, unsafe integer and bad width", () => {
  for (const p of [
    { ...position, y_m: NaN },
    { ...position, cell_x: 2 ** 53 },
    { ...position, local_x_m: Infinity },
  ])
    assert.throws(() => normalizePosition(p, config));
  for (const c of [
    { ...config, schema_version: "2" },
    { ...config, cell_width_m: 0 },
    { ...config, cell_width_m: NaN },
  ])
    assert.throws(() => normalizePosition(position, c));
});
test("readiness gates collision/nav/authority/mandatory cues and content revision", () => {
  for (const missing of [
    "authority",
    "collision",
    "navigation",
    "mandatoryCues",
    "revision",
  ]) {
    const m = new CellResidency(),
      t = m.request("cell", "v1");
    for (const stage of ["IO_READY", "DECODED", "COLLISION_READY"])
      m.advance(t, stage);
    const gates = {
      authority: true,
      collision: true,
      navigation: true,
      mandatoryCues: true,
      revision: "v1",
    };
    delete gates[missing];
    assert.throws(() => m.advance(t, "GAMEPLAY_READY", gates));
    assert.equal(m.mayEnter(t), false);
  }
});
test("valid readiness permits coarse gameplay before presentation", () => {
  const m = new CellResidency(),
    t = m.request("cell", "v1");
  ready(m, t);
  assert.equal(m.mayEnter(t), true);
  assert.equal(m.state("cell").stage, "GAMEPLAY_READY");
  m.advance(t, "PRESENTATION_READY");
  assert.equal(m.mayEnter(t), true);
});
test("out-of-order stage and duplicate requests refused", () => {
  const m = new CellResidency(),
    t = m.request("cell", "v1");
  assert.throws(() => m.advance(t, "DECODED"));
  assert.throws(() => m.request("cell", "v2"));
});
for (const reason of ["CANCELLED", "FAILED", "RETIRING"])
  test(`${reason} generation cannot revive or release replacement`, () => {
    const m = new CellResidency(),
      old = m.request("cell", "v1");
    m.acquire(old, "shared");
    m.retire(old, reason);
    const current = m.request("cell", "v2");
    m.acquire(current, "shared");
    assert.equal(m.advance(old, "IO_READY"), false);
    assert.equal(m.acquire(old, "stale"), false);
    assert.equal(m.retire(old), false);
    assert.equal(m.resourceUsers("shared"), 1);
    assert.equal(m.state("cell").revision, "v2");
    assert.equal(current.generation, old.generation + 1);
  });
test("shared leases dispose exactly once after final owner, duplicate acquisition ignored", () => {
  const disposed = [],
    m = new CellResidency((k) => disposed.push(k)),
    a = m.request("a", "1"),
    b = m.request("b", "1");
  assert.equal(m.acquire(a, "mesh@sha256"), true);
  assert.equal(m.acquire(a, "mesh@sha256"), false);
  m.acquire(b, "mesh@sha256");
  m.retire(a);
  assert.deepEqual(disposed, []);
  assert.equal(m.resourceUsers("mesh@sha256"), 1);
  m.retire(b);
  m.retire(b);
  assert.deepEqual(disposed, ["mesh@sha256"]);
});
test("failing disposer still releases all leases and invokes other disposers once", () => {
  const seen = [],
    m = new CellResidency((k) => {
      seen.push(k);
      if (k === "a") throw Error("device");
    }),
    t = m.request("cell", "1");
  m.acquire(t, "a");
  m.acquire(t, "b");
  assert.throws(() => m.retire(t), AggregateError);
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(m.resourceUsers("a"), 0);
  assert.equal(m.state("cell").stage, "UNREQUESTED");
  assert.equal(m.retire(t), false);
});
for (const contract of events.records)
  test(`actual ${contract.id} exact objective targets succeed with distinct authored test sockets`, () => {
    const e = instance(contract);
    response(e);
    const sockets = socketsFor(contract);
    for (const [socketId] of Object.entries(sockets))
      e.contribute({
        receiptId: `r-${socketId}`,
        socketId,
        accountId: "fixture-account",
        nowMs: 150001,
        gates: safe(150001),
      });
    assert.equal(e.tick(150002, safe(150002)).outcome, "success");
    assert.equal(e.snapshot().phase, "resolution");
    assert.equal(e.tick(160000).phase, "resolution");
    assert.equal(
      e.tick(160001, { outcomeCommitted: true }).phase,
      "reconstruction",
    );
    assert.equal(e.tick(760001, { servicesRestored: true }).phase, "cooldown");
    assert.equal(e.tick(99999999).phase, "cooldown");
  });
test("missing authored sockets and injected predicate code refused", () => {
  assert.throws(
    () =>
      new EventInstance(events.records[0], {
        instanceId: "x",
        nowMs: 0,
        sockets: {},
      }),
  );
  const c = copy(events.records[0]);
  c.success_predicate = "process.exit()";
  assert.throws(() => instance(c));
});
test("incorrect phase order and initial state types refused", () => {
  const c = copy(events.records[0]);
  c.phases.reverse();
  assert.throws(() => instance(c));
  const d = copy(events.records[0]);
  d.state_variables[0].initial = "0";
  assert.throws(() => instance(d));
});
test("receipt retry idempotent across phase transition; conflicting retry and duplicate socket refused", () => {
  const e = instance();
  response(e);
  const socketId = Object.keys(socketsFor(events.records[0]))[0],
    r = {
      receiptId: "r1",
      socketId,
      accountId: "account",
      nowMs: 150001,
      gates: safe(150001),
    };
  const a = e.contribute(r);
  assert.deepEqual(e.contribute(r), a);
  assert.equal(e.snapshot().objectives.vent_count, 1);
  assert.throws(() => e.contribute({ ...r, accountId: "other" }));
  assert.throws(() => e.contribute({ ...r, receiptId: "r2" }));
  e.tick(750000, safe(750000));
  assert.deepEqual(e.contribute({ ...r, nowMs: 750000 }), a);
});
test("unknown socket, early/late contribution and backwards clocks refused", () => {
  const e = instance(),
    r = { receiptId: "r", socketId: "bad", accountId: "a", nowMs: 0 };
  assert.throws(() => e.contribute(r));
  response(e);
  assert.throws(() => e.contribute({ ...r, nowMs: 150001 }));
  assert.throws(() => e.tick(149999, safe(149999)));
  assert.throws(() =>
    e.contribute({
      ...r,
      socketId: Object.keys(socketsFor(events.records[0]))[0],
      nowMs: 750000,
    }),
  );
});
test("zero-player deadline reaches setback then nonhazardous recovery without fabricated rewards", () => {
  const e = instance();
  response(e);
  assert.equal(e.tick(750000, safe(750000)).outcome, "setback");
  e.tick(750001, { outcomeCommitted: true });
  assert.equal(e.tick(1350001, { servicesRestored: true }).phase, "cooldown");
  assert.deepEqual(e.snapshot().receipts, []);
});
test("safety abort unpenalized and offline recovery never completes objectives", () => {
  const e = instance();
  response(e);
  assert.equal(
    e.tick(150001, { ...safe(150001), protectedRoutes: false }).outcome,
    "unpenalized-setback",
  );
  assert.equal(e.snapshot().phase, "reconstruction");
  const other = instance();
  response(other);
  const before = other.snapshot().objectives;
  other.recover(99999999);
  assert.equal(other.snapshot().phase, "reconstruction");
  assert.deepEqual(other.snapshot().objectives, before);
  assert.deepEqual(other.snapshot().receipts, []);
});
test("missing or stale safety attestation fails closed without changing state/time", () => {
  const e = instance();
  const before = e.snapshot();
  assert.throws(() => e.tick(120000));
  assert.throws(() => e.tick(120000, safe(119999)));
  assert.deepEqual(e.snapshot(), before);
  response(e);
  const active = e.snapshot();
  assert.throws(() =>
    e.tick(150001, { checkedAtMs: 150001, protectedRoutes: true }),
  );
  assert.deepEqual(e.snapshot(), active);
  const socketId = Object.keys(socketsFor(events.records[0]))[0];
  assert.throws(() =>
    e.contribute({
      receiptId: "r",
      socketId,
      accountId: "a",
      nowMs: 150001,
      gates: safe(150000),
    }),
  );
  assert.deepEqual(e.snapshot(), active);
});
test("lost catchment lease aborts response without credit and no stale success", () => {
  const e = instance();
  response(e);
  const socketId = Object.keys(socketsFor(events.records[0]))[0];
  assert.throws(() =>
    e.contribute({
      receiptId: "r",
      socketId,
      accountId: "a",
      nowMs: 150001,
      gates: { ...safe(150001), catchmentLease: false },
    }),
  );
  assert.equal(
    e.tick(150001, { ...safe(150001), catchmentLease: false }).outcome,
    "unpenalized-setback",
  );
  assert.deepEqual(e.snapshot().receipts, []);
  assert.equal(e.tick(750001).phase, "reconstruction");
});

test("reentrant disposal preserves newly acquired shared resource", () => {
  const disposed = [];
  let replacement;
  const m = new CellResidency((key) => {
    disposed.push({ key, users: m.resourceUsers(key) });
    if (key === "a") {
      replacement = m.request("replacement", "v1");
      m.acquire(replacement, "b");
    }
  });
  const old = m.request("old", "v1");
  m.acquire(old, "a");
  m.acquire(old, "b");
  m.retire(old);
  assert.deepEqual(disposed, [{ key: "a", users: 0 }]);
  assert.equal(m.resourceUsers("b"), 1);
  m.retire(replacement);
  assert.deepEqual(disposed, [
    { key: "a", users: 0 },
    { key: "b", users: 0 },
  ]);
});
test("tokens are manager-local capabilities, not transferable matching IDs", () => {
  const a = new CellResidency(),
    b = new CellResidency();
  const ta = a.request("cell", "v1"),
    tb = b.request("cell", "v1");
  assert.equal(b.retire(ta), false);
  assert.equal(b.advance(ta, "IO_READY"), false);
  assert.equal(b.acquire({ ...tb }, "resource"), false);
  assert.equal(b.advance(tb, "IO_READY"), true);
});
test("exact receipt retry survives newer action without moving simulation clock", () => {
  const e = instance();
  response(e);
  const keys = Object.keys(socketsFor(events.records[0]));
  const first = {
    receiptId: "r1",
    socketId: keys[0],
    accountId: "a",
    nowMs: 150001,
    gates: safe(150001),
  };
  const accepted = e.contribute(first);
  e.contribute({
    receiptId: "r2",
    socketId: keys[1],
    accountId: "a",
    nowMs: 150002,
    gates: safe(150002),
  });
  assert.deepEqual(e.contribute(first), accepted);
  assert.equal(e.snapshot().objectives.vent_count, 2);
  assert.throws(() => e.tick(150001, safe(150001)), /backwards/);
});
test("unsafe and sub-millisecond event clocks cannot collapse authored duration", () => {
  for (const nowMs of [1e308, Number.MAX_SAFE_INTEGER, -1, 0.5]) {
    assert.throws(
      () =>
        new EventInstance(events.records[0], {
          instanceId: "test",
          nowMs,
          sockets: socketsFor(events.records[0]),
        }),
    );
    const e = instance();
    const before = e.snapshot();
    assert.throws(() => e.tick(nowMs, safe(nowMs)));
    assert.deepEqual(e.snapshot(), before);
  }
});
test("baseline manifest requires63 distinct identities", () => {
  const bad = copy(graph);
  bad.baseline_poi_manifest = Array(63).fill(bad.baseline_poi_manifest[0]);
  assert.throws(() => createWorldIndex(bad, pois), /invariants/);
});

test("same resource cannot be reacquired while its disposer is executing", () => {
  let replacement;
  const m = new CellResidency((key) => {
    replacement = m.request("replacement", "v1");
    assert.equal(m.acquire(replacement, key), false);
    assert.equal(m.resourceUsers(key), 0);
  });
  const old = m.request("old", "v1");
  m.acquire(old, "a");
  m.retire(old);
  assert.equal(m.resourceUsers("a"), 0);
  assert.equal(m.acquire(replacement, "a"), true);
});
