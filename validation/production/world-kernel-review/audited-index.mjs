// Proposed Phase II CPU kernel. No rendering, world placement, authority transport or durable storage.
const copy = (value) => structuredClone(value);
function check(ok, message) {
  if (!ok) throw new Error(message);
}
function id(value) {
  check(typeof value === "string" && value.length > 0, "Expected nonempty ID");
  return value;
}
function number(value) {
  check(Number.isFinite(value), "Expected finite number");
  return value;
}
function integer(value) {
  check(Number.isSafeInteger(value), "Expected safe integer");
  return value;
}
function index(records) {
  check(Array.isArray(records), "Expected records array");
  const result = new Map();
  for (const row of records) {
    id(row.id);
    check(!result.has(row.id), `Duplicate ID: ${row.id}`);
    result.set(row.id, copy(row));
  }
  return result;
}

export function createWorldIndex(graph, poiRegistry) {
  check(
    graph.schema_version === "1.0.0" && poiRegistry.schema_version === "1.0.0",
    "Unsupported schema version",
  );
  const regions = index(graph.records),
    pois = index(poiRegistry.records),
    edges = index(graph.edges),
    adjacency = new Map([...regions.keys()].map((k) => [k, new Set()]));
  check(
    regions.size === 15 &&
      edges.size === 30 &&
      new Set([...regions.values()].map((r) => r.oath_id)).size === 15 &&
      graph.baseline_poi_manifest.length === 63,
    "Phase II continent invariants violated",
  );
  for (const edge of edges.values()) {
    const a = adjacency.get(edge.from_region_id),
      b = adjacency.get(edge.to_region_id);
    check(a && b && a !== b, "Invalid edge endpoints");
    check(
      edge.kind === "bidirectional_land_adjacency",
      "Unsupported edge kind",
    );
    check(!a.has(edge.to_region_id), "Duplicate adjacency");
    a.add(edge.to_region_id);
    b.add(edge.from_region_id);
  }
  for (const region of regions.values()) {
    check(Array.isArray(region.neighbor_ids), "Missing neighbor IDs");
    check(
      JSON.stringify([...adjacency.get(region.id)].sort()) ===
        JSON.stringify([...region.neighbor_ids].sort()),
      "Neighbor/edge mismatch",
    );
    const capital = pois.get(region.capital_id);
    check(
      capital?.region_id === region.id && capital.kind === "capital",
      "Invalid capital",
    );
  }
  for (const poi of pois.values()) {
    const region = regions.get(poi.region_id);
    check(
      region && (poi.oath_id === null || poi.oath_id === region.oath_id),
      "Invalid POI region/Oath",
    );
    for (const adjacent of poi.adjacent_region_ids ?? [])
      check(
        adjacency.get(poi.region_id).has(adjacent),
        "Invalid adjacent POI region",
      );
  }
  for (const baseline of graph.baseline_poi_manifest) {
    const poi = pois.get(baseline.id);
    check(
      poi && poi.region_id === baseline.region_id && poi.name === baseline.name,
      "Baseline POI mismatch",
    );
  }
  const route = (from, to) => {
    check(regions.has(from) && regions.has(to), "Unknown region");
    const queue = [[from]],
      visited = new Set([from]);
    for (const path of queue) {
      const last = path.at(-1);
      if (last === to) return path;
      for (const next of [...adjacency.get(last)].sort())
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
    }
    return null;
  };
  check(
    [...regions.keys()].every((k) => route(regions.keys().next().value, k)),
    "Disconnected continent",
  );
  return Object.freeze({
    region: (key) => {
      check(regions.has(key), "Unknown region");
      return copy(regions.get(key));
    },
    poi: (key) => {
      check(pois.has(key), "Unknown POI");
      return copy(pois.get(key));
    },
    poisInRegion: (key) => {
      check(regions.has(key), "Unknown region");
      return [...pois.values()]
        .filter((p) => p.region_id === key)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(copy);
    },
    route,
    counts: Object.freeze({
      regions: regions.size,
      pois: pois.size,
      edges: edges.size,
    }),
  });
}

export function normalizePosition(position, config) {
  check(
    config.schema_version === "1.0.0" &&
      config.axis === "RH_Y_UP_X_EAST_NEGATIVE_Z_NORTH",
    "Unsupported coordinate config",
  );
  id(config.revision);
  const width = number(config.cell_width_m);
  check(width > 0, "Invalid cell width");
  const out = {
    world_id: id(position.world_id),
    space_id: id(position.space_id),
    cell_x: integer(position.cell_x),
    cell_z: integer(position.cell_z),
    local_x_m: number(position.local_x_m),
    y_m: number(position.y_m),
    local_z_m: number(position.local_z_m),
  };
  for (const axis of ["x", "z"]) {
    const local = `local_${axis}_m`,
      cell = `cell_${axis}`;
    const delta = Math.floor(out[local] / width);
    out[cell] = integer(out[cell] + delta);
    out[local] -= delta * width;
    check(
      out[local] >= 0 && out[local] < width,
      "Position outside numeric precision",
    );
    if (Object.is(out[local], -0)) out[local] = 0;
  }
  return out;
}

const STAGES = [
  "REQUESTED",
  "IO_READY",
  "DECODED",
  "COLLISION_READY",
  "GAMEPLAY_READY",
  "PRESENTATION_READY",
];
export class CellResidency {
  #generations = new Map();
  #cells = new Map();
  #resources = new Map();
  constructor(dispose = () => {}) {
    check(typeof dispose === "function", "Expected disposer");
    this.dispose = dispose;
  }
  request(cellKey, revision) {
    id(cellKey);
    id(revision);
    check(!this.#cells.has(cellKey), "Retire existing cell before requesting");
    const generation = (this.#generations.get(cellKey) ?? 0) + 1;
    integer(generation);
    this.#generations.set(cellKey, generation);
    const token = Object.freeze({ cellKey, revision, generation });
    this.#cells.set(cellKey, { token, stage: "REQUESTED", leases: new Set() });
    return token;
  }
  #current(token) {
    const cell = this.#cells.get(token?.cellKey);
    return cell &&
      cell.token.revision === token.revision &&
      cell.token.generation === token.generation
      ? cell
      : undefined;
  }
  advance(token, stage, readiness = {}) {
    const cell = this.#current(token);
    if (!cell) return false;
    check(
      STAGES.indexOf(stage) === STAGES.indexOf(cell.stage) + 1,
      "Invalid stage transition",
    );
    if (stage === "GAMEPLAY_READY")
      check(
        ["authority", "collision", "navigation", "mandatoryCues"].every(
          (k) => readiness[k] === true,
        ) && readiness.revision === token.revision,
        "Unsafe or mixed revision gameplay admission",
      );
    cell.stage = stage;
    return true;
  }
  acquire(token, resourceKey) {
    const cell = this.#current(token);
    if (!cell) return false;
    id(resourceKey);
    if (cell.leases.has(resourceKey)) return false;
    cell.leases.add(resourceKey);
    this.#resources.set(
      resourceKey,
      (this.#resources.get(resourceKey) ?? 0) + 1,
    );
    return true;
  }
  retire(token, reason = "RETIRING") {
    check(
      ["RETIRING", "FAILED", "CANCELLED"].includes(reason),
      "Invalid retirement reason",
    );
    const cell = this.#current(token);
    if (!cell) return false;
    this.#cells.delete(token.cellKey);
    const disposed = [];
    for (const key of cell.leases) {
      const remaining = this.#resources.get(key) - 1;
      if (remaining) this.#resources.set(key, remaining);
      else {
        this.#resources.delete(key);
        disposed.push(key);
      }
    }
    const errors = [];
    for (const key of disposed)
      try {
        this.dispose(key);
      } catch (error) {
        errors.push(error);
      }
    if (errors.length)
      throw new AggregateError(
        errors,
        "Resource disposal failed; leases already released",
      );
    return true;
  }
  state(cellKey) {
    const cell = this.#cells.get(cellKey);
    return cell
      ? { ...cell.token, stage: cell.stage, resources: [...cell.leases].sort() }
      : { cellKey, stage: "UNREQUESTED" };
  }
  mayEnter(token) {
    const cell = this.#current(token);
    return Boolean(
      cell && ["GAMEPLAY_READY", "PRESENTATION_READY"].includes(cell.stage),
    );
  }
  resourceUsers(key) {
    return this.#resources.get(key) ?? 0;
  }
}

function objectives(contract) {
  const variables = new Map();
  for (const v of contract.state_variables) {
    check(!variables.has(v.name), "Duplicate objective");
    check(
      (v.type === "integer" &&
        Number.isSafeInteger(v.initial) &&
        v.initial >= 0) ||
        (v.type === "boolean" && typeof v.initial === "boolean"),
      "Invalid objective type/initial",
    );
    variables.set(v.name, v);
  }
  const terms = contract.success_predicate.split(" AND ").map((term) => {
    const match = /^([a-z][a-z0-9_]*) == (true|false|0|[1-9][0-9]*)$/.exec(
      term,
    );
    check(match && variables.has(match[1]), "Unsupported success predicate");
    const target = JSON.parse(match[2]),
      v = variables.get(match[1]);
    check(
      typeof target === typeof v.initial &&
        (typeof target === "boolean" ||
          (Number.isSafeInteger(target) && target >= v.initial)),
      "Invalid objective target",
    );
    return { name: match[1], target };
  });
  check(
    new Set(terms.map((t) => t.name)).size === variables.size &&
      terms.length === variables.size,
    "Predicate must cover each objective once",
  );
  return terms;
}
// Call only from trusted simulation authority after validating authored objective sockets.
// No source castable adapter is enabled. The supplied socket allowlist is a required authored dependency.
export class EventInstance {
  #contract;
  #terms;
  #sockets;
  #receipts = new Map();
  #time;
  #entered;
  #phase = "forecast";
  #revision = 0;
  #values;
  #outcome = null;
  constructor(contract, { instanceId, nowMs, sockets }) {
    Object.defineProperty(this, "instanceId", {
      value: id(instanceId),
      enumerable: true,
    });
    this.#contract = copy(contract);
    this.#terms = objectives(contract);
    this.#time = this.#entered = number(nowMs);
    check(nowMs >= 0, "Negative clock");
    const expected = [
      "forecast",
      "activation",
      "response",
      "resolution",
      "reconstruction",
      "cooldown",
    ];
    check(
      JSON.stringify(contract.phases.map((p) => p.name)) ===
        JSON.stringify(expected),
      "Unsupported phase order",
    );
    for (const p of contract.phases)
      check(
        Number.isSafeInteger(p.duration_ms) && p.duration_ms > 0,
        "Invalid phase duration",
      );
    check(sockets && typeof sockets === "object", "Authored sockets required");
    this.#sockets = new Map(Object.entries(sockets));
    for (const [key, value] of this.#sockets) {
      id(key);
      check(
        this.#terms.some((t) => t.name === value),
        "Unknown socket objective",
      );
    }
    for (const term of this.#terms)
      check(
        [...this.#sockets.values()].filter((v) => v === term.name).length >=
          (typeof term.target === "boolean" ? 1 : term.target),
        "Insufficient authored sockets",
      );
    this.#values = Object.fromEntries(
      contract.state_variables.map((v) => [v.name, v.initial]),
    );
  }
  #clock(nowMs) {
    number(nowMs);
    check(nowMs >= this.#time, "Clock moved backwards");
    this.#time = nowMs;
  }
  #move(phase, nowMs) {
    this.#phase = phase;
    this.#entered = nowMs;
    this.#revision++;
  }
  contribute({ receiptId, socketId, accountId, nowMs, gates }) {
    id(receiptId);
    id(socketId);
    id(accountId);
    number(nowMs);
    check(nowMs >= this.#time, "Clock moved backwards");
    const prior = this.#receipts.get(receiptId);
    if (prior) {
      check(
        prior.socketId === socketId && prior.accountId === accountId,
        "Receipt conflict",
      );
      return copy(prior);
    }
    check(
      this.#phase === "response" && nowMs < this.#entered + this.#duration(),
      "Objective window closed",
    );
    this.#safety(nowMs, gates);
    check(gates.protectedRoutes && gates.catchmentLease, "Unsafe contribution");
    const objective = this.#sockets.get(socketId);
    check(objective, "Unknown authored socket");
    check(
      ![...this.#receipts.values()].some((r) => r.socketId === socketId),
      "Socket already completed",
    );
    const term = this.#terms.find((t) => t.name === objective);
    check(
      this.#values[objective] !== term.target,
      "Objective already complete",
    );
    this.#clock(nowMs);
    this.#values[objective] =
      typeof term.target === "boolean"
        ? term.target
        : this.#values[objective] + 1;
    const receipt = {
      receiptId,
      socketId,
      accountId,
      objective,
      instanceId: this.instanceId,
    };
    this.#receipts.set(receiptId, receipt);
    return copy(receipt);
  }
  #duration() {
    return this.#contract.phases.find((p) => p.name === this.#phase)
      .duration_ms;
  }
  #safety(nowMs, gates) {
    check(
      gates?.checkedAtMs === nowMs &&
        typeof gates.protectedRoutes === "boolean" &&
        typeof gates.catchmentLease === "boolean",
      "Fresh explicit safety gates required",
    );
  }
  tick(nowMs, gates = {}) {
    number(nowMs);
    check(nowMs >= this.#time, "Clock moved backwards");
    if (["forecast", "activation", "response"].includes(this.#phase))
      this.#safety(nowMs, gates);
    this.#clock(nowMs);
    const elapsed = nowMs - this.#entered;
    if (
      ["forecast", "activation", "response"].includes(this.#phase) &&
      (gates.protectedRoutes === false || gates.catchmentLease === false)
    ) {
      this.#outcome = "unpenalized-setback";
      this.#move("reconstruction", nowMs);
    } else if (
      this.#phase === "forecast" &&
      elapsed >= this.#duration() &&
      gates.catchmentLease === true
    )
      this.#move("activation", nowMs);
    else if (
      this.#phase === "activation" &&
      elapsed >= this.#duration() &&
      gates.protectedRoutes === true
    )
      this.#move("response", nowMs);
    else if (this.#phase === "response") {
      if (this.#terms.every((t) => this.#values[t.name] === t.target)) {
        this.#outcome = "success";
        this.#move("resolution", nowMs);
      } else if (elapsed >= this.#duration()) {
        this.#outcome = "setback";
        this.#move("resolution", nowMs);
      }
    } else if (this.#phase === "resolution" && gates.outcomeCommitted === true)
      this.#move("reconstruction", nowMs);
    else if (
      this.#phase === "reconstruction" &&
      elapsed >= this.#duration() &&
      gates.servicesRestored === true
    )
      this.#move("cooldown", nowMs);
    return this.snapshot();
  }
  recover(nowMs) {
    this.#clock(nowMs);
    if (
      ["forecast", "activation", "response", "resolution"].includes(this.#phase)
    ) {
      this.#outcome ??= "unpenalized-setback";
      this.#move("reconstruction", nowMs);
    }
    return this.snapshot();
  }
  snapshot() {
    return {
      schema_version: "1.0.0",
      canon_status: "PROPOSED",
      instanceId: this.instanceId,
      eventId: this.#contract.id,
      phase: this.#phase,
      phaseRevision: this.#revision,
      enteredMs: this.#entered,
      deadlineMs: this.#entered + this.#duration(),
      outcome: this.#outcome,
      objectives: copy(this.#values),
      receipts: [...this.#receipts.values()].map(copy),
    };
  }
}
