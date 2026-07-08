import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "./config";
import type {
  AlertRecord,
  BerthingResult,
  Bollard,
  DashboardSummary,
  DepartureResult,
  EventRecord,
  LineLayout,
  LineStatus,
  RiskLevel,
  Vessel,
  VesselStatus,
} from "./types";

export interface LineInput {
  lineId?: string;
  siteId?: string;
  berthId?: string;
  layout?: LineLayout;
  riskLevel?: RiskLevel;
  riskScore?: number;
  deviceOnline?: boolean;
  bollardId?: string | null;
  vesselId?: string | null;
}

export interface VesselInput {
  vesselId?: string;
  name?: string;
  siteId?: string;
  berthId?: string;
  imo?: string;
  vesselType?: string;
  lengthOverallM?: number;
  lat?: number;
  lon?: number;
  status?: VesselStatus;
}

export interface BollardInput {
  bollardId?: string;
  siteId?: string;
  berthId?: string;
  positionM?: number;
  label?: string;
  twinSlot?: number | null;
}

export interface EventInput {
  lineId: string;
  riskLevel: RiskLevel;
  riskScore?: number;
}

export interface DeleteResult {
  deleted: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    // Use the ID token: the API Gateway JWT authorizer's audience is the app
    // client id, which matches the ID token's `aud` claim (not the access token).
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

interface Envelope<T> {
  requestId: string;
  timestamp: string;
  data: T;
  error: { code: string; message: string } | null;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(config.apiBase + path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || (json && json.error)) {
    throw new Error(json?.error?.message || `${res.status} ${res.statusText}`);
  }
  return (json as Envelope<T>).data;
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
}

export interface EventQuery {
  lineId?: string;
  riskLevel?: RiskLevel;
  limit?: number;
}

export const api = {
  listLines: () => req<LineStatus[]>("GET", "/v1/lines"),
  getLine: (id: string) => req<LineStatus>("GET", `/v1/lines/${encodeURIComponent(id)}`),
  summary: () => req<DashboardSummary>("GET", "/v1/dashboard/summary"),
  listEvents: (q: EventQuery = {}) =>
    req<EventRecord[]>("GET", `/v1/events${qs(q as Record<string, string | number | undefined>)}`),
  getEvent: (id: string) => req<EventRecord>("GET", `/v1/events/${encodeURIComponent(id)}`),
  ackEvent: (id: string) => req<EventRecord>("POST", `/v1/events/${encodeURIComponent(id)}/ack`),
  testAlert: (lineId?: string) => req<AlertRecord>("POST", "/v1/alerts/test", { lineId }),
  listAlerts: () => req<AlertRecord[]>("GET", "/v1/alerts"),

  // --- writes (CRUD) ---
  createLine: (body: LineInput) => req<LineStatus>("POST", "/v1/lines", body),
  updateLine: (id: string, body: LineInput) =>
    req<LineStatus>("PUT", `/v1/lines/${encodeURIComponent(id)}`, body),
  deleteLine: (id: string) => req<DeleteResult>("DELETE", `/v1/lines/${encodeURIComponent(id)}`),
  createEvent: (body: EventInput) => req<EventRecord>("POST", "/v1/events", body),
  deleteEvent: (id: string) => req<DeleteResult>("DELETE", `/v1/events/${encodeURIComponent(id)}`),

  // --- vessels ---
  listVessels: () => req<Vessel[]>("GET", "/v1/vessels"),
  getVessel: (id: string) => req<Vessel>("GET", `/v1/vessels/${encodeURIComponent(id)}`),
  createVessel: (body: VesselInput) => req<Vessel>("POST", "/v1/vessels", body),
  updateVessel: (id: string, body: VesselInput) =>
    req<Vessel>("PUT", `/v1/vessels/${encodeURIComponent(id)}`, body),
  deleteVessel: (id: string) => req<DeleteResult>("DELETE", `/v1/vessels/${encodeURIComponent(id)}`),

  // --- berthing workflow (transient vessel<->line association) ---
  berthVessel: (id: string, body: { berthId?: string; bollardIds?: string[] } = {}) =>
    req<BerthingResult>("POST", `/v1/vessels/${encodeURIComponent(id)}/berthing`, body),
  departVessel: (id: string) =>
    req<DepartureResult>("POST", `/v1/vessels/${encodeURIComponent(id)}/departure`),

  // --- bollards (fixed shore assets carrying the sensors) ---
  listBollards: () => req<Bollard[]>("GET", "/v1/bollards"),
  getBollard: (id: string) => req<Bollard>("GET", `/v1/bollards/${encodeURIComponent(id)}`),
  createBollard: (body: BollardInput) => req<Bollard>("POST", "/v1/bollards", body),
  updateBollard: (id: string, body: BollardInput) =>
    req<Bollard>("PUT", `/v1/bollards/${encodeURIComponent(id)}`, body),
  deleteBollard: (id: string) =>
    req<DeleteResult>("DELETE", `/v1/bollards/${encodeURIComponent(id)}`),
};
