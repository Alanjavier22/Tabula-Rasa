import { AlertCircle, FileText, Upload } from 'lucide-react';
import type { Account } from '../../types';
import Select from '../common/Select';

interface StatementUploadStepProps {
  creditCardAccounts: Account[];
  accountId: string;
  onAccountIdChange: (value: string) => void;
  file: File | null;
  dragActive: boolean;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  processing: boolean;
  onProcess: () => void;
}

const StatementUploadStep = ({
  creditCardAccounts,
  accountId,
  onAccountIdChange,
  file,
  dragActive,
  onDrag,
  onDrop,
  onFileSelect,
  processing,
  onProcess,
}: StatementUploadStepProps) => {
  return (
    <div className="space-y-6">
      {creditCardAccounts.length === 0 ? (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>No tienes tarjetas de crédito configuradas.</p>
          <p className="text-sm opacity-80 mt-1">Crea una cuenta de tipo "Tarjeta de Crédito" primero.</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-700">
            <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">Tarjeta Destino</label>
            <Select
              value={accountId}
              onChange={onAccountIdChange}
              options={creditCardAccounts.map(acc => ({ value: acc.id.toString(), label: acc.name }))}
            />
          </div>

          <div
            onDragEnter={onDrag}
            onDragLeave={onDrag}
            onDragOver={onDrag}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-2xl p-5 md:p-6 text-center transition-all duration-300 ${
              dragActive ? 'border-purple-500 bg-purple-500/10 scale-[1.01]' : 'border-slate-600 hover:border-purple-500 hover:bg-slate-800/50'
            }`}
          >
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={onFileSelect}
              className="hidden"
              id="statement-upload"
            />
            <label htmlFor="statement-upload" className="cursor-pointer flex flex-col items-center">
              <div className={`${dragActive ? 'text-purple-400 scale-110' : 'text-slate-400'} transition-all duration-300 mb-2`}>
                <FileText className="w-12 h-12" />
              </div>
              <p className="text-base text-white font-bold mb-1">
                {file ? file.name : 'Arrastra tu PDF aquí'}
              </p>
              <p className="text-slate-400 text-xs">
                {file ? 'Haz clic abajo para analizar' : 'Soporta PDFs y capturas de imagen'}
              </p>
            </label>
          </div>

          {file && (
            <button
              onClick={onProcess}
              disabled={processing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Auditando Estado de Cuenta...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Analizar con Inteligencia Artificial
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default StatementUploadStep;
