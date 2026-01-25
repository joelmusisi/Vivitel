import { useMemo, useState } from "react";
import { notificationEventIds, notificationRows, NotificationRow } from "../../data/notificationLibrary";
import "../../index.css";

const librarySections = [
  "CAN library",
  "Notification library",
  "Firmware library",
  "Location library",
  "Mobile device library",
  "Parameter library",
  "Peripheral library"
];

export default function Libraries() {
  const [activeSection, setActiveSection] = useState(librarySections[0]);
  const isNotificationLibrary = activeSection === "Notification library";
  const isMobileDeviceLibrary = activeSection === "Mobile device library";
  const isLocationLibrary = activeSection === "Location library";
  const isParameterLibrary = activeSection === "Parameter library";
  const isPeripheralLibrary = activeSection === "Peripheral library";
  const [openLibraryActions, setOpenLibraryActions] = useState<string | null>(null);
  const [editingNotification, setEditingNotification] = useState<NotificationRow | null>(null);
  const [editingNotificationOriginal, setEditingNotificationOriginal] = useState<string | null>(null);
  const [notificationItems, setNotificationItems] = useState<NotificationRow[]>(notificationRows);
  const operatorOptions = ["is not", "<", "<=", "=", ">", ">="];
  const [conditions, setConditions] = useState([
    { id: 1, field: "", operator: "", value: "" }
  ]);
  const [selectedConditionId, setSelectedConditionId] = useState<number | null>(1);
  const [videoSelections, setVideoSelections] = useState({ driver: false, road: false, inCab: false });
  const [recordVideo, setRecordVideo] = useState(false);
  const [recordEvent, setRecordEvent] = useState(true);
  const [recordDelay, setRecordDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [recordingType, setRecordingType] = useState("Detailed");
  const recordingTypeHelp: Record<string, string> = {
    Detailed: "Records the start and end of each occurrence of the event.",
    Summary: "Records a summarized occurrence for reporting and review.",
    Notification: "Sends a notification only without capturing video."
  };
  const [returnValueParam, setReturnValueParam] = useState("No return value");
  const [returnValueMode, setReturnValueMode] = useState("Maximum");
  const [recordActions, setRecordActions] = useState({
    startOdometer: false,
    endOdometer: false,
    startPosition: true,
    endPosition: true
  });
  const [actionBuzzerEnabled, setActionBuzzerEnabled] = useState(false);
  const [actionBuzzerDelay, setActionBuzzerDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [actionBuzzerDuration, setActionBuzzerDuration] = useState("");
  const [allowBuzzerOverride, setAllowBuzzerOverride] = useState(false);
  const [relayDriveOneEnabled, setRelayDriveOneEnabled] = useState(false);
  const [relayDriveOneDelay, setRelayDriveOneDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [relayDriveOneDuration, setRelayDriveOneDuration] = useState("");
  const [relayDriveOneOverride, setRelayDriveOneOverride] = useState(false);
  const [relayDriveTwoEnabled, setRelayDriveTwoEnabled] = useState(false);
  const [relayDriveTwoDelay, setRelayDriveTwoDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [relayDriveTwoDuration, setRelayDriveTwoDuration] = useState("");
  const [relayDriveTwoOverride, setRelayDriveTwoOverride] = useState(false);
  const [activeMessageEnabled, setActiveMessageEnabled] = useState(false);
  const [activeQueueDelay, setActiveQueueDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [activeQueueMode, setActiveQueueMode] = useState("");
  const [messagePriority, setMessagePriority] = useState("");
  const [sendCurrentPosition, setSendCurrentPosition] = useState(false);
  const [enableActiveTracking, setEnableActiveTracking] = useState(false);
  const [trackingDelay, setTrackingDelay] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const [trackingInterval, setTrackingInterval] = useState({ hours: "0", minutes: "0", seconds: "0" });
  const handleNotificationSave = () => {
    if (editingNotification) {
      setNotificationItems((current) => {
        if (!editingNotificationOriginal) {
          return [...current, editingNotification];
        }
        return current.map((row) =>
          row.description === editingNotificationOriginal ? editingNotification : row
        );
      });
    }
    setEditingNotification(null);
    setEditingNotificationOriginal(null);
  };
  const resetNotificationFormState = () => {
    setConditions([{ id: 1, field: "", operator: "", value: "" }]);
    setSelectedConditionId(1);
    setVideoSelections({ driver: false, road: false, inCab: false });
    setRecordVideo(false);
    setRecordEvent(false);
    setRecordDelay({ hours: "0", minutes: "0", seconds: "0" });
    setRecordingType("");
    setReturnValueParam("");
    setReturnValueMode("");
    setRecordActions({ startOdometer: false, endOdometer: false, startPosition: false, endPosition: false });
    setActionBuzzerEnabled(false);
    setActionBuzzerDelay({ hours: "0", minutes: "0", seconds: "0" });
    setActionBuzzerDuration("");
    setAllowBuzzerOverride(false);
    setRelayDriveOneEnabled(false);
    setRelayDriveOneDelay({ hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveOneDuration("");
    setRelayDriveOneOverride(false);
    setRelayDriveTwoEnabled(false);
    setRelayDriveTwoDelay({ hours: "0", minutes: "0", seconds: "0" });
    setRelayDriveTwoDuration("");
    setRelayDriveTwoOverride(false);
    setActiveMessageEnabled(false);
    setActiveQueueDelay({ hours: "0", minutes: "0", seconds: "0" });
    setActiveQueueMode("");
    setMessagePriority("");
    setSendCurrentPosition(false);
    setEnableActiveTracking(false);
    setTrackingDelay({ hours: "0", minutes: "0", seconds: "0" });
    setTrackingInterval({ hours: "0", minutes: "0", seconds: "0" });
  };
  const addConditionRow = () => {
    const newId = Date.now() + Math.random();
    setConditions((current) => [
      ...current,
      { id: newId, field: "", operator: "", value: "" }
    ]);
    setSelectedConditionId(newId);
  };
  const updateCondition = (
    id: number,
    updates: Partial<{ field: string; operator: string; value: string }>
  ) => {
    setConditions((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };
  const deleteSelectedCondition = () => {
    setConditions((current) => {
      if (current.length <= 1) {
        const fallbackId = Date.now() + Math.random();
        setSelectedConditionId(fallbackId);
        return [{ id: fallbackId, field: "", operator: "", value: "" }];
      }
      const next = current.filter((row) => row.id !== selectedConditionId);
      setSelectedConditionId(next[0]?.id ?? null);
      return next;
    });
  };
  const moveSelectedCondition = (direction: "up" | "down") => {
    setConditions((current) => {
      if (!selectedConditionId) {
        return current;
      }
      const index = current.findIndex((row) => row.id === selectedConditionId);
      if (index === -1) {
        return current;
      }
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  };
  const handleNotificationAdd = () => {
    resetNotificationFormState();
    const newNotification: NotificationRow = {
      description: "",
      type: "Custom",
      availability: "Available",
      eventId: ""
    };
    setEditingNotification(newNotification);
    setEditingNotificationOriginal(null);
  };
  const updateNotificationAvailability = (description: string, availability: string) => {
    setNotificationItems((current) =>
      current.map((row) =>
        row.description === description ? { ...row, availability } : row
      )
    );
    setOpenLibraryActions(null);
  };
  const deleteNotification = (description: string) => {
    setNotificationItems((current) => current.filter((row) => row.description !== description));
    setOpenLibraryActions(null);
  };

  // notificationRows now imported from shared data module

  const rows = useMemo(() => {
    const type = activeSection.toLowerCase().includes("can") ? "Scriptable CAN" : "Library";
    return [
      {
        name: `${activeSection} Item 1`,
        availability: "Available",
        notForFm: "",
        type
      },
      {
        name: `${activeSection} Item 2`,
        availability: "",
        notForFm: "",
        type
      },
      {
        name: `${activeSection} Item 3`,
        availability: "",
        notForFm: "",
        type
      }
    ];
  }, [activeSection]);

  const mobileDeviceRows = useMemo(
    () => [
      "AT 1330 (Wireless Trailer Track and Trace)",
      "AT 1340 (Wired Trailer Track and Trace)",
      "AT SAT EMS TAM (Satellite Trailer Track and Trace)",
      "BeWhere AT1",
      "Cartrack",
      "Cellocator LV100",
      "Cellocator LV300",
      "Cellocator LV500",
      "Cellocator LV550",
      "Cellocator Vehicle Gateway",
      "CR100 CAN",
      "CR400 CAN",
      "Digital Matter",
      "Flespi",
      "FM 1000 (FM100)",
      "FM 2000 (FM200 Plus)",
      "FM 2000HV (FM200 Plus HV)",
      "FM 2001 (FM200 CAN)",
      "FM 2100 (FM200 Locator)",
      "FM 2100HV (FM200 Locator HV)"
    ],
    []
  );

  const locationRows = useMemo(
    () => [
      { name: "Main Road, gravel / 30.0 kmph / Uganda 46", type: "Speed zone", speed: "35 km/h", availability: "Available" },
      { name: "Main Road, gravel / 50.0 kmph / Uganda 3", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "tertiary / 45.0 kmph / Tanzania 11", type: "Speed zone", speed: "", availability: "" },
      { name: "29 July Accident CPP/Motobike (30km/h)", type: "Speed zone", speed: "", availability: "" },
      { name: "Al-Mansor 50kph", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "Araa Vilager-Kondoa 50kph", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "Araa-Mlima Wa Simu / secondary / 50.0 kmph / Tanza 7", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "Arusha (50km/h)", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "Arusha 2 (50km/h)", type: "Speed zone", speed: "55 km/h", availability: "Available" },
      { name: "Arusha Airport", type: "Customer", speed: "", availability: "" },
      { name: "B01 / MLBV / UG 31", type: "Speed zone", speed: "50 km/h", availability: "Available" },
      { name: "B27 / MLBV Access Road / 30km/hr 51", type: "Speed zone", speed: "35 km/h", availability: "Available" },
      { name: "B52 / MLBV / TZ 80", type: "Speed zone", speed: "", availability: "" },
      { name: "B53 / MLBV / TZ 79", type: "Speed zone", speed: "", availability: "" },
      { name: "B54 / MLBV / TZ 84", type: "Speed zone", speed: "", availability: "" },
      { name: "B61 / MLBV / TZ 88", type: "Speed zone", speed: "", availability: "" },
      { name: "B62 / MLBV + EHT / TZ 78", type: "Speed zone", speed: "", availability: "" },
      { name: "B73 / MLBV / TZ 90", type: "Speed zone", speed: "", availability: "" },
      { name: "B74 / MLBV + EHT / TZ 82", type: "Speed zone", speed: "", availability: "" },
      { name: "Babati 2 (50km/h)", type: "Speed zone", speed: "55 km/h", availability: "Available" }
    ],
    []
  );

  const parameterRows = useMemo(
    () => [
      { name: "3-Axis Cornering G-Force (High Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Cornering G-Force (Low Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Cornering G-Force (Medium Sensitivity)", type: "Value", units: "G" },
      { name: "3-Axis Impact Severity", type: "Value", units: "" },
      { name: "3-Axis Liftoff Severity", type: "Value", units: "" },
      { name: "3-Axis Road Roughness Severity", type: "Value", units: "" },
      { name: "3-Axis X-Axis Rotation", type: "Value", units: "" },
      { name: "3-Axis Y-Axis Rotation", type: "Value", units: "" },
      { name: "Acceleration", type: "Acceleration", units: "km/h/s" },
      { name: "Active Control - output relay drive 1 Progressive", type: "Boolean", units: "" },
      { name: "Active Control - output relay drive 2 Progressive", type: "Boolean", units: "" },
      { name: "Active Control - Plug disarm prevented", type: "Boolean", units: "" },
      { name: "Active Control - positive drive OFF", type: "Boolean", units: "" },
      { name: "Active Control - positive drive ON", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 1 OFF", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 1 ON", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 2 OFF", type: "Boolean", units: "" },
      { name: "Active Control - relay drive 2 ON", type: "Boolean", units: "" },
      { name: "At location", type: "Location", units: "" },
      { name: "Back panel tamper detected", type: "Boolean", units: "" },
      { name: "Bat Over Temperature", type: "Temperature", units: "°C" },
      { name: "Battery disconnect date/time", type: "Date and Time", units: "" },
      { name: "Battery disconnect duration", type: "Seconds", units: "seconds" },
      { name: "Battery level percentage - Bluetooth Remote", type: "Value", units: "" },
      { name: "Battery voltage", type: "Value", units: "mV" },
      { name: "Communication session to server active", type: "Boolean", units: "" },
      { name: "Config rollback reason", type: "Value", units: "" },
      { name: "Cornering G-Force (High Sensitivity)", type: "Value", units: "G" },
      { name: "Cornering G-Force (Low Sensitivity)", type: "Value", units: "G" },
      { name: "Cornering G-Force (Med Sensitivity)", type: "Value", units: "G" },
      { name: "Crossing State Line", type: "Boolean", units: "" },
      { name: "Current date", type: "Date", units: "" },
      { name: "Current date/time", type: "Date and Time", units: "" },
      { name: "Current driver ID", type: "Value", units: "" },
      { name: "Current State", type: "US State ID", units: "" },
      { name: "Current time", type: "Time", units: "" },
      { name: "Current Trip duration", type: "Value", units: "Hours" },
      { name: "Day of week", type: "Day of Week", units: "" },
      { name: "Deceleration", type: "Acceleration", units: "km/h/s" },
      { name: "Diagnostic : Extra Tacho Field", type: "Value", units: "" },
      { name: "Diagnostic : SubTrip Duration", type: "Seconds", units: "seconds" },
      { name: "Diagnostic: Auto-Orientation State", type: "Value", units: "" },
      { name: "Diagnostic: Measured Speed", type: "Speed", units: "km/h" },
      { name: "Diagnostic: Speed Spike", type: "Boolean", units: "" },
      { name: "DriveMate Mode", type: "Value", units: "" },
      { name: "Driver Assist", type: "Value", units: "" },
      { name: "Driver plug valid", type: "Boolean", units: "" },
      { name: "Engine hour reading", type: "Seconds", units: "Hours" },
      { name: "Engine RPM", type: "Value", units: "RPM" },
      { name: "EV CAN: Energy consumed", type: "Value", units: "kWh" },
      { name: "EV CAN: Energy consumed by auxiliaries", type: "Value", units: "kWh" },
      { name: "EV CAN: Energy generated", type: "Value", units: "kWh" },
      { name: "EV CAN: State of charge", type: "Value", units: "%" },
      { name: "Extended Driver ID", type: "Value", units: "" },
      { name: "Extended Driver ID (high)", type: "Value", units: "" },
      { name: "Extended Driver ID (middle)", type: "Value", units: "" },
      { name: "Extended Driver ID present", type: "Boolean", units: "" },
      { name: "Front panel tamper detected", type: "Boolean", units: "" },
      { name: "GPRS - connected to network", type: "Boolean", units: "" },
      { name: "GPRS is connected", type: "Boolean", units: "" },
      { name: "GPRS out of coverage indicator", type: "Value", units: "" },
      { name: "GPRS running Rx byte count", type: "Value", units: "Bytes" },
      { name: "GPRS running session count", type: "Value", units: "" },
      { name: "GPRS running total byte count", type: "Value", units: "Bytes" },
      { name: "GPRS running Tx byte count", type: "Value", units: "Bytes" },
      { name: "GPRS session active", type: "Boolean", units: "" },
      { name: "GPS age of reading", type: "Seconds", units: "seconds" },
      { name: "GPS altitude", type: "Distance", units: "m" },
      { name: "GPS diagnostic plug inserted", type: "Boolean", units: "" },
      { name: "GPS distance since last valid reading", type: "Distance", units: "m" },
      { name: "GPS External Antenna State", type: "Value", units: "" },
      { name: "GPS HDOP", type: "Value", units: "" },
      { name: "GPS heading", type: "Value", units: "°" },
      { name: "GPS jamming status", type: "Value", units: "" },
      { name: "GPS latitude", type: "Latitude", units: "°" },
      { name: "GPS longitude", type: "Longitude", units: "°" },
      { name: "GPS number of satellites", type: "Value", units: "" },
      { name: "GPS Signal Quality", type: "Value", units: "" },
      { name: "GPS velocity", type: "Speed", units: "km/h" },
      { name: "GPS velocity fallback triggered", type: "Boolean", units: "" },
      { name: "GSM call active (data)", type: "Boolean", units: "" },
      { name: "GSM call active (voice)", type: "Boolean", units: "" },
      { name: "GSM diagnostic plug inserted", type: "Boolean", units: "" },
      { name: "GSM idle", type: "Boolean", units: "" },
      { name: "GSM in coverage", type: "Boolean", units: "" },
      { name: "GSM jamming status", type: "Value", units: "" },
      { name: "GSM modem asleep", type: "Boolean", units: "" },
      { name: "GSM modem in use by SDK", type: "Boolean", units: "" },
      { name: "GSM modem rebooted", type: "Boolean", units: "" },
      { name: "GSM network status", type: "Value", units: "" },
      { name: "GSM ringing (voice)", type: "Boolean", units: "" },
      { name: "GSM roaming", type: "Boolean", units: "" },
      { name: "GSM Serving Cell Access Technology", type: "Value", units: "" },
      { name: "GSM signal quality", type: "Value", units: "" },
      { name: "High resolution Odometer", type: "Distance", units: "km" },
      { name: "High resolution trip distance", type: "Distance", units: "km" },
      { name: "Ignition on", type: "Boolean", units: "" },
      { name: "Ignition Voltage", type: "Value", units: "mV" },
      { name: "In Sub-trip", type: "Boolean", units: "" },
      { name: "In trip (drive)", type: "Boolean", units: "" },
      { name: "Internal Battery backup voltage", type: "Value", units: "V" },
      { name: "Internal Battery Charging State", type: "Value", units: "" },
      { name: "Internal Battery charging status", type: "Value", units: "" },
      { name: "Internal battery in use", type: "Boolean", units: "" },
      { name: "Internal Battery ripple voltage", type: "Value", units: "V" },
      { name: "Internal Battery State", type: "Value", units: "" },
      { name: "Internal Battery trickle charging timer", type: "Value", units: "sec" },
      { name: "Internal Battery Voltage", type: "Value", units: "" },
      { name: "Invalid Extended Driver ID", type: "Boolean", units: "" },
      { name: "Invalid organisation driver plug", type: "Boolean", units: "" },
      { name: "Last config error", type: "Value", units: "" },
      { name: "Location speed monitoring - Shape ID of Current Hit", type: "Value", units: "" },
      { name: "Not at location", type: "Location", units: "" },
      { name: "Odometer reading", type: "Distance", units: "km" },
      { name: "Organisation and driver from plug", type: "Combined Company and Driver ID", units: "" },
      { name: "Overrideable alarm on", type: "Boolean", units: "" },
      { name: "Passenger ID", type: "Passenger ID", units: "" },
      { name: "PIN failure count", type: "Value", units: "" },
      { name: "Plug driver ID", type: "Value", units: "" },
      { name: "Plug insert count", type: "Value", units: "" },
      { name: "Plug serial ID", type: "Value", units: "" },
      { name: "Plug type", type: "Value", units: "" },
      { name: "Positive drive power on", type: "Boolean", units: "" },
      { name: "Primary Battery Connection State", type: "Value", units: "" },
      { name: "Private mode plug active", type: "Boolean", units: "" },
      { name: "Raw internal temperature", type: "Temperature", units: "°C" },
      { name: "Rear door driver side state", type: "Value", units: "" },
      { name: "Rear door passenger side state", type: "Value", units: "" },
      { name: "Relay drive 1 enabled / Power control on", type: "Boolean", units: "" },
      { name: "Relay drive 2 enabled / Power control on", type: "Boolean", units: "" },
      { name: "Relay drive 2 status", type: "Boolean", units: "" },
      { name: "Road speed", type: "Speed", units: "km/h" },
      { name: "RPM : Speed ratio", type: "Value", units: "" },
      { name: "RPM calibration pulses", type: "Value", units: "" },
      { name: "RS232 is ok", type: "Boolean", units: "" },
      { name: "Save FM Keypad driving reason", type: "Boolean", units: "" },
      { name: "Seconds since last Cycle", type: "Boolean", units: "" },
      { name: "SIM error", type: "Boolean", units: "" },
      { name: "SIM PUK locked", type: "Boolean", units: "" },
      { name: "Speed calibration pulses", type: "Value", units: "" },
      { name: "Speed monitoring - Active message options", type: "Value", units: "" },
      { name: "Speed monitoring - Current location", type: "Location", units: "" },
      { name: "Speed monitoring - Over speeding buffered value", type: "Speed", units: "km/h" },
      { name: "Speed monitoring - Over speeding value", type: "Speed", units: "km/h" },
      { name: "Speed monitoring - Recording delay", type: "Seconds", units: "seconds" },
      { name: "Speed monitoring - Warning delay", type: "Seconds", units: "seconds" },
      { name: "Standing delay expired", type: "Boolean", units: "" },
      { name: "Starter interuption relay stat", type: "Boolean", units: "" },
      { name: "Stop Vector Count", type: "Value", units: "" },
      { name: "Sub-trip termination button pressed", type: "Boolean", units: "" },
      { name: "System overridden", type: "Boolean", units: "" },
      { name: "Tick - 30 seconds", type: "Boolean", units: "" },
      { name: "Tick - 1 min", type: "Boolean", units: "" },
      { name: "Tick - 5 min", type: "Boolean", units: "" },
      { name: "Tick - 10 min", type: "Boolean", units: "" },
      { name: "Tick - 120 min (2 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 15 min", type: "Boolean", units: "" },
      { name: "Tick - 240 min (4 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 30 min", type: "Boolean", units: "" },
      { name: "Tick - 360 min (6 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 480 min (8 Hours)", type: "Boolean", units: "" },
      { name: "Tick - 60 min (Hour)", type: "Boolean", units: "" },
      { name: "Tick - 720 min (12 Hours)", type: "Boolean", units: "" },
      { name: "Time in mode", type: "Seconds", units: "seconds" },
      { name: "Time Since Ignition On", type: "Seconds", units: "seconds" },
      { name: "Time Since Positive Drive On", type: "Seconds", units: "seconds" },
      { name: "Time Since SubTrip Depart", type: "Value", units: "Hours" },
      { name: "Track trace cornering threshold", type: "Integer", units: "mg" },
      { name: "Track trace input 1 threshold", type: "Integer", units: "mv" },
      { name: "Track trace input 2 threshold", type: "Integer", units: "mv" },
      { name: "Trip distance", type: "Distance", units: "km" },
      { name: "TT: Block 0 Status 11", type: "Value", units: "" },
      { name: "TT: Block 0 Status 12", type: "Value", units: "" },
      { name: "TT: Block 0 Status 13", type: "Value", units: "" },
      { name: "TT: Block 0 Status 8", type: "Value", units: "" },
      { name: "TT: Block 1 Status 14", type: "Value", units: "" },
      { name: "Unit power down requested", type: "Boolean", units: "" },
      { name: "Vehicle active", type: "Boolean", units: "" },
      { name: "Vehicle moving", type: "Boolean", units: "" },
      { name: "Version of configuration that was accepted", type: "Integer", units: "" },
      { name: "Weekday (Monday to Friday)", type: "Boolean", units: "" }
    ],
    []
  );
  const conditionOptions = useMemo(() => parameterRows.map((row) => row.name), [parameterRows]);
  const getConditionUnit = (field: string) =>
    parameterRows.find((row) => row.name === field)?.units ?? "";

  const peripheralRows = useMemo(
    () => [
      { name: "*sirens*", availability: "", type: "Boolean" },
      { name: "-Temperatura do Câmbio", availability: "Available", type: "Analog (0-5000mV)" },
      { name: "-Temperatura do Diferencial", availability: "", type: "Analog (0-5000mV)" },
      { name: ".Aircon On Test", availability: "", type: "Boolean" },
      { name: ".Cargo Door Switch", availability: "", type: "Boolean" },
      { name: ".Cruise Control", availability: "", type: "Boolean" },
      { name: ".Dash Switch", availability: "", type: "Boolean" },
      { name: ".Dash Switch2", availability: "", type: "Boolean" },
      { name: ".Discharge Switch", availability: "", type: "Boolean" },
      { name: ".Door Switch", availability: "", type: "Boolean" },
      { name: ".Drive Cam", availability: "", type: "Boolean" },
      { name: ".Dummy Box (Boolean)", availability: "", type: "Boolean" },
      { name: ".Eco Roll", availability: "", type: "Boolean" },
      { name: ".Fridge On", availability: "", type: "Boolean" },
      { name: ".Intarder", availability: "", type: "Boolean" },
      { name: ".Jakes Brakes", availability: "", type: "Boolean" },
      { name: ".Pressure Switch", availability: "", type: "Boolean" },
      { name: ".PTO Switch", availability: "", type: "Boolean" },
      { name: ".retarder", availability: "", type: "Boolean" },
      { name: ".Retarder activate", availability: "", type: "Boolean" }
    ],
    []
  );

  return (
    <div className="page libraries-page">
      <div className="libraries-topbar">
        <div className="libraries-title">Libraries</div>
        <div className="libraries-path">EA-Transfleet Services-… / Africa - MiXEA - Transfl…</div>
      </div>

      <section className="libraries-card">
        <div className="libraries-layout">
          <aside className="libraries-sidebar">
            {librarySections.map((section) => (
              <button
                key={section}
                type="button"
                className={`libraries-tab ${activeSection === section ? "active" : ""}`}
                onClick={() => setActiveSection(section)}
              >
                {section}
              </button>
            ))}
          </aside>

          <div className="libraries-panel">
            <div className="libraries-panel-header">
              <div className="libraries-panel-title">{activeSection}</div>
              <div className="libraries-header-actions">
                <input className="libraries-search" placeholder="Filter" />
                {isLocationLibrary ? (
                  <>
                    <button type="button" className="libraries-icon-btn" aria-label="Download">
                      ⭳
                    </button>
                    <button type="button" className="libraries-icon-btn" aria-label="Upload">
                      ⭱
                    </button>
                    <button type="button" className="libraries-add-btn" aria-label="Add geofence">
                      Add geofence
                    </button>
                  </>
                ) : isParameterLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add parameter">
                    Add parameter
                  </button>
                ) : isPeripheralLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add peripheral">
                    Add peripheral
                  </button>
                ) : isMobileDeviceLibrary ? (
                  <button type="button" className="libraries-add-btn" aria-label="Add device">
                    Add device
                  </button>
                ) : (
                  <button
                    type="button"
                    className="libraries-add-btn"
                    aria-label="Add"
                    onClick={isNotificationLibrary ? handleNotificationAdd : undefined}
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            <div className={`libraries-table ${isNotificationLibrary ? "libraries-table-event" : ""}`}>
                {isNotificationLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-notification">
                    <div>Notification description</div>
                    <div>Notification Type</div>
                    <div>Availability</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {notificationItems.map((row) => (
                    <div key={row.description} className="libraries-row libraries-row-notification">
                      <div className="libraries-link">{row.description}</div>
                      <div>{row.type}</div>
                      <div>{row.availability}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.description ? null : row.description))
                          }
                        >
                          ⋯
                        </button>
                        {openLibraryActions === row.description && (
                          <div className="libraries-actions-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setEditingNotification(row);
                                setEditingNotificationOriginal(row.description);
                                setOpenLibraryActions(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => updateNotificationAvailability(row.description, "Available")}
                            >
                              Make available
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => updateNotificationAvailability(row.description, "Unavailable")}
                            >
                              Make Un Available
                            </button>
                            <button type="button" role="menuitem" onClick={() => deleteNotification(row.description)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isMobileDeviceLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-mobile">
                    <div>Mobile device</div>
                    <div>Availability</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {mobileDeviceRows.map((name) => (
                    <div key={name} className="libraries-row libraries-row-mobile">
                      <div className="libraries-link">{name}</div>
                      <div />
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() => setOpenLibraryActions((prev) => (prev === name ? null : name))}
                        >
                          ⋯
                        </button>
                        {openLibraryActions === name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem">Edit</button>
                            <button type="button" role="menuitem">Delete</button>
                            <button type="button" role="menuitem">Suspend</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isLocationLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-location">
                    <div>Name</div>
                    <div>Type</div>
                    <div>Speed limit</div>
                    <div>Availability</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {locationRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-location">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.type}</div>
                      <div>{row.speed}</div>
                      <div>{row.availability}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))
                          }
                        >
                          ⋯
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem">Edit</button>
                            <button type="button" role="menuitem">Delete</button>
                            <button type="button" role="menuitem">Suspend</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isParameterLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-parameter">
                    <div>Parameter</div>
                    <div>Parameter type</div>
                    <div>Units</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {parameterRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-parameter">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.type}</div>
                      <div>{row.units}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() => setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))}
                        >
                          ⋯
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem">Edit</button>
                            <button type="button" role="menuitem">Delete</button>
                            <button type="button" role="menuitem">Suspend</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : isPeripheralLibrary ? (
                <>
                  <div className="libraries-row libraries-head libraries-row-peripheral">
                    <div>Peripheral</div>
                    <div>Availability</div>
                    <div>Type</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {peripheralRows.map((row) => (
                    <div key={row.name} className="libraries-row libraries-row-peripheral">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.availability}</div>
                      <div>{row.type}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() => setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))}
                        >
                          ⋯
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem">Edit</button>
                            <button type="button" role="menuitem">Delete</button>
                            <button type="button" role="menuitem">Suspend</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="libraries-row libraries-head">
                    <div>Peripheral</div>
                    <div>Availability</div>
                    <div>Not for FM</div>
                    <div>Type</div>
                    <div className="libraries-actions" aria-hidden="true">⋯</div>
                  </div>
                  {rows.map((row) => (
                    <div key={row.name} className="libraries-row">
                      <div className="libraries-link">{row.name}</div>
                      <div>{row.availability}</div>
                      <div>{row.notForFm}</div>
                      <div>{row.type}</div>
                      <div className="libraries-actions">
                        <button
                          type="button"
                          className="libraries-action-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenLibraryActions((prev) => (prev === row.name ? null : row.name))
                          }
                        >
                          ⋯
                        </button>
                        {openLibraryActions === row.name && (
                          <div className="libraries-actions-menu" role="menu">
                            <button type="button" role="menuitem">Edit</button>
                            <button type="button" role="menuitem">Delete</button>
                            <button type="button" role="menuitem">Suspend</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      {editingNotification && (
        <div className="libraries-event-overlay" role="dialog" aria-modal="true">
          <div className="libraries-event-card">
            <div className="libraries-event-header">
              <div className="libraries-event-title">
                Notification library
              </div>
              <button
                type="button"
                className="libraries-event-close"
                onClick={() => setEditingNotification(null)}
              >
                Close
              </button>
            </div>
            <div className="libraries-event-body">
              <div className="libraries-event-row">
                <label className="libraries-event-label">
                  Notification description <span aria-hidden="true">*</span>
                </label>
                <input
                  className="libraries-event-input"
                  value={editingNotification.description}
                  onChange={(event) =>
                    setEditingNotification({
                      ...editingNotification,
                      description: event.target.value
                    })
                  }
                />
              </div>
              <div className="libraries-event-row">
                <label className="libraries-event-label">
                  Notification type
                </label>
                <input className="libraries-event-input" value={editingNotification.type} disabled />
              </div>
              <div className="libraries-event-row">
                <label className="libraries-event-label">
                  Notification ID
                </label>
                <input
                  className="libraries-event-input"
                  value={
                    editingNotification.type === "Custom"
                      ? editingNotification.eventId ?? ""
                      : notificationEventIds[
                          editingNotification.description.replace(/^\*\s*/, "").trim()
                        ] ?? ""
                  }
                  onChange={(event) =>
                    editingNotification.type === "Custom"
                      ? setEditingNotification({
                          ...editingNotification,
                          eventId: event.target.value
                        })
                      : undefined
                  }
                  disabled={editingNotification.type !== "Custom"}
                />
                {editingNotification.type === "Custom" && (
                  <div className="libraries-event-helper">
                    If left blank, the next available ID will automatically be assigned
                  </div>
                )}
              </div>
            </div>
            {editingNotification.type === "Diagnostic" && (
              <>
                <div className="libraries-event-conditions">
                  <div className="libraries-event-conditions-title">
                    Conditions <span aria-hidden="true">*</span>
                  </div>
                  <div className="libraries-event-conditions-subtitle">
                    Event occurs when the following conditions are met
                  </div>
                  <div className="libraries-event-conditions-toolbar">
                    <button type="button" className="libraries-event-icon" aria-label="Add" onClick={addConditionRow}>＋</button>
                    <button type="button" className="libraries-event-icon" aria-label="Duplicate">⧉</button>
                    <button type="button" className="libraries-event-icon" aria-label="Delete" onClick={deleteSelectedCondition}>×</button>
                    <button type="button" className="libraries-event-icon" aria-label="Move up" onClick={() => moveSelectedCondition("up")}>↑</button>
                    <button type="button" className="libraries-event-icon" aria-label="Move down" onClick={() => moveSelectedCondition("down")}>↓</button>
                  </div>
                  {conditions.map((condition) => (
                    <div
                      key={condition.id}
                      className={`libraries-event-conditions-row ${condition.id === selectedConditionId ? "selected" : ""}`}
                      onClick={() => setSelectedConditionId(condition.id)}
                    >
                      <span className="libraries-event-required">*</span>
                      <select
                        className="libraries-event-select"
                        value={condition.field}
                        onChange={(event) => updateCondition(condition.id, { field: event.target.value })}
                      >
                        <option value="" disabled>
                          Select parameter
                        </option>
                        {conditionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        className="libraries-event-select libraries-event-operator"
                        value={condition.operator}
                        onChange={(event) => updateCondition(condition.id, { operator: event.target.value })}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {operatorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        className="libraries-event-input libraries-event-value"
                        value={condition.value}
                        onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                      />
                      <span className="libraries-event-unit">{getConditionUnit(condition.field)}</span>
                    </div>
                  ))}
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Notification video configuration</div>
                  <div className="libraries-event-section-subtitle">
                    Select which camera videos should be requested when this event is triggered. All the available camera names for the organization are listed below. Video will only be requested for the selected cameras that are available to the unit in the asset where the event is triggered.
                  </div>
                  <div className="libraries-event-toggle-row">
                    <span>Record video</span>
                    <button
                      type="button"
                      className={`libraries-event-toggle ${recordVideo ? "active" : ""}`}
                      onClick={() => setRecordVideo((current) => !current)}
                      aria-pressed={recordVideo}
                    >
                      {recordVideo ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="libraries-event-video-box">
                    {([
                      { key: "driver", label: "Driver" },
                      { key: "road", label: "Road" },
                      { key: "inCab", label: "In Cab" }
                    ] as const).map((item) => (
                      <label key={item.key} className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={videoSelections[item.key]}
                          disabled={!recordVideo}
                          onChange={(event) =>
                            setVideoSelections({
                              ...videoSelections,
                              [item.key]: event.target.checked
                            })
                          }
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Record</div>
                  <label className="libraries-event-checkbox-row">
                    <input
                      type="checkbox"
                      checked={recordEvent}
                      onChange={(event) => setRecordEvent(event.target.checked)}
                    />
                    Record event
                  </label>
                  <div className="libraries-event-record-grid">
                    <div className="libraries-event-delay-group">
                      <div className="libraries-event-section-subtitle">Record delay</div>
                      <div className="libraries-event-delay">
                        <select
                          className="libraries-event-select"
                          value={recordDelay.hours}
                          onChange={(event) => setRecordDelay({ ...recordDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.minutes}
                          onChange={(event) => setRecordDelay({ ...recordDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.seconds}
                          onChange={(event) => setRecordDelay({ ...recordDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="libraries-event-delay-label">
                        <span>Hours</span>
                        <span>Minutes</span>
                        <span>Seconds</span>
                      </div>
                    </div>
                    <div>
                      <div className="libraries-event-section-subtitle">Recording type</div>
                      <select
                        className="libraries-event-select libraries-event-input"
                        value={recordingType}
                        onChange={(event) => setRecordingType(event.target.value)}
                      >
                        <option value="" disabled>
                          Select recording type
                        </option>
                        <option>Detailed</option>
                        <option>Summary</option>
                        <option>Notification</option>
                      </select>
                      <div className="libraries-event-section-subtitle">
                        {recordingType ? recordingTypeHelp[recordingType] ?? recordingTypeHelp.Detailed : ""}
                      </div>
                    </div>
                  </div>

                  <div className="libraries-event-record-actions">
                    <div className="libraries-event-section-title">Record actions</div>
                    <div className="libraries-event-video-box">
                      <label className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={recordActions.startOdometer}
                          onChange={(event) =>
                            setRecordActions({ ...recordActions, startOdometer: event.target.checked })
                          }
                        />
                        Start odometer
                      </label>
                      <label className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={recordActions.endOdometer}
                          onChange={(event) =>
                            setRecordActions({ ...recordActions, endOdometer: event.target.checked })
                          }
                        />
                        End odometer
                      </label>
                      <label className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={recordActions.startPosition}
                          onChange={(event) =>
                            setRecordActions({ ...recordActions, startPosition: event.target.checked })
                          }
                        />
                        Start position
                      </label>
                      <label className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={recordActions.endPosition}
                          onChange={(event) =>
                            setRecordActions({ ...recordActions, endPosition: event.target.checked })
                          }
                        />
                        End position
                      </label>
                    </div>
                  </div>

                  <div className="libraries-event-footer">
                    <button
                      type="button"
                      className="libraries-event-action"
                      onClick={() => setEditingNotification(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="libraries-event-action primary"
                      onClick={handleNotificationSave}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
            {editingNotification.type === "Custom" && (
              <>
                <div className="libraries-event-conditions">
                  <div className="libraries-event-conditions-title">
                    Conditions <span aria-hidden="true">*</span>
                  </div>
                  <div className="libraries-event-conditions-subtitle">
                    Event occurs when the following conditions are met
                  </div>
                  <div className="libraries-event-conditions-toolbar">
                    <button type="button" className="libraries-event-icon" aria-label="Add" onClick={addConditionRow}>＋</button>
                    <button type="button" className="libraries-event-icon" aria-label="Duplicate">⧉</button>
                    <button type="button" className="libraries-event-icon" aria-label="Delete" onClick={deleteSelectedCondition}>×</button>
                    <button type="button" className="libraries-event-icon" aria-label="Move up" onClick={() => moveSelectedCondition("up")}>↑</button>
                    <button type="button" className="libraries-event-icon" aria-label="Move down" onClick={() => moveSelectedCondition("down")}>↓</button>
                  </div>
                  {conditions.map((condition) => (
                    <div
                      key={condition.id}
                      className={`libraries-event-conditions-row ${condition.id === selectedConditionId ? "selected" : ""}`}
                      onClick={() => setSelectedConditionId(condition.id)}
                    >
                      <span className="libraries-event-required">*</span>
                      <select
                        className="libraries-event-select"
                        value={condition.field}
                        onChange={(event) => updateCondition(condition.id, { field: event.target.value })}
                      >
                        <option value="" disabled>
                          Select parameter
                        </option>
                        {conditionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        className="libraries-event-select libraries-event-operator"
                        value={condition.operator}
                        onChange={(event) => updateCondition(condition.id, { operator: event.target.value })}
                      >
                        <option value="" disabled>
                          Select
                        </option>
                        {operatorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        className="libraries-event-input libraries-event-value"
                        value={condition.value}
                        onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                      />
                      <span className="libraries-event-unit">{getConditionUnit(condition.field)}</span>
                    </div>
                  ))}
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Return value</div>
                  <div className="libraries-event-section-subtitle">
                    If the event is to return a value please specify which parameter to return a value from
                  </div>
                  <label className="libraries-event-row">
                    <span className="libraries-event-label">Notification parameter</span>
                    <select
                      className="libraries-event-select libraries-event-input"
                      value={returnValueParam}
                      onChange={(event) => setReturnValueParam(event.target.value)}
                    >
                      <option value="" disabled>
                        Select parameter
                      </option>
                      <option>No return value</option>
                      {conditionOptions.map((option) => (
                        <option key={`return-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="libraries-event-section-subtitle">
                    Please specify whether the minimum, maximum or average of the parameter should be returned when the event is recorded
                  </div>
                  <label className="libraries-event-row">
                    <span className="libraries-event-label">Value</span>
                    <select
                      className="libraries-event-select libraries-event-input"
                      value={returnValueMode}
                      onChange={(event) => setReturnValueMode(event.target.value)}
                      disabled={returnValueParam === "" || returnValueParam === "No return value"}
                    >
                      <option value="" disabled>
                        Select value
                      </option>
                      <option>Minimum</option>
                      <option>Maximum</option>
                      <option>Average</option>
                    </select>
                  </label>
                  <div className="libraries-event-helper">
                    Value calculation only applies to Detailed and Summary events. Notification events and Active messages will always return the current value of the parameter when the specified delay is reached.
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Notification video configuration</div>
                  <div className="libraries-event-section-subtitle">
                    Select which camera videos should be requested when this event is triggered. All the available camera names for the organization are listed below. Video will only be requested for the selected cameras that are available to the unit in the asset where the event is triggered.
                  </div>
                  <div className="libraries-event-toggle-row">
                    <span>Record video</span>
                    <button
                      type="button"
                      className={`libraries-event-toggle ${recordVideo ? "active" : ""}`}
                      onClick={() => setRecordVideo((current) => !current)}
                      aria-pressed={recordVideo}
                    >
                      {recordVideo ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="libraries-event-video-box">
                    {([
                      { key: "driver", label: "Driver" },
                      { key: "road", label: "Road" },
                      { key: "inCab", label: "In Cab" }
                    ] as const).map((item) => (
                      <label key={item.key} className="libraries-event-checkbox-row">
                        <input
                          type="checkbox"
                          checked={videoSelections[item.key]}
                          disabled={!recordVideo}
                          onChange={(event) =>
                            setVideoSelections({
                              ...videoSelections,
                              [item.key]: event.target.checked
                            })
                          }
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Record</div>
                  <label className="libraries-event-checkbox-row">
                    <input
                      type="checkbox"
                      checked={recordEvent}
                      onChange={(event) => setRecordEvent(event.target.checked)}
                    />
                    Record event
                  </label>
                  <div className="libraries-event-record-grid">
                    <div className="libraries-event-delay-group">
                      <div className="libraries-event-section-subtitle">Record delay</div>
                      <div className="libraries-event-delay">
                        <select
                          className="libraries-event-select"
                          value={recordDelay.hours}
                          onChange={(event) => setRecordDelay({ ...recordDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.minutes}
                          onChange={(event) => setRecordDelay({ ...recordDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={recordDelay.seconds}
                          onChange={(event) => setRecordDelay({ ...recordDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="libraries-event-delay-label">
                        <span>Hours</span>
                        <span>Minutes</span>
                        <span>Seconds</span>
                      </div>
                    </div>
                    <div>
                      <div className="libraries-event-section-subtitle">Recording type</div>
                      <select
                        className="libraries-event-select libraries-event-input"
                        value={recordingType}
                        onChange={(event) => setRecordingType(event.target.value)}
                      >
                        <option value="" disabled>
                          Select recording type
                        </option>
                        <option>Detailed</option>
                        <option>Summary</option>
                        <option>Notification</option>
                      </select>
                      <div className="libraries-event-section-subtitle">
                        {recordingType ? recordingTypeHelp[recordingType] ?? recordingTypeHelp.Detailed : ""}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Actions</div>
                  <div className="libraries-event-action-box">
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={actionBuzzerEnabled}
                          onChange={(event) => setActionBuzzerEnabled(event.target.checked)}
                        />
                        Sound buzzer when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.hours}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`ab-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.minutes}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ab-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={actionBuzzerDelay.seconds}
                          onChange={(event) => setActionBuzzerDelay({ ...actionBuzzerDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ab-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={actionBuzzerDuration}
                        onChange={(event) => setActionBuzzerDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select buzzer action
                        </option>
                        <option>Sound the buzzer for 1 second</option>
                        <option>Sound the buzzer for 5 seconds</option>
                        <option>Sound buzzer continuously when the condition is true</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={allowBuzzerOverride}
                        onChange={(event) => setAllowBuzzerOverride(event.target.checked)}
                      />
                      Allow override plug to prevent buzzer from sounding
                    </label>
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={relayDriveOneEnabled}
                          onChange={(event) => setRelayDriveOneEnabled(event.target.checked)}
                        />
                        Enable relay drive 1 when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.hours}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`r1-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.minutes}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r1-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveOneDelay.seconds}
                          onChange={(event) => setRelayDriveOneDelay({ ...relayDriveOneDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r1-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={relayDriveOneDuration}
                        onChange={(event) => setRelayDriveOneDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select relay drive action
                        </option>
                        <option>Turn the relay drive on for 1 second</option>
                        <option>Turn the relay drive on for 2 seconds</option>
                        <option>Turn the relay drive on for 5 seconds</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={relayDriveOneOverride}
                        onChange={(event) => setRelayDriveOneOverride(event.target.checked)}
                      />
                      Allow override plug to prevent relay drive 1 from being turned on
                    </label>
                    <div className="libraries-event-action-row">
                      <label className="libraries-event-inline">
                        <input
                          type="checkbox"
                          checked={relayDriveTwoEnabled}
                          onChange={(event) => setRelayDriveTwoEnabled(event.target.checked)}
                        />
                        Enable relay drive 2 when condition has been true for a delay of
                      </label>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.hours}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`r2-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.minutes}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r2-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={relayDriveTwoDelay.seconds}
                          onChange={(event) => setRelayDriveTwoDelay({ ...relayDriveTwoDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`r2-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={relayDriveTwoDuration}
                        onChange={(event) => setRelayDriveTwoDuration(event.target.value)}
                      >
                        <option value="" disabled>
                          Select relay drive action
                        </option>
                        <option>Turn the relay drive on for 1 second</option>
                        <option>Turn the relay drive on for 2 seconds</option>
                        <option>Turn the relay drive on for 5 seconds</option>
                      </select>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={relayDriveTwoOverride}
                        onChange={(event) => setRelayDriveTwoOverride(event.target.checked)}
                      />
                      Allow override plug to prevent relay drive 2 from being turned on
                    </label>
                  </div>
                </div>

                <div className="libraries-event-section">
                  <div className="libraries-event-section-title">Active</div>
                  <div className="libraries-event-action-box">
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={activeMessageEnabled}
                        onChange={(event) => setActiveMessageEnabled(event.target.checked)}
                      />
                      Send active message
                    </label>
                    <div className="libraries-event-action-row">
                      <span>Queue after a delay of</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.hours}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`aq-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.minutes}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`aq-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={activeQueueDelay.seconds}
                          onChange={(event) => setActiveQueueDelay({ ...activeQueueDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`aq-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span>and</span>
                      <select
                        className="libraries-event-select libraries-event-inline-select"
                        value={activeQueueMode}
                        onChange={(event) => setActiveQueueMode(event.target.value)}
                      >
                        <option value="" disabled>
                          Select message timing
                        </option>
                        <option>Send when condition becomes true</option>
                        <option>Send when condition has been true for delay</option>
                      </select>
                    </div>
                    <div className="libraries-event-action-row libraries-event-action-column">
                      <label className="libraries-event-row">
                        <span className="libraries-event-label">Message priority</span>
                        <select
                          className="libraries-event-select libraries-event-input"
                          value={messagePriority}
                          onChange={(event) => setMessagePriority(event.target.value)}
                        >
                          <option value="" disabled>
                            Select priority
                          </option>
                          <option>Low</option>
                          <option>Normal</option>
                          <option>High</option>
                        </select>
                      </label>
                      <div className="libraries-event-helper">
                        The message will be sent when the message buffer is full
                      </div>
                      <label className="libraries-event-action-row">
                        <input
                          type="checkbox"
                          checked={sendCurrentPosition}
                          onChange={(event) => setSendCurrentPosition(event.target.checked)}
                        />
                        Send current position in message
                      </label>
                    </div>
                    <label className="libraries-event-action-row">
                      <input
                        type="checkbox"
                        checked={enableActiveTracking}
                        onChange={(event) => setEnableActiveTracking(event.target.checked)}
                      />
                      Enable active tracking while the condition is true
                    </label>
                    <div className="libraries-event-action-row">
                      <span>Tracking delay</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.hours}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`td-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.minutes}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`td-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingDelay.seconds}
                          onChange={(event) => setTrackingDelay({ ...trackingDelay, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`td-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="libraries-event-action-row">
                      <span>Tracking interval</span>
                      <div className="libraries-event-time-fields">
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.hours}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, hours: event.target.value })}
                        >
                          {Array.from({ length: 24 }).map((_, index) => (
                            <option key={`ti-h-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.minutes}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, minutes: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ti-m-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          className="libraries-event-select"
                          value={trackingInterval.seconds}
                          onChange={(event) => setTrackingInterval({ ...trackingInterval, seconds: event.target.value })}
                        >
                          {Array.from({ length: 60 }).map((_, index) => (
                            <option key={`ti-s-${index}`} value={index}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {editingNotification.type !== "Diagnostic" && (
              <div className="libraries-event-footer">
                <button
                  type="button"
                  className="libraries-event-action"
                  onClick={() => setEditingNotification(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="libraries-event-action primary"
                  onClick={handleNotificationSave}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
