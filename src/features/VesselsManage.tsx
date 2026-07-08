import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { api } from "../lib/api";
import { VesselForm } from "../components/VesselForm";
import { LineForm } from "../components/LineForm";
import { effectiveRisk } from "../twin/palette";
import type { LineStatus, LiveData, RiskLevel, Vessel, VesselStatus } from "../lib/types";

const STATUS_LABEL: Record<VesselStatus, string> = {
  BERTHED: "접안",
  APPROACHING: "접근 중",
  DEPARTED: "출항",
};
const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };

type LineModal = { existing?: LineStatus; presetVesselId?: string } | null;

/** Vessel management — the single place to manage vessels AND their mooring
 *  lines (add/edit/delete/map). Each vessel expands to its lines; a trailing
 *  section covers unmoored (vessel-less) bollard sensors. */
export function VesselsManage() {
  const { lines, reload } = useOutletContext<LiveData>();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  // Track collapsed ids so vessels are EXPANDED by default (incl. new ones).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [lineModal, setLineModal] = useState<LineModal>(null);

  const load = async () => {
    setLoading(true);
    try {
      setVessels(await api.listVessels());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
    reload(); // keep the dashboard/twin in sync
  };

  useEffect(() => {
    load();
  }, []);

  const linesByVessel = useMemo(() => {
    const m = new Map<string, LineStatus[]>();
    for (const l of lines) {
      if (!l.vesselId) continue;
      const a = m.get(l.vesselId) ?? [];
      a.push(l);
      m.set(l.vesselId, a);
    }
    for (const a of m.values()) a.sort((x, y) => x.lineId.localeCompare(y.lineId));
    return m;
  }, [lines]);

  const unmoored = useMemo(
    () => lines.filter((l) => !l.vesselId).sort((a, b) => a.lineId.localeCompare(b.lineId)),
    [lines],
  );

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const remove = async (v: Vessel) => {
    if (!window.confirm(`${v.name} (${v.vesselId}) 선박을 삭제할까요?`)) return;
    try {
      await api.deleteVessel(v.vesselId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const removeLine = async (l: LineStatus) => {
    if (!window.confirm(`${l.lineId} 계류삭을 삭제할까요?`)) return;
    try {
      await api.deleteLine(l.lineId);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  // Berthing = one-click attach the berth's free lines to this vessel.
  const berth = async (v: Vessel) => {
    try {
      const r = await api.berthVessel(v.vesselId);
      await load();
      alert(`${v.name} 접안 완료 · 계류삭 ${r.attachedLineIds.length}개 귀속`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "접안 실패");
    }
  };

  // Departure = release every line mapped to this vessel.
  const depart = async (v: Vessel) => {
    if (!window.confirm(`${v.name} 출항 처리할까요? (계류삭 매핑 해제)`)) return;
    try {
      const r = await api.departVessel(v.vesselId);
      await load();
      alert(`${v.name} 출항 완료 · 계류삭 ${r.releasedLineIds.length}개 해제`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "출항 실패");
    }
  };

  const pos = (v: Vessel) =>
    v.lat != null && v.lon != null ? `${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}` : "–";

  const lineRow = (l: LineStatus) => {
    const risk = effectiveRisk(l);
    const score = l.vesselId ? l.riskScore : 0;
    return (
      <div className="vessel-line-row" key={l.lineId}>
        <strong className="vlr-id">{l.lineId}</strong>
        <span className="vlr-bollard muted">볼라드 · {l.bollardId ?? "미지정"}</span>
        <span className={`badge badge--${risk}`}>
          <span className={`dot dot--${risk}`} />
          {RISK_LABEL[risk]}
        </span>
        <span className="rail-score">{score.toFixed(2)}</span>
        <span className="vlr-actions">
          <button className="btn-sm" onClick={() => setLineModal({ existing: l })}>
            수정
          </button>
          <button className="btn-sm btn-danger" onClick={() => removeLine(l)}>
            삭제
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>선박 · 계류삭 관리</h2>
        <button className="btn btn-accent btn-icon" onClick={() => setCreating(true)}>
          <Plus size={16} /> 선박 추가
        </button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        선박을 펼치면 그 선박의 계류삭(홋줄)을 추가·수정·삭제·볼라드 매핑할 수 있습니다.
      </p>

      {error && <div className="banner-danger">{error}</div>}

      {loading ? (
        <div className="center" style={{ padding: 40 }}>
          <div className="spin" />
        </div>
      ) : (
        <div>
          <div className="table-head">
            <span>선박명</span>
            <span>선종</span>
            <span>IMO</span>
            <span>상태</span>
            <span>위치</span>
            <span />
          </div>
          {vessels.map((v) => {
            const vlines = linesByVessel.get(v.vesselId) ?? [];
            const open = !collapsed.has(v.vesselId);
            const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              fn();
            };
            return (
              <div key={v.vesselId}>
                <div
                  className="table-row vessel-row"
                  onClick={() => toggle(v.vesselId)}
                  role="button"
                  aria-expanded={open}
                >
                  <div className="vessel-name-cell">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <div>
                      <strong>{v.name}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {v.vesselId} · 계류삭 {vlines.length}
                      </div>
                    </div>
                  </div>
                  <span className="muted">{v.vesselType || "–"}</span>
                  <span className="muted">{v.imo || "–"}</span>
                  <span>
                    <span className="badge">{STATUS_LABEL[v.status]}</span>
                  </span>
                  <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{pos(v)}</span>
                  <span className="row-actions">
                    {v.status === "BERTHED" ? (
                      <button className="btn-sm" onClick={stop(() => depart(v))}>
                        출항
                      </button>
                    ) : (
                      <button className="btn-sm" onClick={stop(() => berth(v))}>
                        접안
                      </button>
                    )}
                    <button className="btn-sm" onClick={stop(() => setEditing(v))}>
                      수정
                    </button>
                    <button className="btn-sm btn-danger" onClick={stop(() => remove(v))}>
                      삭제
                    </button>
                  </span>
                </div>
                {open && (
                  <div className="vessel-lines">
                    <div className="vessel-lines-head">
                      <span className="muted">계류삭 {vlines.length}</span>
                      <button
                        className="btn-sm btn-icon"
                        onClick={() => setLineModal({ presetVesselId: v.vesselId })}
                      >
                        <Plus size={14} /> 계류삭 추가
                      </button>
                    </div>
                    {vlines.map(lineRow)}
                    {vlines.length === 0 && (
                      <div className="muted" style={{ padding: "6px 0" }}>
                        이 선박에 연결된 계류삭이 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {vessels.length === 0 && <div className="muted">등록된 선박이 없습니다.</div>}

          <div style={{ marginTop: 24 }}>
            <div className="vessel-lines-head" style={{ marginBottom: 8 }}>
              <span className="section-label" style={{ margin: 0 }}>
                미계선 계류삭 (선박 없음) · {unmoored.length}
              </span>
              <button className="btn-sm btn-icon" onClick={() => setLineModal({})}>
                <Plus size={14} /> 계류삭 추가
              </button>
            </div>
            <div className="vessel-lines">
              {unmoored.map(lineRow)}
              {unmoored.length === 0 && (
                <div className="muted" style={{ padding: "6px 0" }}>
                  미계선 계류삭이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {creating && (
        <VesselForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <VesselForm
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {lineModal && (
        <LineForm
          existing={lineModal.existing ?? null}
          presetVesselId={lineModal.presetVesselId}
          onClose={() => setLineModal(null)}
          onSaved={() => {
            setLineModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
