import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { LineStatus, RiskLevel, Vessel } from "../lib/types";
import { effectiveRisk, HUD_RISK, RISK_LABEL, RISK_ORDER, STATUS_LABEL, worstRisk } from "./palette";
import { approachState, type TwinLayout } from "./layout";

function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** Tiny mouse glyph with one control lit in red (left button or scroll wheel). */
function MouseGlyph({ part }: { part: "left" | "wheel" }) {
  const red = "#ff5a48";
  return (
    <svg width="15" height="21" viewBox="0 0 15 21" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <rect x="1" y="1" width="13" height="19" rx="6.3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7.5" y1="1.4" x2="7.5" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      {part === "left" && <path d="M7 2 L7 7.6 L2.4 7.6 L2.4 5 Q2.4 2.4 5.4 2 Z" fill={red} opacity="0.92" />}
      <rect
        x="6.3"
        y="3.6"
        width="2.4"
        height="4.2"
        rx="1.2"
        fill={part === "wheel" ? red : "currentColor"}
        opacity={part === "wheel" ? 1 : 0.5}
      />
    </svg>
  );
}

function ControlHint({ part, extra, label }: { part: "left" | "wheel"; extra?: string; label: string }) {
  return (
    <span className="twin-hint">
      <MouseGlyph part={part} />
      {extra && <span className="twin-hint-mark">{extra}</span>}
      {label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className="twin-badge" style={{ color: HUD_RISK[risk] }}>
      <i style={{ background: HUD_RISK[risk] }} />
      {RISK_LABEL[risk]}
    </span>
  );
}

function LineRow({
  line,
  bollardId,
  onClick,
}: {
  line: LineStatus;
  bollardId?: string;
  onClick: () => void;
}) {
  const risk = effectiveRisk(line);
  const score = line.vesselId ? line.riskScore : 0;
  return (
    <button className="twin-line-row" onClick={onClick} title={`${line.lineId} 상세`}>
      <i className="twin-dot" style={{ background: HUD_RISK[risk] }} />
      <span className="twin-line-id">{line.lineId}</span>
      <span className="twin-line-bollard">{bollardId ?? "–"}</span>
      <span className="twin-line-bar">
        <i
          style={{
            width: `${Math.round(score * 100)}%`,
            background: HUD_RISK[risk],
          }}
        />
      </span>
      <span className="twin-line-score">{score.toFixed(2)}</span>
    </button>
  );
}

export interface HudProps {
  vessels: Vessel[];
  lines: LineStatus[];
  layout: TwinLayout;
  selectedVesselId: string | null;
  nowSec: number;
  demo?: boolean;
  testing?: boolean;
  onSelectVessel: (vesselId: string) => void;
  onOpenVessel: (vesselId: string) => void;
  onSelectLine: (line: LineStatus) => void;
  onTestAlert?: () => void;
  onAddBollard?: () => void;
}

export function Hud({
  vessels,
  lines,
  layout,
  selectedVesselId,
  nowSec,
  demo = false,
  testing = false,
  onSelectVessel,
  onOpenVessel,
  onSelectLine,
  onTestAlert,
  onAddBollard,
}: HudProps) {
  const [collapsed, setCollapsed] = useState(false);
  const now = new Date();

  const linesByVessel = useMemo(() => {
    const m = new Map<string, LineStatus[]>();
    for (const l of lines) {
      if (!l.vesselId) continue;
      const arr = m.get(l.vesselId) ?? [];
      arr.push(l);
      m.set(l.vesselId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel] || b.riskScore - a.riskScore);
    }
    return m;
  }, [lines]);

  const vesselIds = useMemo(() => new Set(vessels.map((v) => v.vesselId)), [vessels]);
  const looseLines = useMemo(
    () =>
      lines
        .filter((l) => !l.vesselId || !vesselIds.has(l.vesselId))
        .sort((a, b) => b.riskScore - a.riskScore),
    [lines, vesselIds],
  );

  const active = vessels
    .filter((v) => v.status !== "DEPARTED")
    .sort(
      (a, b) =>
        (a.status === "BERTHED" ? 0 : 1) - (b.status === "BERTHED" ? 0 : 1) ||
        a.name.localeCompare(b.name),
    );
  const departed = vessels.filter((v) => v.status === "DEPARTED");

  const counts = useMemo(() => {
    const c: Record<RiskLevel, number> = { NORMAL: 0, CAUTION: 0, DANGER: 0 };
    for (const l of lines) c[effectiveRisk(l)] += 1;
    return c;
  }, [lines]);

  const danger = useMemo(
    () =>
      lines
        .filter((l) => effectiveRisk(l) === "DANGER")
        .sort((a, b) => b.riskScore - a.riskScore)[0] ?? null,
    [lines],
  );

  const approachSub = (vesselId: string): string | null => {
    const plan = layout.approaches.find((p) => p.vessel.vesselId === vesselId);
    if (!plan) return null;
    const st = approachState(plan, nowSec);
    return st.arrived
      ? "접안 대기 중"
      : `잔여 ${(st.distM / 1000).toFixed(1)} km · ETA ${Math.max(1, Math.ceil(st.etaSec / 60))}분`;
  };

  return (
    <div className="twin-hud">
      {/* ── 좌측 상단: 관제 리스트 (반투명 글래스) ─────────────────────── */}
      <section className={`twin-panel ${collapsed ? "twin-panel--collapsed" : ""}`} aria-label="관제 현황">
        <header className="twin-panel-head">
          <div>
            <h2>부산항 관제 현황</h2>
            <p>
              선박 {active.length} · 홋줄 {lines.length}
              {demo && <em className="twin-chip-demo">DEMO</em>}
            </p>
          </div>
          <button
            className="twin-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "패널 펼치기" : "패널 접기"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        </header>

        {!collapsed && (
          <div className="twin-panel-body">
            {active.length === 0 && looseLines.length === 0 && (
              <p className="twin-empty">등록된 선박·홋줄이 없습니다. 선박 관리에서 등록하세요.</p>
            )}

            {active.map((v) => {
              const vlines = linesByVessel.get(v.vesselId) ?? [];
              const risk = worstRisk(vlines.map((l) => l.riskLevel));
              const selected = v.vesselId === selectedVesselId;
              const open = selected || risk === "DANGER";
              const sub =
                v.status === "APPROACHING"
                  ? approachSub(v.vesselId)
                  : `${v.berthId || "–"} 선석 · 홋줄 ${vlines.length}`;
              return (
                <div key={v.vesselId} className={`twin-vessel ${selected ? "twin-vessel--sel" : ""}`}>
                  <button className="twin-vessel-row" onClick={() => onSelectVessel(v.vesselId)}>
                    <i className="twin-dot" style={{ background: HUD_RISK[risk] }} />
                    <span className="twin-vessel-name">{v.name}</span>
                    <span className={`twin-status twin-status--${v.status}`}>{STATUS_LABEL[v.status]}</span>
                  </button>
                  <div className="twin-vessel-sub">
                    <span>{sub}</span>
                    <span className="twin-vessel-actions">
                      <RiskBadge risk={risk} />
                      <button className="twin-mini" onClick={() => onOpenVessel(v.vesselId)}>
                        상세
                      </button>
                    </span>
                  </div>
                  {open && vlines.length > 0 && (
                    <div className="twin-lines">
                      {vlines.map((l) => (
                        <LineRow
                          key={l.lineId}
                          line={l}
                          bollardId={layout.bollardByLine[l.lineId]}
                          onClick={() => onSelectLine(l)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {looseLines.length > 0 && (
              <div className="twin-group">
                <h3>미계선 센서</h3>
                {looseLines.map((l) => (
                  <LineRow
                    key={l.lineId}
                    line={l}
                    bollardId={layout.bollardByLine[l.lineId]}
                    onClick={() => onSelectLine(l)}
                  />
                ))}
              </div>
            )}

            {departed.length > 0 && (
              <div className="twin-group twin-group--dim">
                <h3>출항</h3>
                {departed.map((v) => (
                  <div key={v.vesselId} className="twin-departed">
                    {v.name} <span>{STATUS_LABEL[v.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!collapsed && (onTestAlert || onAddBollard) && (
          <footer className="twin-panel-foot">
            {onTestAlert && (
              <button className="twin-mini" onClick={onTestAlert} disabled={testing}>
                {testing ? "발송 중…" : "테스트 경보"}
              </button>
            )}
            {onAddBollard && (
              <button
                className="twin-mini"
                onClick={onAddBollard}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={13} /> 볼라드 추가
              </button>
            )}
          </footer>
        )}
      </section>

      {/* ── 우측 상단: KPI ─────────────────────────────────────────────── */}
      <section className="twin-kpis" aria-label="현황 요약">
        <div className="twin-kpi">
          <b>{active.length}</b>
          <span>선박</span>
        </div>
        {(["NORMAL", "CAUTION", "DANGER"] as RiskLevel[]).map((k) => (
          <div key={k} className={`twin-kpi ${k === "DANGER" && counts.DANGER > 0 ? "twin-kpi--alert" : ""}`}>
            <b style={{ color: HUD_RISK[k] }}>{counts[k]}</b>
            <span>
              <i className="twin-dot" style={{ background: HUD_RISK[k] }} />
              {RISK_LABEL[k]}
            </span>
          </div>
        ))}
      </section>

      {/* ── 상단 중앙: 위험 경보 배너 ──────────────────────────────────── */}
      {danger && (
        <section className="twin-banner" role="alert">
          <span className="twin-banner-icon">⚠</span>
          <div>
            <b>
              위험 — {danger.lineId} 파단 위험 (score {danger.riskScore.toFixed(2)})
            </b>
            <p>
              볼라드 {layout.bollardByLine[danger.lineId] ?? "–"} · 위험반경{" "}
              {danger.snapbackZone?.radiusMeters ?? 30} m — 구역 밖 대피 유도
            </p>
          </div>
          <button className="twin-mini twin-mini--danger" onClick={() => onSelectLine(danger)}>
            상세
          </button>
        </section>
      )}

      {/* ── 좌측 하단: 범례 ───────────────────────────────────────────── */}
      <section className="twin-legend" aria-label="범례">
        {(["DANGER", "CAUTION", "NORMAL"] as RiskLevel[]).map((k) => (
          <span key={k}>
            <i className="twin-dot" style={{ background: HUD_RISK[k] }} />
            {RISK_LABEL[k]}
          </span>
        ))}
        <span>
          <i className="twin-legend-ring" />
          위험반경
        </span>
        <span className="twin-legend-sep" />
        <ControlHint part="left" extra="↻" label="드래그 회전" />
        <ControlHint part="wheel" extra="＋" label="휠 확대" />
        <ControlHint part="left" extra="✕" label="배경 클릭 · 선택 해제" />
      </section>

      {/* ── 우측 하단: 시계 ───────────────────────────────────────────── */}
      <section className="twin-clock" aria-label="현재 시각">
        <b>{fmtClock(now)}</b>
        <span>
          {fmtDate(now)} · BUSAN PORT · DIGITAL TWIN{" "}
          <em className={demo ? "twin-live twin-live--demo" : "twin-live"}>{demo ? "SIM" : "LIVE"}</em>
        </span>
      </section>
    </div>
  );
}
