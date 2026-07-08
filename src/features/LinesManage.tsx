import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../lib/api";
import { LineForm } from "../components/LineForm";
import type { LineStatus, LiveData, RiskLevel } from "../lib/types";

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };

export function LinesManage() {
  const { reload } = useOutletContext<LiveData>();
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LineStatus | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLines(await api.listLines());
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

  const remove = async (l: LineStatus) => {
    if (!window.confirm(`${l.lineId} 계류삭을 삭제할까요?`)) return;
    try {
      await api.deleteLine(l.lineId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>라인 관리</h2>
        <button className="btn btn-accent" onClick={() => setCreating(true)}>
          + 라인 추가
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
            <span>라인 ID</span>
            <span>Site</span>
            <span>Berth</span>
            <span>위험도</span>
            <span>Score</span>
            <span />
          </div>
          {lines.map((l) => (
            <div className="table-row" key={l.lineId}>
              <strong>{l.lineId}</strong>
              <span className="muted">{l.siteId}</span>
              <span className="muted">{l.berthId}</span>
              <span>
                <span className={`badge badge--${l.riskLevel}`}>
                  <span className={`dot dot--${l.riskLevel}`} />
                  {RISK_LABEL[l.riskLevel]}
                </span>
              </span>
              <span className="rail-score">{l.riskScore.toFixed(2)}</span>
              <span className="row-actions">
                <button className="btn-sm" onClick={() => setEditing(l)}>
                  수정
                </button>
                <button className="btn-sm btn-danger" onClick={() => remove(l)}>
                  삭제
                </button>
              </span>
            </div>
          ))}
          {lines.length === 0 && <div className="muted">등록된 계류삭이 없습니다.</div>}
        </div>
      )}

      {creating && (
        <LineForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <LineForm
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
