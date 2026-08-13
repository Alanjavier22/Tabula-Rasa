import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Edit, X, AlignLeft, Palette, RefreshCw } from 'lucide-react';

export interface CategoryFormData {
  name: string;
  description: string;
  color: string;
}

interface CategoryFormModalProps {
  isOpen: boolean;
  isCreate: boolean;
  form: CategoryFormData;
  setForm: Dispatch<SetStateAction<CategoryFormData>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CategoryFormModal = ({ isOpen, isCreate, form, setForm, saving, onClose, onSubmit }: CategoryFormModalProps) => {
  const iconWrapperClass = isCreate
    ? 'w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20'
    : 'w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20';
  const fieldClass = isCreate
    ? 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium'
    : 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            {/* Header con estilo Glass */}
            <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-r ${isCreate ? 'from-blue-500/5 to-purple-500/5' : 'from-indigo-500/5 to-purple-500/5'} pointer-events-none`}></div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                <div className={iconWrapperClass}>
                  {isCreate ? <Tag className="w-5 h-5 text-blue-400" /> : <Edit className="w-5 h-5 text-indigo-400" />}
                </div>
                {isCreate ? 'Nueva Categoría' : 'Editar Categoría'}
              </h2>
              <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

              {/* VISTA PREVIA DINÁMICA */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                  Vista Previa
                </label>
                <div className="bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-center min-h-[100px]">
                  <div
                    className="px-6 py-3 rounded-2xl border flex items-center gap-3 shadow-xl transition-all duration-300"
                    style={{
                      backgroundColor: `${form.color}15`,
                      borderColor: `${form.color}40`,
                      color: form.color
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.3)]"
                      style={{ backgroundColor: form.color }}
                    ></div>
                    <span className="font-black tracking-tight text-lg">
                      {form.name || 'Nombre de Categoría'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Nombre */}
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <Tag className="w-3 h-3" />
                    Nombre de la Categoría
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className={fieldClass}
                    placeholder="Ej: Alimentación, Transporte..."
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <AlignLeft className="w-3 h-3" />
                    Descripción (Opcional)
                  </label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    className={`${fieldClass} resize-none`}
                    rows={4}
                    placeholder="Agrega un detalle sobre qué incluirá esta categoría..."
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <Palette className="w-3 h-3" />
                    Identificador Visual (Color)
                  </label>
                  <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/10">
                    <div className="relative group">
                      <input
                        type="color"
                        value={form.color}
                        onChange={e => setForm({...form, color: e.target.value})}
                        className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border-none p-0 overflow-hidden"
                      />
                      <div className="absolute inset-0 rounded-xl pointer-events-none border-2 border-white/20 group-hover:border-white/40 transition-all"></div>
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={form.color}
                        onChange={e => setForm({...form, color: e.target.value})}
                        className="w-full bg-transparent border-none text-white font-mono text-lg focus:ring-0 p-0"
                        placeholder="#8b5cf6"
                      />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Código Hexadecimal</p>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={onSubmit}
                disabled={saving}
                className={`flex-[2] py-4 rounded-2xl bg-gradient-to-r ${isCreate ? 'from-blue-600 to-indigo-600 shadow-blue-900/20' : 'from-indigo-600 to-purple-600 shadow-indigo-900/20'} text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]`}
              >
                {saving ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                ) : (
                  isCreate ? 'Crear Categoría' : 'Actualizar Categoría'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CategoryFormModal;
