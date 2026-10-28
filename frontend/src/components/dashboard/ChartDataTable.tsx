interface ChartDataTableProps {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}
export default function ChartDataTable({
  caption,
  columns,
  rows,
}: ChartDataTableProps) {
  return (
    <details className="app-chart-data">
      <summary>Ver datos de {caption.toLocaleLowerCase()}</summary>
      <div className="app-table-scroll">
        <table>
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
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) =>
                  column === 0 ? (
                    <th key={column} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={column}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
