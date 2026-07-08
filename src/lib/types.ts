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
  vesselId?: string | null;
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
  generatedAt: string;
  recentEvents: EventRecord[];
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
  summary: DashboardSummary | null;
  loaded: boolean;
  error: string | null;
  reload: () => void;
}
