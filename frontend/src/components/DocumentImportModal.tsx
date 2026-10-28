import Modal from './common/Modal';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { aiAPI, accountsAPI, categoriesAPI, transactionsAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileImage, FileText, Trash2 } from 'lucide-react';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType, Cents } from '../types';
import type { AxiosError } from 'axios';
import Select from './common/Select';
import { createFileSelectionHandlers, withFirstDocumentFile } from '../utils/fileSelection';

interface DocumentImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ExtractedTransaction {
  id: string;
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
    }).catch(() => {
      setResult({ success: false, message: 'No se pudieron cargar las cuentas y categorías. Cierra el formulario y vuelve a abrirlo para reintentar.' });
    });
  }, []);

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

  const { handleDrag, handleDrop, handleFileSelect } = createFileSelectionHandlers({
    setDragActive,
    onFileSelect: handleFileSelection,
    selectDroppedFile: withFirstDocumentFile,
  });

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
          id: globalThis.crypto.randomUUID(),
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
    <Modal onClose={onClose} label={'Escanear recibo'}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 15 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-surface border border-line rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl relative"
      >
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface sticky top-0 z-[60] ">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-info-soft rounded-lg">
              <FileText className="w-5 h-5 text-info" />
            </div>
            <h2 className="text-lg font-black text-primary tracking-tight">Importador IA <span className="text-info font-medium text-xs ml-2 px-2 py-0.5 bg-info-soft rounded-full">Documento</span></h2>
          </div>
          <button aria-label="Cerrar diálogo" onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 space-y-4 md:space-y-5">
          {/* Account Selection */}
          <div className="bg-canvas p-3.5 rounded-xl border border-line">
            <label htmlFor="document-import-account" className="block text-xs font-black text-muted mb-1.5 uppercase tracking-wider">Cuenta destino</label>
            <Select
              id="document-import-account"
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
                dragActive ? 'border-line bg-info-soft scale-[1.01]' : 'border-line hover:border-line hover:bg-surface'
              }`}
            >
              <input
                type="file" aria-label="Seleccionar recibo o documento"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="sr-only"
                id="document-upload"
              />
              <label htmlFor="document-upload" className="cursor-pointer flex flex-col items-center">
                <div className={`${dragActive ? 'text-info scale-110' : 'text-muted'} transition-all duration-300 mb-2`}>
                  {getFileIcon()}
                </div>
                <p className="text-base text-primary font-bold mb-1">
                  {file ? file.name : 'Arrastra tu documento aquí'}
                </p>
                <p className="text-muted text-xs">
                  {file ? 'Haz clic abajo para analizar' : 'Imágenes (JPEG, PNG, WebP) o PDF'}
                </p>
              </label>
            </div>
          )}

          {/* Preview */}
          {file && preview && !extractedTransactions.length && (
            <div className="bg-canvas rounded-xl p-3 border border-line">
              <p className="text-xs font-bold text-muted uppercase mb-2 tracking-wider">Vista previa:</p>
              <img src={preview} alt="Vista previa del documento" className="max-h-48 mx-auto rounded-lg shadow-md border border-line" />
            </div>
          )}

          {/* Process Button */}
          {file && !extractedTransactions.length && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full py-3 rounded-xl bg-surface-soft   text-primary font-bold text-sm hover:shadow-lg  hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin"></div>
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
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Transacciones Extraídas</h3>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setExtractedTransactions([]);
                    setResult(null);
                  }}
                  className="flex items-center gap-2 text-muted hover:text-primary text-xs font-bold uppercase bg-surface px-3 py-1.5 rounded-lg border border-line transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Nuevo documento
                </button>
              </div>

              <div className="bg-canvas rounded-2xl border border-line overflow-hidden">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10  shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">
                        <input
                          type="checkbox"
                          checked={extractedTransactions.every(t => t.selected)}
                          onChange={(e) => {
                            setExtractedTransactions(prev =>
                              prev.map(txn => ({ ...txn, selected: e.target.checked }))
                            );
                          }}
                          className="mr-2 accent-info rounded"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Categoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {extractedTransactions.map((txn, index) => (
                      <tr key={txn.id} className={`transition-colors ${txn.selected ? 'bg-info-soft' : 'hover:bg-surface'}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={txn.selected}
                            onChange={() => toggleTransactionSelection(index)}
                            className="accent-info rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-primary font-medium">{txn.description}</td>
                        <td className="px-4 py-3 text-sm font-bold text-primary">${(txn.amount / 100).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full ${
                            txn.transaction_type === 'income'
                              ? 'bg-success-soft text-success'
                              : 'bg-danger-soft text-danger'
                          }`}>
                            {txn.transaction_type === 'income' ? 'Ingreso' : 'Gasto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {txn.category_id
                            ? categories.find(c => c.id === txn.category_id)?.name || 'Desconocida'
                            : 'Sin categoría'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-line">
                <p className="text-muted text-sm">
                  Se importarán <strong className="text-primary">{extractedTransactions.filter(t => t.selected).length}</strong> transacciones.
                </p>
                <div className="flex gap-3">
                  <button aria-label="Cerrar diálogo"
                    onClick={onClose}
                    className="px-6 py-3 rounded-xl border border-line text-muted hover:bg-surface hover:text-primary transition-colors font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !extractedTransactions.some(t => t.selected)}
                    className="px-8 py-3 rounded-xl bg-surface-soft   text-primary   font-bold shadow-lg  transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin"></div>
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
              result.success ? 'bg-success-soft border border-line text-success' : 'bg-danger-soft border border-line text-danger'
            }`}>
              {result.success ? <CheckCircle className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
              <span className="font-semibold">{result.message}</span>
            </div>
          )}
        </div>
      </motion.div>
    </Modal>
  );
};

export default DocumentImportModal;
