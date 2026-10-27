import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canForPath, setStoredApiKey } from "../../utils/api";
import { rememberPostLoginPath } from "../../utils/phoneMode";
import "../../components/mobile/MobilePhoneShell.css";

const MOBILE_PERSONAL_SETTINGS_PATH = "/mobile/personal-settings";

const readSelectedPath = () =>
  typeof window === "undefined" ? "" : String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();

export default function MobileProfile() {
  const navigate = useNavigate();
  const canViewPersonalSettings = canForPath("/Control/user-settings/personal-settings", "view");
  const [selectedPath, setSelectedPath] = useState(readSelectedPath);

  useEffect(() => {
    const refresh = () => setSelectedPath(readSelectedPath());
    window.addEventListener("vivi:orgchange", refresh);
    window.addEventListener("vivi:contextchange", refresh);
    return () => {
      window.removeEventListener("vivi:orgchange", refresh);
      window.removeEventListener("vivi:contextchange", refresh);
    };
  }, []);

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

  // The app-level OrgRibbon (mounted with its bar hidden on phones) owns the picker.
  const openSitePicker = () => window.dispatchEvent(new Event("vivi.orgRibbon.open"));

  const pathParts = selectedPath.split("/").map((part) => part.trim()).filter(Boolean);

  return (
    <div className="page mobile-profile-page">
      <section className="mobile-profile-card">
        <h2>Site selection</h2>
        <div className="mobile-profile-links">
          <button type="button" className="mobile-scope-button" onClick={openSitePicker}>
            <span>
              {pathParts.length ? pathParts[pathParts.length - 1] : "Choose a site"}
              <small>{pathParts.length > 1 ? pathParts.slice(0, -1).join(" › ") : "Dealer, organisation, database and site"}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
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
