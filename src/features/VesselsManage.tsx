import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../lib/api";
import { VesselForm } from "../components/VesselForm";
import type { LiveData, Vessel, VesselStatus } from "../lib/types";

const STATUS_LABEL: Record<VesselStatus, string> = {
  BERTHED: "접안",
  APPROACHING: "접근 중",
  DEPARTED: "출항",
};

export function VesselsManage() {
  const { reload } = useOutletContext<LiveData>();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);

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
    reload(); // keep the dashboard map/KPIs in sync
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (v: Vessel) => {
    if (!window.confirm(`${v.name} (${v.vesselId}) 선박을 삭제할까요?`)) return;
    try {
      await api.deleteVessel(v.vesselId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const pos = (v: Vessel) =>
    v.lat != null && v.lon != null ? `${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}` : "–";

  return (
    <div className="page">
      <div className="page-head">
        <h2>선박 관리</h2>
        <button className="btn btn-accent" onClick={() => setCreating(true)}>
          + 선박 추가
        </button>
      </div>

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
          {vessels.map((v) => (
            <div className="table-row" key={v.vesselId}>
              <strong>
                {v.name}
                <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{v.vesselId}</div>
              </strong>
              <span className="muted">{v.vesselType || "–"}</span>
              <span className="muted">{v.imo || "–"}</span>
              <span>
                <span className="badge">{STATUS_LABEL[v.status]}</span>
              </span>
              <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{pos(v)}</span>
              <span className="row-actions">
                <button className="btn-sm" onClick={() => setEditing(v)}>
                  수정
                </button>
                <button className="btn-sm btn-danger" onClick={() => remove(v)}>
                  삭제
                </button>
              </span>
            </div>
          ))}
          {vessels.length === 0 && <div className="muted">등록된 선박이 없습니다.</div>}
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
    </div>
  );
}
