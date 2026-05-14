import React from 'react';
import { motion } from 'framer-motion';
import { FiscalDashboard } from '../components/dashboard/FiscalDashboard';
import { Receipt, Info } from 'lucide-react';

const FiscalPage: React.FC = () => {
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  
  // Calculate dates for the selected fiscal year
  const firstDay = `${selectedYear}-01-01`;
  const lastDay = `${selectedYear}-12-31`;

  const availableYears = [
    selectedYear + 1,
    selectedYear,
    selectedYear - 1,
    selectedYear - 2
  ];

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
            <p className="text-slate-400 text-sm font-medium">Año Fiscal {selectedYear}</p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
          {availableYears.sort().map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                selectedYear === year 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex items-start gap-4">
        <div className="mt-0.5">
          <Info className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-sm text-blue-200/80 leading-relaxed">
            Visualizando datos del periodo fiscal <strong>{selectedYear}</strong>. 
            Este panel consolida tus gastos deducibles y proyecciones de IVA. Recuerda que el límite de gastos personales para el periodo actual depende de tus cargas familiares y el valor de la Canasta Básica.
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
