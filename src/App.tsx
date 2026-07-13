import { Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./auth/Login";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./features/Dashboard";
import { EventsHistory } from "./features/EventsHistory";
import { SmsRecipientsManage } from "./features/SmsRecipientsManage";
import { VesselsManage } from "./features/VesselsManage";
import { TwinDemo } from "./features/TwinDemo";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/demo" element={<TwinDemo />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/events" element={<EventsHistory />} />
          <Route path="/recipients" element={<SmsRecipientsManage />} />
          <Route path="/vessels" element={<VesselsManage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
