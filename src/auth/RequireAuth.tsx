import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth() {
  const { authenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="center" style={{ height: "100vh" }}>
        <div className="spin" />
      </div>
    );
  }
  return authenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
