import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type WorkerRow = {
  id: string;
  name: string;
  role: string;
  region: string;
  status: "available" | "busy" | "offline";
  activeTasks: number;
  lastActive: string;
};

export default function Workers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const workers: WorkerRow[] = [];

  const filtered = useMemo(() => {
    return workers.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.role.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workers, search, statusFilter]);

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  const getWorkerSortValue = useCallback((row: WorkerRow, key: string) => {
    if (key === "name") return row.name;
    if (key === "role") return row.role;
    if (key === "region") return row.region;
    if (key === "status") return row.status;
    if (key === "activeTasks") return row.activeTasks;
    if (key === "lastActive") return row.lastActive;
    return "";
  }, []);
  const workerSort = useColumnSort({ rows: filtered, getValue: getWorkerSortValue });

  return (
    <div className="page workers-page">
      <div className="workers-topbar">
        <div>
          <div className="workers-title">Workers</div>
          <div className="workers-path">Track / Task Controlment / Workers</div>
        </div>
        <div className="workers-actions">
          <button
            type="button"
            className="workers-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Driver%20List%20Report"
              )
            }
          >
            View driver reports
          </button>
          <button type="button" className="workers-btn ghost">
            Export roster
          </button>
          <button
            type="button"
            className="workers-btn"
            data-modal="Add worker"
            data-modal-sub="Assign a worker to the roster."
            data-modal-fields="Worker name|Role|Site"
          >
            Add worker
          </button>
        </div>
      </div>

      <section className="workers-panel">
        <div className="workers-panel-header">
          <div>
            <div className="workers-panel-title">Worker roster</div>
            <div className="workers-panel-sub">Track availability and workload distribution.</div>
          </div>
          <div className="workers-filter-row">
            <input
              className="workers-search"
              placeholder="Search workers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="workers-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="workers-table">
          <div className="workers-row workers-row-head">
            <SortableColumnHeader as="span" label="Name" {...workerSort.getHeaderProps("name")} />
            <SortableColumnHeader as="span" label="Role" {...workerSort.getHeaderProps("role")} />
            <SortableColumnHeader as="span" label="Region" {...workerSort.getHeaderProps("region")} />
            <SortableColumnHeader as="span" label="Status" {...workerSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Active tasks" {...workerSort.getHeaderProps("activeTasks")} />
            <SortableColumnHeader as="span" label="Last active" {...workerSort.getHeaderProps("lastActive")} />
            <span>Actions</span>
          </div>
          {workerSort.sortedRows.length === 0 ? (
            <div className="workers-empty">
              {hasActiveFilters ? "No workers match your filters." : "No records yet."}
            </div>
          ) : (
            workerSort.sortedRows.map((row) => (
              <div key={row.id} className="workers-row">
                <span className="workers-name">{row.name}</span>
                <span>{row.role}</span>
                <span>{row.region}</span>
                <span className={`workers-pill ${row.status}`}>{row.status}</span>
                <span>{row.activeTasks}</span>
                <span>{row.lastActive}</span>
                <span className="workers-actions-col">
                  <button type="button" className="workers-action">Assign</button>
                  <button type="button" className="workers-action ghost">Profile</button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
