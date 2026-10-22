import { useNavigate } from "react-router-dom";
import OrgRibbon from "../../components/OrgRibbon";
import { canForPath, setStoredApiKey } from "../../utils/api";
import { rememberPostLoginPath } from "../../utils/phoneMode";
import "../../components/mobile/MobilePhoneShell.css";

const MOBILE_PERSONAL_SETTINGS_PATH = "/mobile/personal-settings";

export default function MobileProfile() {
  const navigate = useNavigate();
  const canViewPersonalSettings = canForPath("/Control/user-settings/personal-settings", "view");

  const openPersonalSettings = () => {
    const confirmed = window.confirm(
      "Open Personal Settings to update your user name, phone number, and password?\n\nEmail cannot be changed here. Saved changes sync across all Vivitel platforms."
    );
    if (confirmed) navigate(MOBILE_PERSONAL_SETTINGS_PATH);
  };

  const signOut = () => {
    rememberPostLoginPath();
    setStoredApiKey("");
    window.localStorage.setItem("vivi.apiKey.disabled", "true");
    window.location.assign("/login");
  };

  return (
    <div className="page mobile-profile-page">
      <section className="mobile-profile-card">
        <h2>Site selection</h2>
        <OrgRibbon hideRibbon={false} />
      </section>

      {canViewPersonalSettings && (
        <section className="mobile-profile-card">
          <h2>Personal Settings</h2>
          <div className="mobile-profile-links">
            <button type="button" onClick={openPersonalSettings}>
              <span>
                Personal Settings
                <small>Name, phone, password</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </section>
      )}

      <section className="mobile-profile-card">
        <button type="button" className="ghost" style={{ width: "100%" }} onClick={signOut}>
          Sign out
        </button>
      </section>
    </div>
  );
}
