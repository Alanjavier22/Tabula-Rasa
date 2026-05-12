import { useState, memo, useDeferredValue, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { transactionsAPI, categoriesAPI, accountsAPI, goalsAPI } from '../services/api';
import type { TransactionType, PaymentMethod, ExpenseType } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Upload, Mic, MicOff, FileImage, Search, Bot, CreditCard } from 'lucide-react';
import { aiAPI } from '../services/api';
import AccountImportModal from '../components/AccountImportModal';
import DocumentImportModal from '../components/DocumentImportModal';
import StatementImportModal from '../components/StatementImportModal';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';
import DatePicker from '../components/common/DatePicker';
import { VirtualTransactionList } from '../components/transactions/VirtualTransactionList';

const emptyForm = {
  description: '',
  amount: '',
  transaction_type: 'expense' as TransactionType,
  payment_method: 'transfer' as PaymentMethod,
  date: new Date().toISOString(),
  category_id: '',
  account_id: '',
  expense_type: 'variable' as ExpenseType,
  goal_id: '',
};

const TransactionRow = memo(({ transaction, onEdit, onDelete }: { transaction: any; onEdit: (t: any) => void; onDelete: (id: string) => void }) => (
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
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDocumentImportModal, setShowDocumentImportModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [processingAudio, setProcessingAudio] = useState(false);
  
  // Search and date range filters
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // AI categorization status
  const [isAICategorizing, setIsAICategorizing] = useState(false);
  const [aiCategorizationTimer, setAiCategorizationTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Fetch transactions with React Query
  const { data: transactions, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsAPI.getAll().then(res => res.data),
  });

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesAPI.getAll().then(res => res.data),
  });

  // Fetch accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsAPI.getAll().then(res => res.data),
  });

  // Fetch goals
  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsAPI.getAll().then(res => res.data),
  });

  const loading = transactionsLoading || categoriesLoading || accountsLoading || goalsLoading;

  // FASE 6.2: Optimistic delete handler
  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    
    try {
      await transactionsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Transacción eliminada', type: 'success' });
      setDeleteConfirm({ isOpen: false, id: null });
      refetchTransactions();
      
      // Invalidate dashboard queries
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlowForecast'] });
      queryClient.invalidateQueries({ queryKey: ['netWorth'] });
      queryClient.invalidateQueries({ queryKey: ['vehicleTelemetry'] });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      setToast({ message: 'Error al eliminar transacción', type: 'error' });
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (transaction: any) => {
    setEditingTransaction(transaction);
    setForm({
      description: transaction.description || '',
      amount: formatMoney(transaction.amount),
      transaction_type: transaction.transaction_type as TransactionType,
      payment_method: transaction.payment_method || 'transfer' as PaymentMethod,
      date: transaction.date || new Date().toISOString(),
      category_id: transaction.category_id || '',
      account_id: transaction.account_id || '',
      expense_type: 'variable' as ExpenseType,
      goal_id: transaction.goal_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (formData: any) => {
    try {
      if (editingTransaction) {
        const amountCents = toCents(parseFloat(formData.amount.replace(/[^0-9.-]/g, '')));
        await transactionsAPI.update(editingTransaction.id, {
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
          payment_method: formData.payment_method,
          expense_type: formData.expense_type,
          goal_id: formData.goal_id || null,
        });
        setToast({ message: 'Transacción actualizada', type: 'success' });
      } else {
        const amountCents = toCents(parseFloat(formData.amount.replace(/[^0-9.-]/g, '')));
        await transactionsAPI.create({
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
          payment_method: formData.payment_method,
          expense_type: formData.expense_type,
          goal_id: formData.goal_id || null,
        });
        setToast({ message: 'Transacción creada', type: 'success' });
      }
      
      setShowModal(false);
      setEditingTransaction(null);
      setForm(emptyForm);
      refetchTransactions();

      // Invalidate dashboard queries
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlowForecast'] });
      queryClient.invalidateQueries({ queryKey: ['netWorth'] });
      queryClient.invalidateQueries({ queryKey: ['vehicleTelemetry'] });
    } catch (error) {
      console.error('Error saving transaction:', error);
      setToast({ message: 'Error al guardar transacción', type: 'error' });
    }
  };

  // Trigger AI categorization status after CSV import
  const handleImportSuccess = (importedCount: number) => {
    if (importedCount > 0) {
      setIsAICategorizing(true);
      setToast({ 
        message: `✅ ${importedCount} transacciones importadas. La IA está analizando y categorizando en segundo plano...`, 
        type: 'success' 
      });
      
      // Poll for 30 seconds to show AI categorization progress
      setAiCategorizationTimer(
        setTimeout(() => {
          setIsAICategorizing(false);
          refetchTransactions();
          queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
          queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          queryClient.invalidateQueries({ queryKey: ['expenseBreakdown'] });
        }, 30000)
      );
      
      // Also refetch immediately to show imported transactions
      refetchTransactions();
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlowForecast'] });
      queryClient.invalidateQueries({ queryKey: ['netWorth'] });
      queryClient.invalidateQueries({ queryKey: ['vehicleTelemetry'] });
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (aiCategorizationTimer) {
        clearTimeout(aiCategorizationTimer);
      }
    };
  }, [aiCategorizationTimer]);

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
          goal_id: '',
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

  // Filter transactions based on search and date range
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter((txn: any) => {
      const matchesSearch = !deferredSearchQuery || 
        txn.description?.toLowerCase().includes(deferredSearchQuery.toLowerCase());
      
      const txnDate = txn.date;
      const matchesStartDate = !startDate || txnDate >= startDate;
      const matchesEndDate = !endDate || txnDate <= endDate;
      
      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [transactions, deferredSearchQuery, startDate, endDate]);

  // Compute summary for filtered transactions
  const summary = useMemo(() => {
    return filteredTransactions.reduce((acc, txn) => {
      const amount = txn.amount;
      if (txn.transaction_type === 'income') {
        acc.income += amount;
      } else {
        acc.expenses += amount;
      }
      return acc;
    }, { income: 0, expenses: 0 });
  }, [filteredTransactions]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full relative">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[10%] -right-[10%] w-[30%] h-[30%] bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[30%] h-[30%] bg-purple-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold tracking-widest uppercase mb-1">
              <div className="w-8 h-[1px] bg-purple-500/50"></div>
              <span>Tabula Rasa</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
              Libro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Transacciones</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium">Gestiona tu flujo de caja con precisión</p>
          </motion.div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800/50 backdrop-blur-md p-1 rounded-2xl border border-slate-700/50 shadow-xl">
              <button
                onClick={() => setShowImportModal(true)}
                className="p-2 lg:px-4 py-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-slate-700/50 transition-all flex items-center gap-2 text-sm font-semibold whitespace-nowrap"
                title="Importar Movimientos de Cuenta"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Movimientos</span>
              </button>
              <button
                onClick={() => setShowDocumentImportModal(true)}
                className="p-2 lg:px-4 py-2 rounded-xl text-blue-400 hover:text-blue-300 hover:bg-slate-700/50 transition-all flex items-center gap-2 text-sm font-semibold whitespace-nowrap"
                title="Escanear Recibo Individual"
              >
                <FileImage className="w-4 h-4" />
                <span className="hidden sm:inline">Escanear Recibo</span>
              </button>
              <button
                onClick={() => setShowStatementModal(true)}
                className="p-2 lg:px-4 py-2 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-slate-700/50 transition-all flex items-center gap-2 text-sm font-semibold whitespace-nowrap"
                title="Importar Estado de Cuenta de Tarjeta de Crédito"
              >
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">Est. Cuenta</span>
              </button>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={processingAudio}
                className={`p-2 lg:px-4 py-2 rounded-xl transition-all flex items-center gap-2 text-sm font-semibold whitespace-nowrap ${
                  isRecording 
                    ? 'text-red-400 bg-red-500/10 animate-pulse' 
                    : 'text-blue-400 hover:text-blue-300 hover:bg-slate-700/50'
                }`}
                title="Grabar Voz"
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span className="hidden sm:inline">{processingAudio ? 'Procesando...' : 'Voz'}</span>
              </button>
            </div>
            
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-2xl hover:shadow-lg hover:shadow-purple-500/20 transition-all font-bold group whitespace-nowrap h-full"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              <span>Nueva Transacción</span>
            </button>
          </div>
        </div>

        {/* Mini-Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 p-4 rounded-2xl relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Ingresos</p>
            <p className="text-2xl font-black text-emerald-400">${formatMoney(summary.income)}</p>
          </div>
          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 p-4 rounded-2xl relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Gastos</p>
            <p className="text-2xl font-black text-rose-400">${formatMoney(summary.expenses)}</p>
          </div>
          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 p-4 rounded-2xl relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Balance Neto</p>
            <p className={`text-2xl font-black ${summary.income >= summary.expenses ? 'text-blue-400' : 'text-rose-400'}`}>
              ${formatMoney(summary.income - summary.expenses)}
            </p>
          </div>
        </div>

        {/* AI Categorization Banner */}
        {isAICategorizing && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 mb-6 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
              <Bot className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-purple-300 font-bold">IA Categorizando...</p>
              <p className="text-purple-400/70 text-xs">Analizando descripciones para asignar categorías automáticamente.</p>
            </div>
          </motion.div>
        )}

        <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="md:col-span-2 lg:col-span-3 relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <DatePicker
                value={startDate}
                onChange={(value) => setStartDate(value)}
                placeholder="Desde"
              />
            </div>
            <div className="md:col-span-1">
              <DatePicker
                value={endDate}
                onChange={(value) => setEndDate(value)}
                placeholder="Hasta"
              />
            </div>
          </div>
        </div>

        {/* Transaction List Container */}
        <div className={`bg-slate-800/20 backdrop-blur-xl rounded-2xl border border-slate-700/30 overflow-hidden transition-opacity duration-200 ${searchQuery !== deferredSearchQuery ? 'opacity-50' : ''}`}>
          {filteredTransactions.length > 0 ? (
            <VirtualTransactionList
              transactions={filteredTransactions}
              rowHeight={70}
              visibleRowCount={15}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                <Search className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-400 text-lg font-medium">No se encontraron transacciones</p>
              <p className="text-slate-600 text-sm mt-2">Intenta ajustar los filtros de búsqueda</p>
            </div>
          )}
        </div>

      {showImportModal && (
        <AccountImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {showDocumentImportModal && (
        <DocumentImportModal
          onClose={() => setShowDocumentImportModal(false)}
          onSuccess={() => {
            setToast({ message: 'Recibo procesado y guardado con éxito', type: 'success' });
            refetchTransactions();
          }}
        />
      )}

      {showStatementModal && (
        <StatementImportModal
          onClose={() => setShowStatementModal(false)}
          onSuccess={(count) => {
            setToast({ message: `¡Excelente! ${count} transacciones importadas y balance de tarjeta actualizado.`, type: 'success' });
            refetchTransactions();
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            queryClient.invalidateQueries({ queryKey: ['statements'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
          }}
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

      {showModal && (
        <TransactionForm
          initialData={form}
          initialSplits={editingTransaction?.splits}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowModal(false);
            setEditingTransaction(null);
            setForm(emptyForm);
          }}
          saving={false}
          title={editingTransaction ? 'Editar Transacción' : 'Nueva Transacción'}
          categories={categories || []}
          accounts={accounts || []}
          goals={goals || []}
        />
      )}
    </div>
  </div>
);
};

export default Transactions;
