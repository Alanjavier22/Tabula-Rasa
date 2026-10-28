import { Database, FileSpreadsheet, ShieldAlert, Download, RefreshCw } from 'lucide-react';
import type { Category } from '../../types';

interface GeneralTabConfig {
  vehicle_categories: string[];
  safe_to_spend_buffer: number;
}

interface GeneralTabProps {
  categories: Category[];
  config: GeneralTabConfig;
  onBufferChange: (value: number) => void;
  exporting: boolean;
  onExportCSV: () => void;
  onToggleCategory: (categoryId: string) => void;
}

const GeneralTab = ({ categories, config, onBufferChange, exporting, onExportCSV, onToggleCategory }: GeneralTabProps) => {
  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-success-soft flex items-center justify-center border border-line">
            <Database className="w-5 h-5 text-success" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Exportar Transacciones</h2>
            <p className="text-muted text-sm">Descarga tu historial financiero completo</p>
          </div>
        </div>

        <div className="bg-surface-soft rounded-3xl p-6 border border-line flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-success-soft flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-primary">Reporte CSV</p>
              <p className="text-xs text-muted">Formato compatible con Excel y Sheets</p>
            </div>
          </div>
          <button
            onClick={onExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-success hover:bg-success text-on-color transition-all text-xs font-black uppercase tracking-widest shadow-lg "
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center border border-line">
            <ShieldAlert className="w-5 h-5 text-info" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Fondo de Seguridad</h2>
            <p className="text-muted text-sm">Reserva una parte de tu capital para emergencias</p>
          </div>
        </div>

        <div className="bg-surface-soft rounded-3xl p-6 border border-line">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label htmlFor="safe-to-spend-buffer" className="block text-xs font-black text-muted uppercase tracking-widest mb-2">Reserva de seguridad ($)</label>
              <input
                id="safe-to-spend-buffer"
                type="number"
                step="0.01"
                value={config.safe_to_spend_buffer}
                onChange={e => onBufferChange(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-canvas border border-line rounded-xl px-4 py-3 text-primary font-bold focus:outline-none focus:border-line transition-all"
              />
            </div>
            <div className="w-1/2 p-4 bg-info-soft rounded-2xl border border-line">
              <p className="text-xs text-info font-bold uppercase mb-1">Impacto en Liquidez</p>
              <p className="text-xs text-muted leading-relaxed">
                Este monto se restará de tu "Disponible para gastar" total para protegerte de imprevistos.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
            <FileSpreadsheet className="w-5 h-5 text-accent-strong" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Categorías de Vehículo</h2>
            <p className="text-muted text-sm">Categorías vinculadas al análisis de movilidad</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories
            .toSorted((a, b) => a.name.length - b.name.length)
            .map((category) => (
            <button
              key={category.id}
              onClick={() => onToggleCategory(category.id)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${
                config.vehicle_categories.includes(category.id)
                  ? 'bg-accent-soft border-line text-accent-strong '
                  : 'bg-surface-soft border-line text-muted hover:border-line'
              }`}
            >
              <span className="text-xs font-bold text-center leading-tight">{category.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GeneralTab;
