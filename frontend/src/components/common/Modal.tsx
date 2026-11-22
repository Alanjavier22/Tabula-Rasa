import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
}

// Native modal dialogs provide inert siblings, nested-dialog stacking and focus trapping.
export default function Modal({ children, label, onClose, className = '' }: Readonly<ModalProps>) {
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

  const cancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      className={`app-modal-layer ${className}`}
      {...({ closedby: 'any' } as Record<string, string>)}
      onCancel={cancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
