import { useMemo } from "react";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";

type TripRadialTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  focus: "hour" | "minute";
};

const hourLabels = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteLabels = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const snapMinuteToStep = (minute: string): string => {
  const value = Number(minute);
  if (!Number.isFinite(value)) return "00";
  const snapped = Math.min(55, Math.round(value / 5) * 5);
  return String(snapped).padStart(2, "0");
};

type RadialRingProps = {
  labels: string[];
  selected: string;
  stepDeg: number;
  radius: number;
  centerLabel: string;
  markerClassName: string;
  onSelect: (label: string) => void;
};

function RadialClockRing({
  labels,
  selected,
  stepDeg,
  radius,
  centerLabel,
  markerClassName,
  onSelect
}: RadialRingProps) {
  const selectedIndex = Math.max(0, labels.indexOf(selected));

  return (
    <div className="trip-clock-shell">
      <div
        className="trip-clock-hand"
        aria-hidden="true"
        style={{ transform: `rotate(${selectedIndex * stepDeg}deg)` }}
      />
      <div className="trip-clock-labels" role="listbox" aria-label="Select value">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="option"
            aria-selected={selected === label}
            className={`${markerClassName}${selected === label ? " active" : ""}`}
            style={{
              transform: `rotate(${index * stepDeg}deg) translateY(-${radius}px) rotate(${-index * stepDeg}deg)`
            }}
            onClick={() => onSelect(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="trip-clock-center" aria-hidden="true">
        {centerLabel}
      </div>
    </div>
  );
}

export default function TripRadialTimePicker({ value, onChange, focus }: TripRadialTimePickerProps) {
  const [hours, minutes] = useMemo(() => {
    const parts = String(value ?? "00:00").split(":");
    return [parts[0] ?? "00", parts[1] ?? "00"];
  }, [value]);

  return (
    <div className="trip-timepicker">
      {focus === "minute" ? (
        <RadialClockRing
          labels={minuteLabels}
          selected={snapMinuteToStep(minutes)}
          stepDeg={30}
          radius={82}
          centerLabel={minutes}
          markerClassName="trip-clock-minute"
          onSelect={(label) => onChange(`${hours}:${label}`)}
        />
      ) : (
        <RadialClockRing
          labels={hourLabels}
          selected={hours}
          stepDeg={15}
          radius={82}
          centerLabel={hours}
          markerClassName="trip-clock-hour"
          onSelect={(label) => onChange(`${label}:${minutes}`)}
        />
      )}
    </div>
  );
}
