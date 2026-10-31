import React from 'react';
import { motion } from 'framer-motion';
import { FiscalDashboard } from '../components/dashboard/FiscalDashboard';
import { Info } from 'lucide-react';

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
      className="app-page fiscal-page"
    >
      <header className="fiscal-page-header">
        <div>
          <h1 className="app-page-title">Impuestos SRI</h1>
          <p>Datos del ejercicio fiscal {selectedYear}.</p>
        </div>

        <fieldset className="fiscal-year-switcher" aria-label="Seleccionar ejercicio fiscal">
          {[...availableYears].sort((a, b) => a - b).map(year => (
            <button
              type="button"
              key={year}
              onClick={() => setSelectedYear(year)}
              className={selectedYear === year ? 'is-active' : ''}
              aria-pressed={selectedYear === year}
            >
              {year}
            </button>
          ))}
        </fieldset>
      </header>

      <aside className="fiscal-info-note">
        <Info aria-hidden="true" />
        <p>
          Visualizando datos del periodo fiscal <strong>{selectedYear}</strong>.
          Este panel consolida tus gastos deducibles y proyecciones de IVA. Recuerda que el límite de gastos personales para el periodo actual depende de tus cargas familiares y el valor de la Canasta Básica.
        </p>
      </aside>

      <section className="fiscal-analysis-panel" aria-label="Análisis fiscal">
        <FiscalDashboard
          startDate={firstDay}
          endDate={lastDay}
        />
      </section>
    </motion.div>
  );
};

export default FiscalPage;
