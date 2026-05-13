import { useState, useEffect } from 'react';
import { intelligenceAPI, accountsAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle, FileText, Trash2, CreditCard, Calendar, DollarSign, User } from 'lucide-react';
import type { Account } from '../types';
import Select from './common/Select';
import { formatMoney } from '../utils/money';

interface StatementImportModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

const StatementImportModal = ({ onClose, onSuccess }: StatementImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [creditCardAccounts, setCreditCardAccounts] = useState<Account[]>([]);
  const [processing, setProcessing] = useState(false);
  
  // Datos extraídos de la IA
  const [importLogId, setImportLogId] = useState<string | null>(null);
  const [extractedTransactions, setExtractedTransactions] = useState<any[]>([]);
  const [statementMetadata, setStatementMetadata] = useState<any | null>(null);
  const [auditInfo, setAuditInfo] = useState<any | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Cargar solo cuentas de tipo Tarjeta de Crédito
    accountsAPI.getAll().then(res => {
      const ccAccounts = res.data.filter((acc: Account) => acc.account_type === 'credit_card');
      setCreditCardAccounts(ccAccounts);
      if (ccAccounts.length > 0) {
        setAccountId(ccAccounts[0].id.toString());
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
    setStatementMetadata(null);
    setImportLogId(null);
    setResult(null);
  };

  const handleProcess = async () => {
    if (!file || !accountId) return;
    setProcessing(true);
    setResult(null);
    
    try {
      const response = await intelligenceAPI.uploadStatement(accountId, file);
      
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
        setStatementMetadata({
          issuer_identity: parsed.issuer_identity,
          statement_period: parsed.statement_period,
          statement_month: parsed.statement_month,
          statement_year: parsed.statement_year,
          statement_balance_cents: parsed.statement_balance_cents,
          payment_due_date: parsed.payment_due_date,
          cut_off_date: parsed.cut_off_date,
          total_new_consumos_cents: parsed.total_new_consumos_cents,
          total_pagos_cents: parsed.total_pagos_cents,
          credit_limit_cents: parsed.credit_limit_cents,
          user_share_cents: parsed.statement_balance_cents, // Por defecto el usuario asume todo
          debt_shares: []
        });
        
        setAuditInfo(parsed.audit);
      } else {
        setResult({ success: false, message: 'No se detectaron transacciones en el documento.' });
      }
    } catch (error: any) {
      console.error('Processing error:', error);
      const detail = error.response?.data?.detail || 'Error al procesar el estado de cuenta con IA.';
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
      // Enviamos al backend la confirmación junto con los metadatos de deuda para crear el CreditCardStatement
      const response = await intelligenceAPI.confirmImport(
        importLogId, 
        selectedTransactions,
        statementMetadata
      );
      
      setResult({ success: true, message: `Éxito: ${response.data.imported_count} transacciones importadas y deudas actualizadas.` });
      
      setTimeout(() => {
        onSuccess(response.data.imported_count);
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Save error:', error);
      const detail = error.response?.data?.detail || 'Error al guardar el estado de cuenta.';
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
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <CreditCard className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Importador IA <span className="text-purple-400 font-medium text-sm ml-2 px-2 py-1 bg-purple-500/10 rounded-full">Estados de Cuenta</span></h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Paso 1: Selección y Upload */}
          {!extractedTransactions.length && (
            <div className="space-y-6">
              {creditCardAccounts.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>No tienes tarjetas de crédito configuradas.</p>
                  <p className="text-sm opacity-80 mt-1">Crea una cuenta de tipo "Tarjeta de Crédito" primero.</p>
                </div>
              ) : (
                <>
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="block text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Tarjeta Destino</label>
                    <Select
                      value={accountId}
                      onChange={(value) => setAccountId(value)}
                      options={creditCardAccounts.map(acc => ({ value: acc.id.toString(), label: acc.name }))}
                    />
                  </div>

                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
                      dragActive ? 'border-purple-500 bg-purple-500/10 scale-[1.02]' : 'border-slate-600 hover:border-purple-500 hover:bg-slate-800/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="statement-upload"
                    />
                    <label htmlFor="statement-upload" className="cursor-pointer flex flex-col items-center">
                      <div className={`${dragActive ? 'text-purple-400 scale-110' : 'text-slate-400'} transition-all duration-300 mb-4`}>
                        <FileText className="w-16 h-16" />
                      </div>
                      <p className="text-xl text-white font-bold mb-2">
                        {file ? file.name : 'Arrastra tu PDF aquí'}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {file ? 'Haz clic abajo para analizar' : 'Soporta PDFs y capturas de imagen'}
                      </p>
                    </label>
                  </div>

                  {file && (
                    <button
                      onClick={handleProcess}
                      disabled={processing}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-lg hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Auditando Estado de Cuenta...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Analizar con Inteligencia Artificial
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paso 2: Auditoría y Confirmación */}
          {extractedTransactions.length > 0 && statementMetadata && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Tarjeta de Resumen (Metadata) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl border border-slate-700 shadow-inner">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Período</span>
                  </div>
                  <p className="text-lg font-semibold text-white">{statementMetadata.statement_period}</p>
                  {statementMetadata.cut_off_date && (
                    <p className="text-xs text-slate-500 mt-1">Corte: {statementMetadata.cut_off_date}</p>
                  )}
                </div>
                
                <div className="bg-gradient-to-br from-purple-900/40 to-slate-900 p-5 rounded-2xl border border-purple-500/30 shadow-inner relative overflow-hidden">
                   <div className="absolute -right-4 -top-4 w-16 h-16 bg-purple-500/20 rounded-full blur-xl"></div>
                   <div className="flex items-center justify-between mb-2 relative z-10">
                     <div className="flex items-center gap-2 text-purple-400">
                       <DollarSign className="w-4 h-4" />
                       <span className="text-xs font-bold uppercase tracking-wider">Deuda Total</span>
                     </div>
                     <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">PAGO CONTADO</span>
                   </div>
                   <p className="text-2xl font-black text-white relative z-10 mb-3">
                     ${formatMoney(statementMetadata.statement_balance_cents)}
                   </p>
                   
                   {/* Selector de Cuota de Usuario */}
                   <div className="pt-3 border-t border-purple-500/20 relative z-10">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-purple-300/70 uppercase">Tu Responsabilidad</span>
                        <span className="text-xs font-bold text-white">${formatMoney(statementMetadata.user_share_cents)}</span>
                     </div>
                     <input 
                        type="range" 
                        min="0" 
                        max={statementMetadata.statement_balance_cents} 
                        value={statementMetadata.user_share_cents}
                        onChange={(e) => setStatementMetadata({
                          ...statementMetadata, 
                          user_share_cents: parseInt(e.target.value)
                        })}
                        className="w-full h-1.5 bg-purple-900 rounded-lg appearance-none cursor-pointer accent-purple-400"
                     />
                     {statementMetadata.user_share_cents < statementMetadata.statement_balance_cents && (
                       <p className="text-[10px] text-emerald-400 mt-2 font-bold flex items-center gap-1">
                         <User className="w-3 h-3" />
                         Compartido: ${formatMoney(statementMetadata.statement_balance_cents - statementMetadata.user_share_cents)} serán asignados a terceros.
                       </p>
                     )}
                   </div>
                 </div>

                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl border border-slate-700 shadow-inner">
                   <div className="flex justify-between items-end h-full">
                     <div>
                       <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Consumos Mes</p>
                       <p className="text-lg font-bold text-emerald-400">+${formatMoney(statementMetadata.total_new_consumos_cents)}</p>
                     </div>
                     <div className="text-right">
                       <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Abonos</p>
                       <p className="text-lg font-bold text-blue-400">-${formatMoney(Math.abs(statementMetadata.total_pagos_cents))}</p>
                     </div>
                   </div>
                </div>
              </div>
 
              {/* Alerta de Auditoría / Discrepancia */}
              {auditInfo && (!auditInfo.consumos_match || !auditInfo.pagos_match) && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-500 font-bold text-sm uppercase tracking-wider">Discrepancia detectada en Auditoría 1:1</p>
                    <p className="text-amber-200/80 text-xs mt-1">
                      La suma de las transacciones extraídas no coincide exactamente con el resumen del banco. 
                      Por favor, revisa el documento original para asegurar precisión absoluta.
                    </p>
                  </div>
                </div>
              )}

              {/* Método de Extracción */}
              {auditInfo && (
                <div className="flex items-center justify-end px-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-700/30 rounded-full border border-slate-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      MÉTODO: {auditInfo.extraction_method}
                    </span>
                  </div>
                </div>
              )}

              {/* Tabla de Transacciones */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-700">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Transacciones Detectadas ({extractedTransactions.length})</h3>
                  <button
                    onClick={() => {
                      setFile(null);
                      setExtractedTransactions([]);
                      setStatementMetadata(null);
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
                            checked={extractedTransactions.every(t => t.selected)}
                            onChange={(e) => {
                              setExtractedTransactions(prev =>
                                prev.map(txn => ({ ...txn, selected: e.target.checked && !txn.is_duplicate }))
                              );
                            }}
                            className="mr-2 accent-purple-500 rounded"
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
                        <tr key={index} className={`transition-colors ${txn.selected ? 'bg-purple-500/5' : ''} ${txn.is_duplicate ? 'opacity-50 grayscale' : 'hover:bg-slate-700/30'}`}>
                          <td className="px-4 py-3">
                             <div className="flex items-center gap-2">
                               <input
                                 type="checkbox"
                                 checked={txn.selected}
                                 disabled={txn.is_duplicate}
                                 onChange={() => {
                                   setExtractedTransactions(prev =>
                                     prev.map((t, i) => i === index ? { ...t, selected: !t.selected } : t)
                                   );
                                 }}
                                 className="accent-purple-500 rounded"
                               />
                               {/* Botón de Compartir */}
                               <button 
                                 onClick={() => {
                                   const person = prompt("¿Con quién compartes este gasto?", txn.shared_with || "");
                                   if (person === null) return;
                                   const amount = prompt(`¿Cuánto debe pagar ${person}? (Máximo ${formatMoney(txn.amount_cents)})`, (txn.shared_amount ? (txn.shared_amount/100).toString() : (txn.amount_cents/200).toString()));
                                   if (amount === null) return;
                                   
                                   setExtractedTransactions(prev => prev.map((t, i) => 
                                     i === index ? { 
                                       ...t, 
                                       shared_with: person, 
                                       shared_amount: parseFloat(amount) * 100 
                                     } : t
                                   ));
                                 }}
                                 className={`p-1 rounded transition-colors ${txn.shared_with ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-white hover:bg-slate-700'}`}
                                 title="Marcar como compartido"
                               >
                                 <User className="w-3 h-3" />
                               </button>
                             </div>
                           </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{txn.date}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">
                             <div className="flex flex-col">
                               <span>{txn.description}</span>
                               {txn.shared_with && (
                                 <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight">
                                   👤 {txn.shared_with} te debe ${formatMoney(txn.shared_amount || 0)}
                                 </span>
                               )}
                             </div>
                            {txn.is_deferred && (
                              <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded-full uppercase font-bold tracking-wider">
                                Diferido {txn.deferred_info}
                              </span>
                            )}
                            {txn.is_duplicate && (
                              <span className="ml-2 px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] rounded-full uppercase font-bold tracking-wider">
                                Duplicado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {txn.category_name || <span className="italic opacity-50">Sin Categoría</span>}
                          </td>
                          <td className={`px-4 py-3 text-sm font-bold text-right ${txn.transaction_type === 'income' ? 'text-blue-400' : 'text-rose-400'}`}>
                            {txn.transaction_type === 'income' ? '-' : '+'}${formatMoney(Math.abs(txn.amount_cents))}
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
                  Se importarán <strong className="text-white">{extractedTransactions.filter(t => t.selected).length}</strong> transacciones y se actualizará el balance de la tarjeta.
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
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 font-bold shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
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

export default StatementImportModal;
