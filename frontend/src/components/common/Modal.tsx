import { useCallback, useEffect, useRef } from "react";
import type { ReactNode, KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const focusable =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]';

interface ModalProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
}

// Mount only while open. Portals keep dialogs outside the sticky navigation;
// inert siblings and focus restoration also work with nested import dialogs.
export default function Modal({
  children,
  label,
  onClose,
  className = "",
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useCallback(
    () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 && !element.closest("[inert]"),
      ),
    [],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== root,
    );
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";
    const firstInput = root.querySelector<HTMLElement>(
      'input:not(:disabled):not([type="file"]), textarea:not(:disabled)',
    );
    (firstInput ?? controls()[0] ?? root).focus();
    return () => {
      siblings.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [controls]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (
        !items.length ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`app-modal-layer ${className}`}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
