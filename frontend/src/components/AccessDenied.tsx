import { Link } from "react-router-dom";
import { useAccess } from "../context/AccessContext";

export default function AccessDenied() {
  const { profile } = useAccess();

  return (
    <div className="page admin-page" style={{ padding: 32 }}>
      <div className="admin-title">Access denied</div>
      <p style={{ maxWidth: 560, lineHeight: 1.5 }}>
        {profile?.name ? `${profile.name}, you` : "You"} do not have permission to view this page or
        organisation scope. Contact an administrator to assign the correct role and dealer / organisation /
        database / site access.
      </p>
      <Link to="/" className="admin-btn" style={{ display: "inline-block", marginTop: 16 }}>
        Go home
      </Link>
    </div>
  );
}
