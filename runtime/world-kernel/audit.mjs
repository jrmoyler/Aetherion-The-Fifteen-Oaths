import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createWorldIndex } from "./index.mjs";
const repo =
  process.env.AETHERION_REPO ??
  fileURLToPath(new URL("../../", import.meta.url));
const base = resolve(repo, "AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II");
const sources = {};
function read(file) {
  const bytes = readFileSync(resolve(base, file));
  sources[file] = {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  return JSON.parse(bytes);
}
const graph = read("WORLD_REGION_GRAPH.json"),
  pois = read("WORLD_POI_REGISTRY.json"),
  events = read("WORLD_EVENT_REGISTRY.json"),
  contracts = read("STREAMING_PROTOTYPE_CONTRACTS.json"),
  deliverables = read("DELIVERABLE_MANIFEST.json");
const coverage = {
  "coordinate-rebase": {
    implemented: [
      "normalizePosition: signed cell normalization with configurable width",
    ],
    missing: [
      "Origin epoch and synchronized camera/physics/VFX rebase",
      "Source adapter rebase comparison",
    ],
  },
  "cell-readiness": {
    implemented: [
      "CellResidency: monotonic generations, ordered readiness, stale completion refusal",
      "Shared resource leases, exact final disposal and failure cleanup",
    ],
    missing: [
      "Actual asynchronous IO/decoder/GPU uploads",
      "Pinned collision and protected anchors",
      "Memory budget, hysteresis and movement prefetch",
      "Atomic side-by-side revision swap",
    ],
  },
  "render-visibility": {
    implemented: [],
    missing: [
      "LOD, occlusion, instance identity, lighting, weather and water rendering",
      "Device measurements and silhouette acceptance",
    ],
  },
  "interior-handover": {
    implemented: [],
    missing: [
      "Permissions, pinned exits, committed portal handover and disconnect recovery",
    ],
  },
  "population-nav": {
    implemented: [
      "Semantic region graph routing; not a navmesh or collision route",
    ],
    missing: [
      "Spawn ownership leases, actor clearance, nav links and schedules",
    ],
  },
  "destruction-commit": {
    implemented: [],
    missing: [
      "Whitelisted mesh/collision/nav atomic commit",
      "Durable contribution/reward receipts and protected detours",
    ],
  },
  "replication-interest": {
    implemented: [],
    missing: [
      "Authority transport, ordered replication, epoch enforcement and private interest filtering",
    ],
  },
  "save-recovery": {
    implemented: [],
    missing: [
      "Durable journal transactions, validated snapshot restore, migrations and crash recovery",
    ],
  },
  "platform-gate": {
    implemented: [],
    missing: [
      "Real engine import/gameplay, nominated hardware and GPU/performance/accessibility gates",
    ],
  },
  "terrain-seams": {
    implemented: [],
    missing: [
      "Authored terrain, deterministic seams, watershed constraints and physical route tests",
    ],
  },
};
const result = {
  schema_version: "1.0.0",
  status: "PARTIAL_CPU_IMPLEMENTATION_UNAPPROVED",
  sources,
  registryCoverage: createWorldIndex(graph, pois).counts,
  baselinePoiCount: graph.baseline_poi_manifest.length,
  deliverableFamilies: deliverables.records.map((d) => ({
    id: d.id,
    path: d.path,
    productionComplete: false,
    implementation:
      {
        "WORLD_REGION_GRAPH.json": "PARTIAL: semantic topology only",
        "WORLD_POI_REGISTRY.json": "PARTIAL: semantic ID lookup only",
        "WORLD_EVENT_REGISTRY.json":
          "PARTIAL: trusted in-memory phase/receipt kernel only",
        "WORLD_STREAMING_ARCHITECTURE.md":
          "PARTIAL: coordinates and residency state only",
      }[d.path] ?? "NO_IMPLEMENTED_WORLD_EVIDENCE",
  })),
  streamingContracts: contracts.records.map((c) => ({
    id: c.id,
    canon_status: c.canon_status,
    productionComplete: false,
    ...coverage[c.id.replace("p2-streaming-09-", "")],
  })),
  events: events.records.map((e) => ({
    id: e.id,
    canon_status: e.canon_status,
    status: "PARTIAL_CPU_KERNEL",
    implemented: [
      "Strict named objective predicate parsing",
      "Phase order and timer gates",
      "Distinct authored socket receipts and duplicate/conflict refusal",
      "Safety/offline transition to recovery without objective rewards",
    ],
    missing: [
      "Production authored sockets",
      "NPC assistance integration",
      "Authority eligibility, catchment arbiter and schedule",
      "Durable outcome/reward journal, finite credit allocation",
      "Physical hazards, navigation, protected service restoration and presentation",
    ],
  })),
  boundary:
    "No source castable modification or enabled event extension. No physical POI placement. No engine, network, persistence, art or gameplay certification.",
};
checkCoverage();
function checkCoverage() {
  if (result.streamingContracts.some((c) => !c.implemented || !c.missing))
    throw Error("Unmapped contract");
}
const serialized = JSON.stringify(result, null, 2) + "\n";
if (process.argv[2]) writeFileSync(process.argv[2], serialized);
else process.stdout.write(serialized);
