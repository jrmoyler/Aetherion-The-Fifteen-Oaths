export interface WorldRecord {
  id: string;
  [key: string]: unknown;
}
export interface Region extends WorldRecord {
  oath_id: string;
  capital_id: string;
  neighbor_ids: string[];
}
export interface Poi extends WorldRecord {
  name: string;
  kind: string;
  region_id: string;
  oath_id: string | null;
  adjacent_region_ids?: string[];
}
export interface WorldGraph {
  schema_version: "1.0.0";
  records: Region[];
  edges: Array<
    WorldRecord & {
      from_region_id: string;
      to_region_id: string;
      kind: "bidirectional_land_adjacency";
    }
  >;
  baseline_poi_manifest: Array<{ id: string; region_id: string; name: string }>;
}
export function createWorldIndex(
  graph: WorldGraph,
  pois: { schema_version: "1.0.0"; records: Poi[] },
): Readonly<{
  region(id: string): Region;
  poi(id: string): Poi;
  poisInRegion(id: string): Poi[];
  route(from: string, to: string): string[] | null;
  counts: Readonly<{ regions: number; pois: number; edges: number }>;
}>;
export interface LogicalPosition {
  world_id: string;
  space_id: string;
  cell_x: number;
  cell_z: number;
  local_x_m: number;
  y_m: number;
  local_z_m: number;
}
export interface CoordinateConfig {
  schema_version: "1.0.0";
  revision: string;
  axis: "RH_Y_UP_X_EAST_NEGATIVE_Z_NORTH";
  cell_width_m: number;
}
export function normalizePosition(
  position: LogicalPosition,
  config: CoordinateConfig,
): LogicalPosition;
export interface RequestToken {
  readonly cellKey: string;
  readonly revision: string;
  readonly generation: number;
}
export type ReadyStage =
  | "REQUESTED"
  | "IO_READY"
  | "DECODED"
  | "COLLISION_READY"
  | "GAMEPLAY_READY"
  | "PRESENTATION_READY";
export interface Readiness {
  authority: boolean;
  collision: boolean;
  navigation: boolean;
  mandatoryCues: boolean;
  revision: string;
}
export class CellResidency {
  constructor(dispose?: (resourceKey: string) => void);
  request(cellKey: string, revision: string): RequestToken;
  advance(
    token: RequestToken,
    stage: ReadyStage,
    readiness?: Partial<Readiness>,
  ): boolean;
  acquire(token: RequestToken, resourceKey: string): boolean;
  retire(
    token: RequestToken,
    reason?: "RETIRING" | "FAILED" | "CANCELLED",
  ): boolean;
  state(cellKey: string): {
    cellKey: string;
    stage: ReadyStage | "UNREQUESTED";
    revision?: string;
    generation?: number;
    resources?: string[];
  };
  mayEnter(token: RequestToken): boolean;
  resourceUsers(key: string): number;
}
export interface EventContract {
  id: string;
  state_variables: Array<{
    name: string;
    type: "integer" | "boolean";
    initial: number | boolean;
  }>;
  success_predicate: string;
  phases: Array<{ name: string; duration_ms: number }>;
}
export interface Contribution {
  receiptId: string;
  socketId: string;
  accountId: string;
  nowMs: number;
  gates: SafetyGates;
}
export interface Receipt {
  receiptId: string;
  socketId: string;
  accountId: string;
  objective: string;
  instanceId: string;
}
export interface SafetyGates {
  checkedAtMs: number;
  catchmentLease: boolean;
  protectedRoutes: boolean;
}
export interface EventGates {
  checkedAtMs?: number;
  catchmentLease?: boolean;
  protectedRoutes?: boolean;
  outcomeCommitted?: boolean;
  servicesRestored?: boolean;
}
export interface EventSnapshot {
  schema_version: "1.0.0";
  canon_status: "PROPOSED";
  instanceId: string;
  eventId: string;
  phase: string;
  phaseRevision: number;
  enteredMs: number;
  deadlineMs: number;
  outcome: string | null;
  objectives: Record<string, number | boolean>;
  receipts: Receipt[];
}
export class EventInstance {
  constructor(
    contract: EventContract,
    options: {
      instanceId: string;
      nowMs: number;
      sockets: Record<string, string>;
    },
  );
  readonly instanceId: string;
  contribute(receipt: Contribution): Receipt;
  tick(nowMs: number, gates?: EventGates): EventSnapshot;
  recover(nowMs: number): EventSnapshot;
  snapshot(): EventSnapshot;
}
