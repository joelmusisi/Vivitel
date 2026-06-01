import { Navigate, useLocation } from "react-router-dom";
import { useAccess } from "../context/AccessContext";

export function AuthGate({ children }: { children: JSX.Element }) {
  const { loading, isAuthenticated } = useAccess();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page admin-page" style={{ padding: 24 }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
