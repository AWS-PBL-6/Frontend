import type { WsMessage } from "../lib/types";

const LABEL = { CAUTION: "주의", DANGER: "위험", NORMAL: "정상" } as const;

export function RiskGuidanceAlert({
  message,
  onClose,
  onOpenEvent,
}: {
  message: WsMessage;
  onClose: () => void;
  onOpenEvent: (eventId?: string) => void;
}) {
  const content = message.data.responseGuidance?.guidance;
  const headline = content?.headline ?? message.data.alertMessage ?? `${message.data.lineId} 경보`;
  return (
    <div className="risk-alert-backdrop" role="presentation">
      <section
        className={`risk-alert risk-alert--${message.data.riskLevel}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="risk-alert-title"
      >
        <div className="risk-alert-head">
          <span className={`badge badge--${message.data.riskLevel}`}>
            {LABEL[message.data.riskLevel]} · {(message.data.riskScore * 100).toFixed(1)}%
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="경보 닫기">×</button>
        </div>
        <h2 id="risk-alert-title">{headline}</h2>
        {content?.situation && <p>{content.situation}</p>}
        {!!content?.immediateActions.length && (
          <div className="risk-alert-actions">
            <strong>즉시 조치</strong>
            <ol>{content.immediateActions.map((action) => <li key={action}>{action}</li>)}</ol>
          </div>
        )}
        <div className="risk-alert-foot">
          <span>{message.data.lineId} · {new Date(message.sentAt).toLocaleString("ko-KR")}</span>
          <div>
            <button className="btn btn-ghost" onClick={onClose}>닫기</button>
            <button className="btn btn-accent" onClick={() => onOpenEvent(message.data.lastEventId)}>
              상세 대응 보기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
