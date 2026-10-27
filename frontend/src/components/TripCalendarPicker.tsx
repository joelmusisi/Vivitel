import { useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const formatDayLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long" });

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const timelineCalendarMinDate = (() => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  date.setHours(0, 0, 0, 0);
  return date;
})();

type TripCalendarHeaderProps = {
  date: Date;
  changeMonth: (month: number) => void;
  changeYear: (year: number) => void;
  decreaseMonth: () => void;
  increaseMonth: () => void;
  prevMonthButtonDisabled?: boolean;
  nextMonthButtonDisabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
};

function TripCalendarHeader({
  date,
  changeYear,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
  minDate,
  maxDate
}: TripCalendarHeaderProps) {
  const [yearOpen, setYearOpen] = useState(false);

  const years = useMemo(() => {
    const minYear = minDate?.getFullYear() ?? date.getFullYear() - 5;
    const maxYear = maxDate?.getFullYear() ?? date.getFullYear() + 5;
    const list: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      list.push(year);
    }
    return list;
  }, [date, minDate, maxDate]);

  return (
    <div className="trip-datepicker-header">
      <button
        type="button"
        className="trip-datepicker-nav"
        onClick={decreaseMonth}
        disabled={prevMonthButtonDisabled}
        aria-label="Previous month"
      >
        ‹
      </button>

      <div className="trip-datepicker-header-selects">
        <div className="trip-picker-dropdown-anchor">
          <button
            type="button"
            className={`trip-datepicker-header-title trip-picker-dropdown-trigger${yearOpen ? " open" : ""}`}
            onClick={() => setYearOpen((open) => !open)}
            aria-expanded={yearOpen}
            aria-label="Select year"
          >
            {MONTHS[date.getMonth()]} {date.getFullYear()}
          </button>
          {yearOpen && (
            <div className="trip-picker-dropdown-menu trip-picker-dropdown-menu--years" role="listbox">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  role="option"
                  aria-selected={date.getFullYear() === year}
                  className={`trip-picker-dropdown-item${date.getFullYear() === year ? " active" : ""}`}
                  onClick={() => {
                    changeYear(year);
                    setYearOpen(false);
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="trip-datepicker-nav"
        onClick={increaseMonth}
        disabled={nextMonthButtonDisabled}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

type TripCalendarPickerProps = {
  selected: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  restrictToPast?: boolean;
};

export default function TripCalendarPicker({
  selected,
  onChange,
  minDate,
  maxDate,
  restrictToPast = true
}: TripCalendarPickerProps) {
  const resolvedMinDate = minDate ?? (restrictToPast ? timelineCalendarMinDate : undefined);
  const resolvedMaxDate = restrictToPast ? (maxDate ?? new Date()) : maxDate;

  return (
    <DatePicker
      inline
      selected={selected}
      onChange={(value: Date | null) => {
        if (!value) return;
        const local = new Date(value.getFullYear(), value.getMonth(), value.getDate());
        onChange(local);
      }}
      minDate={resolvedMinDate}
      maxDate={resolvedMaxDate}
      openToDate={selected}
      calendarClassName="trip-datepicker-calendar"
      formatWeekDay={(nameOfDay) => nameOfDay.slice(0, 3).toUpperCase()}
      renderDayContents={(day, date) => {
        if (!date) return <span>{day}</span>;
        return <span title={formatDayLabel(date)}>{day}</span>;
      }}
      renderCustomHeader={(headerProps) => (
        <TripCalendarHeader
          date={headerProps.date}
          changeMonth={headerProps.changeMonth}
          changeYear={headerProps.changeYear}
          decreaseMonth={headerProps.decreaseMonth}
          increaseMonth={headerProps.increaseMonth}
          prevMonthButtonDisabled={headerProps.prevMonthButtonDisabled}
          nextMonthButtonDisabled={headerProps.nextMonthButtonDisabled}
          minDate={resolvedMinDate}
          maxDate={resolvedMaxDate}
        />
      )}
    />
  );
}
