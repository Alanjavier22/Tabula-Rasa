import Modal from '../common/Modal';
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
    ? 'w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center border border-line'
    : 'w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line';
  const fieldClass = isCreate
    ? 'w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line focus:bg-surface-soft transition-all font-medium'
    : 'w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary text-sm focus:outline-none focus:border-line focus:bg-surface-soft transition-all font-medium';
  const submitLabel = isCreate ? 'Crear Categoría' : 'Actualizar Categoría';

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} label={isCreate ? 'Nueva categoría' : 'Editar categoría'}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col "
          >
            {/* Header con estilo Glass */}
            <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-line shrink-0">
              <div className={`absolute top-0 left-0 w-full h-full bg-surface-soft ${isCreate ? ' ' : ' '} pointer-events-none`}></div>
              <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
                <div className={iconWrapperClass}>
                  {isCreate ? <Tag className="w-5 h-5 text-info" /> : <Edit className="w-5 h-5 text-accent-strong" />}
                </div>
                {isCreate ? 'Nueva Categoría' : 'Editar Categoría'}
              </h2>
              <button aria-label="Cerrar diálogo" onClick={onClose} className="w-10 h-10 rounded-full hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all border border-transparent hover:border-line">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">

              {/* VISTA PREVIA DINÁMICA */}
              <div className="space-y-3">
                <span className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide ml-1">
                  Vista Previa
                </span>
                <div className="bg-surface-soft rounded-3xl p-6 border border-line flex items-center justify-center min-h-[100px]">
                  <div
                    className="px-6 py-3 rounded-2xl border flex items-center gap-3 shadow-xl transition-all duration-300"
                    style={{
                      backgroundColor: `${form.color}15`,
                      borderColor: `${form.color}40`,
                      color: form.color
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full "
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
                  <label htmlFor="categoryformmodal-field-1" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <Tag className="w-3 h-3" />
                    Nombre de la Categoría
                  </label>
                  <input id="categoryformmodal-field-1"
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className={fieldClass}
                    placeholder="Ej: Alimentación, Transporte..."
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label htmlFor="categoryformmodal-field-2" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <AlignLeft className="w-3 h-3" />
                    Descripción (Opcional)
                  </label>
                  <textarea id="categoryformmodal-field-2"
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    className={`${fieldClass} resize-none`}
                    rows={4}
                    placeholder="Agrega un detalle sobre qué incluirá esta categoría..."
                  />
                </div>

                {/* Color */}
                <div>
                  <label htmlFor="category-color-hex" className="flex items-center gap-2 text-xs font-black text-muted uppercase tracking-wide mb-3 ml-1">
                    <Palette className="w-3 h-3" />
                    Identificador Visual (Color)
                  </label>
                  <div className="flex items-center gap-4 bg-surface-soft p-3 rounded-2xl border border-line">
                    <div className="relative group">
                      <input
                        type="color"
                        aria-label="Seleccionar color de categoría"
                        value={form.color}
                        onChange={e => setForm({...form, color: e.target.value})}
                        className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border-none p-0 overflow-hidden"
                      />

                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        id="category-color-hex"
                        value={form.color}
                        onChange={e => setForm({...form, color: e.target.value})}
                        className="w-full bg-transparent border-none text-primary font-mono text-lg focus:ring-0 p-0"
                        placeholder="#8b5cf6"
                      />
                      <p className="text-xs text-muted font-bold uppercase tracking-widest mt-1">Código Hexadecimal</p>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="p-7 border-t border-line bg-canvas flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl border border-line text-muted hover:text-primary hover:bg-surface-soft transition-all text-xs font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={onSubmit}
                disabled={saving}
                className={`flex-[2] py-4 rounded-2xl bg-surface-soft ${isCreate ? '  ' : '  '} text-primary transition-all text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]`}
              >
                {saving ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                ) : (
                  submitLabel
                )}
              </button>
            </div>
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default CategoryFormModal;
