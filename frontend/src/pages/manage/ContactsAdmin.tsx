import { useMemo, useState } from "react";
import { saveToApi } from "../../utils/api";
import "../../index.css";

type ContactRow = {
  id: string;
  name: string;
  role: string;
  org: string;
  phone: string;
  status: "active" | "inactive";
};

const contacts: ContactRow[] = [
  {
    id: "ct-1",
    name: "Rose Namusoke",
    role: "Fleet Manager",
    org: "EA Transfleet",
    phone: "+256 701 882 449",
    status: "active"
  },
  {
    id: "ct-2",
    name: "Peter Otim",
    role: "Dispatch Lead",
    org: "CPP Fuels",
    phone: "+256 780 223 144",
    status: "active"
  },
  {
    id: "ct-3",
    name: "Yvonne Ating",
    role: "Safety",
    org: "Kampala Hauliers",
    phone: "+256 754 991 200",
    status: "inactive"
  }
];

export default function ContactsAdmin() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactRows, setContactRows] = useState<ContactRow[]>(contacts);
  const [contactDraft, setContactDraft] = useState({
    name: "",
    role: "",
    org: "",
    phone: ""
  });

  const summary = useMemo(
    () => [
      { label: "Active", value: contactRows.filter((row) => row.status === "active").length },
      { label: "Inactive", value: contactRows.filter((row) => row.status === "inactive").length },
      { label: "Teams", value: 7 },
      { label: "Contacts", value: contactRows.length }
    ],
    [contactRows]
  );

  const filtered = useMemo(() => {
    return contactRows.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.org.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contactRows, search, statusFilter]);

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">Manage contacts</div>
          <div className="admin-path">Manage / Contacts / Manage contacts</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost">Import</button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => {
              setContactDraft({ name: "", role: "", org: "", phone: "" });
              setModalMode("create");
              setEditingId(null);
              setModalOpen(true);
            }}
          >
            Add contact
          </button>
        </div>
      </div>

      <section className="admin-summary">
        {summary.map((card) => (
          <div key={card.label} className="admin-summary-card">
            <div className="admin-summary-label">{card.label}</div>
            <div className="admin-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Contact list</div>
            <div className="admin-panel-sub">Primary operational contacts and roles.</div>
          </div>
          <div className="admin-filter-row">
            <input
              className="admin-search"
              placeholder="Search contact"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="admin-table">
          <div className="admin-row admin-row-head admin-row-wide">
            <span>Contact</span>
            <span>Role</span>
            <span>Organisation</span>
            <span>Phone</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.length === 0 ? (
            <div className="admin-empty">No contacts match your filters.</div>
          ) : (
            filtered.map((row) => (
              <div key={row.id} className="admin-row admin-row-wide">
                <span className="admin-name">{row.name}</span>
                <span>{row.role}</span>
                <span>{row.org}</span>
                <span>{row.phone}</span>
                <span className={`admin-pill ${row.status}`}>{row.status}</span>
                <span className="admin-actions-col">
                  <button
                    type="button"
                    className="admin-action"
                    onClick={() => {
                      setContactDraft({ name: row.name, role: row.role, org: row.org, phone: row.phone });
                      setModalMode("view");
                      setEditingId(row.id);
                      setModalOpen(true);
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="admin-action ghost"
                    onClick={() => {
                      setContactDraft({ name: row.name, role: row.role, org: row.org, phone: row.phone });
                      setModalMode("edit");
                      setEditingId(row.id);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal-card">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">Add contact</div>
                <div className="admin-modal-sub">Create a new operational contact.</div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-field">
                Full name
                <input
                  type="text"
                  placeholder="Rose Namusoke"
                  value={contactDraft.name}
                  onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Role
                <input
                  type="text"
                  placeholder="Fleet Manager"
                  value={contactDraft.role}
                  onChange={(event) => setContactDraft((current) => ({ ...current, role: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Organisation
                <input
                  type="text"
                  placeholder="EA Transfleet"
                  value={contactDraft.org}
                  onChange={(event) => setContactDraft((current) => ({ ...current, org: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Phone
                <input
                  type="text"
                  placeholder="+256 701 882 449"
                  value={contactDraft.phone}
                  onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn ghost"
                onClick={() => {
                  setModalOpen(false);
                }}
              >
                {modalMode === "view" ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  if (modalMode === "view") {
                    setModalOpen(false);
                    return;
                  }
                  const nextRow: ContactRow = {
                    id: editingId ?? `ct-${Date.now()}`,
                    name: contactDraft.name,
                    role: contactDraft.role,
                    org: contactDraft.org,
                    phone: contactDraft.phone,
                    status: "active"
                  };
                  setContactRows((current) => {
                    if (modalMode === "edit" && editingId) {
                      return current.map((row) => (row.id === editingId ? { ...row, ...nextRow } : row));
                    }
                    return [...current, nextRow];
                  });
                  void saveToApi("manage:contacts", {
                    ...contactDraft,
                    updatedAt: new Date().toISOString()
                  });
                  setModalOpen(false);
                }}
              >
                {modalMode === "view" ? "Close" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
