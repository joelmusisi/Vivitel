import { useEffect, useMemo, useState } from "react";
import TripCalendarPicker from "./TripCalendarPicker";
import TripRadialTimePicker from "./TripRadialTimePicker";

const formatDayLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
const formatMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TripDateTimePickerPanelProps = {
  date: Date;
  time: string;
  mode: "date" | "time";
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
  onModeChange: (mode: "date" | "time") => void;
  onDone: () => void;
  showTime?: boolean;
  restrictToPast?: boolean;
  allowPastDates?: boolean;
};

export default function TripDateTimePickerPanel({
  date,
  time,
  mode,
  onDateChange,
  onTimeChange,
  onModeChange,
  onDone,
  showTime = true,
  restrictToPast = false,
  allowPastDates = true
}: TripDateTimePickerPanelProps) {
  const [headerMonthOpen, setHeaderMonthOpen] = useState(false);
  const [headerYearOpen, setHeaderYearOpen] = useState(false);
  const [timeFocus, setTimeFocus] = useState<"hour" | "minute">("hour");

  const scheduleMinDate = useMemo(() => {
    if (allowPastDates) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [allowPastDates]);

  const scheduleMaxDate = useMemo(() => {
    if (restrictToPast) return new Date();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    return future;
  }, [restrictToPast]);

  const yearOptions = useMemo(() => {
    const minYear = scheduleMinDate?.getFullYear() ?? date.getFullYear() - 5;
    const maxYear = scheduleMaxDate.getFullYear();
    const years: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      years.push(year);
    }
    return years;
  }, [date, scheduleMinDate, scheduleMaxDate]);

  useEffect(() => {
    if (mode !== "time") return;
    setHeaderMonthOpen(false);
    setHeaderYearOpen(false);
  }, [mode]);

  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const displayHours = String(Number.isFinite(hours) ? hours : 0).padStart(2, "0");
  const displayMinutes = String(Number.isFinite(minutes) ? minutes : 0).padStart(2, "0");
  const activeMode = showTime ? mode : "date";

  const applyMonth = (monthIndex: number) => {
    const next = new Date(date.getFullYear(), monthIndex, date.getDate());
    onDateChange(next);
    setHeaderMonthOpen(false);
  };

  const applyYear = (year: number) => {
    const next = new Date(year, date.getMonth(), date.getDate());
    onDateChange(next);
    setHeaderYearOpen(false);
  };

  const closeHeaderMenus = () => {
    setHeaderMonthOpen(false);
    setHeaderYearOpen(false);
  };

  return (
    <div className="trip-datetime-card" onClick={closeHeaderMenus}>
      <div className="trip-datetime-card-header">
        <div className="trip-datetime-card-day">{formatDayLabel(date)}</div>

        <div className={`trip-datetime-card-date${activeMode === "date" ? " active" : ""}`}>
          <div className="trip-picker-dropdown-anchor" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={`trip-datetime-month trip-picker-dropdown-trigger${headerMonthOpen ? " open" : ""}`}
              onClick={() => {
                onModeChange("date");
                setHeaderYearOpen(false);
                setHeaderMonthOpen((open) => !open);
              }}
              aria-expanded={headerMonthOpen}
            >
              {formatMonthLabel(date)}
            </button>
            {headerMonthOpen && (
              <div className="trip-picker-dropdown-menu trip-picker-dropdown-menu--header" role="listbox">
                {MONTHS_SHORT.map((month, index) => (
                  <button
                    key={month}
                    type="button"
                    role="option"
                    aria-selected={date.getMonth() === index}
                    className={`trip-picker-dropdown-item${date.getMonth() === index ? " active" : ""}`}
                    onClick={() => applyMonth(index)}
                  >
                    {month}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="trip-datetime-day"
            onClick={() => {
              closeHeaderMenus();
              onModeChange("date");
            }}
            aria-label="Select date"
          >
            {date.getDate()}
          </button>

          <div className="trip-picker-dropdown-anchor" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={`trip-datetime-year trip-picker-dropdown-trigger${headerYearOpen ? " open" : ""}`}
              onClick={() => {
                onModeChange("date");
                setHeaderMonthOpen(false);
                setHeaderYearOpen((open) => !open);
              }}
              aria-expanded={headerYearOpen}
            >
              {date.getFullYear()}
            </button>
            {headerYearOpen && (
              <div className="trip-picker-dropdown-menu trip-picker-dropdown-menu--header trip-picker-dropdown-menu--years" role="listbox">
                {yearOptions.map((year) => (
                  <button
                    key={year}
                    type="button"
                    role="option"
                    aria-selected={date.getFullYear() === year}
                    className={`trip-picker-dropdown-item${date.getFullYear() === year ? " active" : ""}`}
                    onClick={() => applyYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showTime ? (
          <div className={`trip-datetime-card-time-row${activeMode === "time" ? " active" : ""}`}>
            <button
              type="button"
              className={`trip-datetime-card-time-hour${activeMode === "time" && timeFocus === "hour" ? " active" : ""}`}
              onClick={() => {
                onModeChange("time");
                setTimeFocus("hour");
              }}
              aria-label="Select hour"
            >
              {displayHours}
            </button>
            <span className="trip-datetime-card-time-sep">:</span>
            <button
              type="button"
              className={`trip-datetime-card-time-minute${activeMode === "time" && timeFocus === "minute" ? " active" : ""}`}
              onClick={() => {
                onModeChange("time");
                setTimeFocus("minute");
              }}
              aria-label="Select minute"
            >
              {displayMinutes}
            </button>
          </div>
        ) : null}
      </div>

      <div className="trip-datetime-card-body">
        {activeMode === "time" ? (
          <TripRadialTimePicker value={time} onChange={onTimeChange} focus={timeFocus} />
        ) : (
          <TripCalendarPicker
            selected={date}
            onChange={onDateChange}
            restrictToPast={restrictToPast}
            minDate={scheduleMinDate}
            maxDate={restrictToPast ? undefined : scheduleMaxDate}
          />
        )}
      </div>

      <div className="trip-datetime-card-actions">
        <button type="button" className="trip-datetime-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
