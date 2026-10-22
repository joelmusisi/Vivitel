import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  id: string;
  label: string;
  sublabel?: string;
};

type JourneySearchableSelectProps = {
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  valueId: string;
  valueLabel: string;
  options: SearchableOption[];
  loading?: boolean;
  emptyMessage?: string;
  disabled?: boolean;
  onSelect: (option: SearchableOption | null) => void;
};

export default function JourneySearchableSelect({
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  valueId,
  valueLabel,
  options,
  loading = false,
  emptyMessage = "No matches for this site.",
  disabled = false,
  onSelect
}: JourneySearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const hay = `${option.label} ${option.sublabel ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [options, query]);

  return (
    <label className="journey-create-field journey-searchable-field">
      <span>{label}</span>
      <div className={`journey-searchable${open ? " is-open" : ""}`} ref={rootRef}>
        <button
          type="button"
          className="journey-searchable-trigger"
          disabled={disabled || loading}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={valueLabel ? undefined : "is-placeholder"}>
            {loading ? "Loading site options…" : valueLabel || placeholder}
          </span>
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <div className="journey-searchable-panel" role="listbox">
            <input
              className="journey-searchable-filter"
              autoFocus
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="journey-searchable-options">
              {valueId ? (
                <button
                  type="button"
                  className="journey-searchable-option is-clear"
                  onClick={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                >
                  Clear selection
                </button>
              ) : null}
              {filtered.length === 0 ? (
                <div className="journey-searchable-empty">{emptyMessage}</div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={option.id === valueId}
                    className={`journey-searchable-option${option.id === valueId ? " is-selected" : ""}`}
                    onClick={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <strong>{option.label}</strong>
                    {option.sublabel ? <small>{option.sublabel}</small> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
