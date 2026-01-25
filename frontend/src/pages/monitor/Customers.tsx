import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type CustomerRow = {
  id: string;
  name: string;
  segment: string;
  region: string;
  contact: string;
  assets: number;
  status: "active" | "onboarding" | "inactive";
  lastUpdate: string;
};

const customers: CustomerRow[] = [
  {
    id: "cust-1",
    name: "EA Transfleet Services",
    segment: "Logistics",
    region: "East Africa",
    contact: "operations@transfleet.co",
    assets: 124,
    status: "active",
    lastUpdate: "2 hrs ago"
  },
  {
    id: "cust-2",
    name: "CPP Fuels",
    segment: "Energy",
    region: "Southern",
    contact: "fleet@cppfuels.com",
    assets: 56,
    status: "onboarding",
    lastUpdate: "Yesterday"
  },
  {
    id: "cust-3",
    name: "Kampala Hauliers",
    segment: "Freight",
    region: "Central",
    contact: "dispatch@kampalahq.com",
    assets: 88,
    status: "inactive",
    lastUpdate: "12 Dec 2025"
  }
];

export default function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Active", value: customers.filter((row) => row.status === "active").length },
      { label: "Onboarding", value: customers.filter((row) => row.status === "onboarding").length },
      { label: "Inactive", value: customers.filter((row) => row.status === "inactive").length },
      { label: "Total assets", value: customers.reduce((sum, row) => sum + row.assets, 0) }
    ],
    []
  );

  const filtered = useMemo(() => {
    return customers.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.contact.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesRegion = regionFilter === "all" || row.region === regionFilter;
      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [search, statusFilter, regionFilter]);

  return (
    <div className="page customers-page">
      <div className="customers-topbar">
        <div>
          <div className="customers-title">Customers</div>
          <div className="customers-path">Monitor / Fleet admin / Customers</div>
        </div>
        <div className="customers-actions">
          <button
            type="button"
            className="customers-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Asset%20List%20Report"
              )
            }
          >
            View asset reports
          </button>
          <button type="button" className="customers-btn ghost">
            Export
          </button>
          <button
            type="button"
            className="customers-btn"
            data-modal="Add customer"
            data-modal-sub="Capture customer account details."
            data-modal-fields="Customer name|Account owner|Region"
          >
            Add customer
          </button>
        </div>
      </div>

      <section className="customers-summary">
        {summary.map((card) => (
          <div key={card.label} className="customers-summary-card">
            <div className="customers-summary-label">{card.label}</div>
            <div className="customers-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="customers-panel">
        <div className="customers-panel-header">
          <div>
            <div className="customers-panel-title">Customer list</div>
            <div className="customers-panel-sub">Account health and fleet footprint.</div>
          </div>
          <div className="customers-filter-row">
            <input
              className="customers-search"
              placeholder="Search customer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="customers-select"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            >
              <option value="all">All regions</option>
              <option value="East Africa">East Africa</option>
              <option value="Central">Central</option>
              <option value="Southern">Southern</option>
            </select>
            <select
              className="customers-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="customers-table">
          <div className="customers-row customers-row-head">
            <span>Customer</span>
            <span>Segment</span>
            <span>Region</span>
            <span>Contact</span>
            <span>Assets</span>
            <span>Status</span>
            <span>Last update</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="customers-empty">No customers match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="customers-row">
                <span className="customers-name">{row.name}</span>
                <span>{row.segment}</span>
                <span>{row.region}</span>
                <span>{row.contact}</span>
                <span>{row.assets}</span>
                <span className={`customers-pill ${row.status}`}>{row.status}</span>
                <span>{row.lastUpdate}</span>
                <span className="customers-actions-col">
                  <button type="button" className="customers-action">Open</button>
                  <button type="button" className="customers-action ghost">Profile</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
