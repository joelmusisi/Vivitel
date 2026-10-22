import { useEffect, useMemo, useState } from "react";
import { downloadAuthenticatedFile, getBindings } from "../../utils/api";
import { bindingMatchesSite } from "../../utils/notificationLibraryStore";
import { readActiveSiteName } from "../../utils/tenantContext";
import { showToast } from "../../utils/toast";
import "../../index.css";

type DeviceRow = {
  id: string;
  name: string;
  vendor: string;
  model: string;
  firmware: string;
  lastSeen: string;
  status: "active" | "offline" | "maintenance" | "staging";
  imeiCount: number;
  assignedAssets: number;
};

type DeviceBindingRecord = {
  id?: string;
  name?: string;
  site?: string;
  deviceType?: string;
  firmware?: string;
  status?: string;
};

export default function MobileDeviceAdmin() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");

  useEffect(() => {
    let mounted = true;
    const loadDevices = async () => {
      const bindings = await getBindings<DeviceBindingRecord>("devices").catch(() => []);
      if (!mounted) return;
      const activeSite = readActiveSiteName();
      const rows = bindings
        .filter((binding) => bindingMatchesSite(binding, activeSite))
        .map((binding, index) => {
          const name = String(binding.name ?? "").trim() || `Device ${index + 1}`;
          const deviceType = String(binding.deviceType ?? "").trim();
          const statusRaw = String(binding.status ?? "active").trim().toLowerCase();
          const status: DeviceRow["status"] =
            statusRaw === "offline" || statusRaw === "maintenance" || statusRaw === "staging"
              ? statusRaw
              : "active";
          return {
            id: String(binding.id ?? `dev-${index + 1}`),
            name,
            vendor: deviceType || "—",
            model: deviceType || "—",
            firmware: String(binding.firmware ?? "").trim() || "—",
            lastSeen: "—",
            status,
            imeiCount: 0,
            assignedAssets: 0
          } satisfies DeviceRow;
        });
      setDevices(rows);
    };
    void loadDevices();
    const handleOrgChange = () => {
      void loadDevices();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    window.addEventListener("vivi:bindingschange", handleOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
      window.removeEventListener("vivi:bindingschange", handleOrgChange);
    };
  }, []);

  const vendors = useMemo(() => Array.from(new Set(devices.map((d) => d.vendor).filter((v) => v !== "—"))), [devices]);
  const models = useMemo(() => Array.from(new Set(devices.map((d) => d.model).filter((v) => v !== "—"))), [devices]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesQuery =
        !query
        || device.name.toLowerCase().includes(query)
        || device.vendor.toLowerCase().includes(query)
        || device.model.toLowerCase().includes(query)
        || device.firmware.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || device.status === statusFilter;
      const matchesVendor = vendorFilter === "all" || device.vendor === vendorFilter;
      const matchesModel = modelFilter === "all" || device.model === modelFilter;
      return matchesQuery && matchesStatus && matchesVendor && matchesModel;
    });
  }, [devices, search, statusFilter, vendorFilter, modelFilter]);

  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== "all" || vendorFilter !== "all" || modelFilter !== "all";

  const handleDownloadMitacSoftware = async () => {
    const result = await downloadAuthenticatedFile("/downloads/mitac-software", "Vivitel_Mitac_Pack.zip");
    if (!result.ok) {
      showToast(result.error ?? "Download failed.", "error");
      return;
    }
    showToast("Mitac software download started.", "success");
  };

  return (
    <div className="page device-admin-page">
      <div className="device-admin-topbar">
        <div>
          <div className="device-admin-title">Mobile Device Admin</div>
          <div className="device-admin-path">Control / Mobile Device Admin</div>
        </div>
        <div className="device-admin-actions">
          <button
            type="button"
            className="device-admin-btn ghost"
            data-nav="/Analyze/insights/reports?category=List%20Reports&report=Current%20Mobile%20Status%20Report"
          >
            View device reports
          </button>
          <button type="button" className="device-admin-btn ghost" onClick={() => void handleDownloadMitacSoftware()}>
            Download Mitac software
          </button>
          <button type="button" className="device-admin-btn ghost">Import list</button>
          <button type="button" className="device-admin-btn">Upload firmware</button>
          <button type="button" className="device-admin-btn primary">Add device</button>
        </div>
      </div>

      <section className="device-admin-panel">
        <div className="device-admin-filters">
          <input
            className="device-admin-search"
            placeholder="Search device, vendor, model, firmware"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
            <option value="staging">Staging</option>
          </select>
          <select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
            <option value="all">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="all">All models</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="device-admin-table">
          <div className="device-admin-row device-admin-head">
            <div>Device</div>
            <div>Vendor</div>
            <div>Model</div>
            <div>Firmware</div>
            <div>Last seen</div>
            <div>Status</div>
            <div>IMEI</div>
            <div>Assets</div>
            <div className="device-admin-actions-col" aria-hidden="true">⋯</div>
          </div>
          {filteredDevices.map((device) => (
            <div key={device.id} className="device-admin-row">
              <div className="device-admin-name">{device.name}</div>
              <div>{device.vendor}</div>
              <div>{device.model}</div>
              <div>{device.firmware}</div>
              <div>{device.lastSeen}</div>
              <div>
                <span className={`device-admin-status ${device.status}`}>{device.status}</span>
              </div>
              <div>{device.imeiCount}</div>
              <div>{device.assignedAssets}</div>
              <div className="device-admin-actions-col">
                <button type="button" className="device-admin-action">Edit</button>
                <button type="button" className="device-admin-action">Firmware</button>
              </div>
            </div>
          ))}
          {filteredDevices.length === 0 && (
            <div className="device-admin-empty">
              {hasActiveFilters ? "No devices match this filter." : "No records yet."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
