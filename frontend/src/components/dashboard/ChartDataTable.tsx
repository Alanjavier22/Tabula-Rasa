import { useId, useState } from 'react';
import { ChevronDown, Table2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface ChartDataTableProps {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

export default function ChartDataTable({
  caption,
  columns,
  rows,
}: Readonly<ChartDataTableProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const tableId = useId();
  const panelId = useId();
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const firstRow = currentPage * pageSize;
  const visibleRows = rows.slice(firstRow, firstRow + pageSize);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className={`app-chart-data ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className={`app-disclosure-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="app-disclosure-trigger-main">
          <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {isOpen ? 'Ocultar' : 'Ver'} datos de {caption.toLocaleLowerCase()}
          </span>
          <span className="app-disclosure-count">{rows.length}</span>
        </span>
        <span className="app-disclosure-chevron" aria-hidden="true">
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="app-disclosure-body"
          >
            <div className="app-chart-data-inner">
              <div className="app-table-scroll">
                <table id={tableId}>
                  <caption>{caption}</caption>
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={JSON.stringify(row)}>
                        {row.map((cell, column) =>
                          column === 0 ? (
                            <th key={columns[column]} scope="row">
                              {cell}
                            </th>
                          ) : (
                            <td key={columns[column]}>{cell}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > pageSize && (
                <div className="chart-data-pagination">
                  <span aria-live="polite">
                    Filas {firstRow + 1}–
                    {Math.min(firstRow + pageSize, rows.length)} de {rows.length}
                  </span>
                  <nav aria-label={`Paginación: ${caption.toLocaleLowerCase()}`}>
                    <button
                      type="button"
                      aria-controls={tableId}
                      onClick={() => setPageIndex(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      Anterior
                    </button>
                    <button
                      type="button"
                      aria-controls={tableId}
                      onClick={() =>
                        setPageIndex(Math.min(pageCount - 1, currentPage + 1))
                      }
                      disabled={currentPage >= pageCount - 1}
                    >
                      Siguiente
                      <ChevronRight
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                    </button>
                  </nav>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
