import { useState } from "react";
import ScheduleDateTimePicker from "./ScheduleDateTimePicker";

interface DateTimeRangePickerProps {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

type PresetRange = {
  label: string;
  getRange: () => { start: Date; end: Date };
};

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

const formatDisplayDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

export function DateTimeRangePicker({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: DateTimeRangePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"start" | "end">("start");
  const [pickerDateObj, setPickerDateObj] = useState(() => new Date());
  const [pickerTime, setPickerTime] = useState("00:00");
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

  const presets: PresetRange[] = [
    {
      label: "Last 24 hours",
      getRange: () => {
        const end = new Date();
        const start = new Date(end.getTime() - 1000 * 60 * 60 * 24);
        return { start, end };
      },
    },
    {
      label: "Last 7 days",
      getRange: () => {
        const end = new Date();
        const start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 7);
        return { start, end };
      },
    },
    {
      label: "Last 30 days",
      getRange: () => {
        const end = new Date();
        const start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 30);
        return { start, end };
      },
    },
    {
      label: "This month",
      getRange: () => {
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth(), 1);
        return { start, end };
      },
    },
  ];

  const applyPreset = (preset: PresetRange) => {
    const { start, end } = preset.getRange();
    onStartChange(toLocalInputValue(start));
    onEndChange(toLocalInputValue(end));
  };

  const openPicker = (target: "start" | "end") => {
    const base = target === "start" ? startDate : endDate;
    const safeDate = Number.isNaN(base.getTime()) ? new Date() : base;
    setPickerTarget(target);
    setPickerDateObj(new Date(safeDate));
    setPickerTime(`${safeDate.getHours().toString().padStart(2, "0")}:${safeDate.getMinutes().toString().padStart(2, "0")}`);
    setPickerMode("date");
    setPickerOpen(true);
  };

  const applyPicker = () => {
    const [hours, minutes] = pickerTime.split(":").map((value) => Number(value));
    const next = new Date(pickerDateObj);
    if (!Number.isNaN(hours)) next.setHours(hours);
    if (!Number.isNaN(minutes)) next.setMinutes(minutes);
    next.setSeconds(0, 0);

    const value = toLocalInputValue(next);
    if (pickerTarget === "start") {
      onStartChange(value);
    } else {
      onEndChange(value);
    }
    setPickerOpen(false);
  };

  return (
    <div className="date-time-range-picker">
      <div className="dtrp-presets">
        <div className="dtrp-presets-label">Quick select:</div>
        <div className="dtrp-presets-buttons">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="dtrp-preset-btn"
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dtrp-inputs">
        <div className="dtrp-field">
          <label className="dtrp-label">
            <span className="dtrp-label-text">From</span>
            <div className="dtrp-input-wrapper">
              <button type="button" className="dtrp-display-btn" onClick={() => openPicker("start")}>
                <svg className="dtrp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {formatDisplayDate(startDate)}
              </button>
            </div>
          </label>
        </div>

        <div className="dtrp-separator">→</div>

        <div className="dtrp-field">
          <label className="dtrp-label">
            <span className="dtrp-label-text">To</span>
            <div className="dtrp-input-wrapper">
              <button type="button" className="dtrp-display-btn" onClick={() => openPicker("end")}>
                <svg className="dtrp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {formatDisplayDate(endDate)}
              </button>
            </div>
          </label>
        </div>
      </div>

      <ScheduleDateTimePicker
        open={pickerOpen}
        date={pickerDateObj}
        time={pickerTime}
        mode={pickerMode}
        onClose={() => setPickerOpen(false)}
        onConfirm={applyPicker}
        onDateChange={setPickerDateObj}
        onTimeChange={setPickerTime}
        onModeChange={setPickerMode}
        title={pickerTarget === "start" ? "Select start date and time" : "Select end date and time"}
        restrictToPast
      />
    </div>
  );
}
