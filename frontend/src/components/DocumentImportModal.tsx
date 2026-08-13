import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { aiAPI, accountsAPI, categoriesAPI, transactionsAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileImage, FileText, Trash2 } from 'lucide-react';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType, Cents } from '../types';
import type { AxiosError } from 'axios';
import Select from './common/Select';

interface DocumentImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ExtractedTransaction {
  amount: number;
  description: string;
  category_id: string | null;
  transaction_type: string;
  selected: boolean;
}

const DocumentImportModal = ({ onClose, onSuccess }: DocumentImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [processing, setProcessing] = useState(false);
  const [extractedTransactions, setExtractedTransactions] = useState<ExtractedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      accountsAPI.getAll(),
      categoriesAPI.getAll()
    ]).then(([accRes, catRes]) => {
      // Filtrar solo cuentas corrientes, de ahorros y efectivo
      const bankAccounts = accRes.data.filter((acc: Account) => 
        ['savings', 'checking', 'cash'].includes(acc.account_type)
      );
      setAccounts(bankAccounts);
      setCategories(catRes.data);
      if (bankAccounts.length > 0) {
        setAccountId(bankAccounts[0].id);
      }
    });
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type.startsWith('image/') || dropped.type === 'application/pdf') {
        handleFileSelection(dropped);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    setExtractedTransactions([]);
    setResult(null);
    
    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setProcessing(true);
    setResult(null);
    
    try {
      const response = await aiAPI.parseReceipt(file);

      // El backend devuelve response.data.transactions en su esquema AudioToTxnResponse
      const txnsList = response.data.transactions || [];
      if (txnsList.length > 0) {
        const transactions = txnsList.map((tx) => ({
          description: tx.description,
          amount: tx.amount, // Ya está en centavos
          category_id: tx.category_id || null,
          transaction_type: tx.transaction_type || 'expense',
          selected: true
        }));
        setExtractedTransactions(transactions);
      } else {
        setResult({ success: false, message: 'No se detectaron transacciones en el documento' });
      }
    } catch (error) {
      console.error('Processing error:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al procesar el documento';
      setResult({ success: false, message: detail });
    } finally {
      setProcessing(false);
    }
  };

  const toggleTransactionSelection = (index: number) => {
    setExtractedTransactions(prev =>
      prev.map((txn, i) => i === index ? { ...txn, selected: !txn.selected } : txn)
    );
  };

  const handleSave = async () => {
    const selectedTransactions = extractedTransactions.filter(t => t.selected);
    if (selectedTransactions.length === 0) {
      setResult({ success: false, message: 'Selecciona al menos una transacción' });
      return;
    }

    setSaving(true);
    try {
      for (const txn of selectedTransactions) {
        await transactionsAPI.create({
          description: txn.description,
          amount: txn.amount as Cents,
          transaction_type: txn.transaction_type as TransactionType,
          payment_method: 'transfer' as PaymentMethod,
          date: new Date().toISOString().split('T')[0],
          category_id: txn.category_id || undefined,
          account_id: accountId,
          expense_type: txn.transaction_type === 'expense' ? 'variable' as ExpenseType : undefined,
        });
      }
      setResult({ success: true, message: `${selectedTransactions.length} transacción(es) importada(s)` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Save error:', error);
      const axiosError = error as AxiosError<{ detail?: string }>;
      const detail = axiosError.response?.data?.detail || axiosError.message || 'Error al guardar transacciones';
      setResult({ success: false, message: detail });
    } finally {
      setSaving(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-12 h-12" />;
    if (file.type.startsWith('image/')) return <FileImage className="w-12 h-12" />;
    if (file.type === 'application/pdf') return <FileText className="w-12 h-12" />;
    return <Upload className="w-12 h-12" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{ willChange: 'opacity, backdrop-filter' }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 15 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl relative"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800 sticky top-0 z-[60] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-black text-white tracking-tight">Importador IA <span className="text-blue-400 font-medium text-xs ml-2 px-2 py-0.5 bg-blue-500/10 rounded-full">Documento</span></h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 space-y-4 md:space-y-5">
          {/* Account Selection */}
          <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-700">
            <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Cuenta destino</label>
            <Select
              value={accountId}
              onChange={(value) => setAccountId(value)}
              options={accounts.map(acc => ({ value: acc.id, label: acc.name }))}
            />
          </div>

          {/* Drag & Drop Zone */}
          {!extractedTransactions.length && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-5 md:p-6 text-center transition-all duration-300 ${
                dragActive ? 'border-blue-500 bg-blue-500/10 scale-[1.01]' : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/50'
              }`}
            >
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="document-upload"
              />
              <label htmlFor="document-upload" className="cursor-pointer flex flex-col items-center">
                <div className={`${dragActive ? 'text-blue-400 scale-110' : 'text-slate-400'} transition-all duration-300 mb-2`}>
                  {getFileIcon()}
                </div>
                <p className="text-base text-white font-bold mb-1">
                  {file ? file.name : 'Arrastra tu documento aquí'}
                </p>
                <p className="text-slate-400 text-xs">
                  {file ? 'Haz clic abajo para analizar' : 'Imágenes (JPEG, PNG, WebP) o PDF'}
                </p>
              </label>
            </div>
          )}

          {/* Preview */}
          {file && preview && !extractedTransactions.length && (
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Vista previa:</p>
              <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-md border border-slate-600" />
            </div>
          )}

          {/* Process Button */}
          {file && !extractedTransactions.length && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-blue-500/20 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Procesando con IA...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Extraer Transacciones con IA
                </>
              )}
            </button>
          )}

          {/* Extracted Transactions Table */}
          {extractedTransactions.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Transacciones Extraídas</h3>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setExtractedTransactions([]);
                    setResult(null);
                  }}
                  className="flex items-center gap-2 text-slate-400 hover:text-white text-[10px] font-bold uppercase bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Nuevo documento
                </button>
              </div>
              
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">
                        <input
                          type="checkbox"
                          checked={extractedTransactions.every(t => t.selected)}
                          onChange={(e) => {
                            setExtractedTransactions(prev =>
                              prev.map(txn => ({ ...txn, selected: e.target.checked }))
                            );
                          }}
                          className="mr-2 accent-blue-500 rounded"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Categoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {extractedTransactions.map((txn, index) => (
                      <tr key={index} className={`transition-colors ${txn.selected ? 'bg-blue-500/5' : 'hover:bg-slate-700/30'}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={txn.selected}
                            onChange={() => toggleTransactionSelection(index)}
                            className="accent-blue-500 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-white font-medium">{txn.description}</td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-200">${(txn.amount / 100).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                            txn.transaction_type === 'income'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {txn.transaction_type === 'income' ? 'Ingreso' : 'Gasto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {txn.category_id
                            ? categories.find(c => c.id === txn.category_id)?.name || 'Desconocida'
                            : 'Sin categoría'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-sm">
                  Se importarán <strong className="text-white">{extractedTransactions.filter(t => t.selected).length}</strong> transacciones.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="px-6 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !extractedTransactions.some(t => t.selected)}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500 font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Guardando...
                      </>
                    ) : 'Confirmar Importación'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 ${
              result.success ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
              <span className="font-semibold">{result.message}</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DocumentImportModal;
