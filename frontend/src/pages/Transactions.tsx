import { useState, memo, useDeferredValue } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { reportingService } from '../services/ReportingService';
import type { LocalTransaction } from '../db/db';
import type { TransactionType, PaymentMethod, ExpenseType } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Upload, Mic, MicOff, FileImage, Search, Calendar } from 'lucide-react';
import { aiAPI } from '../services/api';
import CSVImportModal from '../components/CSVImportModal';
import DocumentImportModal from '../components/DocumentImportModal';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';
import { VirtualTransactionList } from '../components/transactions/VirtualTransactionList';

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

const TransactionRow = memo(({ transaction, onEdit, onDelete }: { transaction: LocalTransaction & { category?: any }; onEdit: (t: LocalTransaction & { category?: any }) => void; onDelete: (id: string) => void }) => (
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<LocalTransaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDocumentImportModal, setShowDocumentImportModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processingAudio, setProcessingAudio] = useState(false);
  
  // FASE 6.2: Search and date range filters
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // FASE 6.2: Live query for transactions with categories
  const transactions = useLiveQuery(
    () => reportingService.getTransactionsWithCategories(undefined, undefined, startDate, endDate, deferredSearchQuery),
    [],
    []
  );

  // FASE 6.2: Live query for categories
  const categories = useLiveQuery(
    () => db.categories.filter(cat => !cat.is_deleted).toArray(),
    [],
    []
  );

  // FASE 6.2: Live query for accounts
  const accounts = useLiveQuery(
    () => db.accounts.filter(acc => !acc.is_deleted).toArray(),
    [],
    []
  );

  const loading = !transactions && !categories && !accounts;

  // FASE 6.2: Optimistic delete handler
  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    
    try {
      await reportingService.deleteTransactionOptimistic(deleteConfirm.id);
      setToast({ message: 'Transacción eliminada', type: 'success' });
      setDeleteConfirm({ isOpen: false, id: null });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      setToast({ message: 'Error al eliminar transacción', type: 'error' });
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (transaction: LocalTransaction) => {
    setEditingTransaction(transaction);
    setForm({
      description: transaction.description || '',
      amount: formatMoney(transaction.amount),
      transaction_type: transaction.transaction_type as TransactionType,
      payment_method: (transaction as any).payment_method || 'transfer' as PaymentMethod,
      date: transaction.date,
      category_id: transaction.category_id || '',
      account_id: (transaction as any).account_id || '',
      expense_type: 'variable' as ExpenseType,
    });
    setShowModal(true);
  };

  // FASE 6.2: Optimistic create/update handler
  const handleSubmit = async (formData: any) => {
    try {
      if (editingTransaction) {
        // Update existing transaction
        const amountCents = toCents(parseFloat(formData.amount.replace(/[^0-9.-]/g, '')));
        await reportingService.updateTransactionOptimistic(editingTransaction.id, {
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
        });
        setToast({ message: 'Transacción actualizada', type: 'success' });
      } else {
        // Create new transaction
        const amountCents = toCents(parseFloat(formData.amount.replace(/[^0-9.-]/g, '')));
        await reportingService.createTransactionOptimistic({
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
        });
        setToast({ message: 'Transacción creada', type: 'success' });
      }
      
      setShowModal(false);
      setEditingTransaction(null);
      setForm(emptyForm);
    } catch (error) {
      console.error('Error saving transaction:', error);
      setToast({ message: 'Error al guardar transacción', type: 'error' });
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
          initialSplits={undefined}
          categories={categories || []}
          accounts={accounts || []}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowModal(false);
            setEditingTransaction(null);
            setForm(emptyForm);
          }}
          saving={false}
          title={editingTransaction ? 'Editar Transacción' : 'Nueva Transacción'}
        />
      )}

      {/* FASE 6.2: Search and Date Range Filters */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* FASE 6.2: Virtual Transaction List */}
      <div className={`bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 transition-opacity duration-200 ${searchQuery !== deferredSearchQuery ? 'opacity-70' : ''}`}>
        {transactions && transactions.length > 0 ? (
          <VirtualTransactionList
            transactions={transactions}
            rowHeight={60}
            visibleRowCount={20}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No hay transacciones aún</p>
            <p className="text-slate-500 text-sm mt-2">Agrega tu primera transacción para comenzar</p>
          </div>
        )}
      </div>
      {showImportModal && (
        <CSVImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {}}
        />
      )}

      {showDocumentImportModal && (
        <DocumentImportModal
          onClose={() => setShowDocumentImportModal(false)}
          onSuccess={() => {}}
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
