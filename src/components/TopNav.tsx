import { useState } from "react";
import { NavLink } from "react-router-dom";

interface Props {
  connected: boolean;
  email: string | null;
  onSignOut: () => void;
}

export function TopNav({ connected, email, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="nav">
      <div className="nav-left">
        <span className="nav-brand">AE-Sentinel</span>
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          대시보드
        </NavLink>
        <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          이벤트
        </NavLink>
        <NavLink to="/vessels" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          선박 · 계류삭
        </NavLink>
      </div>
      <div className="nav-right">
        <span className="conn" title={connected ? "실시간 연결됨" : "연결 끊김"}>
          <span className={`conn-dot ${connected ? "on" : ""}`} />
          {connected ? "실시간 연결됨" : "연결 대기"}
        </span>
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
