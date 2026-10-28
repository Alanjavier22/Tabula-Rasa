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
            <div className="w-10 h-10 rounded-xl bg-success-soft flex items-center justify-center border border-line">
              <Cloud className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Backups en la Nube</h2>
              <p className="text-muted text-sm">Instantáneas de seguridad de tu base de datos</p>
            </div>
          </div>
          <button
            onClick={onCreateBackup}
            disabled={creatingBackup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success text-on-color text-xs font-black uppercase tracking-widest transition-all shadow-lg"
          >
            {creatingBackup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Nuevo Backup
          </button>
        </div>

        <div className="space-y-3 pr-1">
          {loadingBackups && (
            <div className="p-10 text-center text-muted text-sm animate-pulse">Consultando historial...</div>
          )}
          {!loadingBackups && backups.length > 0 && backups.map((backup: BackupFile) => (
              <div key={backup.id} className="group flex items-center justify-between p-4 bg-surface-soft rounded-2xl border border-line hover:border-line transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-soft flex items-center justify-center group-hover:bg-success-soft transition-all">
                    <Database className="w-5 h-5 text-muted group-hover:text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary group-hover:text-primary transition-all">{backup.name}</p>
                    <p className="text-xs text-muted font-medium">
                      {new Date(backup.createdTime).toLocaleString('es-EC')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onRestoreBackup(backup.id)}
                  className="px-4 py-2 rounded-xl bg-surface-soft hover:bg-success text-on-color text-xs font-black uppercase tracking-widest transition-all border border-line opacity-0 group-hover:opacity-100"
                >
                  Restaurar
                </button>
              </div>
            ))}
          {!loadingBackups && backups.length === 0 && (
            <div className="p-10 text-center text-muted text-sm bg-surface-soft rounded-3xl border border-dashed border-line">
              No se han encontrado backups.
            </div>
          )}
        </div>
      </section>

      <section className="pt-10 border-t border-line">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center border border-line">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-danger">Zona de Peligro</h2>
            <p className="text-muted text-sm">Acciones críticas e irreversibles</p>
          </div>
        </div>

        <div className="bg-danger-soft rounded-2xl p-8 border border-line relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <AlertTriangle className="w-32 h-32 text-danger" />
          </div>
          <div className="relative z-10">
            <h3 className="text-danger font-bold mb-2">Vaciar Base de Datos</h3>
            <p className="text-muted text-xs mb-6 max-w-lg leading-relaxed">
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
              className="px-6 py-3 rounded-xl bg-danger-soft border border-line text-danger hover:bg-danger hover:text-on-color transition-all text-xs font-black uppercase tracking-widest"
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
