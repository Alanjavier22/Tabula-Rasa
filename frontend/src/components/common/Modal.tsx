import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
  preventClose?: boolean;
}

// Native modal dialogs provide inert siblings, nested-dialog stacking and focus trapping.
export default function Modal({ children, label, onClose, className = '', preventClose = false }: Readonly<ModalProps>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const initialControl = dialog.querySelector<HTMLElement>(
      'input:not(:disabled):not([type="file"]), textarea:not(:disabled)',
    ) ?? dialog.querySelector<HTMLElement>('button:not(:disabled):not([tabindex="-1"])');
    initialControl?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target === dialog && !preventClose) onClose();
    };
    dialog.addEventListener('click', closeOnBackdrop);
    return () => dialog.removeEventListener('click', closeOnBackdrop);
  }, [onClose, preventClose]);

  const cancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!preventClose) onClose();
  };

  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      className={`app-modal-layer ${className}`}
      {...({ closedby: preventClose ? 'none' : 'any' } as Record<string, string>)}
      onCancel={cancel}
    >
      {children}
    </dialog>,
    document.body,
  );
}
