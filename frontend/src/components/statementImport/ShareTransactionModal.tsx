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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-80 shadow-2xl transform animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-white mb-1">Repartir Gasto</h3>
        <p className="text-xs text-slate-400 mb-4 truncate">{transactionDescription}</p>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Persona</label>
            <input
              type="text"
              value={sharingTransaction.name}
              onChange={(e) => onChange({...sharingTransaction, name: e.target.value})}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monto de cobro ($)</label>
            <input
              type="number"
              value={sharingTransaction.amount / 100}
              onChange={(e) => onChange({...sharingTransaction, amount: parseFloat(e.target.value) * 100})}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm font-bold hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-500"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareTransactionModal;
