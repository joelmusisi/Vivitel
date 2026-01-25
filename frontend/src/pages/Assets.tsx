import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssetsFromApi, getConfigurationGroups, getTenantId, saveToApi, upsertAssetToApi } from "../utils/api";
import "../index.css";

type Asset = {
  id: string;
  status: "available" | "unavailable";
  assetDescription: string;
  fleetNumber: string;
  imei: string;
  site: string;
  model: string;
  lastPosition: string;
  lastTrip: string;
  registration: string;
  assetId: number;
  country: string;
  assetType?: string;
  make?: string;
  year?: string;
  vin?: string;
  mobileDevice?: string;
  odometer?: string;
  engineHours?: string;
  lastLocation?: string;
  configUploadDate?: string;
  configGroup?: string;
  imsi?: string;
  msisdn?: string;
  cameraSerial?: string;
  faults?: string;
};

type ColumnKey =
  | "assetDescription"
  | "fleetNumber"
  | "imei"
  | "site"
  | "model"
  | "lastPosition"
  | "lastTrip"
  | "registration"
  | "assetId"
  | "country"
  | "assetType"
  | "make"
  | "year"
  | "vin"
  | "mobileDevice"
  | "odometer"
  | "engineHours"
  | "status"
  | "lastLocation"
  | "configUploadDate"
  | "configGroup"
  | "imsi"
  | "msisdn"
  | "cameraSerial"
  | "faults";

const vehicleMakes = [
  "Ashok Leyland",
  "Bajaj",
  "BMW",
  "Chevrolet",
  "Citroën",
  "DAF",
  "Daihatsu",
  "Dodge",
  "Eicher",
  "Faw",
  "Ford",
  "Foton",
  "Freightliner",
  "Hino",
  "Honda",
  "Hyundai",
  "Isuzu",
  "Iveco",
  "Kenworth",
  "Kia",
  "Lexus",
  "Mahindra",
  "MAN",
  "Maserati",
  "Mazda",
  "Mercedes-Benz",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "Renault",
  "Scania",
  "Subaru",
  "Suzuki",
  "Tata",
  "Tesla",
  "Toyota",
  "UD Trucks",
  "Volkswagen",
  "Volvo",
  "Western Star",
  "Yutong"
];

const assetTypes = [
  "Heavy Vehicle - Articulated",
  "Heavy Vehicle - Non-Articulated",
  "Medium Truck",
  "Light Truck",
  "Pickup",
  "Van",
  "Bus",
  "Minibus",
  "Coach",
  "Car",
  "SUV",
  "Motorcycle",
  "Trailer",
  "Tanker",
  "Refrigerated Truck",
  "Tipper",
  "Flatbed",
  "Container",
  "Forklift",
  "Generator",
  "Construction Equipment",
  "Agricultural Equipment",
  "Marine Vessel"
];

const fuelTypes = [
  "Diesel",
  "Petrol/Gasoline",
  "Biodiesel",
  "Ethanol",
  "LPG",
  "CNG",
  "LNG",
  "Hybrid",
  "Electric",
  "Hydrogen"
];

const initialAssets: Asset[] = [
  {
    id: "1",
    status: "available",
    assetDescription: "APM T120DPY",
    fleetNumber: "893144040001220010444/",
    imei: "3577961098890477",
    site: "HV - Long Haul",
    model: "Howo",
    lastPosition: "04/12/2025 01:56 (EAT)",
    lastTrip: "03/12/2025 19:55 (EAT)",
    registration: "T120DPY",
    assetId: 5,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Non-Articulated",
    make: "Sinotruk",
    year: "2006",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "165,732",
    engineHours: "—",
    lastLocation: "Bagamoyo Road, Msata, Tanzania",
    configUploadDate: "26/09/2025 08:59 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "2040471767324098",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "2",
    status: "available",
    assetDescription: "APM T121DPY",
    fleetNumber: "893144040010221003922/",
    imei: "3598581603315756",
    site: "HV - Long Haul",
    model: "HOWO",
    lastPosition: "04/12/2025 01:48 (EAT)",
    lastTrip: "03/12/2025 14:47 (EAT)",
    registration: "T121DPY",
    assetId: 30,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Non-Articulated",
    make: "Sinotruk",
    year: "2006",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "168,325",
    engineHours: "—",
    lastLocation: "47RP+G95, Dar es Salaam, Tanzania",
    configUploadDate: "24/10/2025 03:58 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "2040471767324076",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "3",
    status: "available",
    assetDescription: "APM T264DPW",
    fleetNumber: "893144040010221003658/",
    imei: "3577961098899841",
    site: "HV - Long Haul",
    model: "Howo",
    lastPosition: "04/12/2025 02:23 (EAT)",
    lastTrip: "03/12/2025 18:23 (EAT)",
    registration: "T264DPW",
    assetId: 9,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Articulated",
    make: "Sinotruk",
    year: "2000",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "382,660",
    engineHours: "—",
    lastLocation: "ALMETA 2",
    configUploadDate: "24/09/2025 16:18 (EAT)",
    configGroup: "HV_Vivi 4000 - CAN SPD - CAN RPM",
    imsi: "2040471767324049",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "4",
    status: "available",
    assetDescription: "APM T403DVY",
    fleetNumber: "8925505060873395077/",
    imei: "357796109938771",
    site: "LV - Short Haul",
    model: "—",
    lastPosition: "21/11/2025 10:37 (EAT)",
    lastTrip: "21/11/2025 10:32 (EAT)",
    registration: "T403DVY",
    assetId: 20,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Articulated",
    make: "Faw",
    year: "2021",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "20,956",
    engineHours: "—",
    lastLocation: "ALMETA 1",
    configUploadDate: "20/11/2025 10:04 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "2040506873395027",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "5",
    status: "available",
    assetDescription: "APM T404DVY",
    fleetNumber: "8925505060873394328/",
    imei: "3577961099405557",
    site: "LV - Short Haul",
    model: "—",
    lastPosition: "04/12/2025 02:37 (EAT)",
    lastTrip: "04/12/2025 02:37 (EAT)",
    registration: "T404DVY",
    assetId: 26,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Non-Articulated",
    make: "FAW",
    year: "2006",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "20,880",
    engineHours: "—",
    lastLocation: "ALMETA 1",
    configUploadDate: "11/10/2025 17:06 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "6400506873394318",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "6",
    status: "available",
    assetDescription: "APM T405DVY",
    fleetNumber: "8925505060873395085/",
    imei: "3577961098890576",
    site: "LV - Short Haul",
    model: "—",
    lastPosition: "14/11/2025 13:13 (EAT)",
    lastTrip: "13/11/2025 12:59 (EAT)",
    registration: "T405DVY",
    assetId: 13,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Articulated",
    make: "Faw",
    year: "2006",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "29,992",
    engineHours: "—",
    lastLocation: "47RP+G95, Dar es Salaam, Tanzania",
    configUploadDate: "23/09/2025 15:20 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "2040506873394256",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  },
  {
    id: "7",
    status: "available",
    assetDescription: "APM T406DVY",
    fleetNumber: "300010428741/",
    imei: "357796109370132",
    site: "LV - Short Haul",
    model: "—",
    lastPosition: "03/12/2025 10:40 (EAT)",
    lastTrip: "17/11/2025 00:29 (EAT)",
    registration: "T406DVY",
    assetId: 37,
    country: "Tanzania",
    assetType: "Heavy Vehicle - Non-Articulated",
    make: "FAW",
    year: "2006",
    vin: "Vivi4000",
    mobileDevice: "Vivi4000",
    odometer: "18,620",
    engineHours: "—",
    lastLocation: "—",
    configUploadDate: "21/10/2025 10:40 (EAT)",
    configGroup: "HV_Vivi 4000 GPSV No RPM,Ext GPS",
    imsi: "6400506873394302",
    msisdn: "—",
    cameraSerial: "—",
    faults: "—"
  }
];

const columns: { key: ColumnKey; label: string }[] = [
  { key: "assetDescription", label: "Asset description" },
  { key: "fleetNumber", label: "Fleet number" },
  { key: "imei", label: "IMEI" },
  { key: "site", label: "Site" },
  { key: "model", label: "Model" },
  { key: "lastPosition", label: "Last position" },
  { key: "lastTrip", label: "Last trip" },
  { key: "registration", label: "Registration number" },
  { key: "assetId", label: "Asset ID" },
  { key: "country", label: "Country" },
  { key: "assetType", label: "Asset type" },
  { key: "make", label: "Make" },
  { key: "year", label: "Year" },
  { key: "vin", label: "VIN number" },
  { key: "mobileDevice", label: "Mobile device" },
  { key: "odometer", label: "Odometer" },
  { key: "engineHours", label: "Engine hours" },
  { key: "status", label: "Status" },
  { key: "lastLocation", label: "Last location" },
  { key: "configUploadDate", label: "Config upload date" },
  { key: "configGroup", label: "Configuration group" },
  { key: "imsi", label: "IMSI" },
  { key: "msisdn", label: "MSISDN" },
  { key: "cameraSerial", label: "Camera serial number" },
  { key: "faults", label: "Faults" }
];

export default function Assets() {
  const navigate = useNavigate();
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(columns.map((c) => c.key)));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns.map((c) => c.key));
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [assetSaved, setAssetSaved] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [activeAddTab, setActiveAddTab] = useState("Asset details");
  const [customGroupFilter, setCustomGroupFilter] = useState("");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsTarget, setSmsTarget] = useState<string | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [diagnosticsAsset, setDiagnosticsAsset] = useState<Asset | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState({
    assetDetails: true,
    mobileDevice: true,
    tripInfo: false,
    latestPosition: false
  });
  const [formValues, setFormValues] = useState({
    assetDescription: "",
    assetType: "",
    registration: "",
    site: "",
    configurationGroup: "",
    country: "",
    fleetNumber: "",
    vin: "",
    make: "",
    model: "",
    year: "",
    engineNumber: "",
    fuelType: "",
    targetFuel: "",
    fuelTankCapacity: "",
    serialNumber: "",
    assetId: "",
    additionalMobileDevice: "",
    notes: "",
    trackingIcon: "",
    assetColour: "",
    assetStatus: "Available",
    expiryMode: "never",
    expiryDate: "",
    statusNotes: "",
    hasDefaultDriver: false,
    defaultDriver: ""
  });

  const activeCols = columnOrder
    .filter((key) => visibleCols.has(key))
    .map((key) => columns.find((c) => c.key === key)!)
    .filter(Boolean);
  const grid = `24px repeat(${activeCols.length}, minmax(140px, 1fr)) 36px`;

  const parseAssetDate = (value?: string) => {
    if (!value) return null;
    const cleaned = value.replace("(EAT)", "").trim();
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  };

  const daysSince = (value?: string) => {
    const parsed = parseAssetDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
    const diffMs = Date.now() - parsed.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  };

  const matchesFilter = (asset: Asset, filter: string) => {
    const tripAge = daysSince(asset.lastTrip);
    const positionAge = daysSince(asset.lastPosition);
    switch (filter) {
      case "All":
        return true;
      case "Available":
        return asset.status === "available";
      case "Not available":
        return asset.status !== "available";
      case "No Mobile device":
        return !asset.mobileDevice || asset.mobileDevice === "—";
      case "No trips and positions ≥ 5 days":
        return tripAge >= 5 && positionAge >= 5;
      case "No trips ≥ 5 days":
        return tripAge >= 5;
      case "No positions ≥ 5 days":
        return positionAge >= 5;
      case "Decommissioned":
        return asset.status === "unavailable";
      case "Reminders due soon":
        return false;
      case "Reminders overdue":
        return false;
      default:
        return true;
    }
  };

  const [assetsData, setAssetsData] = useState<Asset[]>(initialAssets);
  const [configGroups, setConfigGroups] = useState<string[]>([]);
  const [siteOptions, setSiteOptions] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      const apiAssets = await getAssetsFromApi<Asset>();
      if (!mounted) return;
      if (apiAssets.length) {
        setAssetsData(apiAssets);
        window.localStorage.setItem("vivi.assets", JSON.stringify(apiAssets));
      } else {
        window.localStorage.setItem("vivi.assets", JSON.stringify(initialAssets));
      }
    };
    void loadAssets();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadConfigGroups = async () => {
      const groups = await getConfigurationGroups<{ name?: string }>();
      if (!mounted) return;
      let source = groups;
      if (!groups.length) {
        const tenantKey = `vivi.configGroups:${getTenantId()}`;
        const stored = window.localStorage.getItem(tenantKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = Array.isArray(parsed) ? parsed : [];
          } catch {
            source = [];
          }
        }
      }
      const names = source
        .map((group) => String(group.name ?? "").trim())
        .filter(Boolean);
      setConfigGroups(names);
    };
    void loadConfigGroups();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOrgChange = () => {
      void (async () => {
        const groups = await getConfigurationGroups<{ name?: string }>();
        let source = groups;
        if (!groups.length) {
          const tenantKey = `vivi.configGroups:${getTenantId()}`;
          const stored = window.localStorage.getItem(tenantKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              source = Array.isArray(parsed) ? parsed : [];
            } catch {
              source = [];
            }
          }
        }
        const names = source
          .map((group) => String(group.name ?? "").trim())
          .filter(Boolean);
        setConfigGroups(names);
      })();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    let mounted = true;
    const refreshGroups = async () => {
      const groups = await getConfigurationGroups<{ name?: string }>();
      if (!mounted) return;
      let source = groups;
      if (!groups.length) {
        const tenantKey = `vivi.configGroups:${getTenantId()}`;
        const stored = window.localStorage.getItem(tenantKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            source = Array.isArray(parsed) ? parsed : [];
          } catch {
            source = [];
          }
        }
      }
      const names = source
        .map((group) => String(group.name ?? "").trim())
        .filter(Boolean);
      setConfigGroups(names);
    };
    void refreshGroups();
    return () => {
      mounted = false;
    };
  }, [showAddModal]);

  useEffect(() => {
    const stored = window.localStorage.getItem("vivi.activeDbSites");
    let sites: string[] = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        sites = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        sites = [];
      }
    }
    if (sites.length === 0) {
      sites = Array.from(new Set(assetsData.map((asset) => asset.site).filter(Boolean)));
    }
    setSiteOptions(sites);
  }, [assetsData]);

  const filteredAssets = assetsData.filter((asset) => matchesFilter(asset, activeFilter));
  const countFor = (label: string) => assetsData.filter((asset) => matchesFilter(asset, label)).length;

  const toggleCol = (key: ColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const updateField = (key: keyof typeof formValues, value: (typeof formValues)[keyof typeof formValues]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };

  const openAddModal = () => {
    setEditingAssetId(null);
    setAssetSaved(false);
    setActiveAddTab("Asset details");
    setFormValues({
      assetDescription: "",
      assetType: "",
      registration: "",
      site: "",
      configurationGroup: "",
      country: "",
      fleetNumber: "",
      vin: "",
      make: "",
      model: "",
      year: "",
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      assetId: "",
      additionalMobileDevice: "",
      notes: "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: "Available",
      expiryMode: "never",
      expiryDate: "",
      statusNotes: "",
      hasDefaultDriver: false,
      defaultDriver: ""
    });
    setShowAddModal(true);
  };

  const openEditModal = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setAssetSaved(true);
    setActiveAddTab("Asset details");
    setFormValues({
      assetDescription: asset.assetDescription ?? "",
      assetType: asset.assetType ?? "",
      registration: asset.registration ?? "",
      site: asset.site ?? "",
      configurationGroup: asset.configGroup ?? "",
      country: asset.country ?? "",
      fleetNumber: asset.fleetNumber ?? "",
      vin: asset.vin ?? "",
      make: asset.make ?? "",
      model: asset.model ?? "",
      year: asset.year ?? "",
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      assetId: String(asset.assetId ?? ""),
      additionalMobileDevice: asset.mobileDevice ?? "",
      notes: "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: asset.status === "unavailable" ? "Not available" : "Available",
      expiryMode: "never",
      expiryDate: "",
      statusNotes: "",
      hasDefaultDriver: false,
      defaultDriver: ""
    });
    setShowAddModal(true);
  };

  const openDuplicateModal = (asset: Asset) => {
    setEditingAssetId(null);
    setAssetSaved(true);
    setActiveAddTab("Asset details");
    setFormValues({
      assetDescription: asset.assetDescription ?? "",
      assetType: asset.assetType ?? "",
      registration: "",
      site: asset.site ?? "",
      configurationGroup: asset.configGroup ?? "",
      country: asset.country ?? "",
      fleetNumber: "",
      vin: asset.vin ?? "",
      make: asset.make ?? "",
      model: asset.model ?? "",
      year: asset.year ?? "",
      engineNumber: "",
      fuelType: "",
      targetFuel: "",
      fuelTankCapacity: "",
      serialNumber: "",
      assetId: "",
      additionalMobileDevice: asset.mobileDevice ?? "",
      notes: "",
      trackingIcon: "",
      assetColour: "",
      assetStatus: asset.status === "unavailable" ? "Not available" : "Available",
      expiryMode: "never",
      expiryDate: "",
      statusNotes: "",
      hasDefaultDriver: false,
      defaultDriver: ""
    });
    setMobileDeviceRows((current) => {
      if (current.length === 0) return current;
      return [
        {
          ...current[0],
          imei: ""
        }
      ];
    });
    setShowAddModal(true);
  };

  const customGroups: { id: string; name: string; assets: number }[] = [];
  const filteredCustomGroups = customGroups.filter((group) =>
    group.name.toLowerCase().includes(customGroupFilter.trim().toLowerCase())
  );
  const driverOptions = [
    "Tumwine Kevin",
    "Wangwe Joel",
    "Said Musa",
    "Asha Kimaro",
    "Peter Mussa",
    "Neema Paul"
  ];

  type SectionKey =
    | "Service history"
    | "Reminders"
    | "Fuel data"
    | "Other cost data"
    | "Mobile device settings"
    | "Required driver certificates"
    | "Required driver licences";

  const sectionFields: Record<SectionKey, { key: string; label: string }[]> = {
    "Service history": [
      { key: "date", label: "Date" },
      { key: "service", label: "Service" },
      { key: "vendor", label: "Vendor" },
      { key: "odometer", label: "Odometer" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "invoice", label: "Invoice" },
      { key: "notes", label: "Notes" }
    ],
    Reminders: [
      { key: "reminder", label: "Reminder" },
      { key: "dueDate", label: "Due date" },
      { key: "status", label: "Status" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "notes", label: "Notes" }
    ],
    "Fuel data": [
      { key: "date", label: "Date" },
      { key: "supplier", label: "Supplier" },
      { key: "location", label: "Location" },
      { key: "litres", label: "Litres" },
      { key: "pricePerLitre", label: "Price/Litre" },
      { key: "total", label: "Total" },
      { key: "currency", label: "Currency" },
      { key: "odometer", label: "Odometer" },
      { key: "invoice", label: "Invoice" }
    ],
    "Other cost data": [
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "vendor", label: "Vendor" },
      { key: "cost", label: "Cost" },
      { key: "currency", label: "Currency" },
      { key: "invoice", label: "Invoice" },
      { key: "notes", label: "Notes" }
    ],
    "Mobile device settings": [
      { key: "device", label: "Device" },
      { key: "model", label: "Model" },
      { key: "imei", label: "IMEI" },
      { key: "installed", label: "Installed" },
      { key: "status", label: "Status" },
      { key: "firmware", label: "Firmware" },
      { key: "camera", label: "Camera" },
      { key: "cameraModel", label: "Camera model" },
      { key: "cameraSerial", label: "Camera serial" },
      { key: "cameraStatus", label: "Camera status" },
      { key: "cameraFirmware", label: "Camera firmware" }
    ],
    "Required driver certificates": [
      { key: "certificate", label: "Certificate" },
      { key: "holder", label: "Holder" },
      { key: "issued", label: "Issued" },
      { key: "expiry", label: "Expiry" },
      { key: "status", label: "Status" }
    ],
    "Required driver licences": [
      { key: "licence", label: "Licence" },
      { key: "holder", label: "Holder" },
      { key: "issued", label: "Issued" },
      { key: "expiry", label: "Expiry" },
      { key: "status", label: "Status" }
    ]
  };

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const escapeValue = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
      return value;
    };
    const csvRows = [headers, ...rows].map((row) => row.map((cell) => escapeValue(String(cell))).join(","));
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const [serviceHistoryRows, setServiceHistoryRows] = useState([
    {
      date: "2025-12-12",
      service: "Scheduled service",
      vendor: "Tanga Auto",
      odometer: "121,420",
      cost: "2,450,000",
      currency: "TZS",
      invoice: "INV-2391",
      notes: "Oil + filters"
    },
    {
      date: "2025-10-03",
      service: "Brake pads",
      vendor: "Peak Garage",
      odometer: "116,008",
      cost: "980,000",
      currency: "TZS",
      invoice: "INV-2214",
      notes: "Front axle"
    }
  ]);

  const [reminderRows, setReminderRows] = useState([
    {
      reminder: "Insurance renewal",
      dueDate: "2026-02-01",
      status: "Due soon",
      cost: "1,200,000",
      currency: "TZS",
      notes: "Annual premium"
    },
    {
      reminder: "Service interval",
      dueDate: "2026-03-15",
      status: "Scheduled",
      cost: "—",
      currency: "TZS",
      notes: "Every 15,000 km"
    }
  ]);

  const [fuelRows, setFuelRows] = useState([
    {
      date: "2025-12-18",
      supplier: "TotalEnergies",
      location: "Dar Depot",
      litres: "420",
      pricePerLitre: "3,200",
      total: "1,344,000",
      currency: "TZS",
      odometer: "122,104",
      invoice: "FUEL-0881"
    },
    {
      date: "2025-12-05",
      supplier: "Puma",
      location: "Morogoro",
      litres: "360",
      pricePerLitre: "3,150",
      total: "1,134,000",
      currency: "TZS",
      odometer: "121,010",
      invoice: "FUEL-0804"
    }
  ]);

  const [otherCostRows, setOtherCostRows] = useState([
    {
      date: "2025-11-22",
      category: "Toll fees",
      vendor: "TANROADS",
      cost: "120,000",
      currency: "TZS",
      invoice: "TOLL-331",
      notes: "Up-country"
    },
    {
      date: "2025-09-14",
      category: "Tyres",
      vendor: "Tyre World",
      cost: "1,680,000",
      currency: "TZS",
      invoice: "TYR-558",
      notes: "2 rear tyres"
    }
  ]);

  const [mobileDeviceRows, setMobileDeviceRows] = useState([
    {
      device: "Vivi4000",
      model: "Vivi4000 Pro",
      imei: "357796109938771",
      installed: "2024-06-25",
      status: "Active",
      firmware: "v3.2.1",
      camera: "ViviCam",
      cameraModel: "VC-200",
      cameraSerial: "CAM-2214",
      cameraStatus: "Online",
      cameraFirmware: "v1.1.0"
    }
  ]);

  const isSaveDisabled =
    !formValues.registration.trim() ||
    !formValues.fleetNumber.trim() ||
    !mobileDeviceRows[0]?.imei?.trim();

  const [deviceCatalog, setDeviceCatalog] = useState([
    "Vivi4000",
    "ViviMini",
    "ViviPro",
    "Teltonika",
    "Queclink",
    "Concox",
    "Ruptela",
    "CalAmp",
    "SinoTrack",
    "Jimi",
    "TKStar",
    "MeiTrack",
    "Cobblestone",
    "Trackimo",
    "Geotab",
    "Traccar",
    "Omnicomm",
    "Sierra Wireless",
    "Novatel",
    "Suntech",
    "Atrack",
    "Xirgo",
    "Gurtam",
    "GalileoSky",
    "Navixy",
    "Fleet Complete",
    "Digi",
    "Micronet",
    "CareTrack",
    "Jablotron",
    "ATrack",
    "Gosafe",
    "iStartek",
    "Rohde & Schwarz",
    "Honeywell",
    "Trimble",
    "Orbcomm",
    "StarLink",
    "Quectel",
    "U-Blox",
    "Neomatica",
    "Technoton",
    "Argus",
    "Bitrek",
    "Digital Matter",
    "FleetGO",
    "Itron",
    "Gosafe (Meiligao)",
    "Smartrak",
    "Samsara",
    "OneStep GPS",
    "Spireon",
    "Linxup",
    "GpsGate",
    "Autofleet",
    "BCE",
    "Monico",
    "Navtelecom",
    "ATrack",
    "Lacuna",
    "Zonar",
    "Inseego",
    "Topflytech",
    "Navixy X",
    "Wialon"
  ]);

  const [deviceModels, setDeviceModels] = useState<Record<string, string[]>>({
    Vivi4000: ["Vivi4000 Pro", "Vivi4000 Lite"],
    ViviMini: ["ViviMini X", "ViviMini 2"],
    ViviPro: ["ViviPro Max", "ViviPro S"],
    Teltonika: ["FMB920", "FMB130", "FMC650"],
    Queclink: ["GV300", "GV500", "GV600"],
    Concox: ["GT06", "JM-VL103"],
    Ruptela: ["FM-Pro4", "FM-Tco4"],
    CalAmp: ["LMU-2630", "LMU-3640"],
    SinoTrack: ["ST-901", "ST-905"],
    Jimi: ["GV55", "GV75"],
    TKStar: ["TK905", "TK909"],
    MeiTrack: ["T366", "T622"],
    Cobblestone: ["Cobblestone Gen2"],
    Trackimo: ["Trackimo 3G"],
    Geotab: ["GO9", "GO8"],
    Traccar: ["Traccar Client"],
    Omnicomm: ["L-Series"],
    "Sierra Wireless": ["FX30", "FX11"],
    Novatel: ["MiFi 8800"],
    Suntech: ["ST3300", "ST4310"],
    Atrack: ["AX7", "AK11"],
    Xirgo: ["XT63", "XT65"],
    GalileoSky: ["7x", "9x"],
    Navixy: ["X-Box", "Tracker"],
    "Fleet Complete": ["FCG100", "FCG200"],
    Digi: ["IX20", "IX30"],
    Micronet: ["Nexus", "Control"],
    CareTrack: ["GT06N"],
    Jablotron: ["JA-82"],
    "Digital Matter": ["Oyster", "Hawk"],
    Samsara: ["VG34", "VG54"],
    Spireon: ["GoldStar", "FleetLocate"],
    Zonar: ["ZTrak", "V4"],
    Inseego: ["FX2000"],
    Topflytech: ["TLW2", "TLD2"],
    Wialon: ["Wialon Pro"],
    Quectel: ["EC25", "EG25"],
    "U-Blox": ["SARA-R5", "TOBY"],
    Neomatica: ["Galileosky Mini"],
    Technoton: ["DUT-E", "DUT-S"],
    Argus: ["Track L1"],
    Bitrek: ["BI-810"],
    "Navtelecom": ["Smart S-2433"],
    Lacuna: ["Lacuna 1"],
    "OneStep GPS": ["OS-100"],
    "Smartrak": ["SMT-1"],
    "GpsGate": ["Gateway"],
    "Autofleet": ["AutoTrack"],
    "BCE": ["BCE-100"],
    "Monico": ["MoniPro"],
    "Gosafe": ["GS-01"],
    "iStartek": ["VT900"],
    "Rohde & Schwarz": ["R&S Track"],
    "Honeywell": ["HX-20"],
    "Trimble": ["TL200"],
    "Orbcomm": ["OG2", "IDP"],
    "StarLink": ["SL-Tracker"],
    "Itron": ["IT-Track"],
    "Gurtam": ["Wialon App"],
    "Navixy X": ["Navixy X1"],
    "ATrack": ["AX5", "AL11"],
    "FleetGO": ["FG-1"],
    "Gosafe (Meiligao)": ["Meiligao GT30"],
    "LinXup": ["LX-200"]
  });

  const [deviceSearch, setDeviceSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [cameraDeviceSearch, setCameraDeviceSearch] = useState("");
  const [cameraModelSearch, setCameraModelSearch] = useState("");
  const [firmwareOptions, setFirmwareOptions] = useState([
    "v3.2.1",
    "v3.1.8",
    "v3.0.5",
    "v2.9.9"
  ]);
  const [statusOptions, setStatusOptions] = useState(["Online", "Offline", "Deinstalled"]);
  const [cameraCatalog, setCameraCatalog] = useState(["ViviCam", "RoadEye", "MiXVision", "TrackCam", "VisionTrack"]);
  const [cameraModels, setCameraModels] = useState<Record<string, string[]>>({
    ViviCam: ["VC-200", "VC-400"],
    RoadEye: ["RE-1"],
    MiXVision: ["MX-500"],
    TrackCam: ["TC-100"],
    VisionTrack: ["VT-20"]
  });
  const [cameraFirmwareOptions, setCameraFirmwareOptions] = useState(["v1.1.0", "v1.0.4", "v0.9.8"]);

  const [certificateRows, setCertificateRows] = useState([
    {
      certificate: "Hazmat",
      holder: "Tumwine Kevin",
      issued: "2024-04-01",
      expiry: "2026-04-01",
      status: "Valid"
    }
  ]);

  const [licenceRows, setLicenceRows] = useState([
    {
      licence: "Class E",
      holder: "Tumwine Kevin",
      issued: "2023-08-12",
      expiry: "2026-08-12",
      status: "Valid"
    }
  ]);

  const sectionRows = useMemo(
    () => ({
      "Service history": serviceHistoryRows,
      Reminders: reminderRows,
      "Fuel data": fuelRows,
      "Other cost data": otherCostRows,
      "Mobile device settings": mobileDeviceRows,
      "Required driver certificates": certificateRows,
      "Required driver licences": licenceRows
    }),
    [
      certificateRows,
      licenceRows,
      mobileDeviceRows,
      otherCostRows,
      reminderRows,
      fuelRows,
      serviceHistoryRows
    ]
  );

  const [selectedRowBySection, setSelectedRowBySection] = useState<Record<SectionKey, number | null>>({
    "Service history": null,
    Reminders: null,
    "Fuel data": null,
    "Other cost data": null,
    "Mobile device settings": null,
    "Required driver certificates": null,
    "Required driver licences": null
  });

  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [dataModalSection, setDataModalSection] = useState<SectionKey | null>(null);
  const [dataModalIndex, setDataModalIndex] = useState<number | null>(null);
  const [dataDraft, setDataDraft] = useState<Record<string, string>>({});

  const openDataModal = (section: SectionKey, index: number | null) => {
    setDataModalSection(section);
    setDataModalIndex(index);
    const fields = sectionFields[section];
    if (index === null) {
      const emptyDraft: Record<string, string> = {};
      fields.forEach((field) => {
        emptyDraft[field.key] = "";
      });
      setDataDraft(emptyDraft);
    } else {
      const row = sectionRows[section][index] as Record<string, string>;
      const draft: Record<string, string> = {};
      fields.forEach((field) => {
        draft[field.key] = row[field.key] ?? "";
      });
      setDataDraft(draft);
    }
    setDataModalOpen(true);
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setDataModalSection(null);
    setDataModalIndex(null);
    setDataDraft({});
  };

  const saveDataModal = () => {
    if (!dataModalSection) return;
    const nextRows = [...sectionRows[dataModalSection]] as Record<string, string>[];
    if (dataModalIndex === null) {
      nextRows.unshift({ ...dataDraft });
    } else {
      nextRows[dataModalIndex] = { ...dataDraft };
    }
    switch (dataModalSection) {
      case "Service history":
        setServiceHistoryRows(nextRows as typeof serviceHistoryRows);
        break;
      case "Reminders":
        setReminderRows(nextRows as typeof reminderRows);
        break;
      case "Fuel data":
        setFuelRows(nextRows as typeof fuelRows);
        break;
      case "Other cost data":
        setOtherCostRows(nextRows as typeof otherCostRows);
        break;
      case "Mobile device settings":
        if (dataModalIndex === null) {
          setMobileDeviceRows([
            {
              ...(dataDraft as typeof mobileDeviceRows[number])
            }
          ]);
        } else {
          setMobileDeviceRows(nextRows as typeof mobileDeviceRows);
        }
        break;
      case "Required driver certificates":
        setCertificateRows(nextRows as typeof certificateRows);
        break;
      case "Required driver licences":
        setLicenceRows(nextRows as typeof licenceRows);
        break;
      default:
        break;
    }
    void saveToApi(`assets:data:${dataModalSection}`, {
      section: dataModalSection,
      rows: nextRows,
      updatedAt: new Date().toISOString()
    });
    closeDataModal();
  };

  const handleSaveAssetModal = () => {
    if (!formValues.configurationGroup) {
      alert("Select a configuration group to commission this asset.");
      return;
    }
    const assetId = editingAssetId ?? `asset-${Date.now()}`;
    const payload: Asset = {
      id: assetId,
      status: formValues.assetStatus === "Not available" ? "unavailable" : "available",
      assetDescription: formValues.assetDescription || "—",
      fleetNumber: formValues.fleetNumber || "—",
      imei: formValues.imei || "—",
      site: formValues.site || "—",
      model: formValues.model || "—",
      lastPosition: formValues.lastPosition || "—",
      lastTrip: formValues.lastTrip || "—",
      registration: formValues.registration || "—",
      assetId: Number(formValues.assetId) || 0,
      country: formValues.country || "—",
      assetType: formValues.assetType || "—",
      make: formValues.make || "—",
      year: formValues.year || "—",
      vin: formValues.vin || "—",
      mobileDevice: formValues.additionalMobileDevice || "—",
      odometer: formValues.odometer || "—",
      engineHours: formValues.engineHours || "—",
      lastLocation: formValues.lastLocation || "—",
      configUploadDate: formValues.configUploadDate || "—",
      configGroup: formValues.configurationGroup || "—",
      imsi: formValues.imsi || "—",
      msisdn: formValues.msisdn || "—",
      cameraSerial: formValues.cameraSerial || "—",
      faults: formValues.faults || "—"
    };

    void upsertAssetToApi(payload);
    setAssetsData((current) => {
      const existingIndex = current.findIndex((asset) => asset.id === assetId);
      const next = [...current];
      if (existingIndex >= 0) {
        next[existingIndex] = payload;
      } else {
        next.unshift(payload);
      }
      window.localStorage.setItem("vivi.assets", JSON.stringify(next));
      return next;
    });
    setAssetSaved(true);
    setShowSaveToast(true);
    window.setTimeout(() => {
      setShowAddModal(false);
      setEditingAssetId(null);
    }, 1000);
    window.setTimeout(() => {
      setShowSaveToast(false);
    }, 1400);
  };

  const deleteSelectedRow = (section: SectionKey) => {
    const selected = selectedRowBySection[section];
    if (selected === null) {
      alert("Select a row first.");
      return;
    }
    const nextRows = sectionRows[section].filter((_, index) => index !== selected);
    switch (section) {
      case "Service history":
        setServiceHistoryRows(nextRows as typeof serviceHistoryRows);
        break;
      case "Reminders":
        setReminderRows(nextRows as typeof reminderRows);
        break;
      case "Fuel data":
        setFuelRows(nextRows as typeof fuelRows);
        break;
      case "Other cost data":
        setOtherCostRows(nextRows as typeof otherCostRows);
        break;
      case "Mobile device settings":
        setMobileDeviceRows(nextRows as typeof mobileDeviceRows);
        break;
      case "Required driver certificates":
        setCertificateRows(nextRows as typeof certificateRows);
        break;
      case "Required driver licences":
        setLicenceRows(nextRows as typeof licenceRows);
        break;
      default:
        break;
    }
    setSelectedRowBySection((current) => ({ ...current, [section]: null }));
  };

  return (
    <div className="assets-layout">
      <div className="assets-toolbar">
        <div className="assets-toolbar-left">
          <span className="assets-toolbar-pill">All</span>
          <span className="assets-toolbar-count">{filteredAssets.length}</span>
        </div>
        <div className="assets-toolbar-right">
          <div className="assets-toolbar-search">
            <input type="search" placeholder="Search" aria-label="Search assets" />
            <span className="assets-toolbar-search-icon" aria-hidden="true">🔍</span>
          </div>
          <button
            type="button"
            className="assets-toolbar-icon"
            aria-label="Export"
            data-tooltip="Export"
          >
            ⭳
          </button>
          <button
            type="button"
            className="assets-toolbar-icon"
            aria-label="Import"
            data-tooltip="Import"
          >
            ⭱
          </button>
          <button
            type="button"
            className="assets-toolbar-icon"
            aria-label="Download template"
            data-tooltip="Download template"
          >
            ⬇️
          </button>
          <button
            type="button"
            className="assets-toolbar-add"
            aria-label="Add asset"
            data-tooltip="Add asset"
            onClick={openAddModal}
          >
            +
          </button>
        </div>
      </div>

      <aside className="assets-filter">
        <button
          type="button"
          className={`assets-filter-header${activeFilter === "All" ? " active" : ""}`}
          onClick={() => setActiveFilter("All")}
        >
          <span>All</span>
          <span className="pill-active" style={{ padding: "6px 10px" }}>
            {countFor("All")}
          </span>
        </button>
        {[
          "Available",
          "Not available",
          "No Mobile device",
          "No trips and positions ≥ 5 days",
          "No trips ≥ 5 days",
          "No positions ≥ 5 days",
          "Decommissioned",
          "Reminders due soon",
          "Reminders overdue"
        ].map((label) => (
          <button
            key={label}
            type="button"
            className={`filter-row${activeFilter === label ? " active" : ""}`}
            onClick={() => setActiveFilter(label)}
          >
            <span>{label}</span>
            <span className="count-pill">{countFor(label)}</span>
          </button>
        ))}
      </aside>

      <section className="assets-table-wrap">
        <div className="assets-table-inner">
          <div className="assets-table-head" style={{ gridTemplateColumns: grid }}>
            <div />
            {activeCols.map((c) => (
              <div
                key={c.key}
                className={`assets-col${dragCol === c.key ? " dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDragCol(c.key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", c.key);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromKey = (event.dataTransfer.getData("text/plain") as ColumnKey) || dragCol;
                  if (!fromKey || fromKey === c.key) return;
                  setColumnOrder((current) => {
                    const next = current.filter((key) => key !== fromKey);
                    const targetIndex = next.indexOf(c.key);
                    next.splice(Math.max(0, targetIndex), 0, fromKey);
                    return next;
                  });
                  setDragCol(null);
                }}
                onDragEnd={() => setDragCol(null)}
              >
                {c.label}
              </div>
            ))}
            <div className="assets-col-menu">
              <button
                className="menu-icon-btn"
                aria-label="Toggle columns"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setColMenuOpen((v) => !v);
                  setColMenuPos({ top: rect.bottom + 6, left: rect.right - 220 });
                }}
              >
                <span />
                <span />
                <span />
              </button>
              {colMenuOpen && colMenuPos && (
                <div className="assets-col-dropdown" style={{ top: colMenuPos.top, left: colMenuPos.left }}>
                  {columns.map((opt) => (
                    <label key={opt.key} className="columns-option">
                      <input type="checkbox" checked={visibleCols.has(opt.key)} onChange={() => toggleCol(opt.key)} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="assets-table-body">
            {filteredAssets.map((a) => (
              <div key={a.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                <div className="assets-cell">
                  <span className="status-dot" style={{ backgroundColor: a.status === "available" ? "#16a34a" : "#94a3b8" }} />
                </div>
                {activeCols.map((col) => (
                  <div key={col.key} className="assets-cell">
                    {String(a[col.key as keyof Asset] ?? "—")}
                  </div>
                ))}
                <div className="assets-cell actions">
                  <button
                    className="actions-trigger"
                    aria-label="Row actions"
                    onClick={() => setOpenRowMenu((current) => (current === a.id ? null : a.id))}
                  >
                    ⋯
                  </button>
                  {openRowMenu === a.id && (
                    <div className="assets-row-menu" role="menu">
                      {[
                        { label: "Edit", icon: "✏️" },
                        { label: "Duplicate", icon: "📄" },
                        { label: "Show on historical tracking", icon: "🧭" },
                        { label: "Show on trip timeline", icon: "🧾" },
                        { label: "Diagnostics", icon: "🧪" },
                        { label: "Resend commissioning SMS", icon: "📨" }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="assets-row-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setOpenRowMenu(null);
                            if (item.label === "Edit") {
                              openEditModal(a);
                            } else if (item.label === "Duplicate") {
                              openDuplicateModal(a);
                            } else if (item.label === "Show on trip timeline") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              localStorage.setItem("vivi.activeAsset", assetLabel);
                              localStorage.setItem("vivi.activeRegistration", a.registration ?? "—");
                              localStorage.setItem("vivi.activeSite", a.site ?? "—");
                              localStorage.removeItem("vivi.contextType");
                              localStorage.removeItem("vivi.contextName");
                              localStorage.removeItem("vivi.contextOptions");
                              window.dispatchEvent(new Event("vivi:contextchange"));
                              navigate("/monitor/activity/trip-timeline");
                            } else if (item.label === "Show on historical tracking") {
                              const assetLabel = `${a.assetDescription} - ${a.registration}`;
                              localStorage.setItem("vivi.activeAsset", assetLabel);
                              localStorage.setItem("vivi.activeRegistration", a.registration ?? "—");
                              localStorage.setItem("vivi.activeSite", a.site ?? "—");
                              localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                              localStorage.removeItem("vivi.contextType");
                              localStorage.removeItem("vivi.contextName");
                              localStorage.removeItem("vivi.contextOptions");
                              window.dispatchEvent(new Event("vivi:contextchange"));
                              navigate("/monitor/tracking/historical");
                            } else if (item.label === "Diagnostics") {
                              setDiagnosticsAsset(a);
                              setDiagnosticsOpen({
                                assetDetails: true,
                                mobileDevice: true,
                                tripInfo: false,
                                latestPosition: false
                              });
                              setShowDiagnosticsModal(true);
                            } else if (item.label === "Resend commissioning SMS") {
                              setSmsTarget(`${a.assetDescription} - ${a.registration}`);
                              setSmsMessage("");
                              setShowSmsModal(true);
                            } else {
                              alert(`${item.label} - ${a.assetDescription}`);
                            }
                            setOpenRowMenu(null);
                          }}
                        >
                          <span className="assets-row-menu-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showAddModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Create new asset">
          <div className="assets-add-card">
            <div className="assets-add-header">
              <div className="assets-add-title">{editingAssetId ? "Edit asset" : "Create new asset"}</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowAddModal(false);
                    setAssetSaved(false);
                    setEditingAssetId(null);
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSaveAssetModal}
                  disabled={isSaveDisabled}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body">
              <aside className="assets-add-sidebar">
                <div className="assets-add-tab-list">
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Asset details" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Asset details")}
                  >
                    Asset details
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Asset status" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Asset status")}
                  >
                    Asset status
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Access control" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Access control")}
                  >
                    Access control
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Custom groups" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Custom groups")}
                  >
                    Custom groups
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Service history" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Service history")}
                  >
                    Service history
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Reminders" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Reminders")}
                  >
                    Reminders
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Fuel data" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Fuel data")}
                  >
                    Fuel data
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Other cost data" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Other cost data")}
                  >
                    Other cost data
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Mobile device settings" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Mobile device settings")}
                  >
                    Mobile device settings
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Required driver certificates" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Required driver certificates")}
                  >
                    Required driver certificates
                  </button>
                  <button
                    type="button"
                    className={`assets-add-tab ${activeAddTab === "Required driver licences" ? "active" : ""}`}
                    onClick={() => setActiveAddTab("Required driver licences")}
                  >
                    Required driver licences
                  </button>
                </div>
              </aside>
              <section className="assets-add-form">
                {activeAddTab === "Asset details" && (
                  <>
                    <h3>Asset details</h3>
                    <div className="assets-add-grid">
                      <label>
                        Asset description <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.assetDescription}
                          onChange={(e) => updateField("assetDescription", e.target.value)}
                        />
                      </label>
                      <label>
                        Asset type <span>*</span>
                        <select
                          value={formValues.assetType}
                          onChange={(e) => updateField("assetType", e.target.value)}
                        >
                          <option value="">Select an asset type</option>
                          {assetTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Registration number <span>*</span>
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.registration}
                          onChange={(e) => updateField("registration", e.target.value)}
                        />
                      </label>
                      <label>
                        Site <span>*</span>
                        <select value={formValues.site} onChange={(e) => updateField("site", e.target.value)}>
                          <option value="">Select a site</option>
                          {siteOptions.map((site) => (
                            <option key={site} value={site}>
                              {site}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Configuration group
                        <select
                          value={formValues.configurationGroup}
                          onChange={(e) => updateField("configurationGroup", e.target.value)}
                        >
                          <option value="">Select a configuration group</option>
                          {configGroups.map((group) => (
                            <option key={group} value={group}>
                              {group}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Country
                        <select>
                          <option value="">Choose country</option>
                        </select>
                      </label>
                      <label>
                        Fleet number
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.fleetNumber}
                          onChange={(e) => updateField("fleetNumber", e.target.value)}
                        />
                      </label>
                      <label>
                        Vehicle Identification Number (VIN)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.vin}
                          onChange={(e) => updateField("vin", e.target.value)}
                        />
                      </label>
                      <label>
                        Make <span>*</span>
                        <select value={formValues.make} onChange={(e) => updateField("make", e.target.value)}>
                          <option value="">Select a make</option>
                          {vehicleMakes.map((make) => (
                            <option key={make} value={make}>
                              {make}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Model
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.model}
                          onChange={(e) => updateField("model", e.target.value)}
                        />
                      </label>
                      <label>
                        Year
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.year}
                          onChange={(e) => updateField("year", e.target.value)}
                        />
                      </label>
                      <label>
                        Engine number
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.engineNumber}
                          onChange={(e) => updateField("engineNumber", e.target.value)}
                        />
                      </label>
                      <label>
                        Fuel type
                        <select value={formValues.fuelType} onChange={(e) => updateField("fuelType", e.target.value)}>
                          <option value="">Select a fuel type</option>
                          {fuelTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Target fuel consumption (km/l)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.targetFuel}
                          onChange={(e) => updateField("targetFuel", e.target.value)}
                        />
                      </label>
                      <label>
                        Fuel tank capacity (l)
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.fuelTankCapacity}
                          onChange={(e) => updateField("fuelTankCapacity", e.target.value)}
                        />
                      </label>
                      <label>
                        Serial number
                        <input
                          type="text"
                          placeholder=""
                          value={formValues.serialNumber}
                          onChange={(e) => updateField("serialNumber", e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Asset ID</div>
                      <div className="assets-add-grid">
                        <label>
                          Asset ID
                          <input
                            type="text"
                            placeholder=""
                            value={formValues.assetId}
                            onChange={(e) => updateField("assetId", e.target.value)}
                          />
                          <small>If left blank, the next available ID will automatically be assigned.</small>
                        </label>
                        <label>
                          Additional mobile device
                          <input
                            type="text"
                            placeholder=""
                            value={formValues.additionalMobileDevice}
                            onChange={(e) => updateField("additionalMobileDevice", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Notes</div>
                      <label>
                        Notes
                        <textarea
                          rows={3}
                          placeholder=""
                          value={formValues.notes}
                          onChange={(e) => updateField("notes", e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Tracking Icon & colour</div>
                      <div className="assets-add-grid">
                        <label>
                          This icon will be displayed on the map
                          <button type="button" className="assets-add-icon-btn">Select icon</button>
                        </label>
                        <label>
                          Asset colour
                          <input
                            type="text"
                            placeholder=""
                            value={formValues.assetColour}
                            onChange={(e) => updateField("assetColour", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab === "Asset status" && (
                  <>
                    <h3>Asset status</h3>
                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Current asset status</div>
                      <label>
                        <select
                          value={formValues.assetStatus}
                          onChange={(e) => updateField("assetStatus", e.target.value)}
                        >
                          <option value="Available">Available</option>
                          <option value="Not available">Not available</option>
                          <option value="Decommissioned">Decommissioned</option>
                        </select>
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Expiry date</div>
                      <label>
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={formValues.expiryMode === "date"}
                          onChange={() => updateField("expiryMode", "date")}
                        />
                        On specified date
                      </label>
                      <input
                        type="date"
                        value={formValues.expiryDate}
                        onChange={(e) => updateField("expiryDate", e.target.value)}
                        disabled={formValues.expiryMode !== "date"}
                      />
                      <label>
                        <input
                          type="radio"
                          name="expiryMode"
                          checked={formValues.expiryMode === "never"}
                          onChange={() => updateField("expiryMode", "never")}
                        />
                        Never
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <div className="assets-add-section-title">Notes</div>
                      <label>
                        Notes
                        <textarea
                          rows={3}
                          placeholder=""
                          value={formValues.statusNotes}
                          onChange={(e) => updateField("statusNotes", e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <small>
                        This asset status was last changed to '{formValues.assetStatus}' on 25/06/2024 13:49 (EAT) by
                        MUSISI JOEL
                      </small>
                      <small>This asset was created on 25/06/2024 13:49 (EAT) by MUSISI JOEL</small>
                    </div>
                  </>
                )}

                {activeAddTab === "Custom groups" && (
                  <>
                    <h3>Custom groups</h3>
                    <div className="assets-add-section">
                      <small>Select the custom groups that this asset should be assigned to</small>
                    </div>
                    <div className="assets-groups-card">
                      <input
                        className="assets-groups-filter"
                        type="search"
                        placeholder="Filter"
                        value={customGroupFilter}
                        onChange={(e) => setCustomGroupFilter(e.target.value)}
                        aria-label="Filter custom groups"
                      />
                      <div className="assets-groups-table">
                        <div className="assets-groups-row assets-groups-head">
                          <div className="assets-groups-cell checkbox">
                            <input type="checkbox" disabled aria-label="Select all" />
                          </div>
                          <div className="assets-groups-cell name">Group name</div>
                          <div className="assets-groups-cell assets">Assets</div>
                        </div>
                        {filteredCustomGroups.length === 0 ? (
                          <div className="assets-groups-empty">No items to display</div>
                        ) : (
                          filteredCustomGroups.map((group) => (
                            <div key={group.id} className="assets-groups-row">
                              <div className="assets-groups-cell checkbox">
                                <input type="checkbox" aria-label={`Select ${group.name}`} />
                              </div>
                              <div className="assets-groups-cell name">{group.name}</div>
                              <div className="assets-groups-cell assets">{group.assets}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}

                {activeAddTab === "Access control" && (
                  <>
                    <h3>Access control</h3>
                    <div className="assets-add-section">
                      <label className="assets-add-checkbox">
                        <input
                          type="checkbox"
                          checked={formValues.hasDefaultDriver}
                          onChange={(e) => updateField("hasDefaultDriver", e.target.checked)}
                        />
                        Asset has a default driver
                      </label>
                    </div>
                    <div className="assets-add-section">
                      <label>
                        Default driver name <span>*</span>
                        <select
                          value={formValues.defaultDriver}
                          onChange={(e) => updateField("defaultDriver", e.target.value)}
                          disabled={!formValues.hasDefaultDriver}
                        >
                          <option value="">Select a driver</option>
                          {driverOptions.map((driver) => (
                            <option key={driver} value={driver}>
                              {driver}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {activeAddTab !== "Asset details" && activeAddTab !== "Asset status" && activeAddTab !== "Custom groups" && activeAddTab !== "Access control" && (
                  <>
                    <h3>{activeAddTab}</h3>
                    {activeAddTab === "Service history" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track scheduled and unscheduled services with cost history.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Service history", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Service history"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Service history", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Service history")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "service-history.csv",
                                  ["Date", "Service", "Vendor", "Odometer", "Cost", "Currency", "Invoice", "Notes"],
                                  serviceHistoryRows.map((row) => [
                                    row.date,
                                    row.service,
                                    row.vendor,
                                    row.odometer,
                                    row.cost,
                                    row.currency,
                                    row.invoice,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Service</div>
                            <div className="assets-data-cell">Vendor</div>
                            <div className="assets-data-cell">Odometer</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {serviceHistoryRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            serviceHistoryRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.service}`}
                                className={`assets-data-row${selectedRowBySection["Service history"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Service history": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.service}</div>
                                <div className="assets-data-cell">{row.vendor}</div>
                                <div className="assets-data-cell">{row.odometer}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Service history", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Service history": index }));
                                      deleteSelectedRow("Service history");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Reminders" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Manage upcoming obligations and renewal costs.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Reminders", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection.Reminders;
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Reminders", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Reminders")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "reminders.csv",
                                  ["Reminder", "Due date", "Status", "Cost", "Currency", "Notes"],
                                  reminderRows.map((row) => [
                                    row.reminder,
                                    row.dueDate,
                                    row.status,
                                    row.cost,
                                    row.currency,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Reminder</div>
                            <div className="assets-data-cell">Due date</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {reminderRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            reminderRows.map((row, index) => (
                              <div
                                key={`${row.reminder}-${row.dueDate}`}
                                className={`assets-data-row${selectedRowBySection.Reminders === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, Reminders: index }))
                                }
                              >
                                <div className="assets-data-cell">{row.reminder}</div>
                                <div className="assets-data-cell">{row.dueDate}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Reminders", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, Reminders: index }));
                                      deleteSelectedRow("Reminders");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Fuel data" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Record all fuel issued for this vehicle for finance reporting.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Fuel data", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Fuel data"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Fuel data", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Fuel data")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "fuel-data.csv",
                                  ["Date", "Supplier", "Location", "Litres", "Price/Litre", "Total", "Currency", "Odometer", "Invoice"],
                                  fuelRows.map((row) => [
                                    row.date,
                                    row.supplier,
                                    row.location,
                                    row.litres,
                                    row.pricePerLitre,
                                    row.total,
                                    row.currency,
                                    row.odometer,
                                    row.invoice
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Supplier</div>
                            <div className="assets-data-cell">Location</div>
                            <div className="assets-data-cell">Litres</div>
                            <div className="assets-data-cell">Price/Litre</div>
                            <div className="assets-data-cell">Total</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Odometer</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {fuelRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            fuelRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.invoice}`}
                                className={`assets-data-row${selectedRowBySection["Fuel data"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Fuel data": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.supplier}</div>
                                <div className="assets-data-cell">{row.location}</div>
                                <div className="assets-data-cell">{row.litres}</div>
                                <div className="assets-data-cell">{row.pricePerLitre}</div>
                                <div className="assets-data-cell">{row.total}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.odometer}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Fuel data", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Fuel data": index }));
                                      deleteSelectedRow("Fuel data");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Other cost data" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Capture non-fuel expenses like tolls, tyres, and fines.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Other cost data", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Other cost data"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Other cost data", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Other cost data")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "other-costs.csv",
                                  ["Date", "Category", "Vendor", "Cost", "Currency", "Invoice", "Notes"],
                                  otherCostRows.map((row) => [
                                    row.date,
                                    row.category,
                                    row.vendor,
                                    row.cost,
                                    row.currency,
                                    row.invoice,
                                    row.notes
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Date</div>
                            <div className="assets-data-cell">Category</div>
                            <div className="assets-data-cell">Vendor</div>
                            <div className="assets-data-cell">Cost</div>
                            <div className="assets-data-cell">Currency</div>
                            <div className="assets-data-cell">Invoice</div>
                            <div className="assets-data-cell">Notes</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {otherCostRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            otherCostRows.map((row, index) => (
                              <div
                                key={`${row.date}-${row.category}`}
                                className={`assets-data-row${selectedRowBySection["Other cost data"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Other cost data": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.date}</div>
                                <div className="assets-data-cell">{row.category}</div>
                                <div className="assets-data-cell">{row.vendor}</div>
                                <div className="assets-data-cell">{row.cost}</div>
                                <div className="assets-data-cell">{row.currency}</div>
                                <div className="assets-data-cell">{row.invoice}</div>
                                <div className="assets-data-cell">{row.notes}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Other cost data", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Other cost data": index }));
                                      deleteSelectedRow("Other cost data");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Mobile device settings" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Hardware and SIM details tied to the asset.</small>
                          <div className="assets-data-actions">
                            <button
                              type="button"
                              onClick={() => openDataModal("Mobile device settings", null)}
                              disabled={mobileDeviceRows.length > 0}
                              title={
                                mobileDeviceRows.length > 0
                                  ? "Only one row is allowed per asset"
                                  : "Add mobile device settings"
                              }
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Mobile device settings"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Mobile device settings", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Mobile device settings")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "mobile-device-settings.csv",
                                  [
                                    "Device",
                                    "Model",
                                    "IMEI",
                                    "Installed",
                                    "Status",
                                    "Firmware",
                                    "Camera",
                                    "Camera model",
                                    "Camera serial",
                                    "Camera status",
                                    "Camera firmware"
                                  ],
                                  mobileDeviceRows.map((row) => [
                                    row.device,
                                    row.model,
                                    row.imei,
                                    row.installed,
                                    row.status,
                                    row.firmware,
                                    row.camera,
                                    row.cameraModel,
                                    row.cameraSerial,
                                    row.cameraStatus,
                                    row.cameraFirmware
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Device</div>
                            <div className="assets-data-cell">Model</div>
                            <div className="assets-data-cell">IMEI</div>
                            <div className="assets-data-cell">Installed</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell">Firmware</div>
                            <div className="assets-data-cell">Camera</div>
                            <div className="assets-data-cell">Camera model</div>
                            <div className="assets-data-cell">Camera serial</div>
                            <div className="assets-data-cell">Camera status</div>
                            <div className="assets-data-cell">Camera firmware</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {mobileDeviceRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            mobileDeviceRows.map((row, index) => (
                              <div
                                key={`${row.device}-${row.imei}`}
                                className={`assets-data-row${selectedRowBySection["Mobile device settings"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Mobile device settings": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.device}</div>
                                <div className="assets-data-cell">{row.model}</div>
                                <div className="assets-data-cell">{row.imei}</div>
                                <div className="assets-data-cell">{row.installed}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell">{row.firmware}</div>
                                <div className="assets-data-cell">{row.camera}</div>
                                <div className="assets-data-cell">{row.cameraModel}</div>
                                <div className="assets-data-cell">{row.cameraSerial}</div>
                                <div className="assets-data-cell">{row.cameraStatus}</div>
                                <div className="assets-data-cell">{row.cameraFirmware}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Mobile device settings", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Mobile device settings": index }));
                                      deleteSelectedRow("Mobile device settings");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Required driver certificates" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track certificates required for this asset.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Required driver certificates", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Required driver certificates"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Required driver certificates", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Required driver certificates")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "driver-certificates.csv",
                                  ["Certificate", "Holder", "Issued", "Expiry", "Status"],
                                  certificateRows.map((row) => [
                                    row.certificate,
                                    row.holder,
                                    row.issued,
                                    row.expiry,
                                    row.status
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Certificate</div>
                            <div className="assets-data-cell">Holder</div>
                            <div className="assets-data-cell">Issued</div>
                            <div className="assets-data-cell">Expiry</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {certificateRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            certificateRows.map((row, index) => (
                              <div
                                key={`${row.certificate}-${row.holder}`}
                                className={`assets-data-row${selectedRowBySection["Required driver certificates"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Required driver certificates": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.certificate}</div>
                                <div className="assets-data-cell">{row.holder}</div>
                                <div className="assets-data-cell">{row.issued}</div>
                                <div className="assets-data-cell">{row.expiry}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Required driver certificates", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Required driver certificates": index }));
                                      deleteSelectedRow("Required driver certificates");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {activeAddTab === "Required driver licences" && (
                      <div className="assets-data-card">
                        <div className="assets-data-toolbar">
                          <small>Track driver licences tied to this asset.</small>
                          <div className="assets-data-actions">
                            <button type="button" onClick={() => openDataModal("Required driver licences", null)}>Add</button>
                            <button
                              type="button"
                              onClick={() => {
                                const selected = selectedRowBySection["Required driver licences"];
                                if (selected === null) {
                                  alert("Select a row first.");
                                  return;
                                }
                                openDataModal("Required driver licences", selected);
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteSelectedRow("Required driver licences")}>Delete</button>
                            <button
                              type="button"
                              className="assets-data-download"
                              onClick={() =>
                                downloadCsv(
                                  "driver-licences.csv",
                                  ["Licence", "Holder", "Issued", "Expiry", "Status"],
                                  licenceRows.map((row) => [
                                    row.licence,
                                    row.holder,
                                    row.issued,
                                    row.expiry,
                                    row.status
                                  ])
                                )
                              }
                            >
                              Download
                            </button>
                          </div>
                        </div>
                        <div className="assets-data-table">
                          <div className="assets-data-row assets-data-head">
                            <div className="assets-data-cell">Licence</div>
                            <div className="assets-data-cell">Holder</div>
                            <div className="assets-data-cell">Issued</div>
                            <div className="assets-data-cell">Expiry</div>
                            <div className="assets-data-cell">Status</div>
                            <div className="assets-data-cell actions">Actions</div>
                          </div>
                          {licenceRows.length === 0 ? (
                            <div className="assets-data-empty">No items to display</div>
                          ) : (
                            licenceRows.map((row, index) => (
                              <div
                                key={`${row.licence}-${row.holder}`}
                                className={`assets-data-row${selectedRowBySection["Required driver licences"] === index ? " selected" : ""}`}
                                onClick={() =>
                                  setSelectedRowBySection((current) => ({ ...current, "Required driver licences": index }))
                                }
                              >
                                <div className="assets-data-cell">{row.licence}</div>
                                <div className="assets-data-cell">{row.holder}</div>
                                <div className="assets-data-cell">{row.issued}</div>
                                <div className="assets-data-cell">{row.expiry}</div>
                                <div className="assets-data-cell">{row.status}</div>
                                <div className="assets-data-cell actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDataModal("Required driver licences", index);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRowBySection((current) => ({ ...current, "Required driver licences": index }));
                                      deleteSelectedRow("Required driver licences");
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {dataModalOpen && dataModalSection && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Edit data">
          <div className="assets-add-card data-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">
                {dataModalIndex === null ? "Add" : "Edit"} {dataModalSection}
              </div>
              <div className="assets-add-actions">
                <button type="button" className="btn ghost" onClick={closeDataModal}>
                  Close
                </button>
                <button type="button" className="btn primary" onClick={saveDataModal}>
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body data-modal-body">
              <section className="assets-add-form" style={{ maxHeight: "unset" }}>
                {dataModalSection === "Mobile device settings" ? (
                  <div className="assets-data-columns">
                    <div className="assets-data-column">
                      <label>
                        Device
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search device"
                          value={deviceSearch}
                          onChange={(event) => setDeviceSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.device ?? ""}
                            onChange={(event) => {
                              setDataDraft((current) => ({ ...current, device: event.target.value, model: "" }));
                              setModelSearch("");
                            }}
                          >
                            <option value="">Select device</option>
                            {deviceCatalog
                              .filter((device) => device.toLowerCase().includes(deviceSearch.trim().toLowerCase()))
                              .map((device) => (
                                <option key={device} value={device}>
                                  {device}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add device"
                            onClick={() => {
                              const next = window.prompt("Add device");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setDeviceCatalog((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDeviceModels((current) =>
                                current[trimmed] ? current : { ...current, [trimmed]: [] }
                              );
                              setDataDraft((current) => ({ ...current, device: trimmed, model: "" }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove device"
                            onClick={() => {
                              const selected = dataDraft.device ?? "";
                              if (!selected) return;
                              setDeviceCatalog((current) => current.filter((item) => item !== selected));
                              setDeviceModels((current) => {
                                const next = { ...current };
                                delete next[selected];
                                return next;
                              });
                              setDataDraft((current) => ({ ...current, device: "", model: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Model
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search model"
                          value={modelSearch}
                          onChange={(event) => setModelSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.model ?? ""}
                            onChange={(event) => setDataDraft((current) => ({ ...current, model: event.target.value }))}
                          >
                            <option value="">Select model</option>
                            {(deviceModels[dataDraft.device ?? ""] ?? [])
                              .filter((model) => model.toLowerCase().includes(modelSearch.trim().toLowerCase()))
                              .map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add model"
                            onClick={() => {
                              const device = dataDraft.device ?? "";
                              if (!device) return;
                              const next = window.prompt("Add model");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setDeviceModels((current) => ({
                                ...current,
                                [device]: current[device]?.includes(trimmed)
                                  ? current[device]
                                  : [...(current[device] ?? []), trimmed]
                              }));
                              setDataDraft((current) => ({ ...current, model: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove model"
                            onClick={() => {
                              const device = dataDraft.device ?? "";
                              const selected = dataDraft.model ?? "";
                              if (!device || !selected) return;
                              setDeviceModels((current) => ({
                                ...current,
                                [device]: (current[device] ?? []).filter((item) => item !== selected)
                              }));
                              setDataDraft((current) => ({ ...current, model: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        IMEI
                        <input
                          type="text"
                          value={dataDraft.imei ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, imei: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Installed
                        <input
                          type="text"
                          value={dataDraft.installed ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, installed: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Status
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.status ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, status: event.target.value }))
                            }
                          >
                            <option value="">Select status</option>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add status"
                            onClick={() => {
                              const next = window.prompt("Add status");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setStatusOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, status: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove status"
                            onClick={() => {
                              const selected = dataDraft.status ?? "";
                              if (!selected) return;
                              setStatusOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, status: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Firmware
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.firmware ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, firmware: event.target.value }))
                            }
                          >
                            <option value="">Select firmware</option>
                            {firmwareOptions.map((fw) => (
                              <option key={fw} value={fw}>
                                {fw}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add firmware"
                            onClick={() => {
                              const next = window.prompt("Add firmware version");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setFirmwareOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, firmware: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove firmware"
                            onClick={() => {
                              const selected = dataDraft.firmware ?? "";
                              if (!selected) return;
                              setFirmwareOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, firmware: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                    </div>
                    <div className="assets-data-column">
                      <label>
                        Camera
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search camera"
                          value={cameraDeviceSearch}
                          onChange={(event) => setCameraDeviceSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.camera ?? ""}
                            onChange={(event) => {
                              setDataDraft((current) => ({ ...current, camera: event.target.value, cameraModel: "" }));
                              setCameraModelSearch("");
                            }}
                          >
                            <option value="">Select camera</option>
                            {cameraCatalog
                              .filter((camera) => camera.toLowerCase().includes(cameraDeviceSearch.trim().toLowerCase()))
                              .map((camera) => (
                                <option key={camera} value={camera}>
                                  {camera}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera"
                            onClick={() => {
                              const next = window.prompt("Add camera");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraCatalog((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setCameraModels((current) =>
                                current[trimmed] ? current : { ...current, [trimmed]: [] }
                              );
                              setDataDraft((current) => ({ ...current, camera: trimmed, cameraModel: "" }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera"
                            onClick={() => {
                              const selected = dataDraft.camera ?? "";
                              if (!selected) return;
                              setCameraCatalog((current) => current.filter((item) => item !== selected));
                              setCameraModels((current) => {
                                const next = { ...current };
                                delete next[selected];
                                return next;
                              });
                              setDataDraft((current) => ({ ...current, camera: "", cameraModel: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Camera model
                        <input
                          className="assets-data-search"
                          type="search"
                          placeholder="Search camera model"
                          value={cameraModelSearch}
                          onChange={(event) => setCameraModelSearch(event.target.value)}
                        />
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraModel ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, cameraModel: event.target.value }))
                            }
                          >
                            <option value="">Select camera model</option>
                            {(cameraModels[dataDraft.camera ?? ""] ?? [])
                              .filter((model) => model.toLowerCase().includes(cameraModelSearch.trim().toLowerCase()))
                              .map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera model"
                            onClick={() => {
                              const camera = dataDraft.camera ?? "";
                              if (!camera) return;
                              const next = window.prompt("Add camera model");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraModels((current) => ({
                                ...current,
                                [camera]: current[camera]?.includes(trimmed)
                                  ? current[camera]
                                  : [...(current[camera] ?? []), trimmed]
                              }));
                              setDataDraft((current) => ({ ...current, cameraModel: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera model"
                            onClick={() => {
                              const camera = dataDraft.camera ?? "";
                              const selected = dataDraft.cameraModel ?? "";
                              if (!camera || !selected) return;
                              setCameraModels((current) => ({
                                ...current,
                                [camera]: (current[camera] ?? []).filter((item) => item !== selected)
                              }));
                              setDataDraft((current) => ({ ...current, cameraModel: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Camera serial
                        <input
                          type="text"
                          value={dataDraft.cameraSerial ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, cameraSerial: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Camera status
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraStatus ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, cameraStatus: event.target.value }))
                            }
                          >
                            <option value="">Select camera status</option>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera status"
                            onClick={() => {
                              const next = window.prompt("Add status");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setStatusOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, cameraStatus: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera status"
                            onClick={() => {
                              const selected = dataDraft.cameraStatus ?? "";
                              if (!selected) return;
                              setStatusOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, cameraStatus: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                      <label>
                        Camera firmware
                        <div className="assets-inline-field">
                          <select
                            value={dataDraft.cameraFirmware ?? ""}
                            onChange={(event) =>
                              setDataDraft((current) => ({ ...current, cameraFirmware: event.target.value }))
                            }
                          >
                            <option value="">Select camera firmware</option>
                            {cameraFirmwareOptions.map((fw) => (
                              <option key={fw} value={fw}>
                                {fw}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="assets-inline-add"
                            aria-label="Add camera firmware"
                            onClick={() => {
                              const next = window.prompt("Add camera firmware");
                              if (!next) return;
                              const trimmed = next.trim();
                              if (!trimmed) return;
                              setCameraFirmwareOptions((current) =>
                                current.includes(trimmed) ? current : [...current, trimmed]
                              );
                              setDataDraft((current) => ({ ...current, cameraFirmware: trimmed }));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="assets-inline-remove"
                            aria-label="Remove camera firmware"
                            onClick={() => {
                              const selected = dataDraft.cameraFirmware ?? "";
                              if (!selected) return;
                              setCameraFirmwareOptions((current) => current.filter((item) => item !== selected));
                              setDataDraft((current) => ({ ...current, cameraFirmware: "" }));
                            }}
                          >
                            −
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="assets-add-grid data-modal-grid">
                    {sectionFields[dataModalSection].map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          type="text"
                          value={dataDraft[field.key] ?? ""}
                          onChange={(event) =>
                            setDataDraft((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {showSaveToast && (
        <div className="assets-save-toast" role="status" aria-live="polite">
          Changes Successfully Saved
        </div>
      )}

      {showSmsModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Resend commissioning SMS">
          <div className="assets-add-card sms-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Resend commissioning SMS</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowSmsModal(false);
                    setSmsTarget(null);
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    if (!smsMessage.trim()) return;
                    alert(`SMS sent to ${smsTarget ?? "device"}`);
                    setShowSmsModal(false);
                    setSmsTarget(null);
                    setSmsMessage("");
                  }}
                >
                  Send
                </button>
              </div>
            </div>
            <div className="assets-add-body sms-modal-body">
              <div className="sms-modal-content">
                <div className="sms-modal-label">Send message to device</div>
                <div className="sms-modal-target">{smsTarget ?? "Selected asset"}</div>
                <textarea
                  rows={4}
                  placeholder="Type commissioning message"
                  value={smsMessage}
                  onChange={(event) => setSmsMessage(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiagnosticsModal && diagnosticsAsset && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Diagnostics">
          <div className="assets-add-card diagnostics-modal-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Diagnostics</div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowDiagnosticsModal(false);
                    setDiagnosticsAsset(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="assets-add-body diagnostics-modal-body">
              <button type="button" className="diagnostics-pill">Request firmware version</button>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, assetDetails: !current.assetDetails }))
                  }
                >
                  Asset details
                  <span>{diagnosticsOpen.assetDetails ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.assetDetails && (
                  <div className="diagnostics-table">
                    <div className="diagnostics-row"><span>Asset description</span><span>{diagnosticsAsset.assetDescription}</span></div>
                    <div className="diagnostics-row"><span>Registration number</span><span>{diagnosticsAsset.registration}</span></div>
                    <div className="diagnostics-row"><span>Asset ID</span><span>{diagnosticsAsset.assetId}</span></div>
                    <div className="diagnostics-row"><span>Organisation</span><span>Africa - MiXEA - Transfleet Services</span></div>
                    <div className="diagnostics-row"><span>Site</span><span>{diagnosticsAsset.site}</span></div>
                    <div className="diagnostics-row"><span>Asset type</span><span>{diagnosticsAsset.assetType ?? "—"}</span></div>
                    <div className="diagnostics-row"><span>Status</span><span>{diagnosticsAsset.status === "available" ? "Available" : "Unavailable"}</span></div>
                    <div className="diagnostics-row"><span>Vehicle Identification Number (VIN)</span><span>{diagnosticsAsset.vin ?? "Not available"}</span></div>
                    <div className="diagnostics-row"><span>Asset site time</span><span>Not available</span></div>
                  </div>
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, mobileDevice: !current.mobileDevice }))
                  }
                >
                  Mobile device details
                  <span>{diagnosticsOpen.mobileDevice ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.mobileDevice && (
                  <div className="diagnostics-table">
                    <div className="diagnostics-row"><span>Mobile device</span><span>{mobileDeviceRows[0]?.device ?? "—"}</span></div>
                    <div className="diagnostics-row"><span>IMEI</span><span>{mobileDeviceRows[0]?.imei ?? "—"}</span></div>
                    <div className="diagnostics-row"><span>Firmware version</span><span>{mobileDeviceRows[0]?.firmware ?? "—"}</span></div>
                    <div className="diagnostics-row"><span>GPS module</span><span>AXN_5.1.9</span></div>
                    <div className="diagnostics-row"><span>Hardware version</span><span>33</span></div>
                    <div className="diagnostics-row"><span>Hardware version modification</span><span>{mobileDeviceRows[0]?.model ?? "—"}</span></div>
                  </div>
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, tripInfo: !current.tripInfo }))
                  }
                >
                  Trip information
                  <span>{diagnosticsOpen.tripInfo ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.tripInfo && (
                  <div className="diagnostics-table">
                    <div className="diagnostics-row"><span>Trip mode</span><span>Out of Trip</span></div>
                    <div className="diagnostics-row"><span>Driver</span><span>{formValues.defaultDriver || "—"}</span></div>
                    <div className="diagnostics-row"><span>Speed</span><span>Not available</span></div>
                    <div className="diagnostics-row"><span>Odometer</span><span>{diagnosticsAsset.odometer ?? "—"}</span></div>
                  </div>
                )}
              </div>

              <div className="diagnostics-card">
                <button
                  type="button"
                  className="diagnostics-toggle"
                  onClick={() =>
                    setDiagnosticsOpen((current) => ({ ...current, latestPosition: !current.latestPosition }))
                  }
                >
                  Latest position information
                  <span>{diagnosticsOpen.latestPosition ? "−" : "+"}</span>
                </button>
                {diagnosticsOpen.latestPosition && (
                  <div className="diagnostics-table">
                    <div className="diagnostics-row"><span>Date and time of last AVL</span><span>{diagnosticsAsset.lastPosition ?? "—"}</span></div>
                    <div className="diagnostics-row"><span>Longitude</span><span>31.3677°</span></div>
                    <div className="diagnostics-row"><span>Latitude</span><span>1.8034°</span></div>
                    <div className="diagnostics-row"><span>GPS velocity</span><span>0 km/h</span></div>
                    <div className="diagnostics-row"><span>Heading</span><span>128°</span></div>
                    <div className="diagnostics-row"><span>Number of satellites</span><span>19</span></div>
                    <div className="diagnostics-row"><span>Age of data</span><span>00:00:00</span></div>
                    <div className="diagnostics-row"><span>Distance since last record</span><span>0 km</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
