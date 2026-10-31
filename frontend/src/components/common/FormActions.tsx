import type { MouseEventHandler } from 'react';
import { RefreshCw } from 'lucide-react';

interface FormActionsProps {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit?: MouseEventHandler<HTMLButtonElement>;
  variant?: 'panel' | 'inline';
}

export default function FormActions({ saving, submitLabel, onClose, onSubmit, variant = 'panel' }: Readonly<FormActionsProps>) {
  const styles = {
    panel: {
      wrapper: 'p-7 border-t border-line bg-canvas flex items-center gap-4',
      cancel: 'flex-1 py-4 rounded-2xl border border-line text-muted hover:text-primary hover:bg-surface-soft transition-all text-xs font-black uppercase tracking-widest',
      submit: 'flex-[2] py-4 rounded-2xl bg-surface-soft text-primary transition-all text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]',
    },
    inline: {
      wrapper: 'pt-2 flex justify-end gap-3 border-t border-line',
      cancel: 'app-btn app-btn-ghost',
      submit: 'app-btn app-btn-primary disabled:opacity-50',
    },
  }[variant];
  return (
    <div className={styles.wrapper}>
      <button type="button" onClick={onClose}
        className={styles.cancel}>
        Cancelar
      </button>
      <button type={onSubmit ? 'button' : 'submit'} onClick={onSubmit} disabled={saving}
        className={styles.submit}>
        {saving ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />Guardando...</span> : submitLabel}
      </button>
    </div>
  );
}
