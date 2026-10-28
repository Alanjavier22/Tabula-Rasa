import Modal from '../common/Modal';
import React, { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { AIWhatIfSimulator } from './AIWhatIfSimulator';
import { AIAgentService } from '../../services/AIAgentService';
import api from '../../services/api';
import type { WhatIfScenario } from '../../services/AIAgentService';
import type { Transaction, Goal, SuggestedScenario } from '../../types';

/** Sugerencias hardcodeadas de fallback traen icon/color; las de la API no. */
type ScenarioSuggestion = SuggestedScenario & { icon?: string; color?: string };

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  currentNetWorth: number;
  monthlyIncome?: number;
  fixedExpenses?: number;
  totalDebt?: number;
  monthlyDebtPayment?: number;
  avgMonthlySpend?: number;
  goals?: Goal[];
}

export const WhatIfModal = React.memo<WhatIfModalProps>(({
  isOpen,
  onClose,
  transactions,
  currentNetWorth,
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
  const [dynamicSuggestions, setDynamicSuggestions] = useState<SuggestedScenario[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      fetchSuggestions();
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
      const categoryTransactions = transactions.slice(0, 150).map((txn, index) => ({
        id: txn.id || `temp-${index}`,
        description: txn.description || 'Unknown',
        amount: Math.round(txn.amount || 0),
        date: txn.date || new Date().toISOString().split('T')[0],
        category_id: txn.category?.name || 'Uncategorized', // nombre de categoría como contexto, no un ID real
      }));

      // Use provided props or fall back to 0
      const income = monthlyIncome || 0;
      const expenses = fixedExpenses || 0;
      const debt = totalDebt || 0;
      const debtPayment = monthlyDebtPayment || (debt * 0.05);
      const cashFlow = income - expenses - debtPayment - (avgMonthlySpend || 0);

      const scenario = await AIAgentService.simulateWhatIfScenario(
        {
          userPrompt: whatIfPrompt,
          categoryTransactions,
          currentNetWorth,
          monthlyIncome: income,
          fixedExpenses: expenses,
          totalDebt: debt,
          monthlyDebtPayment: debtPayment,
          monthlyCashFlow: cashFlow,
          goals,
        }
      );
      setWhatIfScenario(scenario);
    } catch (error) {
      console.error('Error simulating WhatIf scenario:', error);
    } finally {
      setLoadingWhatIf(false);
    }
  }, [whatIfPrompt, transactions, currentNetWorth, monthlyIncome, fixedExpenses, totalDebt, monthlyDebtPayment, avgMonthlySpend, goals]);

  const handleClose = useCallback(() => {
    setWhatIfPrompt('');
    setWhatIfScenario(null);
    onClose();
  }, [onClose]);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const response = await api.get<SuggestedScenario[]>('/api/ai/whatif/suggest-scenarios');
      setDynamicSuggestions(response.data);
    } catch (error) {
      console.error('Error fetching dynamic suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const suggestionsToUse: ScenarioSuggestion[] = dynamicSuggestions.length > 0 ? dynamicSuggestions : [
    { user_prompt: "¿Qué pasaría si me compro una laptop de $1500?", title: "Compra Laptop", description: "Simular gasto puntual", icon: "💻", color: " " },
    { user_prompt: "¿Cómo afectaría si aumento mi ahorro en $200?", title: "Ahorro Extra", description: "Mejorar capacidad de ahorro", icon: "💰", color: " " },
    { user_prompt: "¿Y si reduzco mis gastos de comida un 30%?", title: "Comida en Casa", description: "Optimizar gastos variables", icon: "🍕", color: " " }
  ];

  const colors = [
    " ",
    " ",
    " "
  ];

  return (
    <Modal onClose={onClose} label={'Simular escenario'}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className="bg-surface border border-line rounded-2xl md:rounded-2xl w-full max-w-6xl max-h-[95vh] md:max-h-[90vh] overflow-hidden flex flex-col  relative"
      >
        {/* Glow Effects */}



        {/* Header - Compacted */}
        <div className="relative flex items-center justify-between py-3 md:py-5 px-6 md:px-10 border-b border-line shrink-0">
          <div className="flex items-center gap-4">
            <Sparkles className="w-6 h-6 text-info animate-pulse" />
            <h2 className="text-xl md:text-2xl font-black text-primary tracking-tight leading-none">Simulador <span className="text-primary  ">WhatIf</span></h2>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-xl hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4 md:p-12">
          {!whatIfScenario ? (
            <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-primary tracking-tight">¿Qué tienes en mente hoy?</h3>
                <p className="text-muted text-sm font-medium max-w-2xl mx-auto">
                  Simula el impacto de cualquier escenario financiero en tu patrimonio real con nuestra IA.
                </p>
              </div>

              {/* Suggestions Grid - More Imposing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {loadingSuggestions ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-32 rounded-2xl bg-surface-soft animate-pulse" />
                  ))
                ) : (
                  suggestionsToUse.map((suggestion, idx) => (
                    <motion.button
                      key={suggestion.user_prompt}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setWhatIfPrompt(suggestion.user_prompt)}
                      className={`p-5 rounded-[1.8rem] bg-surface-soft ${suggestion.color || colors[idx % colors.length]} border border-line hover:border-line transition-all text-left flex flex-col gap-2.5 group`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xl shrink-0">{suggestion.icon || "💡"}</div>
                        <Sparkles className="w-3.5 h-3.5 text-muted group-hover:text-info transition-colors" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-muted uppercase tracking-widest mb-0.5">{suggestion.title || "Sugerencia"}</p>
                        <p className="text-xs font-bold text-primary leading-snug group-hover:text-info transition-colors">
                          {suggestion.description || suggestion.user_prompt}
                        </p>
                      </div>
                    </motion.button>
                  ))
                )}
              </div>

              {/* Input Area - Imposing Cinema Style */}
              <div className="relative group pt-4">
                <div className="absolute -inset-1 bg-surface-soft   rounded-3xl  opacity-30 group-focus-within:opacity-80 transition duration-1000"></div>
                <div className="relative flex gap-3 p-2.5 bg-canvas  border border-line rounded-3xl shadow-2xl">
                  <input
                    type="text"
                    value={whatIfPrompt}
                    onChange={(e) => setWhatIfPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSimulateWhatIf()}
                    placeholder="Escribe tu escenario financiero aquí..."
                    disabled={loadingWhatIf}
                    className="flex-1 bg-transparent border-none px-5 py-4 text-primary text-lg placeholder-muted focus:ring-0 disabled:opacity-50 font-semibold"
                  />
                  <button
                    onClick={handleSimulateWhatIf}
                    disabled={loadingWhatIf || !whatIfPrompt.trim()}
                    className="bg-surface-soft   hover:shadow-xl  disabled: disabled: disabled:cursor-not-allowed text-primary px-8 rounded-2xl transition-all flex items-center gap-2.5 font-black text-xs uppercase tracking-widest"
                  >
                    {loadingWhatIf ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4.5 h-4.5" />
                        Simular Impacto
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-surface  border border-line rounded-3xl p-4 md:p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Sparkles className="w-12 h-12 text-info" />
                </div>
                <p className="text-xs font-black text-info uppercase tracking-[0.3em] mb-1">Escenario Proyectado</p>
                <p className="text-lg md:text-xl font-bold text-primary tracking-tight leading-tight">"{whatIfPrompt}"</p>
              </div>

              <div className="bg-canvas rounded-3xl border border-line p-0.5">
                <AIWhatIfSimulator scenario={whatIfScenario} isLoading={loadingWhatIf} />
              </div>

              <button
                onClick={() => setWhatIfScenario(null)}
                className="w-full py-4 bg-surface-soft hover:bg-surface-soft text-primary rounded-xl border border-line transition-all text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 group"
              >
                <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                Nueva Simulación
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </Modal>
  );
});

WhatIfModal.displayName = 'WhatIfModal';
