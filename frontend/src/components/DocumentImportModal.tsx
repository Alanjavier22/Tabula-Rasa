import { useState, useEffect } from 'react';
import { aiAPI, accountsAPI, categoriesAPI, transactionsAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileImage, FileText, Trash2 } from 'lucide-react';
import type { Category, Account, TransactionType, PaymentMethod, ExpenseType } from '../types';

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
  const [accountId, setAccountId] = useState<number>(1);
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
      setAccounts(accRes.data);
      setCategories(catRes.data);
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
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const documentBase64 = base64Data.split(',')[1];

        const response = await aiAPI.documentToTransactions({
          document_base64: documentBase64,
          document_type: file.type
        });

        if (response.data.transactions && response.data.transactions.length > 0) {
          const transactions = response.data.transactions.map((txn: any) => ({
            ...txn,
            selected: true
          }));
          setExtractedTransactions(transactions);
        } else {
          setResult({ success: false, message: 'No se detectaron transacciones en el documento' });
        }
      };
    } catch (error) {
      console.error('Processing error:', error);
      setResult({ success: false, message: 'Error al procesar el documento' });
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
          amount: txn.amount,
          transaction_type: txn.transaction_type as TransactionType,
          payment_method: 'transfer' as PaymentMethod,
          date: new Date().toISOString().split('T')[0],
          category_id: txn.category_id,
          account_id: accountId,
          expense_type: txn.transaction_type === 'expense' ? 'variable' as ExpenseType : null,
        });
      }
      setResult({ success: true, message: `${selectedTransactions.length} transacción(es) importada(s)` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Save error:', error);
      setResult({ success: false, message: 'Error al guardar transacciones' });
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Importar Documento (IA)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Account Selection */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">Cuenta destino</label>
            <select
              value={accountId}
              onChange={e => setAccountId(parseInt(e.target.value))}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* Drag & Drop Zone */}
          {!extractedTransactions.length && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive ? 'border-purple-500 bg-purple-500/10' : 'border-slate-600 hover:border-purple-500'
              }`}
            >
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="document-upload"
              />
              <label htmlFor="document-upload" className="cursor-pointer">
                <div className={`${dragActive ? 'text-purple-400' : 'text-slate-400'} mx-auto mb-3`}>
                  {getFileIcon()}
                </div>
                <p className="text-white font-medium">
                  {file ? file.name : 'Arrastra tu documento aquí'}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {file ? 'Archivo seleccionado' : 'Imágenes (JPEG, PNG, WebP) o PDF'}
                </p>
              </label>
            </div>
          )}

          {/* Preview */}
          {file && preview && !extractedTransactions.length && (
            <div className="bg-slate-700/30 rounded-lg p-3">
              <p className="text-sm text-slate-300 mb-2">Vista previa:</p>
              <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
            </div>
          )}

          {/* Process Button */}
          {file && !extractedTransactions.length && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 text-sm disabled:opacity-50"
            >
              {processing ? 'Procesando con IA...' : 'Extraer Transacciones con IA'}
            </button>
          )}

          {/* Extracted Transactions Table */}
          {extractedTransactions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Transacciones Extraídas</h3>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setExtractedTransactions([]);
                    setResult(null);
                  }}
                  className="flex items-center text-slate-400 hover:text-white text-sm"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Nuevo documento
                </button>
              </div>
              
              <div className="bg-slate-700/30 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        <input
                          type="checkbox"
                          checked={extractedTransactions.every(t => t.selected)}
                          onChange={(e) => {
                            setExtractedTransactions(prev =>
                              prev.map(txn => ({ ...txn, selected: e.target.checked }))
                            );
                          }}
                          className="mr-2"
                        />
                        Seleccionar
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Categoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-600/50">
                    {extractedTransactions.map((txn, index) => (
                      <tr key={index} className={txn.selected ? 'bg-purple-500/10' : ''}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={txn.selected}
                            onChange={() => toggleTransactionSelection(index)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-white">{txn.description}</td>
                        <td className="px-4 py-3 text-sm text-white">${txn.amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            txn.transaction_type === 'income'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
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

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !extractedTransactions.some(t => t.selected)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : `Guardar ${extractedTransactions.filter(t => t.selected).length} transacción(es)`}
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-3 ${
              result.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              <div className="flex items-center gap-2">
                {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="font-medium">{result.message}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentImportModal;
