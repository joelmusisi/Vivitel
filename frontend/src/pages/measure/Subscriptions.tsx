import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Subscriptions are managed inside the Reports page subscriptions tab. */
export default function Subscriptions() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/Analyze/insights/reports?tab=subscriptions", { replace: true });
  }, [navigate]);

  return null;
}
