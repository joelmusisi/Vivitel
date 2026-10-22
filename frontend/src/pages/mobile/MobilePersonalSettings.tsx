import { useNavigate } from "react-router-dom";
import PersonalSettingsForm from "../../components/PersonalSettingsForm";

export default function MobilePersonalSettings() {
  const navigate = useNavigate();
  return <PersonalSettingsForm variant="mobile" onBack={() => navigate("/mobile/profile")} />;
}
