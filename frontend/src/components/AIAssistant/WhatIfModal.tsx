import React, { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { AIWhatIfSimulator } from './AIWhatIfSimulator';
import { AIAgentService } from '../../services/AIAgentService';
import type { WhatIfScenario } from '../../services/AIAgentService';

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  currentNetWorth: number;
  apiKey: string;
  monthlyIncome?: number;
  fixedExpenses?: number;
  totalDebt?: number;
  monthlyDebtPayment?: number;
  avgMonthlySpend?: number;
}

export const WhatIfModal = React.memo<WhatIfModalProps>(({
  isOpen,
  onClose,
  transactions,
  currentNetWorth,
  apiKey,
  monthlyIncome,
  fixedExpenses,
  totalDebt,
  monthlyDebtPayment,
  avgMonthlySpend,
}) => {
  const [whatIfPrompt, setWhatIfPrompt] = useState('');
  const [whatIfScenario, setWhatIfScenario] = useState<WhatIfScenario | null>(null);
  const [loadingWhatIf, setLoadingWhatIf] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setWhatIfPrompt('');
      setWhatIfScenario(null);
    }
  }, [isOpen]);

  const handleSimulateWhatIf = useCallback(async () => {
    if (!whatIfPrompt.trim()) {
      return;
    }

    setLoadingWhatIf(true);
    try {
      // Get transactions for the scenario
      const categoryTransactions = transactions.slice(0, 50).map((txn: any) => ({
        id: txn.id || 'unknown',
        description: txn.description || 'Unknown transaction',
        amount: txn.amount || 0,
        date: txn.date || new Date().toISOString().split('T')[0],
        category_id: txn.category_id || null,
      }));

      // Use provided props or fall back to 0
      const income = monthlyIncome || 0;
      const expenses = fixedExpenses || 0;
      const debt = totalDebt || 0;
      const debtPayment = monthlyDebtPayment || (debt * 0.05);
      const cashFlow = income - expenses - debtPayment - (avgMonthlySpend || 0);

      const scenario = await AIAgentService.simulateWhatIfScenario(
        whatIfPrompt,
        categoryTransactions,
        currentNetWorth,
        apiKey,
        income,
        expenses,
        debt,
        debtPayment,
        cashFlow
      );
      setWhatIfScenario(scenario);
    } catch (error) {
      console.error('Error simulating WhatIf scenario:', error);
    } finally {
      setLoadingWhatIf(false);
    }
  }, [whatIfPrompt, transactions, currentNetWorth, apiKey]);

  const handleClose = useCallback(() => {
    setWhatIfPrompt('');
    setWhatIfScenario(null);
    onClose();
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Simulador WhatIf</h2>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {!whatIfScenario ? (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                Escribe un escenario financiero para simular su impacto en tus finanzas. Por ejemplo:
              </p>
              <ul className="text-slate-400 text-sm list-disc list-inside space-y-1">
                <li>"¿Qué pasaría si me compro una laptop de $1500?"</li>
                <li>"¿Cómo afectaría mis finanzas si aumento mi ahorro mensual en $200?"</li>
                <li>"¿Qué impacto tendría si redujo mis gastos de alimentación en un 30%?"</li>
              </ul>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whatIfPrompt}
                  onChange={(e) => setWhatIfPrompt(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSimulateWhatIf()}
                  placeholder="Escribe tu escenario..."
                  disabled={loadingWhatIf}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  onClick={handleSimulateWhatIf}
                  disabled={loadingWhatIf || !whatIfPrompt.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  {loadingWhatIf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Simulando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Simular
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">Escenario simulado:</p>
                <p className="text-white">{whatIfPrompt}</p>
              </div>
              <AIWhatIfSimulator scenario={whatIfScenario} isLoading={loadingWhatIf} />
              <button
                onClick={() => setWhatIfScenario(null)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Simular otro escenario
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

WhatIfModal.displayName = 'WhatIfModal';
