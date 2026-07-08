import type { LineStatus, RiskLevel } from "../lib/types";

const RISK_COLOR: Record<RiskLevel, string> = {
  NORMAL: "var(--normal)",
  CAUTION: "var(--caution)",
  DANGER: "var(--danger)",
};

export function LineRail({
  lines,
  onSelect,
}: {
  lines: LineStatus[];
  onSelect: (line: LineStatus) => void;
}) {
  const sorted = [...lines].sort((a, b) => b.riskScore - a.riskScore);
  return (
    <div className="rail">
      {sorted.map((line) => (
        <button key={line.lineId} className="rail-item" onClick={() => onSelect(line)}>
          <span className={`dot dot--${line.riskLevel}`} />
          <span className="rail-id">{line.lineId}</span>
          <span className="rail-bar">
            <i
              style={{
                width: `${Math.round(line.riskScore * 100)}%`,
                background: RISK_COLOR[line.riskLevel],
              }}
            />
          </span>
          <span className="rail-score">{line.riskScore.toFixed(2)}</span>
        </button>
      ))}
      {sorted.length === 0 && <div className="muted">등록된 계류삭이 없습니다.</div>}
    </div>
  );
}
