export type RiskLevel = "NORMAL" | "CAUTION" | "DANGER";
export type EventWorkflowStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "FALSE_POSITIVE";

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
  lastSeenAt?: string | null;
  lastMeasurementAt?: string | null;
  statusMeasurementAt?: string | null; // measurement time of the reading that set riskLevel
  sensorMode: SensorMode;
  sensorId?: string | null; // AWS IoT Thing attached to this line's eye/splice
  sensorBoundAt?: string | null;
  bollardId?: string | null; // current quay attachment point
  vesselId?: string | null; // transient: vessel moored on this line right now
}

/** Operator-tunable frequency severity bands (backend settings API). */
export interface PiezoBandSettings {
  minActiveHz: number;
  normalMaxHz: number;
  cautionMaxHz: number;
  updatedAt?: string | null;
}

/** One-time sensor onboarding state of a mooring line:
 *  PENDING(미연동) → DEVICE(피에조 실센서). VIRTUAL is retained for legacy demos. */
export type SensorMode = "PENDING" | "DEVICE" | "VIRTUAL";

/** Fixed quay-side mooring attachment point. Sensors belong to LineStatus. */
export interface Bollard {
  bollardId: string;
  siteId: string;
  berthId: string;
  positionM: number;
  label?: string | null;
  twinSlot?: number | null; // bound digital-twin post number (1-based)
  createdAt: string;
  updatedAt: string;
}

export type SensorConnectivityStatus = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";

/** Assignable physical hardware discovered from the AWS IoT Core registry. */
export interface PiezoSensor {
  sensorId: string;
  thingName: string;
  displayName: string;
  sensorKind: "PIEZO";
  source: "AWS_IOT_CORE";
  registrationStatus: "REGISTERED";
  connectivityStatus: SensorConnectivityStatus;
  lastConnectedAt?: string | null;
  lastSeenAt?: string | null;
  siteId?: string | null;
  berthId?: string | null;
  assignedLineId?: string | null;
  assignedBollardId?: string | null;
  assignedBollardLabel?: string | null;
  assignedVesselId?: string | null;
  assignedBerthId?: string | null;
  available: boolean;
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

export interface GuidanceContent {
  riskLevel: RiskLevel;
  headline: string;
  situation: string;
  immediateActions: string[];
  followupActions: string[];
  citations: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ResponseGuidance {
  schemaVersion: "1.0.0";
  type: "response.guidance.generated";
  traceId: string;
  eventId: string;
  generatedAt: string;
  lineId: string;
  vesselId?: string | null;
  siteId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  source: "KB";
  alertDispatched: boolean;
  guidance: GuidanceContent;
}

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
  features: Record<string, number | string>;
  context: Record<string, unknown>;
  snapbackZone?: SnapbackZone | null;
  alertMessage?: string | null;
  responseGuidance?: ResponseGuidance | null;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  workflowStatus: EventWorkflowStatus;
  workflowUpdatedAt?: string | null;
  workflowNote?: string | null;
  handledBy?: string | null;
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
  smsRecipientCount?: number;
}

export interface TestAlertResult {
  event: EventRecord;
  alert: AlertRecord | null;
}

export interface SmsRecipient {
  recipientId: string;
  name: string;
  phoneNumber: string;
  siteId?: string | null;
  berthId?: string | null;
  role?: string | null;
  enabled: boolean;
  smsOptIn: boolean;
  notes?: string | null;
  lastNotifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalLines: number;
  riskCounts: Record<RiskLevel, number>;
  activeDangerEvents: number;
  totalEvents: number;
  totalAlerts: number;
  totalSmsRecipients?: number;
  totalVessels?: number;
  totalBollards?: number;
  generatedAt: string;
  recentEvents: EventRecord[];
}

/** Latest physical reading delivered over the dashboard WebSocket. */
export interface LiveSensorReading {
  lineId: string;
  eventId: string;
  occurredAt: string;
  receivedAt: string;
  sensorKind: "PIEZO";
  sensorId?: string | null;
  freqHz: number;
  loadRatio?: number | null;
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
  | "sensor.reading.received"
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
    /** Newly persisted event that produced this risk snapshot. */
    lastEventId?: string;
    occurredAt?: string;
    snapbackZone?: SnapbackZone | null;
    alertMessage?: string;
    responseGuidance?: ResponseGuidance | null;
    smsRecipientCount?: number;
    deviceOnline?: boolean;
    lastSeenAt?: string;
    /** Whether this event still owns the line's latest status snapshot. */
    statusCurrent?: boolean;
    measurement?: {
      sensorKind: "PIEZO";
      eventId: string;
      sensorId?: string;
      freqHz: number;
      loadRatio?: number;
    };
  };
}

export type RealtimeConnectionState =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

/** Shared live state provided by the authed layout via router Outlet context. */
export interface LiveData {
  lines: LineStatus[];
  vessels: Vessel[];
  bollards: Bollard[];
  summary: DashboardSummary | null;
  loaded: boolean;
  error: string | null;
  reload: () => void;
  realtimeState: RealtimeConnectionState;
  lastRealtimeAt: string | null;
  liveReadings: Record<string, LiveSensorReading>;
}
