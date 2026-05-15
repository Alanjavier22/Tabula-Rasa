import React, { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
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
  goals?: any[];
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
  goals = [],
}) => {
  const [whatIfPrompt, setWhatIfPrompt] = useState('');
  const [whatIfScenario, setWhatIfScenario] = useState<WhatIfScenario | null>(null);
  const [loadingWhatIf, setLoadingWhatIf] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setWhatIfPrompt('');
      setWhatIfScenario(null);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSimulateWhatIf = useCallback(async () => {
    if (!whatIfPrompt.trim()) {
      return;
    }

    setLoadingWhatIf(true);
    try {
      // Deep Context: Send 150 transactions with proper schema mapping to avoid 422
      const categoryTransactions = transactions.slice(0, 150).map((txn: any) => ({
        id: txn.id || `temp-${Math.random()}`,
        description: txn.description || 'Unknown',
        amount: Math.round(txn.amount || 0),
        date: txn.date || new Date().toISOString().split('T')[0],
        category_id: txn.category_name || 'Uncategorized', // Using category_name as ID for AI context
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
        cashFlow,
        goals
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

  const suggestions = [
    { text: "¿Qué pasaría si me compro una laptop de $1500?", icon: "💻", color: "from-blue-500/20 to-indigo-500/20" },
    { text: "¿Cómo afectaría si aumento mi ahorro en $200?", icon: "💰", color: "from-emerald-500/20 to-teal-500/20" },
    { text: "¿Y si reduzco mis gastos de comida un 30%?", icon: "🍕", color: "from-orange-500/20 to-rose-500/20" }
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-50 flex items-center justify-center p-4 lg:p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className="bg-slate-900/90 border border-white/10 rounded-[3rem] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_30px_100px_rgba(0,0,0,0.6)] relative"
      >
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

        {/* Header - Compacted */}
        <div className="relative flex items-center justify-between py-5 px-10 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <Sparkles className="w-6 h-6 text-blue-400 animate-pulse" />
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-none">Simulador <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">WhatIf</span></h2>
          </div>
          <button 
            onClick={handleClose}
            className="w-10 h-10 rounded-xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-8 md:p-12">
          {!whatIfScenario ? (
            <div className="max-w-5xl mx-auto space-y-10">
              <div className="text-center space-y-3">
                <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">¿Qué tienes en mente hoy?</h3>
                <p className="text-slate-400 text-base font-medium max-w-2xl mx-auto">
                  Simula el impacto de cualquier escenario financiero en tu patrimonio real con nuestra IA.
                </p>
              </div>

              {/* Suggestions Grid - More Imposing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {suggestions.map((suggestion, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ y: -5, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setWhatIfPrompt(suggestion.text)}
                    className={`p-6 rounded-[2rem] bg-gradient-to-br ${suggestion.color} border border-white/5 hover:border-white/20 transition-all text-left flex flex-col gap-4 group`}
                  >
                    <div className="text-3xl shrink-0">{suggestion.icon}</div>
                    <p className="text-sm font-black text-white leading-snug group-hover:text-blue-300 transition-colors">
                      {suggestion.text}
                    </p>
                  </motion.button>
                ))}
              </div>

              {/* Input Area - Imposing Cinema Style */}
              <div className="relative group pt-4">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/30 to-purple-600/30 rounded-[2.5rem] blur-2xl opacity-40 group-focus-within:opacity-100 transition duration-1000"></div>
                <div className="relative flex gap-3 p-3 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-2xl">
                  <input
                    type="text"
                    value={whatIfPrompt}
                    onChange={(e) => setWhatIfPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSimulateWhatIf()}
                    placeholder="Escribe tu escenario financiero aquí..."
                    disabled={loadingWhatIf}
                    className="flex-1 bg-transparent border-none px-6 py-5 text-white text-xl placeholder-slate-500 focus:ring-0 disabled:opacity-50 font-semibold"
                  />
                  <button
                    onClick={handleSimulateWhatIf}
                    disabled={loadingWhatIf || !whatIfPrompt.trim()}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-xl hover:shadow-blue-500/20 disabled:from-slate-800 disabled:to-slate-900 disabled:cursor-not-allowed text-white px-10 rounded-[1.8rem] transition-all flex items-center gap-3 font-black text-xs uppercase tracking-widest"
                  >
                    {loadingWhatIf ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Simular Impacto
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-slate-800/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5">
                  <Sparkles className="w-20 h-20 text-blue-400" />
                </div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2">Escenario Proyectado</p>
                <p className="text-xl md:text-3xl font-black text-white tracking-tight">"{whatIfPrompt}"</p>
              </div>

              <div className="bg-slate-900/50 rounded-[2.5rem] border border-white/5 p-1">
                <AIWhatIfSimulator scenario={whatIfScenario} isLoading={loadingWhatIf} />
              </div>

              <button
                onClick={() => setWhatIfScenario(null)}
                className="w-full py-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/5 transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 group"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Realizar otra Simulación
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
});

WhatIfModal.displayName = 'WhatIfModal';
