export type RiskLevel = "NORMAL" | "CAUTION" | "DANGER";

export interface Point { x: number; y: number; }
export interface SnapbackZone { radiusMeters: number; polygon: Point[]; }
export interface LineLayout { anchorX: number; anchorY: number; headingDeg: number; }

export interface LineStatus {
  lineId: string;
  siteId: string;
  berthId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  updatedAt: string;
  layout: LineLayout;
  lastEventId?: string | null;
  snapbackZone?: SnapbackZone | null;
  deviceOnline: boolean;
  bollardId?: string | null; // permanent home bollard of this sensor
  vesselId?: string | null; // transient: vessel moored on this line right now
}

/** One-time sensor onboarding state of a bollard:
 *  PENDING(미연동) → DEVICE(실센서) | VIRTUAL(가상 모드). */
export type SensorMode = "PENDING" | "DEVICE" | "VIRTUAL";

/** Fixed quay-side bollard carrying an AE sensor (shore asset). */
export interface Bollard {
  bollardId: string;
  siteId: string;
  berthId: string;
  positionM: number;
  label?: string | null;
  twinSlot?: number | null; // bound digital-twin post number (1-based)
  sensorMode: SensorMode;
  sensorId?: string | null; // physical AE sensor id (DEVICE mode)
  sensorBoundAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VesselStatus = "BERTHED" | "APPROACHING" | "DEPARTED";

export interface Vessel {
  vesselId: string;
  name: string;
  siteId: string;
  berthId: string;
  imo?: string | null;
  vesselType?: string | null;
  lengthOverallM?: number | null;
  lat?: number | null;
  lon?: number | null;
  status: VesselStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClassProbabilities { NORMAL: number; CAUTION: number; DANGER: number; }

export interface EventRecord {
  eventId: string;
  traceId: string;
  lineId: string;
  siteId: string;
  berthId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  classProbabilities: ClassProbabilities;
  modelVersion: string;
  occurredAt: string;
  createdAt: string;
  features: Record<string, number>;
  context: Record<string, unknown>;
  snapbackZone?: SnapbackZone | null;
  alertMessage?: string | null;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
}

export interface AlertRecord {
  alertId: string;
  eventId: string;
  lineId: string;
  riskLevel: RiskLevel;
  message: string;
  channel: string;
  sentAt: string;
  traceId: string;
  messageId?: string | null;
}

export interface DashboardSummary {
  totalLines: number;
  riskCounts: Record<RiskLevel, number>;
  activeDangerEvents: number;
  totalEvents: number;
  totalAlerts: number;
  totalVessels?: number;
  totalBollards?: number;
  generatedAt: string;
  recentEvents: EventRecord[];
}

/** Result of the berthing workflow (POST /v1/vessels/{id}/berthing). */
export interface BerthingResult {
  vessel: Vessel;
  attachedLineIds: string[];
}

/** Result of the departure workflow (POST /v1/vessels/{id}/departure). */
export interface DepartureResult {
  vessel: Vessel;
  releasedLineIds: string[];
}

/** ws-risk-message.v1 */
export type WsType =
  | "line.status.updated"
  | "risk.caution.detected"
  | "risk.danger.detected"
  | "snapback.zone.updated"
  | "alert.sent"
  | "device.offline";

export interface WsMessage {
  type: WsType;
  version: string;
  traceId: string;
  sentAt: string;
  data: {
    lineId: string;
    riskLevel: RiskLevel;
    riskScore: number;
    snapbackZone?: SnapbackZone;
    alertMessage?: string;
  };
}

/** Shared live state provided by the authed layout via router Outlet context. */
export interface LiveData {
  lines: LineStatus[];
  vessels: Vessel[];
  bollards: Bollard[];
  summary: DashboardSummary | null;
  loaded: boolean;
  error: string | null;
  reload: () => void;
}
