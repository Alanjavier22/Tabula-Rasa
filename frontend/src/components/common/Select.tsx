import {
  useId,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  "aria-label"?: string;
}

const Select = ({
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  id,
  className = "",
  disabled = false,
  searchable = true,
  "aria-label": ariaLabel,
}: SelectProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;
  const [isOpen, setIsOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const open = isOpen && !disabled;
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.label
          .toLocaleLowerCase()
          .includes(searchQuery.toLocaleLowerCase()),
      ),
    [options, searchQuery],
  );
  const activeOption =
    filteredOptions[Math.min(activeIndex, filteredOptions.length - 1)];
  const optionId = (index: number) => `${listId}-${index}`;

  useLayoutEffect(() => {
    if (!open) return;
    const positionPopup = () => {
      const input = inputRef.current;
      const popup = popupRef.current;
      const list = listRef.current;
      if (!input || !popup || !list) return;
      const rect = input.getBoundingClientRect();
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const below = viewportHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const placeAbove = below < 240 && above > below;
      const height = Math.max(44, Math.min(240, placeAbove ? above : below));
      popup.style.width = `${Math.min(rect.width, window.innerWidth - 24)}px`;
      popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`;
      popup.style.top = placeAbove ? "auto" : `${rect.bottom + 6}px`;
      popup.style.bottom = placeAbove
        ? `${window.innerHeight - rect.top + 6}px`
        : "auto";
      list.style.maxHeight = `${height}px`;
    };
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    window.visualViewport?.addEventListener("resize", positionPopup);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      window.visualViewport?.removeEventListener("resize", positionPopup);
    };
  }, [open, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        !selectRef.current?.contains(event.target as Node) &&
        !popupRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open && activeOption) {
      listRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeOption]);

  const close = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  const openOptions = (last = false) => {
    setPortalTarget(
      inputRef.current?.closest('[role="dialog"], dialog') ?? document.body,
    );
    setSearchQuery("");
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(
      selectedIndex >= 0
        ? selectedIndex
        : last
          ? Math.max(0, options.length - 1)
          : 0,
    );
    setIsOpen(true);
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    close();
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openOptions(event.key === "ArrowUp");
      else
        setActiveIndex((index) =>
          Math.max(
            0,
            Math.min(
              filteredOptions.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            ),
          ),
        );
    } else if (event.key === "Enter" || (!searchable && event.key === " ")) {
      event.preventDefault();
      if (!open) openOptions();
      else if (activeOption) choose(activeOption);
    } else if (
      open &&
      !searchable &&
      (event.key === "Home" || event.key === "End")
    ) {
      event.preventDefault();
      setActiveIndex(
        event.key === "Home" ? 0 : Math.max(0, filteredOptions.length - 1),
      );
    }
  };

  return (
    <div
      ref={selectRef}
      className={`app-select ${className}`}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !popupRef.current?.contains(event.relatedTarget as Node | null)
        )
          close();
      }}
    >
      <div className="app-select-control">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={ariaLabel ?? (id ? undefined : placeholder)}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete={searchable ? "list" : "none"}
          aria-activedescendant={
            open && activeOption
              ? optionId(filteredOptions.indexOf(activeOption))
              : undefined
          }
          autoComplete="off"
          disabled={disabled}
          readOnly={!searchable}
          placeholder={open && searchable ? "Buscar opciones…" : placeholder}
          value={
            open && searchable ? searchQuery : (selectedOption?.label ?? "")
          }
          onFocus={(event) => event.currentTarget.select()}
          onClick={() => {
            if (!open) openOptions();
          }}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setPortalTarget(
              inputRef.current?.closest('[role="dialog"], dialog') ??
                document.body,
            );
            setSearchQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
        />
        {open && searchable ? (
          <Search aria-hidden="true" />
        ) : (
          <ChevronDown aria-hidden="true" />
        )}
      </div>
      {open &&
        portalTarget &&
        createPortal(
          <div
            ref={popupRef}
            className="app-select-popup"
            onMouseDown={(event) => event.preventDefault()}
          >
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? placeholder}
            >
              {filteredOptions.map((option, index) => (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  data-active={option === activeOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActiveIndex(index)}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check aria-hidden="true" />}
                </div>
              ))}
            </div>
            {filteredOptions.length === 0 && (
              <p role="status" className="app-select-empty">
                Sin resultados. Prueba con otro término.
              </p>
            )}
          </div>,
          portalTarget,
        )}
    </div>
  );
};

export default Select;
