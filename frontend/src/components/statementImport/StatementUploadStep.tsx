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
        <div className="p-4 bg-warning-soft border border-line rounded-xl text-warning text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>No tienes tarjetas de crédito configuradas.</p>
          <p className="text-sm opacity-80 mt-1">Crea una cuenta de tipo "Tarjeta de Crédito" primero.</p>
        </div>
      ) : (
        <>
          <div className="bg-canvas p-3.5 rounded-xl border border-line">
            <label htmlFor="statement-upload-account" className="block text-xs font-black text-muted mb-1.5 uppercase tracking-wider">Tarjeta Destino</label>
            <Select
              id="statement-upload-account"
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
              dragActive ? 'border-line bg-accent-soft scale-[1.01]' : 'border-line hover:border-line hover:bg-surface'
            }`}
          >
            <input
              type="file" aria-label="Seleccionar estado de cuenta"
              accept="image/*,.pdf"
              onChange={onFileSelect}
              className="sr-only"
              id="statement-upload"
            />
            <label htmlFor="statement-upload" className="cursor-pointer flex flex-col items-center">
              <div className={`${dragActive ? 'text-accent-strong scale-110' : 'text-muted'} transition-all duration-300 mb-2`}>
                <FileText className="w-12 h-12" />
              </div>
              <p className="text-base text-primary font-bold mb-1">
                {file ? file.name : 'Arrastra tu PDF aquí'}
              </p>
              <p className="text-muted text-xs">
                {file ? 'Haz clic abajo para analizar' : 'Soporta PDFs y capturas de imagen'}
              </p>
            </label>
          </div>

          {file && (
            <button
              onClick={onProcess}
              disabled={processing}
              className="w-full py-3 rounded-xl bg-surface-soft   text-primary font-bold text-sm hover:shadow-lg  hover:scale-[1.01] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin"></div>
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
