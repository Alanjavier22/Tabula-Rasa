/**
 * Sankey Chart - Income Flow Visualization
 * Uses snapshot data for performance (max 20 nodes)
 */

import React, { useEffect, useState } from 'react';
import { db } from '../db/db';

interface SankeyNode {
  name: string;
  value: number;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export const SankeyChart: React.FC = () => {
  const [data, setData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshotData = async () => {
    try {
      setLoading(true);
      
      // Get latest snapshot (current month)
      const latestSnapshot = await db.net_worth_snapshots
        .orderBy('date')
        .reverse()
        .first();

      if (!latestSnapshot) {
        setLoading(false);
        return;
      }

      // Get budgets for current month
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      
      const budgets = await db.budgets
        .filter(b => !b.is_deleted && b.month === currentMonth && b.year === currentYear)
        .toArray();

      // Get pending IOUs
      const ious = await db.ious
        .filter(i => !i.is_deleted && i.amount > i.amount_paid)
        .toArray();

      const totalBudgets = budgets.reduce((sum, b) => sum + b.amount, 0);
      const totalIOUs = ious.reduce((sum, i) => sum + (i.amount - i.amount_paid), 0);
      const totalIncome = latestSnapshot.income_cents;
      const netWorthIncrease = latestSnapshot.net_worth_cents;

      // Build Sankey data (max 20 nodes)
      // Flow: Total Income -> [Fixed Expenses, Debt Payments, Savings]
      const nodes: SankeyNode[] = [
        { name: 'Total Income', value: totalIncome },
        { name: 'Fixed Expenses', value: totalBudgets },
        { name: 'Debt Payments', value: totalIOUs },
        { name: 'Savings', value: Math.max(0, netWorthIncrease) },
      ];

      const links: SankeyLink[] = [
        { source: 'Total Income', target: 'Fixed Expenses', value: totalBudgets },
        { source: 'Total Income', target: 'Debt Payments', value: totalIOUs },
        { source: 'Total Income', target: 'Savings', value: Math.max(0, netWorthIncrease) },
      ];

      // Add category breakdown with grouping if >15 categories
      const categoryNodes: SankeyNode[] = [];
      const categoryLinks: SankeyLink[] = [];

      if (budgets.length > 0) {
        // Sort budgets by amount descending
        const sortedBudgets = [...budgets].sort((a, b) => b.amount - a.amount);

        if (sortedBudgets.length <= 15) {
          // Show all categories
          for (const budget of sortedBudgets) {
            const categoryName = `Budget: ${budget.id}`;
            categoryNodes.push({ name: categoryName, value: budget.amount });
            categoryLinks.push({
              source: 'Fixed Expenses',
              target: categoryName,
              value: budget.amount
            });
          }
        } else {
          // Show top 15, group rest into "Otros Gastos"
          const topBudgets = sortedBudgets.slice(0, 15);
          const otherBudgets = sortedBudgets.slice(15);
          const otherTotal = otherBudgets.reduce((sum, b) => sum + b.amount, 0);

          for (const budget of topBudgets) {
            const categoryName = `Budget: ${budget.id}`;
            categoryNodes.push({ name: categoryName, value: budget.amount });
            categoryLinks.push({
              source: 'Fixed Expenses',
              target: categoryName,
              value: budget.amount
            });
          }

          // Add "Otros Gastos" node
          if (otherTotal > 0) {
            categoryNodes.push({ name: 'Otros Gastos', value: otherTotal });
            categoryLinks.push({
              source: 'Fixed Expenses',
              target: 'Otros Gastos',
              value: otherTotal
            });
          }
        }
      }

      setData({
        nodes: [...nodes, ...categoryNodes],
        links: [...links, ...categoryLinks]
      });
    } catch (error) {
      console.error('Error loading snapshot data for Sankey:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshotData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-slate-400 text-center">Cargando datos...</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-slate-400 text-center">No hay datos disponibles</div>
      </div>
    );
  }

  // Simple SVG-based Sankey visualization (fallback if no library available)
  const maxValue = Math.max(...data.nodes.map(n => n.value));
  const nodeWidth = 120;
  const gap = 20;

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Flujo de Ingresos (Sankey)</h3>
      
      <div className="overflow-x-auto">
        <svg width={Math.max(600, data.nodes.length * (nodeWidth + gap))} height={400}>
          {/* Render nodes */}
          {data.nodes.map((node, index) => {
            const x = index * (nodeWidth + gap) + 50;
            const height = (node.value / maxValue) * 300;
            const y = 200 - height / 2;
            
            return (
              <g key={node.name}>
                <rect
                  x={x}
                  y={y}
                  width={nodeWidth}
                  height={Math.max(height, 20)}
                  fill="#3b82f6"
                  rx={4}
                />
                <text
                  x={x + nodeWidth / 2}
                  y={y - 10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={12}
                >
                  ${Math.round(node.value / 100)}
                </text>
                <text
                  x={x + nodeWidth / 2}
                  y={y + Math.max(height, 20) / 2 + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={10}
                >
                  {node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name}
                </text>
              </g>
            );
          })}

          {/* Render links */}
          {data.links.map((link) => {
            const sourceIndex = data.nodes.findIndex(n => n.name === link.source);
            const targetIndex = data.nodes.findIndex(n => n.name === link.target);
            
            if (sourceIndex === -1 || targetIndex === -1) return null;
            
            const sourceX = sourceIndex * (nodeWidth + gap) + 50 + nodeWidth;
            const targetX = targetIndex * (nodeWidth + gap) + 50;
            const linkWidth = Math.max((link.value / maxValue) * 300, 2);
            
            const sourceY = 200;
            const targetY = 200;
            
            return (
              <path
                key={`${link.source}-${link.target}`}
                d={`M ${sourceX} ${sourceY} C ${sourceX + 50} ${sourceY}, ${targetX - 50} ${targetY}, ${targetX} ${targetY}`}
                stroke="#10b981"
                strokeWidth={linkWidth}
                fill="none"
                opacity={0.6}
              />
            );
          })}
        </svg>
      </div>

      <div className="mt-4 text-xs text-slate-400">
        * Datos de snapshot (rendimiento optimizado)
      </div>
    </div>
  );
};