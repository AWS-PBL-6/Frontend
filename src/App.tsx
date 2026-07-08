import { Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./auth/Login";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./features/Dashboard";
import { EventsHistory } from "./features/EventsHistory";
import { LinesManage } from "./features/LinesManage";
import { VesselsManage } from "./features/VesselsManage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/events" element={<EventsHistory />} />
          <Route path="/vessels" element={<VesselsManage />} />
          <Route path="/lines" element={<LinesManage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
