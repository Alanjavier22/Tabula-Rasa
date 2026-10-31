import { type CSSProperties, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { categoriesAPI } from '../services/api';
import type { Category } from '../types';
import { Plus, Trash2, Edit, Download, Upload, Tag } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import CategoryFormModal, {
  type CategoryFormData,
} from '../components/categories/CategoryFormModal';

const emptyForm: CategoryFormData = {
  name: '',
  description: '',
  color: '#ae3a2e',
};

const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingCategory, setEditingCategory] = useState<Category | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
  }>({ isOpen: false, id: null });
  const [importing, setImporting] = useState(false);

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
    void Promise.resolve().then(fetchCategories);
  }, []);

  const handleExport = async () => {
    try {
      const response = await categoriesAPI.export();
      const exportedCategories = response.data;
      const dataStr = JSON.stringify(exportedCategories, null, 2);
      const dataBlob = new Blob(['\ufeff' + dataStr], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `categorias_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setToast({
        message: 'Categorías exportadas correctamente',
        type: 'success',
      });
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
      const parsedCategories = JSON.parse(text);
      const response = await categoriesAPI.import(parsedCategories);
      setToast({
        message: `Importación completada: ${response.data.imported_count} nuevas, ${response.data.skipped_count} omitidas (duplicados)`,
        type: 'success',
      });
      void fetchCategories();
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
      void fetchCategories();
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
      color: category.color || '#ae3a2e',
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
      void fetchCategories();
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
      void fetchCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      setToast({ message: 'Error al actualizar categoría', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page">
        <p role="status" className="app-inline-message">
          Cargando categorías…
        </p>
      </div>
    );
  }

  return (
    <div className="app-page categories-page">
      <div className="app-page-heading">
        <div>
          <h1 className="app-page-title">Categorías</h1>
          <p>
            Organiza y segmenta tus movimientos por rubro de ingreso o gasto.
          </p>
        </div>

        <div className="categories-actions">
          <button
            type="button"
            onClick={handleExport}
            className="app-btn"
            title="Exportar categorías en JSON"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Exportar</span>
          </button>
          <label className="app-btn cursor-pointer" title="Importar categorías desde JSON">
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>{importing ? 'Importando…' : 'Importar'}</span>
            <input
              type="file"
              aria-label="Importar categorías desde JSON"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="app-btn app-btn-primary"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nueva categoría</span>
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="app-empty-state">
          <h2>Organiza tus movimientos</h2>
          <p>Crea una categoría para distinguir tus ingresos y gastos.</p>
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Crear primera categoría
          </button>
        </div>
      ) : (
        <div className="categories-grid">
          <AnimatePresence mode="popLayout">
            {categories.map((category, index) => {
              const categoryColor = category.color || '#ae3a2e';

              return (
                <motion.article
                  key={category.id}
                  layout
                  initial={false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18, delay: index * 0.03 }}
                  className="category-card"
                  style={
                    { '--category-color': categoryColor } as CSSProperties
                  }
                >
                  <div className="category-card-top">
                    <div className="category-card-identity">
                      <div className="category-card-icon" aria-hidden="true">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div className="category-card-title">
                        <span>Rubro contable</span>
                        <h3>{category.name}</h3>
                      </div>
                    </div>

                    <div className="category-card-actions">
                      <button
                        type="button"
                        onClick={() => handleEdit(category)}
                        className="category-card-action category-card-action-edit"
                        aria-label={`Editar categoría ${category.name}`}
                        title="Editar categoría"
                      >
                        <Edit className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category.id)}
                        className="category-card-action category-card-action-delete"
                        aria-label={`Eliminar categoría ${category.name}`}
                        title="Eliminar categoría"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <p className="category-card-description">
                    {category.description || 'Sin descripción registrada.'}
                  </p>

                  <div className="category-card-footer">
                    <span className="category-card-meta">Color asignado</span>
                    <span className="category-card-color">
                      <i aria-hidden="true" />
                      {categoryColor.toUpperCase()}
                    </span>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

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
