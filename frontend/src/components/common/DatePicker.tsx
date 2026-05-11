import { useState } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const DatePicker = ({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className = "",
  disabled = false
}: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedDate = value ? new Date(value) : null;

  const handleChange = (date: Date | null) => {
    if (date) {
      // Format date as YYYY-MM-DD
      const formattedDate = date.toISOString().split('T')[0];
      onChange(formattedDate);
    } else {
      onChange('');
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <style>{`
        .react-datepicker-popper {
          z-index: 9999 !important;
        }
        .react-datepicker {
          background-color: #1e293b !important;
          border: 1px solid #475569 !important;
          border-radius: 0.5rem !important;
          font-family: inherit !important;
        }
        .react-datepicker__header {
          background-color: #1e293b !important;
          border-bottom: 1px solid #475569 !important;
          border-top-left-radius: 0.5rem !important;
          border-top-right-radius: 0.5rem !important;
        }
        .react-datepicker__current-month {
          color: #ffffff !important;
          font-weight: 600 !important;
        }
        .react-datepicker__day-name {
          color: #94a3b8 !important;
        }
        .react-datepicker__month {
          margin: 0 !important;
        }
        .react-datepicker__week {
          display: flex !important;
        }
        .react-datepicker__day {
          color: #cbd5e1 !important;
          border-radius: 0.25rem !important;
          margin: 0.25rem !important;
        }
        .react-datepicker__day:hover {
          background-color: #7c3aed !important;
          color: #ffffff !important;
        }
        .react-datepicker__day--selected {
          background-color: #7c3aed !important;
          color: #ffffff !important;
        }
        .react-datepicker__day--keyboard-selected {
          background-color: #7c3aed !important;
          color: #ffffff !important;
        }
        .react-datepicker__day--today {
          background-color: #7c3aed !important;
          color: #ffffff !important;
          font-weight: 600 !important;
        }
        .react-datepicker__day--outside-month {
          color: #64748b !important;
        }
        .react-datepicker__day--disabled {
          color: #475569 !important;
          cursor: not-allowed !important;
        }
        .react-datepicker__navigation {
          color: #cbd5e1 !important;
        }
        .react-datepicker__navigation:hover {
          color: #ffffff !important;
        }
        .react-datepicker__triangle {
          display: none !important;
        }
      `}</style>
      <ReactDatePicker
        selected={selectedDate}
        onChange={handleChange}
        dateFormat="yyyy-MM-dd"
        placeholderText={placeholder}
        disabled={disabled}
        customInput={
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className={`
              min-w-[200px] w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 
              text-white text-sm text-left flex items-center justify-between
              focus:outline-none focus:border-purple-700
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors duration-200
              ${className}
            `}
          >
            <span className={selectedDate ? 'text-white' : 'text-slate-400'}>
              {selectedDate ? value : placeholder}
            </span>
            <Calendar className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        }
      />
    </div>
  );
};

export default DatePicker;
