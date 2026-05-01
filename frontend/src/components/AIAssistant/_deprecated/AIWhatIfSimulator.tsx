import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { WhatIfScenario } from '../../services/AIAgentService';

interface AIWhatIfSimulatorProps {
  scenario: WhatIfScenario | null;
  isLoading?: boolean;
}

export const AIWhatIfSimulator: React.FC<AIWhatIfSimulatorProps> = ({
  scenario,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="ai-what-if-simulator">
        <div className="loading-state">Loading projection...</div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="ai-what-if-simulator">
        <p>No scenario data available</p>
      </div>
    );
  }

  return (
    <div className="ai-what-if-simulator">
      <div className="scenario-header">
        <h3>{scenario.scenario_title}</h3>
        <p className="scenario-summary">{scenario.summary}</p>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={scenario.projection}>
            <XAxis
              dataKey="month"
              label={{ value: 'Month', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Net Worth ($)', angle: -90, position: 'insideLeft' }}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
            />
            <Tooltip
              formatter={(value: number) => `$${value.toLocaleString()}`}
              labelFormatter={(label) => `Month ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="baseline_net_worth"
              stroke="#9ca3af"
              strokeWidth={2}
              name="Baseline (Current)"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="projected_net_worth"
              stroke="#3b82f6"
              strokeWidth={3}
              name="Projected (Optimized)"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
