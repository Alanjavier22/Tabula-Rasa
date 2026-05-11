import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { categoriesAPI } from '../services/api';
import type { Category } from '../types';
import { Plus, Trash2, Edit, X, Download, Upload, Tag, Palette, AlignLeft, RefreshCw } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  name: '',
  description: '',
  color: '#8b5cf6',
};


const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleExport = async () => {
    try {
      const response = await categoriesAPI.export();
      const categories = response.data;
      const dataStr = JSON.stringify(categories, null, 2);
      const dataBlob = new Blob(['\ufeff' + dataStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `categorias_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToast({ message: 'Categorías exportadas correctamente', type: 'success' });
    } catch (error) {
      console.error('Error exporting categories:', error);
      setToast({ message: 'Error al exportar categorías', type: 'error' });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const categories = JSON.parse(text);
      const response = await categoriesAPI.import(categories);
      setToast({ 
        message: `Importación completada: ${response.data.imported_count} nuevas, ${response.data.skipped_count} omitidas (duplicados)`, 
        type: 'success' 
      });
      fetchCategories();
    } catch (error) {
      console.error('Error importing categories:', error);
      setToast({ message: 'Error al importar categorías', type: 'error' });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await categoriesAPI.delete(deleteConfirm.id);
      setToast({ message: 'Categoría eliminada', type: 'success' });
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      setToast({ message: 'Error al eliminar categoría', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setEditForm({
      name: category.name,
      description: category.description || '',
      color: category.color || '#8b5cf6',
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await categoriesAPI.create({
        name: form.name,
        description: form.description || null,
        color: form.color,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Categoría creada', type: 'success' });
      fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      setToast({ message: 'Error al crear categoría', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setSaving(true);
    try {
      await categoriesAPI.update(editingCategory.id, {
        name: editForm.name,
        description: editForm.description || null,
        color: editForm.color,
      });
      setShowEditModal(false);
      setEditingCategory(null);
      setEditForm(emptyForm);
      setToast({ message: 'Categoría actualizada', type: 'success' });
      fetchCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      setToast({ message: 'Error al actualizar categoría', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white font-medium">Cargando ecosistema...</div>;
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[10%] -right-[5%] w-[30%] h-[30%] bg-blue-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[20%] -left-[5%] w-[30%] h-[30%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-widest uppercase mb-1">
              <div className="w-8 h-[1px] bg-blue-500/50"></div>
              <span>Tabula Rasa</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
              Libro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Categorías</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium">Organiza y segmenta tu flujo financiero</p>
          </motion.div>

          <div className="flex flex-wrap gap-2">
            <div className="flex bg-slate-800/50 backdrop-blur-md p-1 rounded-2xl border border-slate-700/50 shadow-xl">
              <button
                onClick={handleExport}
                className="p-2 lg:px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all flex items-center gap-2 text-sm font-semibold"
                title="Exportar JSON"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
              <label className="p-2 lg:px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Importar</span>
                <input type="file" accept=".json" onChange={handleImport} disabled={importing} className="hidden" />
              </label>
            </div>
            
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl hover:shadow-lg hover:shadow-blue-500/20 transition-all font-bold group"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              <span>Nueva Categoría</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {categories.map((category, index) => (
              <motion.div
                key={category.id}
                layout
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="group bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 hover:bg-slate-800/50 hover:border-slate-600/50 transition-all shadow-lg hover:shadow-black/20 relative overflow-hidden"
              >
                {/* Color Strip */}
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1.5 opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: category.color || '#8b5cf6' }}
                ></div>

                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                      style={{ backgroundColor: category.color || '#8b5cf6' }}
                    ></div>
                    <h3 className="text-lg font-bold text-white tracking-tight leading-tight group-hover:text-blue-400 transition-colors">
                      {category.name}
                    </h3>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    <button 
                      onClick={() => handleEdit(category)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(category.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-slate-400 text-sm leading-relaxed line-clamp-3 min-h-[3rem]">
                  {category.description || 'Sin descripción'}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-700/30 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <span>ID: {category.id.substring(0, 8)}</span>
                  <div 
                    className="px-2 py-0.5 rounded bg-slate-900/50 border border-slate-700/50"
                    style={{ color: category.color || '#8b5cf6' }}
                  >
                    {category.color}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {categories.length === 0 && (
            <div className="col-span-full text-center py-20 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-700/30">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                <Tag className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-400 text-lg font-medium">Tu libro de categorías está vacío</p>
              <p className="text-slate-600 text-sm mt-2">Crea categorías para organizar tu flujo financiero</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Header con estilo Glass */}
              <div className="relative flex items-center justify-between p-7 border-b border-white/5">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <Tag className="w-5 h-5 text-blue-400" />
                  </div>
                  Nueva Categoría
                </h2>
                <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-7 space-y-8 custom-scrollbar">
                
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
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium"
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
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium resize-none"
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
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleCreateSubmit}
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </div>
                  ) : (
                    'Crear Categoría'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && editingCategory && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Header con estilo Glass */}
              <div className="relative flex items-center justify-between p-7 border-b border-white/5">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-indigo-500/5 to-purple-500/5 pointer-events-none"></div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Edit className="w-5 h-5 text-indigo-400" />
                  </div>
                  Editar Categoría
                </h2>
                <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-7 space-y-8 custom-scrollbar">
                
                {/* VISTA PREVIA DINÁMICA */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                    Vista Previa
                  </label>
                  <div className="bg-black/20 rounded-3xl p-6 border border-white/5 flex items-center justify-center min-h-[100px]">
                    <div 
                      className="px-6 py-3 rounded-2xl border flex items-center gap-3 shadow-xl transition-all duration-300"
                      style={{ 
                        backgroundColor: `${editForm.color}15`, 
                        borderColor: `${editForm.color}40`,
                        color: editForm.color 
                      }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.3)]"
                        style={{ backgroundColor: editForm.color }}
                      ></div>
                      <span className="font-black tracking-tight text-lg">
                        {editForm.name || 'Nombre de Categoría'}
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
                      value={editForm.name}
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
                    />
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <AlignLeft className="w-3 h-3" />
                      Descripción
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm({...editForm, description: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium resize-none"
                      rows={4}
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
                          value={editForm.color}
                          onChange={e => setEditForm({...editForm, color: e.target.value})}
                          className="w-14 h-14 rounded-xl cursor-pointer bg-transparent border-none p-0 overflow-hidden"
                        />
                        <div className="absolute inset-0 rounded-xl pointer-events-none border-2 border-white/20 group-hover:border-white/40 transition-all"></div>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={editForm.color}
                          onChange={e => setEditForm({...editForm, color: e.target.value})}
                          className="w-full bg-transparent border-none text-white font-mono text-lg focus:ring-0 p-0"
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
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleEditSubmit}
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </div>
                  ) : (
                    'Actualizar Categoría'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Categoría"
        message="¿Estás seguro de que quieres eliminar esta categoría? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Categories;
