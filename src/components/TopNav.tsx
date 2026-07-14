import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { RealtimeConnectionState } from "../lib/types";

interface Props {
  realtimeState: RealtimeConnectionState;
  lastRealtimeAt: string | null;
  email: string | null;
  onOpenGuide: () => void;
  onSignOut: () => void;
}

const REALTIME_LABEL: Record<RealtimeConnectionState, string> = {
  disabled: "실시간 미설정",
  connecting: "실시간 연결 중",
  connected: "실시간 연결됨",
  reconnecting: "실시간 재연결 중",
  offline: "네트워크 오프라인",
};

export function TopNav({ realtimeState, lastRealtimeAt, email, onOpenGuide, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const connected = realtimeState === "connected";
  const realtimeTitle = lastRealtimeAt
    ? `${REALTIME_LABEL[realtimeState]} · 최근 이벤트 ${new Date(lastRealtimeAt).toLocaleString("ko-KR")}`
    : REALTIME_LABEL[realtimeState];
  return (
    <nav className="nav" data-guide="navigation">
      <div className="nav-left">
        <span className="nav-brand">AE-Sentinel</span>
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          대시보드
        </NavLink>
        <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          이벤트
        </NavLink>
        <NavLink to="/recipients" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          SMS 수신자
        </NavLink>
        <NavLink to="/vessels" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          선박 · 계류삭
        </NavLink>
      </div>
      <div className="nav-right">
        <span
          className="conn"
          title={realtimeTitle}
          data-guide="connection-status"
        >
          <span className={`conn-dot ${connected ? "on" : ""}`} />
          {REALTIME_LABEL[realtimeState]}
        </span>
        <button className="guide-launch" onClick={onOpenGuide} data-guide="guide-launch">
          <CircleHelp size={15} />
          <span>사용 가이드</span>
        </button>
        <div className="usermenu">
          <button className="usermenu-btn" onClick={() => setOpen((v) => !v)}>
            관리자 ▾
          </button>
          {open && (
            <div className="usermenu-pop" onMouseLeave={() => setOpen(false)}>
              <div className="email">{email ?? "signed-in"}</div>
              <button className="btn btn-ghost btn-block" onClick={onSignOut}>
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
