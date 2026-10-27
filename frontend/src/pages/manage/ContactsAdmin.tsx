import { useCallback, useEffect, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { loadSharedRecords, saveSharedRecords } from "../../utils/sharedRecords";
import "../../index.css";

const CONTACTS_STORAGE_BASE = "control:contacts";

type ContactRow = {
  id: string;
  name: string;
  role: string;
  org: string;
  phone: string;
  status: "active" | "inactive";
};

type StoredContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  employer?: string;
  position?: string;
  mobile?: string;
  email?: string;
};

const mapStoredContact = (row: StoredContact): ContactRow | null => {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const firstName = String(row.firstName ?? "").trim();
  const lastName = String(row.lastName ?? "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return {
    id,
    name: name || String(row.email ?? "").trim() || "Contact",
    role: String(row.position ?? "").trim() || "—",
    org: String(row.employer ?? "").trim() || "—",
    phone: String(row.mobile ?? "").trim() || "—",
    status: "active"
  };
};

export default function ContactsAdmin() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactRows, setContactRows] = useState<ContactRow[]>([]);
  const [contactDraft, setContactDraft] = useState({
    name: "",
    role: "",
    org: "",
    phone: ""
  });

  useEffect(() => {
    let cancelled = false;
    const loadContacts = () => {
      void loadSharedRecords<StoredContact>(CONTACTS_STORAGE_BASE).then((stored) => {
        if (cancelled) return;
        const rows = (Array.isArray(stored) ? stored : [])
          .map((row) => mapStoredContact(row))
          .filter((row): row is ContactRow => Boolean(row));
        setContactRows(rows);
      });
    };
    loadContacts();
    window.addEventListener("vivi:orgchange", loadContacts);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", loadContacts);
    };
  }, []);

  const filtered = useMemo(() => {
    return contactRows.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.org.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contactRows, search, statusFilter]);

  const getContactSortValue = useCallback((row: ContactRow, key: string) => {
    if (key === "name") return row.name;
    if (key === "role") return row.role;
    if (key === "org") return row.org;
    if (key === "phone") return row.phone;
    if (key === "status") return row.status;
    return "";
  }, []);
  const contactSort = useColumnSort({ rows: filtered, getValue: getContactSortValue });

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  const persistContactRows = (rows: ContactRow[]) => {
    const stored: StoredContact[] = rows.map((row) => {
      const parts = row.name.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ");
      return {
        id: row.id,
        firstName,
        lastName,
        employer: row.org === "—" ? "" : row.org,
        position: row.role === "—" ? "" : row.role,
        mobile: row.phone === "—" ? "" : row.phone,
        email: ""
      };
    });
    void saveSharedRecords(CONTACTS_STORAGE_BASE, stored);
  };

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">Control contacts</div>
          <div className="admin-path">Control / Contacts / Control contacts</div>
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
            <SortableColumnHeader as="span" label="Contact" {...contactSort.getHeaderProps("name")} />
            <SortableColumnHeader as="span" label="Role" {...contactSort.getHeaderProps("role")} />
            <SortableColumnHeader as="span" label="Organisation" {...contactSort.getHeaderProps("org")} />
            <SortableColumnHeader as="span" label="Phone" {...contactSort.getHeaderProps("phone")} />
            <SortableColumnHeader as="span" label="Status" {...contactSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {contactSort.sortedRows.length === 0 ? (
            <div className="admin-empty">
              {hasActiveFilters ? "No contacts match your filters." : "No records yet."}
            </div>
          ) : (
            contactSort.sortedRows.map((row) => (
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
              <button type="button" className="admin-modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-field">
                Full name
                <input
                  type="text"
                  placeholder="Contact name"
                  value={contactDraft.name}
                  onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Role
                <input
                  type="text"
                  placeholder="Role"
                  value={contactDraft.role}
                  onChange={(event) => setContactDraft((current) => ({ ...current, role: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Organisation
                <input
                  type="text"
                  placeholder="Organisation"
                  value={contactDraft.org}
                  onChange={(event) => setContactDraft((current) => ({ ...current, org: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
              <label className="admin-modal-field">
                Phone
                <input
                  type="text"
                  placeholder="Phone number"
                  value={contactDraft.phone}
                  onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))}
                  disabled={modalMode === "view"}
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-btn ghost" onClick={() => setModalOpen(false)}>
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
                    role: contactDraft.role || "—",
                    org: contactDraft.org || "—",
                    phone: contactDraft.phone || "—",
                    status: "active"
                  };
                  setContactRows((current) => {
                    const next =
                      modalMode === "edit" && editingId
                        ? current.map((row) => (row.id === editingId ? { ...row, ...nextRow } : row))
                        : [...current, nextRow];
                    persistContactRows(next);
                    return next;
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
