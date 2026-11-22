import type { MouseEventHandler } from 'react';
import { RefreshCw } from 'lucide-react';

interface FormActionsProps {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit?: MouseEventHandler<HTMLButtonElement>;
  formId?: string;
  variant?: 'panel' | 'inline';
}

export default function FormActions({ saving, submitLabel, onClose, onSubmit, formId, variant = 'panel' }: Readonly<FormActionsProps>) {
  const styles = {
    panel: {
      wrapper: 'p-7 border-t border-line bg-canvas flex items-center gap-4',
      cancel: 'app-btn app-btn-ghost flex-1',
      submit: 'app-btn app-btn-primary flex-[2] disabled:opacity-50',
    },
    inline: {
      wrapper: 'pt-2 flex justify-end gap-3 border-t border-line',
      cancel: 'app-btn app-btn-ghost',
      submit: 'app-btn app-btn-primary disabled:opacity-50',
    },
  }[variant];
  return (
    <div className={styles.wrapper}>
      <button type="button" onClick={onClose} disabled={saving}
        className={styles.cancel}>
        Cancelar
      </button>
      <button
        type={formId || !onSubmit ? 'submit' : 'button'}
        form={formId}
        onClick={formId ? undefined : onSubmit}
        disabled={saving}
        className={styles.submit}
      >
        {saving ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />Guardando...</span> : submitLabel}
      </button>
    </div>
  );
}
