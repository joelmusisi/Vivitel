import { Navigate, useLocation } from "react-router-dom";
import { useAccess } from "../context/AccessContext";

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const { loading, canViewPath } = useAccess();

  if (loading) {
    return (
      <div className="page admin-page" style={{ padding: 24 }}>
        Loading access…
      </div>
    );
  }

  if (!canViewPath(location.pathname)) {
    return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
  }

  return children;
}
