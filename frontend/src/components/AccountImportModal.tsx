import Modal from './common/Modal';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { intelligenceAPI, accountsAPI, categoriesAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileSpreadsheet, Trash2, Calendar, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import type { Account, Category, AccountExtractedTransaction, AccountParsingResponse } from '../types';
import type { AxiosError } from 'axios';
import Select from './common/Select';
import { formatMoney } from '../utils/money';
import { createFileSelectionHandlers } from '../utils/fileSelection';

interface AccountImportModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type ExtractedTransactionRow = AccountExtractedTransaction & { selected: boolean };

const AccountImportModal = ({ onClose, onSuccess }: AccountImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [processing, setProcessing] = useState(false);

  // Datos extraídos de la IA
  const [importLogId, setImportLogId] = useState<string | null>(null);
  const [extractedTransactions, setExtractedTransactions] = useState<ExtractedTransactionRow[]>([]);
  const [accountMetadata, setAccountMetadata] = useState<Omit<AccountParsingResponse, 'transactions'> | null>(null);

  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Cargar solo cuentas de tipo Ahorro, Corriente o Efectivo
    accountsAPI.getAll().then(res => {
      const bAccounts = res.data.filter((acc: Account) =>
        ['savings', 'checking', 'cash'].includes(acc.account_type)
      );
      setBankAccounts(bAccounts);
      if (bAccounts.length > 0) {
        setAccountId(bAccounts[0].id.toString());
      }
    });

    categoriesAPI.getAll().then(res => {
      setCategories(res.data);
    });
  }, []);

  const handleDroppedFile = (dropped: File) => {
    if (dropped.name.endsWith('.csv') || dropped.name.endsWith('.xlsx')) {
      handleFileSelection(dropped);
    } else {
      setResult({ success: false, message: 'Solo se permiten archivos CSV o Excel (.xlsx)' });
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    setExtractedTransactions([]);
    setAccountMetadata(null);
    setImportLogId(null);
    setResult(null);
  };

  const { handleDrag, handleDrop, handleFileSelect } = createFileSelectionHandlers({
    setDragActive,
    onFileSelect: handleFileSelection,
    onDropFile: handleDroppedFile,
  });

  const handleProcess = async () => {
    if (!file || !accountId) return;
    setProcessing(true);
    setResult(null);

    try {
      const response = await intelligenceAPI.uploadAccountDocument(accountId, file);

      setImportLogId(response.data.import_log_id);

      const parsed = response.data.parsed_data;
      if (parsed.transactions && parsed.transactions.length > 0) {
        // Seleccionamos por defecto las que NO son duplicadas
        const txsWithSelection = parsed.transactions.map((tx) => ({
          ...tx,
          selected: !tx.is_duplicate
        }));

        setExtractedTransactions(txsWithSelection);

        // Extraemos los metadatos globales
        setAccountMetadata({
          bank_name: parsed.bank_name,
          account_type: parsed.account_type,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          total_income_cents: parsed.total_income_cents,
          total_expense_cents: parsed.total_expense_cents
        });
      } else {
        setResult({ success: false, message: 'No se detectaron transacciones válidas en el archivo.' });
      }
    } catch (error) {
      console.error('Processing error:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al procesar los movimientos con IA.';
      setResult({ success: false, message: detail });
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!importLogId) return;

    const selectedTransactions = extractedTransactions.filter(t => t.selected);
    if (selectedTransactions.length === 0) {
      setResult({ success: false, message: 'Selecciona al menos una transacción para importar.' });
      return;
    }

    setSaving(true);
    try {
      const response = await intelligenceAPI.confirmAccountImport(
        importLogId,
        selectedTransactions
      );

      setResult({ success: true, message: `Éxito: ${response.data.imported_count} movimientos importados correctamente.` });

      setTimeout(() => {
        onSuccess(response.data.imported_count);
        onClose();
        setSaving(false);
      }, 2000);
    } catch (error) {
      console.error('Save error:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al guardar los movimientos.';
      setResult({ success: false, message: detail });
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} label={'Importar movimientos'}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 15 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-surface border border-line rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface sticky top-0 z-10 ">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-success-soft rounded-lg">
              <Wallet className="w-5 h-5 text-success" />
            </div>
            <h2 className="text-lg font-black text-primary tracking-tight">Importador IA <span className="text-success font-medium text-xs ml-2 px-2 py-0.5 bg-success-soft rounded-full">Movimientos</span></h2>
          </div>
          <button aria-label="Cerrar diálogo" onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 space-y-4 md:space-y-5">
          {/* Paso 1: Selección y Upload */}
          {!extractedTransactions.length && (
            <div className="space-y-6">
              {bankAccounts.length === 0 ? (
                <div className="p-4 bg-warning-soft border border-line rounded-xl text-warning text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>No tienes cuentas bancarias configuradas.</p>
                  <p className="text-sm opacity-80 mt-1">Crea una cuenta de tipo Ahorro o Corriente primero.</p>
                </div>
              ) : (
                <>
                  <div className="bg-canvas p-3.5 rounded-xl border border-line">
                    <label htmlFor="account-import-account" className="block text-xs font-black text-muted mb-1.5 uppercase tracking-wider">Cuenta Destino</label>
                    <Select
                      id="account-import-account"
                      value={accountId}
                      onChange={(value) => setAccountId(value)}
                      options={bankAccounts.map(acc => ({ value: acc.id.toString(), label: acc.name }))}
                    />
                  </div>

                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-5 md:p-6 text-center transition-all duration-300 ${
                      dragActive ? 'border-line bg-success-soft scale-[1.01]' : 'border-line hover:border-line hover:bg-surface'
                    }`}
                  >
                    <input
                      type="file" aria-label="Seleccionar archivo de movimientos"
                      accept=".csv,.xlsx"
                      onChange={handleFileSelect}
                      className="sr-only"
                      id="account-upload"
                    />
                    <label htmlFor="account-upload" className="cursor-pointer flex flex-col items-center">
                      <div className={`${dragActive ? 'text-success scale-110' : 'text-muted'} transition-all duration-300 mb-2`}>
                        <FileSpreadsheet className="w-12 h-12" />
                      </div>
                      <p className="text-base text-primary font-bold mb-1">
                        {file ? file.name : 'Arrastra tu archivo CSV o Excel aquí'}
                      </p>
                      <p className="text-muted text-xs">
                        {file ? 'Haz clic abajo para analizar' : 'Soporta cualquier formato exportado de tu banco (.csv, .xlsx)'}
                      </p>
                    </label>
                  </div>

                  {file && (
                    <button
                      onClick={handleProcess}
                      disabled={processing}
                      className="w-full py-3 rounded-xl bg-surface-soft   text-primary font-bold text-sm hover:shadow-lg  hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin"></div>
                          Analizando con IA...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Extraer Movimientos Inteligente
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paso 2: Auditoría y Confirmación */}
          {extractedTransactions.length > 0 && accountMetadata && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Tarjetas de Resumen (Metadata) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner">
                  <div className="flex items-center gap-2 text-muted mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Período</span>
                  </div>
                  <p className="text-lg font-semibold text-primary">
                    {accountMetadata.period_start || '?'} al {accountMetadata.period_end || '?'}
                  </p>
                  <p className="text-xs text-muted mt-1">{accountMetadata.bank_name}</p>
                </div>

                <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-success-soft rounded-full "></div>
                  <div className="flex items-center gap-2 text-success mb-2 relative z-10">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Ingresos del Periodo</span>
                  </div>
                  <p className="text-2xl font-black text-primary relative z-10">
                    +${formatMoney(accountMetadata.total_income_cents || 0)}
                  </p>
                </div>

                <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-danger-soft rounded-full "></div>
                  <div className="flex items-center gap-2 text-danger mb-2 relative z-10">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Egresos del Periodo</span>
                  </div>
                  <p className="text-2xl font-black text-primary relative z-10">
                    -${formatMoney(Math.abs(accountMetadata.total_expense_cents || 0))}
                  </p>
                </div>
              </div>

              {/* Tabla de Transacciones */}
              <div className="bg-canvas rounded-2xl border border-line overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-surface border-b border-line">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Movimientos Detectados ({extractedTransactions.length})</h3>
                  <button
                    onClick={() => {
                      setFile(null);
                      setExtractedTransactions([]);
                      setAccountMetadata(null);
                      setResult(null);
                    }}
                    className="flex items-center text-muted hover:text-primary text-sm bg-surface px-3 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Descartar y Rehacer
                  </button>
                </div>

                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10  shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">
                          <input
                            type="checkbox"
                            checked={extractedTransactions.filter(t => !t.is_duplicate).every(t => t.selected)}
                            onChange={(e) => {
                              setExtractedTransactions(prev =>
                                prev.map(txn => ({ ...txn, selected: e.target.checked && !txn.is_duplicate }))
                              );
                            }}
                            className="mr-2 accent-success rounded"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Descripción</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Categoría</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-muted uppercase">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {extractedTransactions.map((txn, index) => (
                        <tr key={txn.fingerprint} className={`transition-colors ${txn.selected ? 'bg-success-soft' : ''} ${txn.is_duplicate ? 'opacity-50 grayscale' : 'hover:bg-surface'}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={txn.selected}
                              disabled={txn.is_duplicate}
                              onChange={() => {
                                setExtractedTransactions(prev =>
                                  prev.map((t, i) => i === index ? { ...t, selected: !t.selected } : t)
                                );
                              }}
                              className="accent-success rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-muted">{txn.date}</td>
                          <td className="px-4 py-3 text-sm text-primary font-medium">
                            {txn.description}
                            {txn.beneficiary && (
                              <div className="text-xs text-muted font-normal mt-0.5 truncate max-w-[250px]" title={txn.beneficiary}>
                                → {txn.beneficiary}
                              </div>
                            )}
                            {txn.is_duplicate && (
                              <span className="ml-2 px-2 py-0.5 bg-danger-soft text-danger text-xs rounded-full uppercase font-bold tracking-wider">
                                Duplicado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <select
                              value={txn.category_id || ''}
                              onChange={(e) => {
                                const newCategoryId = e.target.value;
                                const newCategoryName = categories.find(c => c.id === newCategoryId)?.name || '';
                                setExtractedTransactions(prev =>
                                  prev.map((t, i) => i === index ? { ...t, category_id: newCategoryId, category_name: newCategoryName } : t)
                                );
                              }}
                              className="bg-surface border border-line rounded-lg text-muted px-2 py-1 text-xs w-full max-w-[200px] focus:outline-none focus:ring-1 focus:ring-success focus:border-line transition-colors"
                            >
                              <option value="" disabled>Seleccione...</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className={`px-4 py-3 text-sm font-bold text-right ${txn.transaction_type === 'income' ? 'text-info' : 'text-danger'}`}>
                            {txn.transaction_type === 'income' ? '+' : '-'}${formatMoney(Math.abs(txn.amount_cents))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Controles Finales */}
              <div className="flex items-center justify-between pt-4 border-t border-line">
                <p className="text-muted text-sm">
                  Se importarán <strong className="text-primary">{extractedTransactions.filter(t => t.selected).length}</strong> nuevos movimientos a tu cuenta.
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
                        Aplicando...
                      </>
                    ) : 'Confirmar Importación'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mensajes de Resultado */}
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

export default AccountImportModal;
