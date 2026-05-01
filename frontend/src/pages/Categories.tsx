import { useEffect, useState } from 'react';
import { categoriesAPI } from '../services/api';
import type { Category } from '../types';
import { Plus, Trash2, Edit, X } from 'lucide-react';
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

  useEffect(() => {
    fetchCategories();
  }, []);

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
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Categorías</h1>
          <p className="text-slate-300 text-sm lg:text-base">Gestiona tus categorías de ingresos y gastos</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap">
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Categoría
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No hay categorías aún</p>
            <p className="text-slate-500 text-sm mt-2">Crea categorías para organizar tus transacciones</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider hidden md:table-cell">
                    Descripción
                  </th>
                  <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Color
                  </th>
                  <th className="px-3 lg:px-6 py-3 lg:py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-800/30 divide-y divide-slate-700/50">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {category.color && (
                          <div
                            className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                        <div className="text-sm font-medium text-white">
                          {category.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 lg:px-6 py-3 lg:py-4 text-sm text-slate-300 hidden md:table-cell">
                      <span className="truncate block max-w-[200px] lg:max-w-none">{category.description || '-'}</span>
                    </td>
                    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
                      {category.color && (
                        <div className="flex items-center">
                          <div
                            className="w-6 h-6 rounded flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="ml-2 text-sm text-slate-300 hidden lg:inline">{category.color}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleEdit(category)} className="text-blue-400 hover:text-blue-300 mr-3">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Nueva Categoría</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Ej: Comida"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm({...form, color: e.target.value})}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={e => setForm({...form, color: e.target.value})}
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="#8b5cf6"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingCategory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Editar Categoría</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editForm.color}
                    onChange={e => setEditForm({...editForm, color: e.target.value})}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editForm.color}
                    onChange={e => setEditForm({...editForm, color: e.target.value})}
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
