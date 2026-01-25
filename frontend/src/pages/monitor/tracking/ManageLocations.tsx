import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Polygon, Polyline, Rectangle, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "../../../index.css";

type LocationRow = {
  id: string;
  locationId: string;
  name: string;
  type: string;
  address: string;
  site: string;
  contact: string;
  email: string;
  mobile: string;
  home: string;
  work: string;
  category: string;
};

type LatLng = { lat: number; lng: number };

type ToolMode = "circle" | "rectangle" | "polygon" | "polyline" | "edit" | null;

const handleIcon = L.divIcon({
  className: "geofence-handle",
  iconSize: [12, 12]
});

const MapClickHandler = ({ enabled, onSelect }: { enabled: boolean; onSelect: (point: LatLng) => void }) => {
  useMapEvents({
    click: (event) => {
      if (!enabled) return;
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
};

const categoryItems = [
  "All",
  "Customer",
  "Site",
  "No-go zone",
  "Street polyline",
  "Other",
  "Fuel stop",
  "Rest stop",
  "Speed zone"
];

const initialLocations: LocationRow[] = [
  {
    id: "loc-1",
    locationId: "LOC-0001",
    name: "Dar es salaam",
    type: "Speed zone",
    address: "Kibaha, Pwani, Tanzania",
    site: "All sites",
    contact: "",
    email: "",
    mobile: "",
    home: "",
    work: "",
    category: "Speed zone"
  }
];

export default function ManageLocations() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LocationRow[]>(initialLocations);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LocationRow | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [locationColor, setLocationColor] = useState("#0ea5e9");
  const [locationOpacity, setLocationOpacity] = useState(0.5);
  const [externalReference, setExternalReference] = useState("");
  const [locationDetails, setLocationDetails] = useState("");
  const [locationBy, setLocationBy] = useState<string>("");
  const [addressQuery, setAddressQuery] = useState("");
  const [coordInput, setCoordInput] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [mapLayer, setMapLayer] = useState("google-street");
  const [geofenceCenter, setGeofenceCenter] = useState<LatLng | null>(null);
  const [geofenceRadius, setGeofenceRadius] = useState(26000);
  const [editGeofence, setEditGeofence] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>(null);
  const [rectangleAnchor, setRectangleAnchor] = useState<LatLng | null>(null);
  const [rectangleBounds, setRectangleBounds] = useState<[LatLng, LatLng] | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<LatLng[]>([]);
  const [polylinePoints, setPolylinePoints] = useState<LatLng[]>([]);
  const [shapeType, setShapeType] = useState<"circle" | "rectangle" | "polygon" | "polyline" | null>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [formPosition, setFormPosition] = useState({ x: 16, y: 40 });
  const [draggingForm, setDraggingForm] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const editorCardRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const baseLayers: Record<string, { url: string; attribution: string }> = {
    "google-street": {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    "google-terrain": {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    },
    "google-satellite": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    },
    "google-hybrid": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };
  const overlayLayers: Record<string, { url: string; attribution: string }> = {
    "google-hybrid": {
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri"
    }
  };
  const defaultCenter: [number, number] = [-6.7924, 39.2083];
  const mapCenter: [number, number] = geofenceCenter
    ? [geofenceCenter.lat, geofenceCenter.lng]
    : defaultCenter;

  const showHandles = !!activeTool || editGeofence;

  const distanceMeters = (a: LatLng, b: LatLng) => {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const circleRadiusHandle = geofenceCenter
    ? {
      lat: geofenceCenter.lat,
      lng: geofenceCenter.lng + (geofenceRadius / (111320 * Math.cos((geofenceCenter.lat * Math.PI) / 180)))
    }
    : null;

  useEffect(() => {
    if (!draggingForm) return;
    const handleMove = (event: MouseEvent) => {
      if (!editorCardRef.current) return;
      const bounds = editorCardRef.current.getBoundingClientRect();
      const nextX = event.clientX - bounds.left - dragOffset.x;
      const nextY = event.clientY - bounds.top - dragOffset.y;
      const maxX = Math.max(0, bounds.width - 360 - 16);
      const maxY = Math.max(0, bounds.height - 200);
      setFormPosition({
        x: Math.min(Math.max(0, nextX), maxX),
        y: Math.min(Math.max(0, nextY), maxY)
      });
    };
    const handleUp = () => setDraggingForm(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingForm, dragOffset]);

  const handleMapClick = (point: LatLng) => {
    if (activeTool === "circle" || (activeTool === "edit" && shapeType === "circle")) {
      setGeofenceCenter(point);
      setShapeType("circle");
      return;
    }
    if (activeTool === "rectangle") {
      if (!rectangleAnchor) {
        setRectangleAnchor(point);
        return;
      }
      setRectangleBounds([rectangleAnchor, point]);
      setRectangleAnchor(null);
      setShapeType("rectangle");
      return;
    }
    if (activeTool === "polygon") {
      setPolygonPoints((prev) => [...prev, point]);
      setShapeType("polygon");
      return;
    }
    if (activeTool === "polyline") {
      setPolylinePoints((prev) => [...prev, point]);
      setShapeType("polyline");
    }
  };

  const columnOptions = [
    { key: "address", label: "Address" },
    { key: "contact", label: "Contact name" },
    { key: "email", label: "Email address" },
    { key: "home", label: "Home number" },
    { key: "locationId", label: "Location ID" },
    { key: "name", label: "Location name" },
    { key: "type", label: "Location type" },
    { key: "mobile", label: "Mobile number" },
    { key: "site", label: "Site" },
    { key: "work", label: "Work number" }
  ] as const;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["name", "type", "address", "site", "contact"])
  );

  const locationTypeOptions = [
    "Speed zone",
    "Customer",
    "Site",
    "No-go zone",
    "Street polyline",
    "Other",
    "Fuel stop",
    "Rest stop"
  ];

  const siteOptions = ["All sites", "Dar es Salaam", "Kampala", "Mombasa"];

  const colorOptions = [
    "#000000",
    "#1d4ed8",
    "#15803d",
    "#0f766e",
    "#0ea5e9",
    "#06b6d4",
    "#16a34a",
    "#4ade80",
    "#4c1d95",
    "#737373",
    "#7f1d1d",
    "#7e22ce",
    "#a3e635",
    "#bae6fd",
    "#b91c1c",
    "#ef4444",
    "#f472b6",
    "#f97316",
    "#fef08a",
    "#facc15"
  ];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    categoryItems.forEach((item) => map.set(item, 0));
    map.set("All", rows.length);
    rows.forEach((row) => {
      map.set(row.category, (map.get(row.category) ?? 0) + 1);
    });
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesCategory = activeCategory === "All" || row.category === activeCategory;
      const matchesSearch = !query
        || row.name.toLowerCase().includes(query)
        || row.type.toLowerCase().includes(query)
        || row.address.toLowerCase().includes(query)
        || row.site.toLowerCase().includes(query)
        || row.contact.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [rows, activeCategory, search]);

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.id));
  const anyFilteredSelected = filtered.some((row) => selectedIds.includes(row.id));

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = anyFilteredSelected && !allFilteredSelected;
  }, [anyFilteredSelected, allFilteredSelected]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((row) => row.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filtered.map((row) => row.id)])));
    }
  };

  const toCsv = (data: LocationRow[]) => {
    const header = [
      "locationId",
      "name",
      "type",
      "address",
      "site",
      "contact",
      "email",
      "mobile",
      "home",
      "work",
      "category"
    ];
    const lines = data.map((row) => [
      row.locationId,
      row.name,
      row.type,
      row.address,
      row.site,
      row.contact,
      row.email,
      row.mobile,
      row.home,
      row.work,
      row.category
    ].map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","));
    return [header.join(","), ...lines].join("\n");
  };

  const downloadFile = (content: string, filename: string, type = "text/csv") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const exportRows = filtered.length > 0 ? filtered : rows;
    downloadFile(toCsv(exportRows), "locations-export.csv");
  };

  const handleDownloadTemplate = () => {
    const template = [
      "locationId,name,type,address,site,contact,email,mobile,home,work,category",
      "LOC-0001,Dar es salaam,Speed zone,Example address,All sites,,,,,Speed zone"
    ].join("\n");
    downloadFile(template, "locations-template.csv");
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [] as LocationRow[];
    const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
    return lines.slice(1).map((line, index) => {
      const values = line.split(",").map((value) => value.replace(/^"|"$/g, "").trim());
      const getValue = (key: string) => {
        const idx = header.indexOf(key);
        return idx >= 0 ? values[idx] ?? "" : "";
      };
      const name = getValue("name") || `Imported location ${index + 1}`;
      const locationId = getValue("locationid") || "";
      const type = getValue("type") || "Other";
      const address = getValue("address") || "";
      const site = getValue("site") || "All sites";
      const contact = getValue("contact") || "";
      const email = getValue("email") || "";
      const mobile = getValue("mobile") || "";
      const home = getValue("home") || "";
      const work = getValue("work") || "";
      const category = getValue("category") || type || "Other";
      return {
        id: `imp-${Date.now()}-${index}`,
        locationId,
        name,
        type,
        address,
        site,
        contact,
        email,
        mobile,
        home,
        work,
        category
      };
    });
  };

  const handleImport = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const imported = parseCsv(text);
      if (imported.length > 0) {
        setRows((prev) => [...imported, ...prev]);
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = () => {
    if (selectedIds.length === 0) return;
    setRows((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
    setSelectedIds([]);
  };

  const handleAdd = () => {
    const newRow: LocationRow = {
      id: `loc-new-${Date.now()}`,
      locationId: "",
      name: "",
      type: "",
      address: "",
      site: "",
      contact: "",
      email: "",
      mobile: "",
      home: "",
      work: "",
      category: "Other"
    };
    setEditRowId(newRow.id);
    setEditDraft(newRow);
    setIsCreatingNew(true);
    setLocationColor("#0ea5e9");
    setLocationOpacity(0.5);
    setExternalReference("");
    setLocationDetails("");
    setLocationBy("");
    setAddressQuery("");
    setCoordInput("");
    setGeoError(null);
    setGeofenceCenter(null);
    setGeofenceRadius(26000);
    setEditGeofence(false);
    setActiveTool(null);
    setRectangleAnchor(null);
    setRectangleBounds(null);
    setPolygonPoints([]);
    setPolylinePoints([]);
    setShapeType(null);
    setShowEditModal(true);
  };

  const handleDuplicate = (row: LocationRow) => {
    const copy: LocationRow = {
      ...row,
      id: `dup-${Date.now()}`,
      name: `${row.name} (copy)`
    };
    setRows((prev) => [copy, ...prev]);
  };

  const startEdit = (row: LocationRow) => {
    setEditRowId(row.id);
    setEditDraft({ ...row });
    setIsCreatingNew(false);
    setLocationColor("#0ea5e9");
    setLocationOpacity(0.5);
    setExternalReference("");
    setLocationDetails("");
    setLocationBy("");
    setAddressQuery("");
    setCoordInput("");
    setGeoError(null);
    setGeofenceCenter(null);
    setGeofenceRadius(26000);
    setEditGeofence(false);
    setActiveTool(null);
    setRectangleAnchor(null);
    setRectangleBounds(null);
    setPolygonPoints([]);
    setPolylinePoints([]);
    setShapeType(null);
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const saveEdit = () => {
    if (!editDraft || !editRowId) return;
    if (isCreatingNew) {
      setRows((prev) => [editDraft, ...prev]);
    } else {
      setRows((prev) => prev.map((row) => (row.id === editRowId ? editDraft : row)));
    }
    setEditRowId(null);
    setEditDraft(null);
    setIsCreatingNew(false);
    setShowEditModal(false);
  };

  const cancelEdit = () => {
    setEditRowId(null);
    setEditDraft(null);
    setIsCreatingNew(false);
    setShowEditModal(false);
  };

  const handleCoordsSearch = () => {
    const match = coordInput.split(",").map((value) => value.trim());
    if (match.length !== 2) {
      setGeoError("Enter coordinates as latitude, longitude.");
      return;
    }
    const lat = Number(match[0]);
    const lng = Number(match[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setGeoError("Coordinates must be numbers.");
      return;
    }
    setGeoError(null);
    setGeofenceCenter({ lat, lng });
  };

  const handleAddressSearch = async () => {
    if (!addressQuery.trim()) {
      setGeoError("Enter an address to search.");
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery.trim())}`
      );
      const results: Array<{ lat: string; lon: string }> = await response.json();
      if (!results.length) {
        setGeoError("No results found for that address.");
      } else {
        setGeofenceCenter({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
      }
    } catch {
      setGeoError("Address lookup failed. Try again.");
    } finally {
      setGeoLoading(false);
    }
  };

  return (
    <div className="page locations-admin-page">
      <div className="locations-admin-layout">
        <aside className="locations-admin-sidebar">
          {categoryItems.map((item) => (
            <button
              key={item}
              type="button"
              className={`locations-admin-sideitem${activeCategory === item ? " active" : ""}`}
              onClick={() => setActiveCategory(item)}
            >
              <span>{item}</span>
              <span className="locations-admin-count">{counts.get(item) ?? 0}</span>
            </button>
          ))}
        </aside>

        <section className="locations-admin-panel">
          <div className="locations-admin-header">
            <div className="locations-admin-title">
              <span>All</span>
              <span className="locations-admin-count">{counts.get("All") ?? 0}</span>
            </div>
            <div className="locations-admin-tools">
              <input
                className="locations-admin-filter"
                placeholder="Filter"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                className="locations-admin-icon"
                aria-label="Export"
                data-tooltip="Export"
                onClick={handleExport}
              >
                ⤴
              </button>
              <button
                type="button"
                className="locations-admin-icon"
                aria-label="Import"
                data-tooltip="Import"
                onClick={() => importInputRef.current?.click()}
              >
                ⤵
              </button>
              <button
                type="button"
                className="locations-admin-icon"
                aria-label="Download template"
                data-tooltip="Download template"
                onClick={handleDownloadTemplate}
              >
                ⤓
              </button>
              <button
                type="button"
                className="locations-admin-icon"
                aria-label="Delete"
                data-tooltip="Delete"
                onClick={handleDelete}
              >
                🗑
              </button>
              <button
                type="button"
                className="locations-admin-add"
                onClick={handleAdd}
                aria-label="Add"
                data-tooltip="Add location"
              >
                +
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                className="locations-admin-file"
                onChange={(event) => handleImport(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="locations-admin-table">
            <div className="locations-admin-row locations-admin-head">
              <span>
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                />
              </span>
              {visibleColumns.has("name") && (
                <span className="locations-admin-sort">Location name</span>
              )}
              {visibleColumns.has("type") && <span>Location type</span>}
              {visibleColumns.has("address") && <span>Address</span>}
              {visibleColumns.has("site") && <span>Site</span>}
              {visibleColumns.has("contact") && <span>Contact name</span>}
              {visibleColumns.has("email") && <span>Email address</span>}
              {visibleColumns.has("home") && <span>Home number</span>}
              {visibleColumns.has("locationId") && <span>Location ID</span>}
              {visibleColumns.has("mobile") && <span>Mobile number</span>}
              {visibleColumns.has("work") && <span>Work number</span>}
              <span className="locations-admin-actions">
                <button
                  type="button"
                  className="locations-admin-menu-btn"
                  aria-label="Column chooser"
                  data-tooltip="Column chooser"
                  onClick={() => setShowColumnChooser((prev) => !prev)}
                >
                  ▥
                </button>
                {showColumnChooser && (
                  <div className="locations-admin-menu">
                    {columnOptions.map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() =>
                          setVisibleColumns((prev) => {
                            const next = new Set(prev);
                            if (next.has(col.key)) {
                              next.delete(col.key);
                            } else {
                              next.add(col.key);
                            }
                            return next;
                          })
                        }
                      >
                        {visibleColumns.has(col.key) ? "✓" : ""} {col.label}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="locations-admin-empty">No locations match your filters.</div>
            ) : (
              filtered.map((row) => (
                <div key={row.id} className="locations-admin-row">
                  <span>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleRow(row.id)}
                    />
                  </span>
                  <>
                      {visibleColumns.has("name") && (
                        <span className="locations-admin-link">{row.name}</span>
                      )}
                      {visibleColumns.has("type") && <span>{row.type}</span>}
                      {visibleColumns.has("address") && <span>{row.address}</span>}
                      {visibleColumns.has("site") && <span>{row.site}</span>}
                      {visibleColumns.has("contact") && <span>{row.contact || ""}</span>}
                      {visibleColumns.has("email") && <span>{row.email || ""}</span>}
                      {visibleColumns.has("home") && <span>{row.home || ""}</span>}
                      {visibleColumns.has("locationId") && <span>{row.locationId}</span>}
                      {visibleColumns.has("mobile") && <span>{row.mobile || ""}</span>}
                      {visibleColumns.has("work") && <span>{row.work || ""}</span>}
                      <span className="locations-admin-actions">
                        <button
                          type="button"
                          className="locations-admin-menu-btn"
                          aria-label="More options"
                          data-tooltip="More options"
                          onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
                        >
                          ⋯
                        </button>
                        {openMenuId === row.id && (
                          <div className="locations-admin-menu">
                            <button type="button" onClick={() => startEdit(row)}>Edit</button>
                            <button type="button" onClick={() => handleDuplicate(row)}>Duplicate</button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setRows((prev) => prev.filter((item) => item.id !== row.id));
                                setSelectedIds((prev) => prev.filter((id) => id !== row.id));
                                setOpenMenuId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </span>
                  </>
                </div>
              ))
            )}
          </div>

          <div className="locations-admin-footer">
            <span>Last refresh: a few seconds ago</span>
            <button type="button" className="locations-admin-refresh">Refresh</button>
          </div>
        </section>
      </div>
      {showEditModal && editDraft && (
        <div className="location-editor" role="dialog" aria-modal="true">
          <div
            className="location-editor-card"
            ref={editorCardRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="location-editor-topbar">
              <button type="button" className="location-editor-back" onClick={cancelEdit}>
                ←Back to location list
              </button>
            </div>
            <div className="location-editor-body">
              <section
                className="location-editor-form"
                style={{ left: formPosition.x, top: formPosition.y }}
                onMouseDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("input, textarea, select, button")) return;
                  const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                  setDragOffset({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
                  setDraggingForm(true);
                }}
              >
                <label className="location-editor-label">
                  By:
                  <select value={locationBy} onChange={(event) => setLocationBy(event.target.value)}>
                    <option value="">Select one</option>
                    <option value="address">An address</option>
                    <option value="latlng">A latitude/longitude</option>
                  </select>
                </label>

                {locationBy === "address" && (
                  <label className="location-editor-label">
                    Address search
                    <div className="location-editor-inline">
                      <input
                        value={addressQuery}
                        onChange={(event) => setAddressQuery(event.target.value)}
                        placeholder="Search for a location"
                      />
                      <button type="button" onClick={handleAddressSearch} disabled={geoLoading}>
                        {geoLoading ? "Searching" : "Find"}
                      </button>
                    </div>
                  </label>
                )}

                {locationBy === "latlng" && (
                  <label className="location-editor-label">
                    Coordinates
                    <div className="location-editor-inline">
                      <input
                        value={coordInput}
                        onChange={(event) => setCoordInput(event.target.value)}
                        placeholder="Latitude, Longitude"
                      />
                      <button type="button" onClick={handleCoordsSearch}>
                        Find
                      </button>
                    </div>
                  </label>
                )}

                {geoError && <div className="location-editor-error">{geoError}</div>}

                {locationBy ? (
                  <>
                <label className="location-editor-label">
                  Location name <span>*</span>
                  <input
                    value={editDraft.name}
                    onChange={(event) =>
                      setEditDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                    }
                  />
                </label>
                <label className="location-editor-label">
                  Location type <span>*</span>
                  <select
                    value={editDraft.type}
                    onChange={(event) =>
                      setEditDraft((prev) => (prev ? { ...prev, type: event.target.value } : prev))
                    }
                  >
                    <option value="">Select location type</option>
                    {locationTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="location-editor-label">
                  Site <span>*</span>
                  <select
                    value={editDraft.site}
                    onChange={(event) =>
                      setEditDraft((prev) => (prev ? { ...prev, site: event.target.value } : prev))
                    }
                  >
                    <option value="">Select site</option>
                    {siteOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="location-editor-label">
                  Location colour
                  <div className="location-editor-swatches">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`location-editor-swatch${locationColor === color ? " active" : ""}`}
                        style={{ background: color }}
                        onClick={() => setLocationColor(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <label className="location-editor-label">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={locationOpacity}
                    onChange={(event) => setLocationOpacity(Number(event.target.value))}
                  />
                </label>
                <label className="location-editor-label">
                  Radius (km)
                  <input
                    type="range"
                    min={1}
                    max={80}
                    step={1}
                    value={Math.round(geofenceRadius / 1000)}
                    onChange={(event) => setGeofenceRadius(Number(event.target.value) * 1000)}
                  />
                </label>
                <label className="location-editor-label">
                  External reference
                  <input
                    value={externalReference}
                    onChange={(event) => setExternalReference(event.target.value)}
                  />
                </label>
                <div className="location-editor-divider" />
                <label className="location-editor-label">
                  Locations details
                  <textarea
                    rows={4}
                    value={locationDetails}
                    onChange={(event) => setLocationDetails(event.target.value)}
                  />
                </label>
                <div className="location-editor-actions">
                  <button type="button" className="location-editor-btn ghost" onClick={cancelEdit}>
                    Close
                  </button>
                  <button type="button" className="location-editor-btn" onClick={saveEdit}>
                    Save
                  </button>
                </div>
                  </>
                ) : null}
              </section>
              <section className="location-editor-map">
                <div className="location-editor-map-placeholder">
                  <MapContainer
                    center={mapCenter}
                    zoom={9}
                    scrollWheelZoom
                    className="map-leaflet"
                    ref={mapRef}
                    whenReady={() => setMapInstance(mapRef.current)}
                  >
                    <MapClickHandler enabled={!!activeTool} onSelect={handleMapClick} />
                    <TileLayer
                      key={mapLayer}
                      attribution={baseLayers[mapLayer].attribution}
                      url={baseLayers[mapLayer].url}
                    />
                    {mapLayer === "google-hybrid" && (
                      <TileLayer
                        attribution={overlayLayers[mapLayer].attribution}
                        url={overlayLayers[mapLayer].url}
                      />
                    )}
                    {shapeType === "circle" && geofenceCenter && (
                      <>
                        <Circle
                          center={mapCenter}
                          radius={geofenceRadius}
                          pathOptions={{
                            color: locationColor,
                            fillColor: locationColor,
                            fillOpacity: Math.max(0.45, locationOpacity),
                            weight: 4,
                            opacity: 0.9
                          }}
                        />
                        {showHandles && (
                          <>
                            <Marker
                              position={mapCenter}
                              icon={handleIcon}
                              draggable
                              eventHandlers={{
                                dragend: (event) => {
                                  const { lat, lng } = event.target.getLatLng();
                                  setGeofenceCenter({ lat, lng });
                                }
                              }}
                            />
                            {circleRadiusHandle && (
                              <Marker
                                position={[circleRadiusHandle.lat, circleRadiusHandle.lng]}
                                icon={handleIcon}
                                draggable
                                eventHandlers={{
                                  dragend: (event) => {
                                    if (!geofenceCenter) return;
                                    const { lat, lng } = event.target.getLatLng();
                                    setGeofenceRadius(distanceMeters(geofenceCenter, { lat, lng }));
                                  }
                                }}
                              />
                            )}
                          </>
                        )}
                      </>
                    )}
                    {shapeType === "rectangle" && rectangleBounds && (
                      <>
                        <Rectangle
                          bounds={rectangleBounds.map((point) => [point.lat, point.lng]) as [[number, number], [number, number]]}
                          pathOptions={{
                            color: locationColor,
                            fillColor: locationColor,
                            fillOpacity: Math.max(0.35, locationOpacity),
                            weight: 3
                          }}
                        />
                        {showHandles && (
                          <>
                            {rectangleBounds.map((corner, index) => (
                              <Marker
                                key={`rect-${index}`}
                                position={[corner.lat, corner.lng]}
                                icon={handleIcon}
                                draggable
                                eventHandlers={{
                                  dragend: (event) => {
                                    const { lat, lng } = event.target.getLatLng();
                                    const next = [...rectangleBounds] as [LatLng, LatLng];
                                    next[index] = { lat, lng };
                                    setRectangleBounds(next);
                                  }
                                }}
                              />
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {shapeType === "polygon" && polygonPoints.length >= 2 && (
                      <>
                        <Polygon
                          positions={polygonPoints.map((point) => [point.lat, point.lng]) as [number, number][]}
                          pathOptions={{
                            color: locationColor,
                            fillColor: locationColor,
                            fillOpacity: Math.max(0.35, locationOpacity),
                            weight: 3
                          }}
                        />
                        {showHandles && (
                          <>
                            {polygonPoints.map((point, index) => (
                              <Marker
                                key={`poly-${index}`}
                                position={[point.lat, point.lng]}
                                icon={handleIcon}
                                draggable
                                eventHandlers={{
                                  dragend: (event) => {
                                    const { lat, lng } = event.target.getLatLng();
                                    setPolygonPoints((prev) =>
                                      prev.map((pt, idx) => (idx === index ? { lat, lng } : pt))
                                    );
                                  }
                                }}
                              />
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {shapeType === "polyline" && polylinePoints.length >= 2 && (
                      <>
                        <Polyline
                          positions={polylinePoints.map((point) => [point.lat, point.lng]) as [number, number][]}
                          pathOptions={{ color: locationColor, weight: 3 }}
                        />
                        {showHandles && (
                          <>
                            {polylinePoints.map((point, index) => (
                              <Marker
                                key={`line-${index}`}
                                position={[point.lat, point.lng]}
                                icon={handleIcon}
                                draggable
                                eventHandlers={{
                                  dragend: (event) => {
                                    const { lat, lng } = event.target.getLatLng();
                                    setPolylinePoints((prev) =>
                                      prev.map((pt, idx) => (idx === index ? { lat, lng } : pt))
                                    );
                                  }
                                }}
                              />
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </MapContainer>
                </div>
                <div className="location-editor-map-toolbar">
                  <button
                    type="button"
                    aria-label="Zoom in"
                    data-tooltip="Zoom in"
                    onClick={() => mapInstance?.zoomIn()}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    data-tooltip="Zoom out"
                    onClick={() => mapInstance?.zoomOut()}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={activeTool === "circle" ? "active" : ""}
                    aria-label="Draw circle geofence"
                    data-tooltip="Draw circle"
                    onClick={() => {
                      setActiveTool((prev) => (prev === "circle" ? null : "circle"));
                      setShapeType("circle");
                    }}
                  >
                    ⬤
                  </button>
                  <button
                    type="button"
                    className={activeTool === "rectangle" ? "active" : ""}
                    aria-label="Draw rectangle geofence"
                    data-tooltip="Draw rectangle"
                    onClick={() => {
                      setActiveTool((prev) => (prev === "rectangle" ? null : "rectangle"));
                      setRectangleAnchor(null);
                      setShapeType("rectangle");
                    }}
                  >
                    ▭
                  </button>
                  <button
                    type="button"
                    className={activeTool === "polygon" ? "active" : ""}
                    aria-label="Draw polygon geofence"
                    data-tooltip="Draw polygon"
                    onClick={() => {
                      setActiveTool((prev) => (prev === "polygon" ? null : "polygon"));
                      setShapeType("polygon");
                    }}
                  >
                    ⬠
                  </button>
                  <button
                    type="button"
                    className={activeTool === "polyline" ? "active" : ""}
                    aria-label="Draw polyline geofence"
                    data-tooltip="Draw polyline"
                    onClick={() => {
                      setActiveTool((prev) => (prev === "polyline" ? null : "polyline"));
                      setShapeType("polyline");
                    }}
                  >
                    ╱
                  </button>
                  <button
                    type="button"
                    className={activeTool === "edit" ? "active" : ""}
                    aria-label="Edit geofence"
                    data-tooltip="Edit geofence"
                    onClick={() => {
                      setActiveTool((prev) => (prev === "edit" ? null : "edit"));
                      setEditGeofence((prev) => !prev);
                    }}
                  >
                    ✎
                  </button>
                  {(activeTool === "polygon" || activeTool === "polyline") && (
                    <button type="button" aria-label="Finish drawing" data-tooltip="Finish drawing" onClick={() => setActiveTool(null)}>
                      ✓
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Clear shape"
                    data-tooltip="Clear shape"
                    onClick={() => {
                      setRectangleAnchor(null);
                      setRectangleBounds(null);
                      setPolygonPoints([]);
                      setPolylinePoints([]);
                      setShapeType(null);
                      setGeofenceCenter(null);
                    }}
                  >
                    ⟲
                  </button>
                  <select value={mapLayer} onChange={(event) => setMapLayer(event.target.value)}>
                    <option value="google-street">Google (street)</option>
                    <option value="google-terrain">Terrain</option>
                    <option value="google-satellite">Google (satellite)</option>
                    <option value="google-hybrid">Google (hybrid)</option>
                  </select>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
