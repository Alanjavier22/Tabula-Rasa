import { useState, useEffect } from 'react';
import { importAPI, accountsAPI } from '../services/api';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';

interface CSVImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CSVImportModal = ({ onClose, onSuccess }: CSVImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    accountsAPI.getAll().then(res => setAccounts(res.data));
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
      if (dropped.name.endsWith('.csv')) {
        setFile(dropped);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await importAPI.uploadCSV(file, accountId);
      setResult(res.data);
      if (res.data.imported_count > 0) {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setResult({ success: false, error: 'Error al subir archivo' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Importar CSV</h2>
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
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* Drag & Drop Zone */}
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
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className={`w-12 h-12 mx-auto mb-3 ${dragActive ? 'text-purple-400' : 'text-slate-400'}`} />
              <p className="text-white font-medium">
                {file ? file.name : 'Arrastra tu CSV aquí'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {file ? 'Archivo seleccionado' : 'o haz clic para seleccionar'}
              </p>
            </label>
          </div>

          {/* Expected Format */}
          <div className="bg-slate-700/30 rounded-lg p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300 mb-1">Formato esperado CSV:</p>
            <code className="block">date, description, amount, type, payment_method</code>
            <p className="mt-1">Ej: 29/04/2026, Compra super, 50.00, expense, debit_card</p>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-3 ${
              result.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              <div className="flex items-center gap-2">
                {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="font-medium">
                  {result.success ? 'Importación exitosa' : 'Error'}
                </span>
              </div>
              {result.success && (
                <div className="mt-2 text-sm">
                  <p>Importados: {result.imported_count}</p>
                  <p>Omitidos (duplicados): {result.skipped_count}</p>
                  {result.ai_categorized_count > 0 && (
                    <p className="text-purple-300">Categorizados por IA: {result.ai_categorized_count}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
            >
              {uploading ? 'Importando...' : 'Importar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CSVImportModal;
