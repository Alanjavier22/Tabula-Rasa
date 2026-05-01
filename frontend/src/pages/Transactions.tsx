import { useState, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsAPI, categoriesAPI, accountsAPI, aiAPI } from '../services/api';
import type { Transaction, TransactionType, PaymentMethod, ExpenseType } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Upload, Mic, MicOff, FileImage } from 'lucide-react';
import CSVImportModal from '../components/CSVImportModal';
import DocumentImportModal from '../components/DocumentImportModal';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';

const emptyForm = {
  description: '',
  amount: '',
  transaction_type: 'expense' as TransactionType,
  payment_method: 'transfer' as PaymentMethod,
  date: new Date().toISOString().split('T')[0],
  category_id: '',
  account_id: '',
  expense_type: 'variable' as ExpenseType,
};

const TransactionRow = memo(({ transaction, onEdit, onDelete }: { transaction: Transaction; onEdit: (t: Transaction) => void; onDelete: (id: string) => void }) => (
  <tr key={transaction.id} className="hover:bg-slate-700/30 transition-colors">
    <td className="px-3 lg:px-6 py-3 lg:py-4">
      <div className="text-sm font-medium text-white break-words">
        {transaction.description}
      </div>
    </td>
    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
      <span
        className={`px-2 lg:px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
          transaction.transaction_type === 'income'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}
      >
        {transaction.transaction_type === 'income' ? 'Ingreso' : 'Gasto'}
      </span>
    </td>
    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
      <span
        className={`text-sm font-semibold ${
          transaction.transaction_type === 'income'
            ? 'text-green-400'
            : 'text-red-400'
        }`}
      >
        {transaction.transaction_type === 'income' ? '+' : '-'}
        ${formatMoney(transaction.amount)}
      </span>
    </td>
    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-sm text-slate-300">
      {new Date(transaction.date).toLocaleDateString('es-ES')}
    </td>
    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-sm text-slate-300 hidden md:table-cell">
      {transaction.payment_method === 'cash' ? 'Efectivo' :
       transaction.payment_method === 'credit_card' ? 'T. Crédito' :
       transaction.payment_method === 'debit_card' ? 'T. Débito' :
       transaction.payment_method === 'transfer' ? 'Transferencia' : 'Otro'}
    </td>
    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-right text-sm font-medium">
      <button onClick={() => onEdit(transaction)} className="text-blue-400 hover:text-blue-300 mr-3">
        <Edit className="w-4 h-4" />
      </button>
      <button
        onClick={() => onDelete(transaction.id)}
        className="text-red-400 hover:text-red-300"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </td>
  </tr>
));

TransactionRow.displayName = 'TransactionRow';

const Transactions = () => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDocumentImportModal, setShowDocumentImportModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processingAudio, setProcessingAudio] = useState(false);

  const { data: transactions = [], isLoading: loadingTxns } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const res = await transactionsAPI.getAll();
      return res.data;
    }
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await categoriesAPI.getAll();
      return res.data;
    }
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await accountsAPI.getAll();
      return res.data;
    }
  });

  const loading = loadingTxns;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsAPI.delete(id),
    onSuccess: () => {
      setToast({ message: 'Transacción eliminada', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      setDeleteConfirm({ isOpen: false, id: null });
    },
    onError: (error: any) => {
      console.error('Error deleting transaction:', error);
      setToast({ 
        message: error.response?.data?.detail || 'Error al eliminar transacción', 
        type: 'error' 
      });
      setDeleteConfirm({ isOpen: false, id: null });
    }
  });

  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = () => {
    if (deleteConfirm.id === null) return;
    deleteMutation.mutate(deleteConfirm.id);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setForm({
      description: transaction.description,
      // Backend returns cents, use formatMoney for display
      amount: formatMoney(transaction.amount),
      transaction_type: transaction.transaction_type,
      payment_method: transaction.payment_method,
      date: transaction.date.split('T')[0],
      category_id: transaction.category_id?.toString() || '',
      account_id: transaction.account_id?.toString() || '',
      expense_type: (transaction.expense_type || 'variable') as ExpenseType,
    });
    setShowModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => transactionsAPI.create(payload),
    onSuccess: () => {
      setToast({ message: 'Transacción creada', type: 'success' });
      setShowModal(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
    },
    onError: (error: any) => {
      console.error('Error creating transaction:', error);
      setToast({ 
        message: error.response?.data?.detail || 'Error al crear transacción', 
        type: 'error' 
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string, payload: any }) => transactionsAPI.update(id, payload),
    onSuccess: () => {
      setToast({ message: 'Transacción actualizada', type: 'success' });
      setShowModal(false);
      setEditingTransaction(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
    },
    onError: (error: any) => {
      console.error('Error updating transaction:', error);
      setToast({ 
        message: error.response?.data?.detail || 'Error al actualizar transacción', 
        type: 'error' 
      });
    }
  });

  const handleSubmit = async (data: any, splits?: any[]) => {
    const payload = {
      description: data.description,
      // Convert user input (dollars) to cents for backend
      amount: toCents(data.amount),
      transaction_type: data.transaction_type,
      payment_method: data.payment_method,
      date: data.date + 'T00:00:00',
      category_id: data.category_id ? parseInt(data.category_id) : null,
      account_id: data.account_id ? parseInt(data.account_id) : null,
      expense_type: data.transaction_type === 'expense' ? data.expense_type : null,
      splits: splits && splits.length > 0 ? splits.map(s => ({
        // Convert split amounts to cents
        amount: toCents(s.amount),
        category_id: s.category_id ? parseInt(s.category_id) : null,
        description: s.description || null
      })) : undefined
    };

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setToast({ message: 'Error al acceder al micrófono', type: 'error' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setProcessingAudio(true);
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

      const audioBase64 = base64Audio.split(',')[1];

      const response = await aiAPI.audioToTransactions({
        audio_base64: audioBase64,
        audio_format: 'webm'
      });

      if (response.data.transactions && response.data.transactions.length > 0) {
        const firstTxn = response.data.transactions[0];
        setForm({
          description: firstTxn.description,
          // AI returns cents, use formatMoney for display
          amount: formatMoney(firstTxn.amount),
          transaction_type: firstTxn.transaction_type as TransactionType,
          payment_method: 'transfer' as PaymentMethod,
          date: new Date().toISOString().split('T')[0],
          category_id: firstTxn.category_id?.toString() || '',
          account_id: '',
          expense_type: 'variable' as ExpenseType,
        });
        setShowModal(true);
        setToast({ message: 'Transacción extraída del audio', type: 'success' });
      } else {
        setToast({ message: 'No se detectaron transacciones en el audio', type: 'warning' });
      }
    } catch (error: any) {
      console.error('Error processing audio:', error);
      const detail = error.response?.data?.detail || 'Error al procesar el audio con IA. Intenta de nuevo.';
      setToast({ message: detail, type: 'error' });
      setIsRecording(false);
    } finally {
      setProcessingAudio(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Transacciones</h1>
          <p className="text-slate-300 text-sm lg:text-base">Gestiona tus ingresos y gastos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap"
          >
            <Upload className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
            Importar CSV
          </button>
          <button
            onClick={() => setShowDocumentImportModal(true)}
            className="flex items-center bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-orange-700 hover:to-amber-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap"
          >
            <FileImage className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
            Importar Documento
          </button>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={processingAudio}
            className={`flex items-center text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl transition-all duration-300 text-sm lg:text-base whitespace-nowrap ${
              isRecording
                ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 animate-pulse'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
            } ${processingAudio ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRecording ? <MicOff className="w-4 h-4 lg:w-5 lg:h-5 mr-2" /> : <Mic className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />}
            {isRecording ? 'Detener' : processingAudio ? 'Procesando...' : 'Grabar Voz'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap"
          >
            <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
            Agregar Transacción
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <TransactionForm
          initialData={form}
          initialSplits={editingTransaction?.splits}
          categories={categories}
          accounts={accounts}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowModal(false);
            setEditingTransaction(null);
            setForm(emptyForm);
          }}
          saving={createMutation.isPending || updateMutation.isPending}
          title={editingTransaction ? 'Editar Transacción' : 'Nueva Transacción'}
        />
      )}

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No hay transacciones aún</p>
            <p className="text-slate-500 text-sm mt-2">Agrega tu primera transacción para comenzar</p>
          </div>
        ) : (
          <div>
            <table className="w-full table-fixed">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="w-[40%] md:w-[35%] px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="w-[12%] px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="w-[14%] px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="w-[14%] px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="w-[12%] px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider hidden md:table-cell">
                    Método
                  </th>
                  <th className="w-[10%] md:w-[13%] px-3 lg:px-6 py-3 lg:py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-800/30 divide-y divide-slate-700/50">
                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showImportModal && (
        <CSVImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => queryClient.invalidateQueries()}
        />
      )}

      {showDocumentImportModal && (
        <DocumentImportModal
          onClose={() => setShowDocumentImportModal(false)}
          onSuccess={() => queryClient.invalidateQueries()}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Transacción"
        message="¿Estás seguro de que quieres eliminar esta transacción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Transactions;
