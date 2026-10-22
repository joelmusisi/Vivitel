import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VTLoader from "../../components/VTLoader";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import {
  deleteBindingDetailed,
  getAssetsFromApi,
  getBindings,
  getCachedPrincipal,
  getConfigurationGroups,
  getDriversFromApi,
  saveBindingDetailed
} from "../../utils/api";
import { isUserNotificationBinding } from "../../utils/notificationLibraryStore";
import {
  DEVICE_ALERT_EMAIL_FROM,
  SAMPLE_DEVICE_ALERT_EMAIL_EVENT
} from "../../utils/deviceAlertEmailFormat";
import {
  DEVICE_ALERT_MESSAGE_TOKENS,
  buildMessagePreviewSegments,
  extractTokenKeysFromMessage,
  insertTokenIntoMessage
} from "../../utils/deviceAlertMessageTokens";
import type { AlertRecipientRef } from "../../utils/operationalContacts";
import {
  addSiteLocalContact,
  loadSiteRecipientOptions,
  recipientRefFromSiteOption,
  type SiteRecipientOption
} from "../../utils/deviceAlertRecipients";
import {
  resyncConfigurationGroupsForBinding,
  syncNotificationBindingToTraccar,
  type ConfigGroupRecord,
  type NotificationBindingRecord
} from "../../utils/traccarBindingSync";
import { readActiveSiteName } from "../../utils/tenantContext";
import { filterRecordsForActiveSelection, siteScopesMatch } from "../../utils/scopeStorage";
import { showToast } from "../../utils/toast";
import "../../index.css";

type RecipientEntry = {
  name: string;
  channel?: string;
};

type DeviceNotificationBinding = NotificationBindingRecord & {
  recipients?: RecipientEntry[];
  emailRecipients?: AlertRecipientRef[];
  pushRecipients?: AlertRecipientRef[];
  notificationOwner?: string;
  sendFor?: string;
  selectedAssets?: string[];
  selectedDrivers?: string[];
  message?: string;
  messageTokens?: string[];
};

type DeviceNotificationRow = {
  id: string;
  name: string;
  notificationsLabel: string;
  assets: number;
  drivers: number;
  recipientsLabel: string;
  ownerLabel: string;
  raw: DeviceNotificationBinding;
};

type WizardDraft = {
  id: string;
  name: string;
  sendFor: "Assets with drivers" | "Assets" | "Drivers";
  selectedAssets: string[];
  selectedDrivers: string[];
  selectedNotifications: string[];
  emailRecipients: AlertRecipientRef[];
  pushRecipients: AlertRecipientRef[];
  message: string;
  messageTokens: string[];
};

const WIZARD_STEPS = ["Details", "Assets", "Drivers", "Notifications", "Recipients", "Alert Massagee"] as const;

const SEND_FOR_OPTIONS = ["Assets with drivers", "Assets", "Drivers"] as const;

const EMPTY_WIZARD: WizardDraft = {
  id: "",
  name: "",
  sendFor: "Assets with drivers",
  selectedAssets: [],
  selectedDrivers: [],
  selectedNotifications: [],
  emailRecipients: [],
  pushRecipients: [],
  message: "",
  messageTokens: []
};

const normalizeRef = (value: string) => String(value ?? "").trim().toLowerCase();

const readAssetConfigGroup = (asset: Record<string, unknown>) =>
  String(
    asset.configurationGroup
      ?? asset.configGroup
      ?? asset.configurationGroupName
      ?? ""
  ).trim();

const readAssetDriver = (asset: Record<string, unknown>) =>
  String(asset.driverName ?? asset.driver ?? asset.assignedDriver ?? "").trim();

const assetLabel = (asset: Record<string, unknown>) => {
  const description = String(asset.assetDescription ?? asset.description ?? asset.name ?? "").trim();
  const registration = String(asset.registration ?? asset.plate ?? "").trim();
  return [description, registration].filter(Boolean).join(" - ") || "Asset";
};

const driverLabel = (driver: Record<string, unknown>) =>
  String(driver.driverName ?? driver.name ?? driver.fullName ?? "").trim() || "Driver";

const assetKey = (asset: Record<string, unknown>) => assetLabel(asset);

const driverKey = (driver: Record<string, unknown>) => driverLabel(driver);

const bindingMatchesGroup = (binding: DeviceNotificationBinding, group: ConfigGroupRecord) => {
  const refs = [binding.id, binding.name].map((value) => normalizeRef(String(value ?? ""))).filter(Boolean);
  const groupRef = normalizeRef(String(group.notificationBinding ?? ""));
  return refs.includes(groupRef);
};

const formatRecipientsLabel = (binding: DeviceNotificationBinding) => {
  const emailCount = Array.isArray(binding.emailRecipients) ? binding.emailRecipients.length : 0;
  const pushCount = Array.isArray(binding.pushRecipients) ? binding.pushRecipients.length : 0;
  if (emailCount || pushCount) {
    const parts: string[] = [];
    if (emailCount) parts.push(`${emailCount} email`);
    if (pushCount) parts.push(`${pushCount} push/SMS`);
    return parts.join(", ");
  }

  const legacy = binding.recipients;
  if (!Array.isArray(legacy) || legacy.length === 0) return "—";
  return legacy
    .map((entry) => {
      const name = String(entry?.name ?? "").trim();
      if (!name) return "";
      const channel = String(entry?.channel ?? "Email").trim();
      return `${name} (${channel})`;
    })
    .filter(Boolean)
    .join(", ");
};

const migrateBindingRecipients = (binding: DeviceNotificationBinding) => {
  const emailRecipients = Array.isArray(binding.emailRecipients)
    ? binding.emailRecipients
        .map((entry) => ({
          id: String(entry?.id ?? entry?.email ?? entry?.name ?? "").trim(),
          name: String(entry?.name ?? "").trim(),
          email: String(entry?.email ?? "").trim() || undefined,
          mobile: String(entry?.mobile ?? "").trim() || undefined
        }))
        .filter((entry) => entry.id && entry.name)
    : [];

  const pushRecipients = Array.isArray(binding.pushRecipients)
    ? binding.pushRecipients
        .map((entry) => ({
          id: String(entry?.id ?? entry?.mobile ?? entry?.name ?? "").trim(),
          name: String(entry?.name ?? "").trim(),
          email: String(entry?.email ?? "").trim() || undefined,
          mobile: String(entry?.mobile ?? "").trim() || undefined
        }))
        .filter((entry) => entry.id && entry.name)
    : [];

  if (emailRecipients.length || pushRecipients.length) {
    return { emailRecipients, pushRecipients };
  }

  for (const entry of binding.recipients ?? []) {
    const name = String(entry?.name ?? "").trim();
    if (!name) continue;
    const channel = String(entry?.channel ?? "Email").trim().toLowerCase();
    const ref = { id: name, name };
    if (channel === "sms" || channel === "in-app" || channel === "push") {
      pushRecipients.push({ ...ref, email: undefined, mobile: name });
    } else {
      emailRecipients.push({ ...ref, email: name.includes("@") ? name : undefined, mobile: undefined });
    }
  }

  return { emailRecipients, pushRecipients };
};

const resolveOwnerLabel = (binding: DeviceNotificationBinding) => {
  const stored = String(binding.notificationOwner ?? "").trim();
  if (stored) return stored;
  const principal = getCachedPrincipal()?.principal;
  return String(principal?.email ?? principal?.name ?? "").trim() || "—";
};

const mapBindingRow = (
  binding: DeviceNotificationBinding,
  groups: ConfigGroupRecord[],
  assets: Record<string, unknown>[],
  drivers: Record<string, unknown>[]
): DeviceNotificationRow => {
  const linkedGroups = groups.filter((group) => bindingMatchesGroup(binding, group));
  const groupRefs = new Set(
    linkedGroups
      .flatMap((group) => [group.id, group.name])
      .map((value) => normalizeRef(String(value ?? "")))
      .filter(Boolean)
  );

  const linkedAssets = assets.filter((asset) => {
    const assigned = normalizeRef(readAssetConfigGroup(asset));
    return assigned && groupRefs.has(assigned);
  });

  const driverNames = new Set<string>();
  for (const asset of linkedAssets) {
    const driver = readAssetDriver(asset);
    if (driver) driverNames.add(driver.toLowerCase());
  }

  const storedAssetCount = Array.isArray(binding.selectedAssets) ? binding.selectedAssets.length : 0;
  const storedDriverCount = Array.isArray(binding.selectedDrivers) ? binding.selectedDrivers.length : 0;

  const siteDrivers = drivers.filter((driver) => {
    const site = String(binding.site ?? readActiveSiteName()).trim();
    if (!site) return false;
    return siteScopesMatch(String(driver.site ?? driver.organisation ?? ""), site);
  });

  const notifications = Array.isArray(binding.monitoredEvents)
    ? binding.monitoredEvents.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  return {
    id: String(binding.id ?? binding.name),
    name: String(binding.name ?? "").trim() || "Untitled alert",
    notificationsLabel: notifications.length ? notifications.join(", ") : "—",
    assets: storedAssetCount || linkedAssets.length,
    drivers: storedDriverCount || driverNames.size || siteDrivers.length,
    recipientsLabel: formatRecipientsLabel(binding),
    ownerLabel: resolveOwnerLabel(binding),
    raw: binding
  };
};

const isDeviceAlertBinding = (binding: DeviceNotificationBinding): boolean =>
  Boolean(
    String(binding.sendFor ?? "").trim()
    || String(binding.notificationOwner ?? "").trim()
    || String(binding.message ?? "").trim()
    || (Array.isArray(binding.emailRecipients) && binding.emailRecipients.length > 0)
    || (Array.isArray(binding.pushRecipients) && binding.pushRecipients.length > 0)
    || (Array.isArray(binding.recipients) && binding.recipients.length > 0)
    || (Array.isArray(binding.selectedAssets) && binding.selectedAssets.length > 0)
    || (Array.isArray(binding.selectedDrivers) && binding.selectedDrivers.length > 0)
  );

const collectMonitoredNotificationsFromBindings = (
  bindings: DeviceNotificationBinding[],
  site: string
): string[] => {
  const activeSite = site.trim();
  const names = new Set<string>();

  for (const binding of bindings) {
    if (!isUserNotificationBinding(binding)) continue;
    if (isDeviceAlertBinding(binding)) continue;

    const bindingSite = String(binding.site ?? "").trim();
    if (activeSite) {
      if (!bindingSite || !siteScopesMatch(bindingSite, activeSite)) continue;
    } else if (!bindingSite) {
      continue;
    }

    for (const event of binding.monitoredEvents ?? []) {
      const label = String(event ?? "").trim();
      if (label) names.add(label);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

const draftFromBinding = (binding: DeviceNotificationBinding): WizardDraft => {
  const { emailRecipients, pushRecipients } = migrateBindingRecipients(binding);
  return {
    id: String(binding.id ?? "").trim(),
    name: String(binding.name ?? "").trim(),
    sendFor: (binding.sendFor as WizardDraft["sendFor"]) || "Assets with drivers",
    selectedAssets: Array.isArray(binding.selectedAssets)
      ? binding.selectedAssets.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    selectedDrivers: Array.isArray(binding.selectedDrivers)
      ? binding.selectedDrivers.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    selectedNotifications: Array.isArray(binding.monitoredEvents)
      ? binding.monitoredEvents.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    emailRecipients,
    pushRecipients,
    message: String(binding.message ?? "").trim(),
    messageTokens: Array.isArray(binding.messageTokens)
      ? binding.messageTokens.map((item) => String(item ?? "").trim()).filter(Boolean)
      : extractTokenKeysFromMessage(String(binding.message ?? ""))
  };
};

export default function DeviceAlertsAdmin() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DeviceNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState<"create" | "edit">("create");
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft>(EMPTY_WIZARD);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState("");

  const [assetOptions, setAssetOptions] = useState<Record<string, unknown>[]>([]);
  const [driverOptions, setDriverOptions] = useState<Record<string, unknown>[]>([]);
  const [notificationOptions, setNotificationOptions] = useState<string[]>([]);
  const [notificationFilter, setNotificationFilter] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [siteRecipients, setSiteRecipients] = useState<SiteRecipientOption[]>([]);
  const [siteRecipientsLoading, setSiteRecipientsLoading] = useState(false);
  const [recipientPickerTarget, setRecipientPickerTarget] = useState<"email" | "push" | null>(null);
  const [recipientFilter, setRecipientFilter] = useState("");
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    employer: "",
    position: "",
    email: "",
    mobile: ""
  });
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [showTokenMenu, setShowTokenMenu] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const activeSite = readActiveSiteName().trim();
      const [bindings, groups, assets, drivers] = await Promise.all([
        getBindings<DeviceNotificationBinding>("notifications", { refresh: true }),
        getConfigurationGroups<ConfigGroupRecord>(),
        getAssetsFromApi<Record<string, unknown>>(),
        getDriversFromApi<Record<string, unknown>>()
      ]);

      const filteredBindings = (Array.isArray(bindings) ? bindings : [])
        .filter((binding) => isUserNotificationBinding(binding))
        .filter((binding) => isDeviceAlertBinding(binding))
        .filter((binding) => {
          if (!activeSite) return Boolean(String(binding.site ?? "").trim());
          return siteScopesMatch(String(binding.site ?? ""), activeSite);
        });

      const mapped = filteredBindings.map((binding) =>
        mapBindingRow(binding, groups ?? [], assets ?? [], drivers ?? [])
      );
      setRows(mapped);
      setLastRefreshAt(new Date());
    } catch (loadError: unknown) {
      setError(String((loadError as Error)?.message ?? loadError ?? "Unable to load device alerts."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWizardOptions = async () => {
    setOptionsLoading(true);
    try {
      const activeSite = readActiveSiteName().trim();
      const [assets, drivers, bindings] = await Promise.all([
        getAssetsFromApi<Record<string, unknown>>(),
        getDriversFromApi<Record<string, unknown>>(),
        getBindings<DeviceNotificationBinding>("notifications", { refresh: true })
      ]);

      const siteAssets = filterRecordsForActiveSelection(
        (Array.isArray(assets) ? assets : []).map((asset) => ({
          ...asset,
          site: String(asset.site ?? asset.organisation ?? "").trim()
        }))
      );

      const siteDrivers = filterRecordsForActiveSelection(
        (Array.isArray(drivers) ? drivers : []).map((driver) => ({
          ...driver,
          site: String(driver.site ?? driver.organisation ?? "").trim()
        }))
      );

      setAssetOptions(siteAssets);
      setDriverOptions(siteDrivers);
      setNotificationOptions(
        collectMonitoredNotificationsFromBindings(
          Array.isArray(bindings) ? bindings : [],
          activeSite
        )
      );
    } finally {
      setOptionsLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    const onBindingsChange = () => {
      void loadRows();
      if (showWizard) void loadWizardOptions();
    };
    window.addEventListener("vivi:bindingschange", onBindingsChange);
    return () => window.removeEventListener("vivi:bindingschange", onBindingsChange);
  }, [showWizard]);

  useEffect(() => {
    if (!showWizard) return;
    void loadWizardOptions();
    void reloadSiteRecipients();
  }, [showWizard]);

  useEffect(() => {
    if (!showWizard) return;
    const onContextChange = () => {
      void reloadSiteRecipients();
    };
    window.addEventListener("vivi:contextchange", onContextChange);
    return () => window.removeEventListener("vivi:contextchange", onContextChange);
  }, [showWizard]);

  const reloadSiteRecipients = async () => {
    setSiteRecipientsLoading(true);
    try {
      const options = await loadSiteRecipientOptions(readActiveSiteName());
      setSiteRecipients(options);
    } catch {
      setSiteRecipients([]);
    } finally {
      setSiteRecipientsLoading(false);
    }
  };

  const messagePreviewSegments = useMemo(
    () => buildMessagePreviewSegments(wizardDraft.message, SAMPLE_DEVICE_ALERT_EMAIL_EVENT),
    [wizardDraft.message]
  );

  const insertMessageToken = (tokenLabel: string) => {
    setWizardDraft((current) => {
      const message = insertTokenIntoMessage(current.message, tokenLabel);
      return {
        ...current,
        message,
        messageTokens: extractTokenKeysFromMessage(message)
      };
    });
    setShowTokenMenu(false);
    messageInputRef.current?.focus();
  };

  const updateMessageDraft = (message: string) => {
    setWizardDraft((current) => ({
      ...current,
      message,
      messageTokens: extractTokenKeysFromMessage(message)
    }));
  };

  const filteredPickerRecipients = useMemo(() => {
    const query = recipientFilter.trim().toLowerCase();
    return siteRecipients.filter((recipient) => {
      if (recipientPickerTarget === "email" && !String(recipient.email ?? "").trim()) return false;
      if (
        recipientPickerTarget === "push"
        && !String(recipient.mobile ?? "").trim()
        && !String(recipient.email ?? "").trim()
      ) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        recipient.name,
        recipient.firstName,
        recipient.lastName,
        recipient.employer,
        recipient.position,
        recipient.email,
        recipient.mobile,
        recipient.subtitle
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [siteRecipients, recipientFilter, recipientPickerTarget]);

  const openRecipientPicker = async (target: "email" | "push") => {
    await reloadSiteRecipients();
    setRecipientPickerTarget(target);
    setRecipientFilter("");
    const selected =
      target === "email"
        ? wizardDraft.emailRecipients.map((entry) => entry.id)
        : wizardDraft.pushRecipients.map((entry) => entry.id);
    setPickerSelectedIds(selected);
  };

  const closeRecipientPicker = () => {
    setRecipientPickerTarget(null);
    setRecipientFilter("");
    setPickerSelectedIds([]);
  };

  const applyRecipientPicker = () => {
    if (!recipientPickerTarget) return;
    const selected = siteRecipients
      .filter((recipient) => pickerSelectedIds.includes(recipient.id))
      .map((recipient) => recipientRefFromSiteOption(recipient))
      .filter((recipient) =>
        recipientPickerTarget === "email"
          ? Boolean(recipient.email)
          : Boolean(recipient.mobile || recipient.email)
      );

    setWizardDraft((current) => ({
      ...current,
      ...(recipientPickerTarget === "email"
        ? { emailRecipients: selected }
        : { pushRecipients: selected })
    }));
    closeRecipientPicker();
  };

  const togglePickerRecipient = (id: string) => {
    setPickerSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const pickerAllSelected =
    filteredPickerRecipients.length > 0
    && filteredPickerRecipients.every((recipient) => pickerSelectedIds.includes(recipient.id));

  const togglePickerSelectAll = () => {
    const filteredIds = filteredPickerRecipients.map((recipient) => recipient.id);
    if (pickerAllSelected) {
      const filteredIdSet = new Set(filteredIds);
      setPickerSelectedIds((current) => current.filter((id) => !filteredIdSet.has(id)));
      return;
    }
    setPickerSelectedIds((current) => Array.from(new Set([...current, ...filteredIds])));
  };

  const handleSaveContact = async () => {
    const firstName = contactForm.firstName.trim();
    const email = contactForm.email.trim();
    const site = readActiveSiteName().trim();
    if (!site) {
      showToast("Select a site in the ribbon before adding a recipient.", "error");
      return;
    }
    if (!firstName || !email) {
      showToast("First name and email are required.", "error");
      return;
    }

    try {
      const contact = await addSiteLocalContact({
        firstName,
        lastName: contactForm.lastName.trim(),
        employer: contactForm.employer.trim(),
        position: contactForm.position.trim(),
        email,
        mobile: contactForm.mobile.trim(),
        site
      });

      const options = await loadSiteRecipientOptions(site);
      setSiteRecipients(options);
      setPickerSelectedIds((current) => Array.from(new Set([`contact:${contact.id}`, ...current])));
      setContactForm({ firstName: "", lastName: "", employer: "", position: "", email: "", mobile: "" });
      setShowAddContactModal(false);
      if (!recipientPickerTarget) setRecipientPickerTarget("email");
      showToast("Recipient saved for this site.", "success");
    } catch (saveError: unknown) {
      showToast(String((saveError as Error)?.message ?? saveError ?? "Unable to save recipient."), "error");
    }
  };

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(query)
        || row.notificationsLabel.toLowerCase().includes(query)
        || row.recipientsLabel.toLowerCase().includes(query)
        || row.ownerLabel.toLowerCase().includes(query)
    );
  }, [rows, search]);

  const getAlertSortValue = useCallback((row: DeviceNotificationRow, key: string) => {
    if (key === "name") return row.name;
    if (key === "alerts") return row.notificationsLabel;
    if (key === "assets") return row.assets;
    if (key === "drivers") return row.drivers;
    if (key === "recipients") return row.recipientsLabel;
    if (key === "owner") return row.ownerLabel;
    return "";
  }, []);
  const alertSort = useColumnSort({ rows: filteredRows, getValue: getAlertSortValue });

  const refreshLabel = lastRefreshAt
    ? `Last refresh: ${lastRefreshAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : "Not refreshed yet";

  const canLeaveDetailsStep = wizardDraft.name.trim().length > 0;
  const hasSelectedNotifications = wizardDraft.selectedNotifications.length > 0;
  const hasAlertRecipients = wizardDraft.emailRecipients.length > 0 || wizardDraft.pushRecipients.length > 0;

  const isWizardPrimaryDisabled =
    wizardSaving
    || (wizardStep === 0 && !canLeaveDetailsStep)
    || (wizardStep === WIZARD_STEPS.length - 1 && !canLeaveDetailsStep);

  const wizardPrimaryLabel =
    wizardStep === WIZARD_STEPS.length - 1 ? (wizardSaving ? "Saving..." : "Save") : "Next";

  const goToWizardStep = (index: number) => {
    if (index > 0 && !canLeaveDetailsStep) {
      setWizardError("Alert name is required.");
      return;
    }
    setWizardError("");
    setWizardStep(index);
  };

  const openCreateWizard = () => {
    setWizardMode("create");
    setWizardStep(0);
    setWizardDraft({ ...EMPTY_WIZARD });
    setNotificationFilter("");
    setWizardError("");
    setShowWizard(true);
  };

  const openEditWizard = (row: DeviceNotificationRow) => {
    setOpenMenuId(null);
    setWizardMode("edit");
    setWizardStep(0);
    setWizardDraft(draftFromBinding(row.raw));
    setNotificationFilter("");
    setWizardError("");
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setWizardStep(0);
    setWizardDraft({ ...EMPTY_WIZARD });
    setNotificationFilter("");
    setShowTokenMenu(false);
    setWizardError("");
  };

  const handleWizardBack = () => {
    setWizardStep((step) => Math.max(0, step - 1));
  };

  const handleWizardPrimary = () => {
    if (wizardStep === 0 && !canLeaveDetailsStep) {
      setWizardError("Alert name is required.");
      return;
    }
    if (wizardStep === 3 && !hasSelectedNotifications) {
      setWizardError("Select at least one notification before choosing who receives it.");
      return;
    }
    if (wizardStep === 4 && !hasAlertRecipients) {
      setWizardError("Add at least one person who should receive this alert. It is not sent to everyone on the site.");
      return;
    }
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardError("");
      setWizardStep((step) => Math.min(step + 1, WIZARD_STEPS.length - 1));
      return;
    }
    void saveWizard();
  };

  const saveWizard = async () => {
    const name = wizardDraft.name.trim();
    if (!name) {
      setWizardError("Alert name is required.");
      return;
    }
    if (!wizardDraft.selectedNotifications.length) {
      setWizardError("Select at least one notification.");
      setWizardStep(3);
      return;
    }
    if (!wizardDraft.emailRecipients.length && !wizardDraft.pushRecipients.length) {
      setWizardError("Add at least one person who should receive this alert. It is not sent to everyone on the site.");
      setWizardStep(4);
      return;
    }

    const site = readActiveSiteName().trim();
    if (!site) {
      setWizardError("Select a site in the ribbon before saving.");
      return;
    }

    setWizardSaving(true);
    setWizardError("");
    try {
      const principal = getCachedPrincipal()?.principal;
      const owner = String(principal?.email ?? principal?.name ?? "").trim();

      const payload: DeviceNotificationBinding = {
        id: wizardDraft.id,
        name,
        site,
        monitoredEvents: wizardDraft.selectedNotifications,
        sendFor: wizardDraft.sendFor,
        selectedAssets: wizardDraft.selectedAssets,
        selectedDrivers: wizardDraft.selectedDrivers,
        emailRecipients: wizardDraft.emailRecipients,
        pushRecipients: wizardDraft.pushRecipients,
        message: wizardDraft.message,
        messageTokens: wizardDraft.messageTokens,
        notificationOwner: owner
      };

      const result = await saveBindingDetailed("notifications", payload);
      if (!result.stored) throw new Error(result.error ?? "Save failed.");

      const savedId = String(result.id ?? payload.id ?? "").trim();
      const saved = { ...payload, id: savedId };

      await syncNotificationBindingToTraccar({
        id: savedId,
        name,
        site,
        monitoredEvents: saved.monitoredEvents ?? []
      });
      void resyncConfigurationGroupsForBinding("notifications", { id: savedId, name, site });

      window.dispatchEvent(new CustomEvent("vivi:bindingschange"));
      showToast(wizardMode === "edit" ? "Alert updated." : "Alert created.", "success");
      closeWizard();
      await loadRows();
    } catch (saveError: unknown) {
      setWizardError(String((saveError as Error)?.message ?? saveError ?? "Unable to save alert."));
    } finally {
      setWizardSaving(false);
    }
  };

  const toggleDraftListValue = (key: "selectedAssets" | "selectedDrivers" | "selectedNotifications", value: string) => {
    setWizardDraft((current) => {
      const list = new Set(current[key]);
      if (list.has(value)) list.delete(value);
      else list.add(value);
      return { ...current, [key]: Array.from(list) };
    });
  };

  const setAllDraftListValues = (
    key: "selectedAssets" | "selectedDrivers" | "selectedNotifications",
    values: string[],
    selectAll: boolean
  ) => {
    setWizardDraft((current) => ({
      ...current,
      [key]: selectAll ? values : []
    }));
  };

  const filteredNotificationOptions = useMemo(() => {
    const query = notificationFilter.trim().toLowerCase();
    if (!query) return notificationOptions;
    return notificationOptions.filter((label) => label.toLowerCase().includes(query));
  }, [notificationFilter, notificationOptions]);

  const toggleAllFilteredNotifications = (selectAll: boolean) => {
    setWizardDraft((current) => {
      const visible = new Set(filteredNotificationOptions);
      if (selectAll) {
        const next = new Set([...current.selectedNotifications, ...filteredNotificationOptions]);
        return { ...current, selectedNotifications: Array.from(next) };
      }
      return {
        ...current,
        selectedNotifications: current.selectedNotifications.filter((label) => !visible.has(label))
      };
    });
  };

  const assetLabels = assetOptions.map((asset) => assetKey(asset));
  const driverLabels = driverOptions.map((driver) => driverKey(driver));
  const allAssetsSelected =
    assetLabels.length > 0 && assetLabels.every((label) => wizardDraft.selectedAssets.includes(label));
  const someAssetsSelected =
    wizardDraft.selectedAssets.length > 0 && !allAssetsSelected;
  const allDriversSelected =
    driverLabels.length > 0 && driverLabels.every((label) => wizardDraft.selectedDrivers.includes(label));
  const someDriversSelected =
    wizardDraft.selectedDrivers.length > 0 && !allDriversSelected;
  const allFilteredNotificationsSelected =
    filteredNotificationOptions.length > 0
    && filteredNotificationOptions.every((label) => wizardDraft.selectedNotifications.includes(label));
  const someFilteredNotificationsSelected =
    filteredNotificationOptions.some((label) => wizardDraft.selectedNotifications.includes(label))
    && !allFilteredNotificationsSelected;

  const handleExport = () => {
    if (!rows.length) {
      showToast("No device alerts to export.", "error");
      return;
    }
    const payload = rows.map((row) => row.raw);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "device-alerts.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Device alerts exported.", "success");
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Import file must contain a JSON array.");
      showToast(`Imported ${parsed.length} alert record(s).`, "success");
    } catch (importError: unknown) {
      showToast(String((importError as Error)?.message ?? importError ?? "Import failed."), "error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleDelete = async (row: DeviceNotificationRow) => {
    if (!confirm(`Delete alert "${row.name}"?`)) return;
    setDeletingId(row.id);
    setOpenMenuId(null);
    try {
      const result = await deleteBindingDetailed("notifications", row.id);
      if (!result.deleted) throw new Error(result.error ?? "Delete failed.");
      showToast(`Deleted "${row.name}".`, "success");
      await loadRows();
    } catch (deleteError: unknown) {
      showToast(String((deleteError as Error)?.message ?? deleteError ?? "Delete failed."), "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (showWizard) {
    return (
      <div className="page device-Alerts-page device-Alerts-wizard-page">
        <div className="device-Alerts-wizard">
          <div className="device-Alerts-wizard-header">
            <div className="device-Alerts-wizard-title">
              {wizardMode === "edit" ? "Edit alert" : "Add alert"}
            </div>
            <div className="device-Alerts-wizard-actions">
              {wizardStep > 0 && (
                <button type="button" className="sat-pill" onClick={handleWizardBack} disabled={wizardSaving}>
                  Back
                </button>
              )}
              <button type="button" className="sat-pill" onClick={closeWizard} disabled={wizardSaving}>
                Close
              </button>
              <button
                type="button"
                className="sat-pill device-Alerts-wizard-next"
                disabled={isWizardPrimaryDisabled}
                onClick={handleWizardPrimary}
              >
                {wizardPrimaryLabel}
              </button>
            </div>
          </div>

          <div className="device-Alerts-wizard-layout">
            <nav className="device-Alerts-wizard-steps" aria-label="Alert wizard steps">
              {WIZARD_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={`device-Alerts-wizard-step${index === wizardStep ? " active" : ""}${index < wizardStep ? " completed" : ""}`}
                  disabled={index > 0 && !canLeaveDetailsStep}
                  onClick={() => goToWizardStep(index)}
                >
                  {step}
                </button>
              ))}
            </nav>

            <div className="device-Alerts-wizard-content">
              {wizardError && <div className="sat-error">{wizardError}</div>}

              {wizardStep === 0 && (
                <div className="sat-form">
                  <div className="sat-section-title">Alert details</div>
                  <label className="sat-label">
                    Name *
                    <input
                      className="sat-input"
                      value={wizardDraft.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        setWizardDraft((current) => ({ ...current, name }));
                        if (name.trim()) setWizardError("");
                      }}
                      placeholder="e.g. Vivi Alerts"
                    />
                  </label>
                  <div className="sat-label">Send alert for</div>
                  <select
                    className="sat-input"
                    value={wizardDraft.sendFor}
                    onChange={(event) =>
                      setWizardDraft((current) => ({
                        ...current,
                        sendFor: event.target.value as WizardDraft["sendFor"]
                      }))
                    }
                  >
                    {SEND_FOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="sat-form">
                  <div className="sat-section-title">Assets</div>
                  {optionsLoading && <div className="sat-hint">Loading assets...</div>}
                  {!optionsLoading && assetOptions.length === 0 && (
                    <div className="sat-hint">No assets found for the selected site.</div>
                  )}
                  {!optionsLoading && assetOptions.length > 0 && (
                    <label className="device-Alerts-check-item device-Alerts-check-item--select-all">
                      <input
                        type="checkbox"
                        checked={allAssetsSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = someAssetsSelected;
                        }}
                        onChange={() => setAllDraftListValues("selectedAssets", assetLabels, !allAssetsSelected)}
                      />
                      <span>Select all</span>
                    </label>
                  )}
                  <div className="device-Alerts-checklist">
                    {assetOptions.map((asset) => {
                      const label = assetKey(asset);
                      const checked = wizardDraft.selectedAssets.includes(label);
                      return (
                        <label key={label} className="device-Alerts-check-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftListValue("selectedAssets", label)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="sat-form">
                  <div className="sat-section-title">Drivers</div>
                  {optionsLoading && <div className="sat-hint">Loading drivers...</div>}
                  {!optionsLoading && driverOptions.length === 0 && (
                    <div className="sat-hint">No drivers found for the selected site.</div>
                  )}
                  {!optionsLoading && driverOptions.length > 0 && (
                    <label className="device-Alerts-check-item device-Alerts-check-item--select-all">
                      <input
                        type="checkbox"
                        checked={allDriversSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = someDriversSelected;
                        }}
                        onChange={() => setAllDraftListValues("selectedDrivers", driverLabels, !allDriversSelected)}
                      />
                      <span>Select all</span>
                    </label>
                  )}
                  <div className="device-Alerts-checklist">
                    {driverOptions.map((driver) => {
                      const label = driverKey(driver);
                      const checked = wizardDraft.selectedDrivers.includes(label);
                      return (
                        <label key={label} className="device-Alerts-check-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftListValue("selectedDrivers", label)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="sat-form">
                  <div className="sat-section-title">Notifications</div>
                  <div className="sat-hint">
                    Choose which notifications from your Notifications bindings should be included in this alert.
                  </div>
                  {optionsLoading && <div className="sat-hint">Loading notifications...</div>}
                  {!optionsLoading && notificationOptions.length === 0 && (
                    <div className="sat-hint">
                      No notifications configured yet. Select them under Manage → Bindings → Notifications Bindings first.
                    </div>
                  )}
                  {!optionsLoading && notificationOptions.length > 0 && (
                    <div className="device-Alerts-filter">
                      <label className="device-Alerts-filter-label" htmlFor="device-Alerts-notification-filter">
                        Filter
                      </label>
                      <input
                        id="device-Alerts-notification-filter"
                        className="device-Alerts-filter-input"
                        placeholder="Search events"
                        value={notificationFilter}
                        onChange={(event) => setNotificationFilter(event.target.value)}
                      />
                    </div>
                  )}
                  {!optionsLoading && notificationOptions.length > 0 && filteredNotificationOptions.length > 0 && (
                    <label className="device-Alerts-check-item device-Alerts-check-item--select-all">
                      <input
                        type="checkbox"
                        checked={allFilteredNotificationsSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = someFilteredNotificationsSelected;
                        }}
                        onChange={() => toggleAllFilteredNotifications(!allFilteredNotificationsSelected)}
                      />
                      <span>Select all</span>
                    </label>
                  )}
                  {!optionsLoading && notificationOptions.length > 0 && filteredNotificationOptions.length === 0 && (
                    <div className="sat-hint">No events match your filter.</div>
                  )}
                  <div className="device-Alerts-checklist">
                    {filteredNotificationOptions.map((label) => {
                      const checked = wizardDraft.selectedNotifications.includes(label);
                      return (
                        <label key={label} className="device-Alerts-check-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftListValue("selectedNotifications", label)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="sat-form device-Alerts-recipients-step">
                  <div className="sat-section-title">Recipients</div>
                  <div className="sat-hint">
                    Add the people who should receive this alert. It is sent only to them, not to everyone on the site.
                  </div>

                  <section className="device-Alerts-recipient-panel">
                    <div className="device-Alerts-recipient-panel-title">Email Alerts</div>
                    <div className="device-Alerts-recipient-panel-head">
                      <div className="device-Alerts-recipient-panel-label">Recipients</div>
                      <button
                        type="button"
                        className="device-Alerts-select-recipients-btn"
                        onClick={() => void openRecipientPicker("email")}
                      >
                        Select recipients
                      </button>
                    </div>
                    <div className="device-Alerts-recipient-note">
                      Recipients receive alerts via email from {DEVICE_ALERT_EMAIL_FROM}. Select users with access to this site, or add a site contact without an account.
                      If the recipient does not exist -
                      <button
                        type="button"
                        className="device-Alerts-inline-link"
                        onClick={() => setShowAddContactModal(true)}
                      >
                        click here to add.
                      </button>
                    </div>
                    <div className="device-Alerts-recipient-listbox">
                      {wizardDraft.emailRecipients.length === 0 ? (
                        <div className="device-Alerts-recipient-empty">No email recipients selected yet.</div>
                      ) : (
                        wizardDraft.emailRecipients.map((recipient) => (
                          <div key={`email-${recipient.id}`} className="device-Alerts-recipient-list-item">
                            <span>{recipient.name}</span>
                            <span>{recipient.email ?? "—"}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="device-Alerts-recipient-panel">
                    <div className="device-Alerts-recipient-panel-title">
                      Push Alerts <span className="device-Alerts-beta-tag">BETA</span>
                    </div>
                    <div className="device-Alerts-recipient-panel-head">
                      <div className="device-Alerts-recipient-panel-label">Recipients</div>
                      <button
                        type="button"
                        className="device-Alerts-select-recipients-btn"
                        onClick={() => void openRecipientPicker("push")}
                      >
                        Select recipients
                      </button>
                    </div>
                    <div className="device-Alerts-recipient-note">
                      Recipients receive alerts on their mobile applications and via text messages. Select users with access to this site, or add a site contact without an account.
                      If the recipient does not exist -
                      <button
                        type="button"
                        className="device-Alerts-inline-link"
                        onClick={() => setShowAddContactModal(true)}
                      >
                        click here to add.
                      </button>
                    </div>
                    <div className="device-Alerts-recipient-listbox">
                      {wizardDraft.pushRecipients.length === 0 ? (
                        <div className="device-Alerts-recipient-empty">No push/SMS recipients selected yet.</div>
                      ) : (
                        wizardDraft.pushRecipients.map((recipient) => (
                          <div key={`push-${recipient.id}`} className="device-Alerts-recipient-list-item">
                            <span>{recipient.name}</span>
                            <span>{recipient.mobile || recipient.email || "—"}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="sat-form device-Alerts-message-step">
                  <div className="sat-section-title">Alert Massagee</div>
                  <div className="sat-hint">
                    Define the Alert message for these events by typing in the box below. Insert replacement tokens using the Insert token button. Selected tokens are included in the alert email body.
                  </div>

                  <div className="device-Alerts-message-panel">
                    <div className="device-Alerts-message-toolbar">
                      <label className="device-Alerts-message-label" htmlFor="device-Alerts-notification-message">
                        Alert Massagee
                      </label>
                      <div className="device-Alerts-token-dropdown">
                        <button
                          type="button"
                          className="device-Alerts-insert-token-btn"
                          onClick={() => setShowTokenMenu((open) => !open)}
                        >
                          Insert token
                        </button>
                        {showTokenMenu && (
                          <div className="device-Alerts-token-menu" role="menu">
                            {DEVICE_ALERT_MESSAGE_TOKENS.map((token) => (
                              <button
                                key={token.key}
                                type="button"
                                className="device-Alerts-token-menu-item"
                                onClick={() => insertMessageToken(token.label)}
                              >
                                {token.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <textarea
                      id="device-Alerts-notification-message"
                      ref={messageInputRef}
                      className="sat-input device-Alerts-message"
                      rows={6}
                      value={wizardDraft.message}
                      onChange={(event) => updateMessageDraft(event.target.value)}
                      placeholder="Type your Alert message and insert tokens..."
                    />

                    <label className="device-Alerts-message-label" htmlFor="device-Alerts-message-preview">
                      Example message preview
                    </label>
                    <div id="device-Alerts-message-preview" className="device-Alerts-message-preview-box">
                      {messagePreviewSegments.length === 0 ? (
                        <span className="device-Alerts-message-preview-empty">
                          Add tokens to preview the resolved message.
                        </span>
                      ) : (
                        messagePreviewSegments.map((segment, index) =>
                          segment.type === "token" ? (
                            <span key={`preview-${index}`} className="device-Alerts-message-preview-pill">
                              {segment.value}
                            </span>
                          ) : (
                            <span key={`preview-${index}`} className="device-Alerts-message-preview-text">
                              {segment.value}
                            </span>
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {recipientPickerTarget && (
            <div className="device-Alerts-modal-backdrop" role="dialog" aria-modal="true">
              <div className="device-Alerts-modal device-Alerts-modal--recipients">
                <div className="device-Alerts-modal-head">
                  <h3>
                    {recipientPickerTarget === "email" ? "Select email recipients" : "Select push recipients"}
                  </h3>
                  <button type="button" onClick={closeRecipientPicker} aria-label="Close">
                    ×
                  </button>
                </div>
                <input
                  className="device-Alerts-filter-input"
                  placeholder="Filter"
                  value={recipientFilter}
                  onChange={(event) => setRecipientFilter(event.target.value)}
                />
                <div className="device-Alerts-recipient-picker-table">
                  <div className="device-Alerts-recipient-picker-head">
                    <label className="device-Alerts-recipient-picker-check">
                      <input
                        type="checkbox"
                        checked={pickerAllSelected}
                        onChange={togglePickerSelectAll}
                        aria-label="Select all recipients"
                      />
                    </label>
                    <span>First name</span>
                    <span>Last name</span>
                    <span>Employer</span>
                    <span>Position</span>
                    <span>Email address</span>
                  </div>
                  <div className="device-Alerts-recipient-picker-body">
                    {siteRecipientsLoading && (
                      <div className="device-Alerts-recipient-empty">Loading site recipients...</div>
                    )}
                    {!siteRecipientsLoading && filteredPickerRecipients.map((recipient) => (
                      <label key={recipient.id} className="device-Alerts-recipient-picker-row">
                        <span className="device-Alerts-recipient-picker-check">
                          <input
                            type="checkbox"
                            checked={pickerSelectedIds.includes(recipient.id)}
                            onChange={() => togglePickerRecipient(recipient.id)}
                          />
                        </span>
                        <span>{recipient.firstName || "—"}</span>
                        <span>{recipient.lastName || "—"}</span>
                        <span>{recipient.employer || "—"}</span>
                        <span>{recipient.position || "—"}</span>
                        <span>{recipient.email || "—"}</span>
                      </label>
                    ))}
                    {!siteRecipientsLoading && !filteredPickerRecipients.length && (
                      <div className="device-Alerts-recipient-empty">
                        No users or contacts with access to this site yet.
                      </div>
                    )}
                  </div>
                </div>
                <div className="device-Alerts-modal-actions">
                  <button type="button" className="sat-pill" onClick={closeRecipientPicker}>
                    Cancel
                  </button>
                  <button type="button" className="sat-pill device-Alerts-wizard-next" onClick={applyRecipientPicker}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAddContactModal && (
            <div className="device-Alerts-modal-backdrop" role="dialog" aria-modal="true">
              <div className="device-Alerts-modal device-Alerts-modal--wide">
                <div className="device-Alerts-modal-head">
                  <h3>Add new contact</h3>
                  <button type="button" onClick={() => setShowAddContactModal(false)} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="device-Alerts-contact-form">
                  <label className="sat-label">
                    First name *
                    <input
                      className="sat-input"
                      value={contactForm.firstName}
                      onChange={(event) => setContactForm((current) => ({ ...current, firstName: event.target.value }))}
                    />
                  </label>
                  <label className="sat-label">
                    Last name
                    <input
                      className="sat-input"
                      value={contactForm.lastName}
                      onChange={(event) => setContactForm((current) => ({ ...current, lastName: event.target.value }))}
                    />
                  </label>
                  <label className="sat-label">
                    Employer
                    <input
                      className="sat-input"
                      value={contactForm.employer}
                      onChange={(event) => setContactForm((current) => ({ ...current, employer: event.target.value }))}
                    />
                  </label>
                  <label className="sat-label">
                    Position
                    <input
                      className="sat-input"
                      value={contactForm.position}
                      onChange={(event) => setContactForm((current) => ({ ...current, position: event.target.value }))}
                    />
                  </label>
                  <label className="sat-label">
                    Email *
                    <input
                      className="sat-input"
                      type="email"
                      value={contactForm.email}
                      onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                  <label className="sat-label">
                    Mobile
                    <input
                      className="sat-input"
                      value={contactForm.mobile}
                      onChange={(event) => setContactForm((current) => ({ ...current, mobile: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="device-Alerts-modal-actions">
                  <button type="button" className="sat-pill" onClick={() => setShowAddContactModal(false)}>
                    Close
                  </button>
                  <button type="button" className="sat-pill device-Alerts-wizard-next" onClick={() => void handleSaveContact()}>
                    Agree and save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page sat-notifications-page device-Alerts-page">
      <div className={`sat-layout${sidebarCollapsed ? " sat-layout--sidebar-collapsed" : ""}`}>
        <aside className={`sat-sidebar${sidebarCollapsed ? " sat-sidebar--collapsed" : ""}`}>
          <div className="sat-sidebar-title">My alerts</div>
          <div className="sat-categories">
            <button type="button" className="sat-category active">
              <span>My alerts</span>
              <span className="sat-badge sat-badge--green">{rows.length}</span>
            </button>
          </div>
          <button
            type="button"
            className="sat-sidebar-collapse"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </aside>

        <section className="sat-panel">
          {error && <div className="sat-error">{error}</div>}
          <div className="sat-panel-header">
            <div className="sat-panel-title">
              My alerts
              <span className="sat-panel-badge">{filteredRows.length}</span>
            </div>
            <div className="sat-panel-actions">
              <div className="sat-search">
                <input
                  placeholder="Filter"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <button type="button" className="sat-icon-btn" aria-label="Export" title="Export" onClick={handleExport}>
                ⤒
              </button>
              <button
                type="button"
                className="sat-icon-btn"
                aria-label="Import"
                title="Import"
                onClick={() => importInputRef.current?.click()}
              >
                ⤓
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="device-Alerts-import-input"
                onChange={(event) => void handleImport(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="sat-icon-btn sat-icon-btn-primary device-Alerts-add-btn"
                aria-label="Add alert"
                title="Add alert"
                onClick={openCreateWizard}
              >
                +
              </button>
            </div>
          </div>

          <div className="sat-table">
            <div className="sat-row sat-row-head sat-row--device-notifications">
              <SortableColumnHeader as="span" label="Alert name" {...alertSort.getHeaderProps("name")} />
              <SortableColumnHeader as="span" label="Alerts" {...alertSort.getHeaderProps("alerts")} />
              <SortableColumnHeader as="span" label="Assets" {...alertSort.getHeaderProps("assets")} />
              <SortableColumnHeader as="span" label="Drivers" {...alertSort.getHeaderProps("drivers")} />
              <SortableColumnHeader as="span" label="Recipients" {...alertSort.getHeaderProps("recipients")} />
              <SortableColumnHeader as="span" label="Alert owner" {...alertSort.getHeaderProps("owner")} />
              <span className="sat-col-actions" aria-hidden="true">
                ☰
              </span>
            </div>
            {loading && <VTLoader compact label="Loading device alerts" />}
            {!loading && alertSort.sortedRows.length === 0 && (
              <div className="sat-empty">
                No device alerts yet. Use + to add an alert.
              </div>
            )}
            {!loading && alertSort.sortedRows.map((row) => (
              <div key={row.id} className="sat-row sat-row--device-notifications">
                <button type="button" className="sat-link sat-link-btn" onClick={() => openEditWizard(row)}>
                  {row.name}
                </button>
                <span className="device-Alerts-notifications">{row.notificationsLabel}</span>
                <span>{row.assets}</span>
                <span>{row.drivers}</span>
                <span className="device-Alerts-recipients">{row.recipientsLabel}</span>
                <span className="device-Alerts-owner">{row.ownerLabel}</span>
                <span className="sat-actions">
                  <button
                    type="button"
                    className="sat-actions-btn"
                    aria-label="More options"
                    onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
                  >
                    ⋯
                  </button>
                  {openMenuId === row.id && (
                    <div className="sat-actions-menu">
                      <button type="button" className="sat-actions-item" onClick={() => openEditWizard(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="sat-actions-item sat-actions-danger"
                        disabled={deletingId === row.id}
                        onClick={() => void handleDelete(row)}
                      >
                        {deletingId === row.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="sat-footer">
            <span>{refreshLabel}</span>
            <button type="button" className="sat-link-btn" onClick={() => void loadRows()}>
              Refresh
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
