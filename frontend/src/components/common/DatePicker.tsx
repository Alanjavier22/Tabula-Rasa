interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

// Keep calendar dates as YYYY-MM-DD without a time-zone conversion.
const DatePicker = ({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  id,
  className = "",
  disabled = false,
  required = false,
}: DatePickerProps) => (
  <input
    id={id}
    type="date"
    className={`app-date-input ${className}`}
    value={value?.slice(0, 10) ?? ""}
    onChange={(event) => onChange(event.target.value)}
    aria-label={id ? undefined : placeholder}
    disabled={disabled}
    required={required}
  />
);

export default DatePicker;
