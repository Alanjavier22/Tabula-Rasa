import Modal from './common/Modal';
import { useState, useEffect } from 'react';
import { intelligenceAPI, accountsAPI } from '../services/api';
import { X, CheckCircle, AlertCircle, Trash2, CreditCard, Calendar, DollarSign, User } from 'lucide-react';
import type { Account, StatementExtractedTransaction, StatementParsingResponse } from '../types';
import type { AxiosError } from 'axios';
import { formatMoney } from '../utils/money';
import { motion } from 'framer-motion';
import StatementUploadStep from './statementImport/StatementUploadStep';
import ShareTransactionModal, { type SharingTransactionState } from './statementImport/ShareTransactionModal';
import { createFileSelectionHandlers, withFirstDocumentFile } from '../utils/fileSelection';

interface StatementImportModalProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type ExtractedStatementRow = StatementExtractedTransaction & {
  selected: boolean;
  shared_with?: string;
  shared_amount?: number;
};

type StatementMetadataDraft = Pick<StatementParsingResponse,
  | 'issuer_identity'
  | 'statement_period'
  | 'statement_month'
  | 'statement_year'
  | 'statement_balance_cents'
  | 'payment_due_date'
  | 'cut_off_date'
  | 'total_new_consumos_cents'
  | 'total_pagos_cents'
  | 'credit_limit_cents'
> & {
  user_share_cents: number;
  debt_shares: unknown[];
};

const StatementImportModal = ({ onClose, onSuccess }: StatementImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [creditCardAccounts, setCreditCardAccounts] = useState<Account[]>([]);
  const [processing, setProcessing] = useState(false);

  // Datos extraídos de la IA
  const [importLogId, setImportLogId] = useState<string | null>(null);
  const [extractedTransactions, setExtractedTransactions] = useState<ExtractedStatementRow[]>([]);
  const [statementMetadata, setStatementMetadata] = useState<StatementMetadataDraft | null>(null);
  const [auditInfo, setAuditInfo] = useState<StatementParsingResponse['audit'] | null>(null);

  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sharingTransaction, setSharingTransaction] = useState<SharingTransactionState | null>(null);

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

  const userShareCents = statementMetadata
    ? Math.max(
        0,
        statementMetadata.statement_balance_cents - extractedTransactions
          .filter(t => t.selected && t.shared_amount)
          .reduce((sum, t) => sum + (t.shared_amount || 0), 0),
      )
    : 0;

  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    setExtractedTransactions([]);
    setStatementMetadata(null);
    setImportLogId(null);
    setResult(null);
  };

  const { handleDrag, handleDrop, handleFileSelect } = createFileSelectionHandlers({
    setDragActive,
    onFileSelect: handleFileSelection,
    selectDroppedFile: withFirstDocumentFile,
  });

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
        const txsWithSelection = parsed.transactions.map((tx) => ({
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
    } catch (error) {
      console.error('Processing error:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al procesar el estado de cuenta con IA.';
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
          ? { ...statementMetadata, user_share_cents: userShareCents }
          : undefined
      );

      setResult({ success: true, message: `Éxito: ${response.data.imported_count} transacciones importadas y deudas actualizadas.` });

      setTimeout(() => {
        onSuccess(response.data.imported_count);
        onClose();
        // Solo después de que se supone que el modal se cierra o el proceso termina totalmente
        setSaving(false);
      }, 2000);
    } catch (error) {
      console.error('Save error:', error);
      const detail = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al guardar el estado de cuenta.';
      setResult({ success: false, message: detail });
      setSaving(false);
    }
  };

  const handleConfirmShare = () => {
    if (!statementMetadata || !sharingTransaction) return;
    const newTransactions = extractedTransactions.map((t, i) =>
      i === sharingTransaction.index ? {
        ...t,
        shared_with: sharingTransaction.name,
        shared_amount: sharingTransaction.amount
      } : t
    );
    setExtractedTransactions(newTransactions);
    setSharingTransaction(null);
  };

  return (
    <>
      <Modal onClose={onClose} label={'Importar estado de cuenta'}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-surface border border-line rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl relative"
      >
          <div className="flex items-center justify-between p-4 border-b border-line bg-surface sticky top-0 z-[60] ">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-accent-soft rounded-lg">
                <CreditCard className="w-5 h-5 text-accent-strong" />
              </div>
              <h2 className="text-lg font-black text-primary tracking-tight">Importador IA <span className="text-accent-strong font-medium text-xs ml-2 px-2 py-0.5 bg-accent-soft rounded-full">Estados de Cuenta</span></h2>
            </div>
            <button aria-label="Cerrar diálogo" onClick={onClose} className="text-muted hover:text-primary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 md:p-5 space-y-4 md:space-y-5">
            {/* Paso 1: Selección y Upload */}
            {!extractedTransactions.length && (
              <StatementUploadStep
                creditCardAccounts={creditCardAccounts}
                accountId={accountId}
                onAccountIdChange={setAccountId}
                file={file}
                dragActive={dragActive}
                onDrag={handleDrag}
                onDrop={handleDrop}
                onFileSelect={handleFileSelect}
                processing={processing}
                onProcess={handleProcess}
              />
            )}

            {/* Paso 2: Auditoría y Confirmación */}
            {extractedTransactions.length > 0 && statementMetadata && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Tarjeta de Resumen (Metadata) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner">
                    <div className="flex items-center gap-2 text-muted mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Período</span>
                    </div>
                    <p className="text-lg font-semibold text-primary">{statementMetadata.statement_period}</p>
                    {statementMetadata.cut_off_date && (
                      <p className="text-xs text-muted mt-1">Corte: {statementMetadata.cut_off_date}</p>
                    )}
                  </div>

                  <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner relative overflow-hidden">
                     <div className="absolute -right-4 -top-4 w-16 h-16 bg-accent-soft rounded-full "></div>
                     <div className="flex items-center justify-between mb-2 relative z-10">
                       <div className="flex items-center gap-2 text-accent-strong">
                         <DollarSign className="w-4 h-4" />
                         <span className="text-xs font-bold uppercase tracking-wider">Deuda Total</span>
                       </div>
                       <span className="text-xs bg-accent-soft text-accent-strong px-2 py-0.5 rounded-full font-bold">PAGO CONTADO</span>
                     </div>
                     <p className="text-2xl font-black text-primary relative z-10 mb-3">
                       ${formatMoney(statementMetadata.statement_balance_cents)}
                     </p>

                     {/* Selector de Cuota de Usuario */}
                     <div className="pt-3 border-t border-line relative z-10">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-xs font-bold text-accent-strong uppercase">Tu Responsabilidad</span>
                           <span className="text-xs font-bold text-primary">${formatMoney(userShareCents)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-accent-soft rounded-lg overflow-hidden relative">
                          <div
                            className="h-full bg-accent-strong transition-all duration-300"
                            style={{ width: `${(userShareCents / statementMetadata.statement_balance_cents) * 100}%` }}
                          />
                        </div>

                       {userShareCents < statementMetadata.statement_balance_cents && (
                         <p className="text-xs text-success mt-2 font-bold flex items-center gap-1">
                           <User className="w-3 h-3" />
                           Compartido: ${formatMoney(statementMetadata.statement_balance_cents - userShareCents)} serán asignados a terceros.
                         </p>
                       )}
                     </div>
                   </div>

                  <div className="bg-surface-soft   p-5 rounded-2xl border border-line shadow-inner">
                     <div className="flex justify-between items-end h-full">
                       <div>
                         <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Consumos Mes</p>
                         <p className="text-lg font-bold text-success">+${formatMoney(statementMetadata.total_new_consumos_cents)}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Abonos</p>
                         <p className="text-lg font-bold text-info">-${formatMoney(Math.abs(statementMetadata.total_pagos_cents))}</p>
                       </div>
                     </div>
                  </div>
                </div>

                {/* Alerta de Auditoría / Discrepancia */}
                {auditInfo && (!auditInfo.consumos_match || !auditInfo.pagos_match) && (
                  <div className="p-4 bg-warning-soft border border-line rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-warning font-bold text-sm uppercase tracking-wider">Discrepancia detectada en Auditoría 1:1</p>
                      <p className="text-warning text-xs mt-1">
                        La suma de las transacciones extraídas no coincide exactamente con el resumen del banco.
                        Por favor, revisa el documento original para asegurar precisión absoluta.
                      </p>
                    </div>
                  </div>
                )}

                {/* Método de Extracción */}
                {auditInfo && (
                  <div className="flex items-center justify-end px-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-surface rounded-full border border-line">
                      <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div>
                      <span className="text-xs font-bold text-muted uppercase tracking-widest">
                        MÉTODO: {auditInfo.extraction_method}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tabla de Transacciones */}
                <div className="bg-canvas rounded-2xl border border-line overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-surface border-b border-line">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Transacciones Detectadas ({extractedTransactions.length})</h3>
                    <div className="flex items-center gap-2">
                      {extractedTransactions.some(t => t.is_duplicate) && (
                        <button
                          onClick={() => {
                            setExtractedTransactions(prev => prev.filter(t => !t.is_duplicate));
                          }}
                          className="flex items-center gap-2 text-danger hover:text-danger text-xs font-bold uppercase bg-danger-soft px-3 py-1.5 rounded-lg border border-line transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Limpiar Duplicados
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setFile(null);
                          setExtractedTransactions([]);
                          setStatementMetadata(null);
                          setResult(null);
                        }}
                        className="flex items-center gap-2 text-muted hover:text-primary text-xs font-bold uppercase bg-surface px-3 py-1.5 rounded-lg border border-line transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        Descartar y Rehacer
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[40vh] overflow-y-auto relative">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-30 shadow-sm border-b border-line">

                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">
                            <input
                              type="checkbox"
                              checked={extractedTransactions.every(t => t.selected)}
                              onChange={(e) => {
                                setExtractedTransactions(prev =>
                                  prev.map(txn => ({ ...txn, selected: e.target.checked && !txn.is_duplicate }))
                                );
                              }}
                              className="mr-2 accent-accent rounded"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Descripción</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Responsable</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-muted uppercase">Categoría</th>
                          <th className="px-4 py-3 text-right text-xs font-bold text-muted uppercase">Monto</th>

                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {extractedTransactions.map((txn, index) => (
                          <tr key={txn.fingerprint} className={`transition-colors ${txn.selected ? 'bg-accent-soft' : ''} ${txn.is_duplicate ? 'opacity-50 grayscale' : 'hover:bg-surface'}`}>
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
                                   className="accent-accent rounded"
                                 />
                               </div>
                             </td>

                            <td className="px-4 py-3 text-sm text-muted">{txn.date}</td>
                            <td className="px-4 py-3 text-sm text-primary font-medium">
                               <div className="flex flex-col">
                                 <span>{txn.description}</span>
                                 {txn.shared_with && (
                                   <span className="text-xs text-success font-bold uppercase tracking-tight">
                                     👤 {txn.shared_with} te debe ${formatMoney(txn.shared_amount || 0)}
                                   </span>
                                 )}
                               </div>
                               {txn.is_deferred && (
                                 <span className="ml-2 px-2 py-0.5 bg-info-soft text-info text-xs rounded-full uppercase font-bold tracking-wider">
                                   Diferido {txn.deferred_info}
                                 </span>
                               )}
                               {txn.is_duplicate && (
                                 <span className="ml-2 px-2 py-0.5 bg-danger-soft text-danger text-xs rounded-full uppercase font-bold tracking-wider">
                                   Duplicado
                                 </span>
                               )}
                             </td>
                             <td className="px-4 py-3">
                               <div className="flex items-center gap-2">
                                 <button
                                   onClick={() => {
                                     if (txn.shared_with) {
                                       // Unshare directly if already shared
                                       const newTransactions = extractedTransactions.map((t, i) =>
                                         i === index ? { ...t, shared_with: undefined, shared_amount: undefined } : t
                                       );
                                       setExtractedTransactions(newTransactions);
                                     } else {
                                       setSharingTransaction({ index, name: "Dennis", amount: txn.amount_cents / 2 });
                                     }
                                   }}

                                   className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                                     txn.shared_with
                                       ? 'bg-success-soft text-success border border-line'
                                       : 'bg-surface text-muted border border-line hover:text-muted'
                                   }`}
                                 >
                                   <User className="w-3.5 h-3.5" />
                                   {txn.shared_with ? txn.shared_with : 'Mío'}
                                 </button>
                               </div>
                             </td>

                            <td className="px-4 py-3 text-sm text-muted">
                              {txn.category_name || <span className="italic opacity-50">Sin Categoría</span>}
                            </td>
                            <td className={`px-4 py-3 text-sm font-bold text-right ${txn.transaction_type === 'income' ? 'text-info' : 'text-danger'}`}>
                              {txn.transaction_type === 'income' ? '-' : '+'}${formatMoney(Math.abs(txn.amount_cents))}
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
                    Se importarán <strong className="text-primary">{extractedTransactions.filter(t => t.selected).length}</strong> transacciones y se actualizará el balance de la tarjeta.
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

      {/* Mini-Modal para repartir gasto (Premium replacement for prompt) */}
      {sharingTransaction && (
        <ShareTransactionModal
          sharingTransaction={sharingTransaction}
          transactionDescription={extractedTransactions[sharingTransaction.index].description}
          onChange={setSharingTransaction}
          onCancel={() => setSharingTransaction(null)}
          onConfirm={handleConfirmShare}
        />
      )}
    </>
  );
};

export default StatementImportModal;
