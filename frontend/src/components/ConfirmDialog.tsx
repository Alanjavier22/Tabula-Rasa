import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [isOpen]);

  const confirm = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-busy={submitting}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="app-confirm-content">
        <AlertTriangle className="app-confirm-icon" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <p id={messageId}>{message}</p>
        <div className="app-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="app-btn"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="app-btn app-btn-danger"
            disabled={submitting}
            onClick={() => void confirm()}
          >
            {submitting ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default ConfirmDialog;
