import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
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

export default function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const customers: CustomerRow[] = [];

  const filtered = useMemo(() => {
    return customers.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.contact.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesRegion = regionFilter === "all" || row.region === regionFilter;
      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [customers, search, statusFilter, regionFilter]);

  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== "all" || regionFilter !== "all";

  const regionOptions = useMemo(
    () =>
      [...new Set(customers.map((row) => row.region).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [customers]
  );

  const getCustomerSortValue = useCallback((row: CustomerRow, key: string) => {
    if (key === "customer") return row.name;
    if (key === "segment") return row.segment;
    if (key === "region") return row.region;
    if (key === "contact") return row.contact;
    if (key === "assets") return row.assets;
    if (key === "status") return row.status;
    if (key === "lastUpdate") return row.lastUpdate;
    return "";
  }, []);
  const customerSort = useColumnSort({ rows: filtered, getValue: getCustomerSortValue });

  return (
    <div className="page customers-page">
      <div className="customers-topbar">
        <div>
          <div className="customers-title">Customers</div>
          <div className="customers-path">Track / Fleet admin / Customers</div>
        </div>
        <div className="customers-actions">
          <button
            type="button"
            className="customers-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Asset%20List%20Report"
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
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
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
            <SortableColumnHeader as="span" label="Customer" {...customerSort.getHeaderProps("customer")} />
            <SortableColumnHeader as="span" label="Segment" {...customerSort.getHeaderProps("segment")} />
            <SortableColumnHeader as="span" label="Region" {...customerSort.getHeaderProps("region")} />
            <SortableColumnHeader as="span" label="Contact" {...customerSort.getHeaderProps("contact")} />
            <SortableColumnHeader as="span" label="Assets" {...customerSort.getHeaderProps("assets")} />
            <SortableColumnHeader as="span" label="Status" {...customerSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Last update" {...customerSort.getHeaderProps("lastUpdate")} />
            <span>Actions</span>
          </div>
          {customerSort.sortedRows.length === 0 ? (
            <div className="customers-empty">
              {hasActiveFilters ? "No customers match your filters." : "No records yet."}
            </div>
          ) : (
            customerSort.sortedRows.map((row) => (
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
