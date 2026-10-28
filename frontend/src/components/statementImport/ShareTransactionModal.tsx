import Modal from '../common/Modal';
export interface SharingTransactionState {
  index: number;
  name: string;
  amount: number;
}

interface ShareTransactionModalProps {
  sharingTransaction: SharingTransactionState;
  transactionDescription: string;
  onChange: (next: SharingTransactionState) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const ShareTransactionModal = ({ sharingTransaction, transactionDescription, onChange, onCancel, onConfirm }: ShareTransactionModalProps) => {
  return (
    <Modal onClose={onCancel} label={'Compartir transacción'}>
      <div className="bg-surface border border-line p-6 rounded-2xl w-80 shadow-2xl transform animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-primary mb-1">Repartir Gasto</h3>
        <p className="text-xs text-muted mb-4 truncate">{transactionDescription}</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="share-transaction-name" className="text-xs font-bold text-muted uppercase block mb-1">Persona</label>
            <input
              id="share-transaction-name"
              type="text"
              value={sharingTransaction.name}
              onChange={(e) => onChange({...sharingTransaction, name: e.target.value})}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-primary text-sm focus:border-line outline-none"
            />
          </div>
          <div>
            <label htmlFor="share-transaction-amount" className="text-xs font-bold text-muted uppercase block mb-1">Monto de cobro ($)</label>
            <input
              id="share-transaction-amount"
              type="number"
              value={sharingTransaction.amount / 100}
              onChange={(e) => onChange({...sharingTransaction, amount: Number.parseFloat(e.target.value) * 100})}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-primary text-sm focus:border-line outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button aria-label="Cerrar diálogo"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-line text-muted text-sm font-bold hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-accent-strong text-on-color text-sm font-bold hover:bg-accent-strong"
          >
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShareTransactionModal;
