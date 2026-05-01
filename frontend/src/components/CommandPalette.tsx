import { useState, useEffect } from 'react';
import { Search, Home, DollarSign, PieChart, Target, Calendar, List, Sparkles, Send, Loader2, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiAssistantAPI } from '../services/api';

const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'navigation' | 'ai'>('navigation');
  const [aiResponse, setAiResponse] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setMode('navigation');
        setQuery('');
        setAiResponse('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const routes = [
    { name: 'Ir al Panel Principal', path: '/', icon: Home },
    { name: 'Ver Transacciones', path: '/transactions', icon: List },
    { name: 'Gestionar Cuentas', path: '/accounts', icon: DollarSign },
    { name: 'Ver Presupuestos', path: '/budgets', icon: PieChart },
    { name: 'Metas Financieras', path: '/goals', icon: Target },
    { name: 'Recordatorios', path: '/reminders', icon: Calendar },
  ];

  const filteredRoutes = routes.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));

  const chatMutation = useMutation({
    mutationFn: (message: string) => aiAssistantAPI.chat(message),
    onSuccess: (res) => {
      setAiResponse(res.data.response);
      if (res.data.has_mutations) {
        // Invalidate all relevant queries to refresh the UI "magically"
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
        queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
        // Can add 'ious' if you have an IOU fetcher
      }
    },
    onError: () => {
      setAiResponse('Error al procesar tu consulta. Por favor intenta nuevamente.');
    }
  });

  const handleAIQuery = () => {
    if (!query.trim()) return;
    setMode('ai');
    chatMutation.mutate(query);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMutation.isPending) {
      handleAIQuery();
    }
  };

  const resetToNavigation = () => {
    setMode('navigation');
    setQuery('');
    setAiResponse('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[20vh] px-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      <div className="relative bg-slate-800 border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {mode === 'navigation' ? (
          <>
            <div className="flex items-center px-4 border-b border-slate-700/50">
              <Search className="w-5 h-5 text-slate-400" />
              <input
                autoFocus
                type="text"
                className="w-full bg-transparent border-0 text-white px-4 py-4 focus:ring-0 placeholder:text-slate-500 outline-none"
                placeholder="Buscar o saltar a... (Usa las flechas)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="hidden sm:inline-block bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-md">ESC</kbd>
            </div>
            {filteredRoutes.length > 0 ? (
              <ul className="max-h-72 overflow-y-auto p-2">
                {filteredRoutes.map((route, i) => {
                  const Icon = route.icon;
                  return (
                    <li key={i}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-300 hover:bg-slate-700/50 hover:text-white rounded-xl transition-colors"
                        onClick={() => {
                          navigate(route.path);
                          setIsOpen(false);
                          setQuery('');
                        }}
                      >
                        <Icon className="w-4 h-4 text-purple-400" />
                        {route.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-8 text-center text-slate-500">No se encontraron resultados para "{query}"</div>
            )}
            {query && (
              <div className="p-3 border-t border-slate-700/50">
                <button
                  onClick={() => setMode('ai')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Preguntar a IA Assistant
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 border-b border-slate-700/50">
              <div className="flex items-center gap-2 flex-1">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-transparent border-0 text-white px-4 py-4 focus:ring-0 placeholder:text-slate-500 outline-none"
                  placeholder="Pregunta sobre tus finanzas (ej: ¿Cuánto presupuesto me queda en Comida?)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !chatMutation.isPending) {
                      e.preventDefault();
                      handleAIQuery();
                    }
                  }}
                />
              </div>
              <button
                onClick={resetToNavigation}
                className="ml-2 text-slate-400 hover:text-white text-sm"
              >
                Navegación
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-4">
              {chatMutation.isPending ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                  <div className="space-y-2 text-center flex flex-col items-center">
                    <span className="text-purple-300 font-medium animate-pulse flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      La IA está pensando y ejecutando acciones...
                    </span>
                    <span className="text-xs text-slate-500">Esto puede tomar unos segundos...</span>
                  </div>
                </div>
              ) : aiResponse ? (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 backdrop-blur-xl rounded-xl border border-purple-500/50 p-4">
                    <p className="text-slate-200 text-sm leading-relaxed">{aiResponse}</p>
                  </div>
                  <button
                    onClick={() => {
                      setQuery('');
                      setAiResponse('');
                    }}
                    className="w-full text-center text-sm text-slate-400 hover:text-white"
                  >
                    Hacer otra pregunta
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-sm mb-4">Ejemplos de preguntas:</p>
                  <ul className="text-left text-sm text-slate-500 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      ¿Cuánto presupuesto me queda en Comida?
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      ¿Cuál es el saldo de mi cuenta principal?
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      ¿Cuánto dinero tengo en total?
                    </li>
                  </ul>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-3 border-t border-slate-700/50">
              <button
                type="submit"
                disabled={chatMutation.isPending || !query.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all text-sm disabled:opacity-50"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default CommandPalette;
