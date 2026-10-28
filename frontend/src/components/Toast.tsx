import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "warning";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

const Toast = ({ message, type, onClose, duration }: ToastProps) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const autoCloseAfter = duration ?? (type === "success" ? 5000 : 0);
  useEffect(() => {
    if (autoCloseAfter <= 0 || hovered || focused) return;
    const timer = setTimeout(onClose, autoCloseAfter);
    return () => clearTimeout(timer);
  }, [onClose, autoCloseAfter, hovered, focused, message, type]);

  const Icon =
    type === "success" ? CheckCircle : type === "error" ? XCircle : AlertCircle;

  return (
    <div
      className={`app-toast app-toast-${type}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <Icon aria-hidden="true" />
      <p role={type === "error" ? "alert" : "status"} aria-atomic="true">
        {message}
      </p>
      <button
        type="button"
        className="app-icon-button"
        aria-label="Cerrar notificación"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
};

export default Toast;
