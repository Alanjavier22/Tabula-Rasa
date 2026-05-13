import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
}

const Select = ({
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  className = "",
  disabled = false,
  searchable = true
}: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset search when opening/closing
  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, searchable]);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter(opt => 
      opt.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  return (
    <div ref={selectRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5
          text-white text-sm text-left flex items-center justify-between
          focus:outline-none focus:border-indigo-500/50 focus:bg-white/10
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-300 group
          ${isOpen ? 'border-indigo-500/50 bg-white/10' : ''}
          ${className}
        `}
      >
        <span className={`font-medium ${selectedOption ? 'text-white' : 'text-white/30'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-400' : 'group-hover:text-white/60'}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-[9999] w-full mt-2 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {searchable && (
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/30 transition-all"
                />
              </div>
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full px-4 py-3 text-sm text-left rounded-xl transition-all duration-200 mb-1 last:mb-0
                    ${option.value === value 
                      ? 'bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20' 
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-white/20 font-bold uppercase tracking-widest">Sin resultados</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Select;
