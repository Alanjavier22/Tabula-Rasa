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
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-8 pb-24"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-info-soft flex items-center justify-center border border-line shadow-lg ">
            <Receipt className="w-6 h-6 text-info" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-primary tracking-tight">Impuestos SRI</h1>
            <p className="text-muted text-sm font-medium">Año Fiscal {selectedYear}</p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center bg-surface p-1 rounded-xl border border-line">
          {[...availableYears].sort((a, b) => a - b).map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                selectedYear === year
                ? 'bg-info text-on-color shadow-lg '
                : 'text-muted hover:text-primary hover:bg-surface'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-info-soft border border-line rounded-2xl p-4 flex items-start gap-4">
        <div className="mt-0.5">
          <Info className="w-5 h-5 text-info" />
        </div>
        <div>
          <p className="text-sm text-info leading-relaxed">
            Visualizando datos del periodo fiscal <strong>{selectedYear}</strong>.
            Este panel consolida tus gastos deducibles y proyecciones de IVA. Recuerda que el límite de gastos personales para el periodo actual depende de tus cargas familiares y el valor de la Canasta Básica.
          </p>
        </div>
      </div>

      {/* Main Fiscal Dashboard */}
      <section className="bg-canvas  rounded-2xl border border-line p-8 shadow-2xl">
        <FiscalDashboard
          startDate={firstDay}
          endDate={lastDay}
        />
      </section>
    </motion.div>
  );
};

export default FiscalPage;
