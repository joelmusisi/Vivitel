import { useMemo, useState } from "react";
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

const devices: DeviceRow[] = [
  {
    id: "dev-1",
    name: "Vivi4000 - CPP TZ",
    vendor: "Vivi",
    model: "Vivi4000 Pro",
    firmware: "v3.2.1",
    lastSeen: "2 min ago",
    status: "active",
    imeiCount: 124,
    assignedAssets: 98
  },
  {
    id: "dev-2",
    name: "Teltonika FMX",
    vendor: "Teltonika",
    model: "FMX 130",
    firmware: "v2.9.0",
    lastSeen: "18 min ago",
    status: "active",
    imeiCount: 68,
    assignedAssets: 52
  },
  {
    id: "dev-3",
    name: "Mix4000 Standard",
    vendor: "MiX",
    model: "MiX4000",
    firmware: "v5.1.4",
    lastSeen: "3 hrs ago",
    status: "maintenance",
    imeiCount: 210,
    assignedAssets: 190
  },
  {
    id: "dev-4",
    name: "Streamax 2CH",
    vendor: "Streamax",
    model: "ADX-200",
    firmware: "v1.8.2",
    lastSeen: "Yesterday",
    status: "offline",
    imeiCount: 36,
    assignedAssets: 24
  },
  {
    id: "dev-5",
    name: "ATrack QA Batch",
    vendor: "ATrack",
    model: "AT5",
    firmware: "v4.0.0",
    lastSeen: "Just now",
    status: "staging",
    imeiCount: 12,
    assignedAssets: 0
  }
];

export default function MobileDeviceAdmin() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");

  const vendors = Array.from(new Set(devices.map((d) => d.vendor)));
  const models = Array.from(new Set(devices.map((d) => d.model)));

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
  }, [search, statusFilter, vendorFilter, modelFilter]);

  const summary = useMemo(() => {
    const total = devices.length;
    const active = devices.filter((d) => d.status === "active").length;
    const offline = devices.filter((d) => d.status === "offline").length;
    const staging = devices.filter((d) => d.status === "staging").length;
    return { total, active, offline, staging };
  }, []);

  return (
    <div className="page device-admin-page">
      <div className="device-admin-topbar">
        <div>
          <div className="device-admin-title">Mobile Device Admin</div>
          <div className="device-admin-path">EA-Transfleet Services-… / Africa - MiXEA - Transfleet Services - EAC</div>
        </div>
        <div className="device-admin-actions">
          <button
            type="button"
            className="device-admin-btn ghost"
            data-nav="/measure/insights/reports?category=List%20Reports&report=Current%20Mobile%20Status%20Report"
          >
            View device reports
          </button>
          <button type="button" className="device-admin-btn ghost">Import list</button>
          <button type="button" className="device-admin-btn">Upload firmware</button>
          <button type="button" className="device-admin-btn primary">Add device</button>
        </div>
      </div>

      <div className="device-admin-summary">
        <div className="device-admin-card">
          <div className="device-admin-label">Total devices</div>
          <div className="device-admin-value">{summary.total}</div>
        </div>
        <div className="device-admin-card">
          <div className="device-admin-label">Active</div>
          <div className="device-admin-value">{summary.active}</div>
        </div>
        <div className="device-admin-card">
          <div className="device-admin-label">Offline</div>
          <div className="device-admin-value">{summary.offline}</div>
        </div>
        <div className="device-admin-card">
          <div className="device-admin-label">Staging</div>
          <div className="device-admin-value">{summary.staging}</div>
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
          {filteredDevices.length === 0 && <div className="device-admin-empty">No devices match this filter.</div>}
        </div>
      </section>
    </div>
  );
}
