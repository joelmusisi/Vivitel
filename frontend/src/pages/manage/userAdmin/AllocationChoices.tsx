import type { ChoiceOption } from "./types";

type Props = {
  label: string;
  options: ChoiceOption[];
  values: string[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  singleSelect?: boolean;
};

export default function AllocationChoices({ label, options, values, onSelect, disabled = false, singleSelect = false }: Props) {
  return (
    <div className="admin-modal-field">
      <span>{label}</span>
      <div className="admin-modal-sub">
        Selected: {options.filter((option) => values.includes(option.id)).map((option) => option.name).join(", ") || "None"}
      </div>
      <div className={`admin-choice-list${disabled ? " admin-choice-list--disabled" : ""}`} role="group" aria-label={label}>
        {options.length ? (
          options.map((option) => {
            const checked = values.includes(option.id);
            return (
              <label
                key={option.id}
                className={`admin-choice-item${checked ? " admin-choice-item--selected" : ""}${disabled ? " admin-choice-item--disabled" : ""}`}
              >
                <input
                  type={singleSelect ? "radio" : "checkbox"}
                  name={singleSelect ? `assign-${label}` : undefined}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onSelect(option.id)}
                />
                <span>{option.name}</span>
              </label>
            );
          })
        ) : (
          <div className="admin-choice-empty">No options available</div>
        )}
      </div>
    </div>
  );
}
