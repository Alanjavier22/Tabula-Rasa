import React from 'react';
import { motion } from 'framer-motion';
import { FiscalDashboard } from '../components/dashboard/FiscalDashboard';
import { Receipt, Info } from 'lucide-react';

const FiscalPage: React.FC = () => {
  // Current month range for default view
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-8 pb-24"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
            <Receipt className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Centro Fiscal SRI</h1>
            <p className="text-slate-400 text-sm font-medium">Gestión tributaria, anexos y proyecciones de IVA</p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-start gap-4">
        <div className="mt-0.5">
          <Info className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-sm text-blue-200/80 leading-relaxed">
            Este panel consolida tus gastos deducibles y proyecciones de IVA basadas en las categorías configuradas. 
            Recuerda que para una correcta exportación del <strong>Anexo SRI</strong>, debes tener tus transacciones 
            correctamente categorizadas como gastos personales.
          </p>
        </div>
      </div>

      {/* Main Fiscal Dashboard */}
      <section className="bg-slate-900/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-8 shadow-2xl">
        <FiscalDashboard 
          startDate={firstDay}
          endDate={lastDay}
        />
      </section>
    </motion.div>
  );
};

export default FiscalPage;
