import { useEffect } from "react";
import TripDateTimePickerPanel from "./TripDateTimePickerPanel";
import "react-datepicker/dist/react-datepicker.css";

type Props = {
  open: boolean;
  date: Date;
  time: string;
  mode: "date" | "time";
  onClose: () => void;
  onConfirm: () => void;
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
  onModeChange: (mode: "date" | "time") => void;
  title?: string;
  allowPastDates?: boolean;
  showTime?: boolean;
  nested?: boolean;
  closeOnBackdropClick?: boolean;
  restrictToPast?: boolean;
};

export default function ScheduleDateTimePicker({
  open,
  date,
  time,
  mode,
  onClose,
  onConfirm,
  onDateChange,
  onTimeChange,
  onModeChange,
  title = "Select scheduled time",
  allowPastDates = true,
  showTime = true,
  nested = false,
  closeOnBackdropClick = true,
  restrictToPast = false
}: Props) {
  useEffect(() => {
    if (!open || showTime) return;
    if (mode !== "date") onModeChange("date");
  }, [open, showTime, mode, onModeChange]);

  if (!open) return null;

  return (
    <div
      className={`trip-datetime-modal${nested ? " trip-datetime-modal--nested" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div onClick={(event) => event.stopPropagation()}>
        <TripDateTimePickerPanel
          date={date}
          time={time}
          mode={mode}
          showTime={showTime}
          restrictToPast={restrictToPast}
          allowPastDates={allowPastDates}
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
          onModeChange={onModeChange}
          onDone={onConfirm}
        />
      </div>
    </div>
  );
}
