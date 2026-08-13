import { Cloud, Download, RefreshCw, Database, AlertTriangle } from 'lucide-react';
import { configAPI } from '../../services/api';
import type { BackupFile } from '../../types';
import type { ToastMessage } from './types';

interface CloudTabProps {
  backups: BackupFile[];
  loadingBackups: boolean;
  creatingBackup: boolean;
  onCreateBackup: () => void;
  onRestoreBackup: (backupId: string) => void;
  setToast: (toast: ToastMessage) => void;
}

const CloudTab = ({ backups, loadingBackups, creatingBackup, onCreateBackup, onRestoreBackup, setToast }: CloudTabProps) => {
  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Cloud className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Backups en la Nube</h2>
              <p className="text-slate-400 text-sm">Instantáneas de seguridad de tu base de datos</p>
            </div>
          </div>
          <button
            onClick={onCreateBackup}
            disabled={creatingBackup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
          >
            {creatingBackup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Nuevo Backup
          </button>
        </div>

        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {loadingBackups ? (
            <div className="p-10 text-center text-slate-500 text-sm animate-pulse">Consultando historial...</div>
          ) : backups.length > 0 ? (
            backups.map((backup: BackupFile) => (
              <div key={backup.id} className="group flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500/10 transition-all">
                    <Database className="w-5 h-5 text-slate-500 group-hover:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80 group-hover:text-white transition-all">{backup.name}</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {new Date(backup.createdTime).toLocaleString('es-EC')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRestoreBackup(backup.id)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 opacity-0 group-hover:opacity-100"
                >
                  Restaurar
                </button>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-slate-500 text-sm bg-black/10 rounded-3xl border border-dashed border-white/5">
              No se han encontrado backups.
            </div>
          )}
        </div>
      </section>

      <section className="pt-10 border-t border-red-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-rose-500">Zona de Peligro</h2>
            <p className="text-slate-400 text-sm">Acciones críticas e irreversibles</p>
          </div>
        </div>

        <div className="bg-rose-500/5 rounded-[2rem] p-8 border border-rose-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <AlertTriangle className="w-32 h-32 text-rose-500" />
          </div>
          <div className="relative z-10">
            <h3 className="text-rose-400 font-bold mb-2">Vaciar Base de Datos</h3>
            <p className="text-slate-400 text-xs mb-6 max-w-lg leading-relaxed">
              Se eliminarán todas las transacciones, estados de cuenta, presupuestos, metas, suscripciones,
              recordatorios, snapshots, activos y logs de importación.
              Las cuentas se conservarán con saldo en $0. Las categorías y configuración permanecen intactas.
            </p>
            <button
              onClick={async () => {
                const firstConfirm = window.confirm("¡ADVERTENCIA!\n\n¿Estás seguro?");
                if (!firstConfirm) return;
                const secondConfirm = window.prompt('Escribe "ELIMINAR TODO":');
                if (secondConfirm !== 'ELIMINAR TODO') return;
                try {
                  await configAPI.wipeDatabase();
                  setToast({ message: 'Sistema reiniciado', type: 'success' });
                  setTimeout(() => window.location.reload(), 1500);
                } catch {
                  setToast({ message: 'Error al limpiar', type: 'error' });
                }
              }}
              className="px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all text-xs font-black uppercase tracking-widest"
            >
              Eliminar Todo el Historial
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CloudTab;
