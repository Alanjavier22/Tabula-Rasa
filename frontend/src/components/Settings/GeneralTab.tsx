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
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Database className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Exportar Transacciones</h2>
            <p className="text-slate-400 text-sm">Descarga tu historial financiero completo</p>
          </div>
        </div>

        <div className="bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Reporte CSV</p>
              <p className="text-xs text-slate-500">Formato compatible con Excel y Sheets</p>
            </div>
          </div>
          <button
            onClick={onExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <ShieldAlert className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Fondo de Seguridad</h2>
            <p className="text-slate-400 text-sm">Reserva una parte de tu capital para emergencias</p>
          </div>
        </div>

        <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-black text-white/30 uppercase tracking-widest mb-2">Monto de Buffer ($)</label>
              <input
                type="number"
                step="0.01"
                value={config.safe_to_spend_buffer}
                onChange={e => onBufferChange(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <div className="w-1/2 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
              <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Impacto en Liquidez</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Este monto se restará de tu "Gasto Seguro" total para protegerte de imprevistos.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Categorías de Vehículo</h2>
            <p className="text-slate-400 text-sm">Categorías vinculadas al análisis de movilidad</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories
            .sort((a, b) => a.name.length - b.name.length)
            .map((category) => (
            <button
              key={category.id}
              onClick={() => onToggleCategory(category.id)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${
                config.vehicle_categories.includes(category.id)
                  ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                  : 'bg-black/20 border-white/5 text-slate-500 hover:border-white/10'
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
