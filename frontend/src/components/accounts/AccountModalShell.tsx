import { useId, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import FormActions from '../common/FormActions';
import Modal from '../common/Modal';

interface AccountModalShellProps {
  isOpen: boolean;
  label: string;
  title: string;
  icon: ReactNode;
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}

export default function AccountModalShell({
  isOpen,
  label,
  title,
  icon,
  saving,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: Readonly<AccountModalShellProps>) {
  const formId = useId();

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} preventClose={saving} label={label}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col "
          >
            <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-line shrink-0">
              <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
                  {icon}
                </div>
                {title}
              </h2>
              <button
                type="button"
                aria-label="Cerrar diálogo"
                disabled={saving}
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all border border-transparent hover:border-line disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              id={formId}
              onSubmit={onSubmit}
              className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain"
            >
              {children}
            </form>

            <FormActions saving={saving} onClose={onClose} formId={formId} submitLabel={submitLabel} />
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
