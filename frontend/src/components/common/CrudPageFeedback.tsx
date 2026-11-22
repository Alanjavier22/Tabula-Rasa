import ConfirmDialog from '../ConfirmDialog';
import Toast from '../Toast';

export interface FeedbackToastState {
  message: string;
  type: 'success' | 'error' | 'warning';
}

interface CrudPageFeedbackProps {
  toast: FeedbackToastState | null;
  onCloseToast: () => void;
  deleteConfirmOpen: boolean;
  deleteTitle: string;
  deleteMessage: string;
  onConfirmDelete: () => void | Promise<void>;
  onCancelDelete: () => void;
}

export default function CrudPageFeedback({
  toast,
  onCloseToast,
  deleteConfirmOpen,
  deleteTitle,
  deleteMessage,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<CrudPageFeedbackProps>) {
  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={onCloseToast} />}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title={deleteTitle}
        message={deleteMessage}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </>
  );
}
