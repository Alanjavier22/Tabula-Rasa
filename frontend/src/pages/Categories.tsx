import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { categoriesAPI } from '../services/api';
import type { Category } from '../types';
import { Plus, Trash2, Edit, Download, Upload, Tag } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import CategoryFormModal, { type CategoryFormData } from '../components/categories/CategoryFormModal';

const emptyForm: CategoryFormData = {
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

  // Bloquear scroll del body cuando el modal está activo
  useEffect(() => {
    if (showCreateModal || showEditModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showCreateModal, showEditModal]);

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
        description: form.description || undefined,
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
        description: editForm.description || undefined,
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

      <CategoryFormModal
        isOpen={showCreateModal}
        isCreate={true}
        form={form}
        setForm={setForm}
        saving={saving}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
      />

      <CategoryFormModal
        isOpen={showEditModal && !!editingCategory}
        isCreate={false}
        form={editForm}
        setForm={setEditForm}
        saving={saving}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleEditSubmit}
      />

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
