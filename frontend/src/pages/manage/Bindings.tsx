import { useEffect, useMemo, useState } from "react";
import { getBindings, getDeviceReportingSettings, saveBinding, saveDeviceReportingSettings } from "../../utils/api";
import "../../index.css";

const bindingSections = ["Notifications Bindings", "Location Bindings", "Devices Bindings"];

type BindingRow = {
  name: string;
  assetCount: number;
  groupCount: number;
};

type DeviceBindingRow = BindingRow & {
  deviceType: string;
};

type BindingDraft = {
  name: string;
  deviceType?: string;
};

type DeviceReportingSettings = {
  enabled: boolean;
  apn: string;
  apnUsername: string;
  apnPassword: string;
  apnAuth: "PAP" | "CHAP";
  serverDomain: string;
  serverPort: number;
  protocol: "TCP" | "UDP";
  tls: "None" | "TLS/DTLS";
};

const defaultNotificationBindings: BindingRow[] = [
  { name: "Default notification template", assetCount: 0, groupCount: 0 },
  { name: "Speeding alerts", assetCount: 0, groupCount: 0 },
  { name: "Harsh braking", assetCount: 0, groupCount: 0 }
];

export default function Bindings() {
  const [activeSection, setActiveSection] = useState(bindingSections[0]);
  const defaultSettings: DeviceReportingSettings = {
    enabled: true,
    apn: "linksapn",
    apnUsername: "",
    apnPassword: "",
    apnAuth: "PAP",
    serverDomain: "ttk.za.mixtel.com",
    serverPort: 22000,
    protocol: "TCP",
    tls: "None"
  };
  const [deviceSettings, setDeviceSettings] = useState<DeviceReportingSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<DeviceReportingSettings>(defaultSettings);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      const settings = await getDeviceReportingSettings<DeviceReportingSettings>();
      if (!mounted) return;
      if (settings) {
        setDeviceSettings(settings);
        setSettingsDraft(settings);
      }
    };
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const [notificationRows, setNotificationRows] = useState<BindingRow[]>([]);
  const [locationRows, setLocationRows] = useState<BindingRow[]>([]);
  const [deviceRows, setDeviceRows] = useState<DeviceBindingRow[]>([]);
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>({ name: "", deviceType: "" });

  const rows = useMemo(() => {
    if (activeSection === "Location Bindings") return locationRows;
    if (activeSection === "Devices Bindings") return deviceRows;
    return notificationRows;
  }, [activeSection, deviceRows, notificationRows, locationRows]);

  useEffect(() => {
    let mounted = true;
    const loadBindings = async () => {
      const [notifications, locations, devices] = await Promise.all([
        getBindings<BindingRow>("notifications"),
        getBindings<BindingRow>("locations"),
        getBindings<DeviceBindingRow>("devices")
      ]);
      if (!mounted) return;
      setNotificationRows(notifications.length ? notifications : defaultNotificationBindings);
      setLocationRows(locations);
      setDeviceRows(devices);
    };
    void loadBindings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOrgChange = () => {
      void (async () => {
        const [notifications, locations, devices] = await Promise.all([
          getBindings<BindingRow>("notifications"),
          getBindings<BindingRow>("locations"),
          getBindings<DeviceBindingRow>("devices")
        ]);
        setNotificationRows(notifications.length ? notifications : defaultNotificationBindings);
        setLocationRows(locations);
        setDeviceRows(devices);
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, []);

  const saveSettings = async () => {
    setSettingsStatus("saving");
    const stored = await saveDeviceReportingSettings(settingsDraft);
    if (stored) {
      setDeviceSettings(settingsDraft);
      setSettingsStatus("saved");
      window.setTimeout(() => setSettingsStatus("idle"), 1400);
    } else {
      setSettingsStatus("error");
      window.setTimeout(() => setSettingsStatus("idle"), 1400);
    }
  };

  const cancelSettings = () => {
    setSettingsDraft(deviceSettings);
    setSettingsStatus("idle");
  };

  const openBindingModal = () => {
    setBindingDraft({ name: "", deviceType: "" });
    setBindingModalOpen(true);
  };

  const saveBindingDraft = async () => {
    const name = bindingDraft.name.trim();
    if (!name) {
      alert("Provide a binding name.");
      return;
    }
    if (activeSection === "Devices Bindings" && !bindingDraft.deviceType?.trim()) {
      alert("Provide a device type for device bindings.");
      return;
    }
    const id = `${activeSection.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    if (activeSection === "Devices Bindings") {
      const payload: DeviceBindingRow = {
        name,
        deviceType: bindingDraft.deviceType?.trim() || "—",
        assetCount: 0,
        groupCount: 0
      };
      const stored = await saveBinding("devices", { id, ...payload });
      if (stored) setDeviceRows((current) => [payload, ...current]);
    } else if (activeSection === "Location Bindings") {
      const payload: BindingRow = { name, assetCount: 0, groupCount: 0 };
      const stored = await saveBinding("locations", { id, ...payload });
      if (stored) setLocationRows((current) => [payload, ...current]);
    } else {
      const payload: BindingRow = { name, assetCount: 0, groupCount: 0 };
      const stored = await saveBinding("notifications", { id, ...payload });
      if (stored) setNotificationRows((current) => [payload, ...current]);
    }
    setBindingModalOpen(false);
  };

  return (
    <div className="page bindings-page">
      <div className="bindings-topbar">
        <div className="bindings-title">Bindings</div>
        <div className="bindings-path">EA-Transfleet Services-… / Africa - MiXEA - Transfl…</div>
      </div>

      <section className="bindings-card">
        <div className="bindings-layout">
          <aside className="bindings-sidebar">
            {bindingSections.map((section) => (
              <button
                key={section}
                type="button"
                className={`bindings-tab ${activeSection === section ? "active" : ""}`}
                onClick={() => setActiveSection(section)}
              >
                {section}
              </button>
            ))}
          </aside>

          <div className="bindings-panel">
            <div className="bindings-panel-header">
              <div className="bindings-panel-title">{activeSection}</div>
              <div className="bindings-header-actions">
                <input className="bindings-search" placeholder="Filter" />
                <button
                  type="button"
                  className="bindings-add-btn"
                  data-nav="/measure/insights/reports?category=List%20Reports&report=Asset%20Notifications%20Configuration%20Report"
                >
                  View reports
                </button>
                <button type="button" className="bindings-add-btn" aria-label="Add binding" onClick={openBindingModal}>
                  +
                </button>
              </div>
            </div>

            {activeSection === "Devices Bindings" && (
              <section className="bindings-settings-card">
                <div className="bindings-settings-title">Device reporting settings</div>
                <div className="bindings-settings-grid">
                  <div className="bindings-settings-group">
                    <div className="bindings-settings-label">GPRS Context</div>
                    <div className="bindings-toggle">
                      <button
                        type="button"
                        className={settingsDraft.enabled ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, enabled: true }))}
                      >
                        Enable
                      </button>
                      <button
                        type="button"
                        className={!settingsDraft.enabled ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, enabled: false }))}
                      >
                        Disable
                      </button>
                    </div>
                    <label className="bindings-field">
                      APN
                      <input
                        className="bindings-input"
                        value={settingsDraft.apn}
                        onChange={(event) => setSettingsDraft((current) => ({ ...current, apn: event.target.value }))}
                      />
                    </label>
                    <label className="bindings-field">
                      APN Username
                      <input
                        className="bindings-input"
                        value={settingsDraft.apnUsername}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, apnUsername: event.target.value }))
                        }
                      />
                    </label>
                    <label className="bindings-field">
                      APN Password
                      <input
                        className="bindings-input"
                        type="password"
                        value={settingsDraft.apnPassword}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, apnPassword: event.target.value }))
                        }
                      />
                    </label>
                    <div className="bindings-settings-label">GPRS Authentication</div>
                    <div className="bindings-toggle">
                      <button
                        type="button"
                        className={settingsDraft.apnAuth === "PAP" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, apnAuth: "PAP" }))}
                      >
                        PAP
                      </button>
                      <button
                        type="button"
                        className={settingsDraft.apnAuth === "CHAP" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, apnAuth: "CHAP" }))}
                      >
                        CHAP
                      </button>
                    </div>
                  </div>

                  <div className="bindings-settings-group">
                    <div className="bindings-settings-label">Server Settings</div>
                    <label className="bindings-field">
                      Domain
                      <input
                        className="bindings-input"
                        value={settingsDraft.serverDomain}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({ ...current, serverDomain: event.target.value }))
                        }
                      />
                    </label>
                    <label className="bindings-field">
                      Port
                      <input
                        className="bindings-input"
                        type="number"
                        min={1}
                        max={65535}
                        value={settingsDraft.serverPort}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            serverPort: Number(event.target.value) || 0
                          }))
                        }
                      />
                    </label>
                    <div className="bindings-settings-label">Protocol</div>
                    <div className="bindings-toggle">
                      <button
                        type="button"
                        className={settingsDraft.protocol === "TCP" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, protocol: "TCP" }))}
                      >
                        TCP
                      </button>
                      <button
                        type="button"
                        className={settingsDraft.protocol === "UDP" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, protocol: "UDP" }))}
                      >
                        UDP
                      </button>
                    </div>
                    <div className="bindings-settings-label">TLS Encryption</div>
                    <div className="bindings-toggle">
                      <button
                        type="button"
                        className={settingsDraft.tls === "None" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, tls: "None" }))}
                      >
                        None
                      </button>
                      <button
                        type="button"
                        className={settingsDraft.tls === "TLS/DTLS" ? "active" : ""}
                        onClick={() => setSettingsDraft((current) => ({ ...current, tls: "TLS/DTLS" }))}
                      >
                        TLS/DTLS
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bindings-settings-actions">
                  <div className={`bindings-settings-status ${settingsStatus}`}
                    aria-live="polite"
                  >
                    {settingsStatus === "saving"
                      ? "Saving…"
                      : settingsStatus === "saved"
                        ? "Saved"
                        : settingsStatus === "error"
                          ? "Save failed"
                          : ""}
                  </div>
                  <div className="bindings-settings-buttons">
                    <button type="button" className="bindings-ghost" onClick={cancelSettings}>
                      Cancel
                    </button>
                    <button type="button" className="bindings-primary" onClick={saveSettings}>
                      Save
                    </button>
                  </div>
                </div>
              </section>
            )}

            <div className="bindings-table">
              {activeSection === "Devices Bindings" ? (
                <>
                  <div className="bindings-row bindings-head bindings-row-device">
                    <div>Template name</div>
                    <div>Mobile device type</div>
                    <div>Asset count</div>
                    <div>Configuration group count</div>
                    <div className="bindings-actions" aria-hidden="true">⋯</div>
                  </div>
                  {deviceRows.map((row) => (
                    <div key={row.name} className="bindings-row bindings-row-device">
                      <div className="bindings-link">{row.name}</div>
                      <div>{row.deviceType}</div>
                      <div>{row.assetCount}</div>
                      <div>{row.groupCount}</div>
                      <div className="bindings-actions">
                        <button type="button" className="bindings-action-btn" aria-label="Actions">
                          ⋯
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="bindings-row bindings-head">
                    <div>Template name</div>
                    <div>Asset count</div>
                    <div>Configuration group count</div>
                    <div className="bindings-actions" aria-hidden="true">⋯</div>
                  </div>
                  {rows.map((row) => (
                    <div key={row.name} className="bindings-row">
                      <div className="bindings-link">{row.name}</div>
                      <div>{row.assetCount}</div>
                      <div>{row.groupCount}</div>
                      <div className="bindings-actions">
                        <button type="button" className="bindings-action-btn" aria-label="Actions">
                          ⋯
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {bindingModalOpen && (
        <div className="bindings-modal" role="dialog" aria-modal="true">
          <div className="bindings-modal-card">
            <div className="bindings-modal-header">
              <div>Add {activeSection.replace(" Bindings", "")} binding</div>
              <button type="button" className="bindings-modal-close" onClick={() => setBindingModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="bindings-modal-body">
              <label>
                Name
                <input
                  className="bindings-input"
                  value={bindingDraft.name}
                  onChange={(event) => setBindingDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              {activeSection === "Devices Bindings" && (
                <label>
                  Device type
                  <input
                    className="bindings-input"
                    value={bindingDraft.deviceType}
                    onChange={(event) =>
                      setBindingDraft((current) => ({ ...current, deviceType: event.target.value }))
                    }
                  />
                </label>
              )}
            </div>
            <div className="bindings-modal-actions">
              <button type="button" className="bindings-ghost" onClick={() => setBindingModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="bindings-primary" onClick={saveBindingDraft}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
