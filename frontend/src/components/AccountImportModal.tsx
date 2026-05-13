import { useState, useEffect } from 'react';
import { intelligenceAPI, accountsAPI, categoriesAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileSpreadsheet, Trash2, Calendar, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import type { Account } from '../types';
import Select from './common/Select';
import { formatMoney } from '../utils/money';

interface AccountImportModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

const AccountImportModal = ({ onClose, onSuccess }: AccountImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  
  // Datos extraídos de la IA
  const [importLogId, setImportLogId] = useState<string | null>(null);
  const [extractedTransactions, setExtractedTransactions] = useState<any[]>([]);
  const [accountMetadata, setAccountMetadata] = useState<any | null>(null);
  
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
      if (dropped.name.endsWith('.csv') || dropped.name.endsWith('.xlsx')) {
        handleFileSelection(dropped);
      } else {
        setResult({ success: false, message: 'Solo se permiten archivos CSV o Excel (.xlsx)' });
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
    setAccountMetadata(null);
    setImportLogId(null);
    setResult(null);
  };

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
        const txsWithSelection = parsed.transactions.map((tx: any) => ({
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
    } catch (error: any) {
      console.error('Processing error:', error);
      const detail = error.response?.data?.detail || 'Error al procesar los movimientos con IA.';
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
      }, 2000);
    } catch (error: any) {
      console.error('Save error:', error);
      const detail = error.response?.data?.detail || 'Error al guardar los movimientos.';
      setResult({ success: false, message: detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Wallet className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Importador IA <span className="text-emerald-400 font-medium text-sm ml-2 px-2 py-1 bg-emerald-500/10 rounded-full">Movimientos</span></h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Paso 1: Selección y Upload */}
          {!extractedTransactions.length && (
            <div className="space-y-6">
              {bankAccounts.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>No tienes cuentas bancarias configuradas.</p>
                  <p className="text-sm opacity-80 mt-1">Crea una cuenta de tipo Ahorro o Corriente primero.</p>
                </div>
              ) : (
                <>
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Cuenta Destino</label>
                    <Select
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
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                      dragActive ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : 'border-slate-600 hover:border-emerald-500 hover:bg-slate-800/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="account-upload"
                    />
                    <label htmlFor="account-upload" className="cursor-pointer flex flex-col items-center">
                      <div className={`${dragActive ? 'text-emerald-400 scale-110' : 'text-slate-400'} transition-all duration-300 mb-4`}>
                        <FileSpreadsheet className="w-16 h-16" />
                      </div>
                      <p className="text-xl text-white font-bold mb-2">
                        {file ? file.name : 'Arrastra tu archivo CSV o Excel aquí'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {file ? 'Haz clic abajo para analizar' : 'Soporta cualquier formato exportado de tu banco (.csv, .xlsx)'}
                      </p>
                    </label>
                  </div>

                  {file && (
                    <button
                      onClick={handleProcess}
                      disabled={processing}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-lg hover:shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Analizando con IA...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
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
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl border border-slate-700 shadow-inner">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Período</span>
                  </div>
                  <p className="text-lg font-semibold text-white">
                    {accountMetadata.period_start || '?'} al {accountMetadata.period_end || '?'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{accountMetadata.bank_name}</p>
                </div>
                
                <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 p-5 rounded-2xl border border-emerald-500/30 shadow-inner relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/20 rounded-full blur-xl"></div>
                  <div className="flex items-center gap-2 text-emerald-400 mb-2 relative z-10">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Ingresos del Periodo</span>
                  </div>
                  <p className="text-2xl font-black text-white relative z-10">
                    +${formatMoney(accountMetadata.total_income_cents || 0)}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-rose-900/40 to-slate-900 p-5 rounded-2xl border border-rose-500/30 shadow-inner relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-rose-500/20 rounded-full blur-xl"></div>
                  <div className="flex items-center gap-2 text-rose-400 mb-2 relative z-10">
                    <TrendingDown className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Egresos del Periodo</span>
                  </div>
                  <p className="text-2xl font-black text-white relative z-10">
                    -${formatMoney(Math.abs(accountMetadata.total_expense_cents || 0))}
                  </p>
                </div>
              </div>

              {/* Tabla de Transacciones */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-700">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Movimientos Detectados ({extractedTransactions.length})</h3>
                  <button
                    onClick={() => {
                      setFile(null);
                      setExtractedTransactions([]);
                      setAccountMetadata(null);
                      setResult(null);
                    }}
                    className="flex items-center text-slate-400 hover:text-white text-sm bg-slate-800 px-3 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Descartar y Rehacer
                  </button>
                </div>
                
                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">
                          <input
                            type="checkbox"
                            checked={extractedTransactions.filter(t => !t.is_duplicate).every(t => t.selected)}
                            onChange={(e) => {
                              setExtractedTransactions(prev =>
                                prev.map(txn => ({ ...txn, selected: e.target.checked && !txn.is_duplicate }))
                              );
                            }}
                            className="mr-2 accent-emerald-500 rounded"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Descripción</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase">Categoría</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {extractedTransactions.map((txn, index) => (
                        <tr key={index} className={`transition-colors ${txn.selected ? 'bg-emerald-500/5' : ''} ${txn.is_duplicate ? 'opacity-50 grayscale' : 'hover:bg-slate-700/30'}`}>
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
                              className="accent-emerald-500 rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{txn.date}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">
                            {txn.description}
                            {txn.beneficiary && (
                              <div className="text-[11px] text-slate-500 font-normal mt-0.5 truncate max-w-[250px]" title={txn.beneficiary}>
                                → {txn.beneficiary}
                              </div>
                            )}
                            {txn.is_duplicate && (
                              <span className="ml-2 px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] rounded-full uppercase font-bold tracking-wider">
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
                              className="bg-slate-700/50 border border-slate-600 rounded-lg text-slate-300 px-2 py-1 text-xs w-full max-w-[200px] focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                            >
                              <option value="" disabled>Seleccione...</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className={`px-4 py-3 text-sm font-bold text-right ${txn.transaction_type === 'income' ? 'text-blue-400' : 'text-rose-400'}`}>
                            {txn.transaction_type === 'income' ? '+' : '-'}${formatMoney(Math.abs(txn.amount_cents))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Controles Finales */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-sm">
                  Se importarán <strong className="text-white">{extractedTransactions.filter(t => t.selected).length}</strong> nuevos movimientos a tu cuenta.
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
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? 'Aplicando...' : 'Confirmar Importación'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mensajes de Resultado */}
          {result && (
            <div className={`rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 ${
              result.success ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
              <span className="font-semibold">{result.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountImportModal;
