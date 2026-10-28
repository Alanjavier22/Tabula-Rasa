import { navigationItems } from '../utils/navigation';
import Modal from './common/Modal';
import { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Send, Loader2, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiAssistantAPI } from '../services/AIAssistantService';

const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'navigation' | 'ai'>('navigation');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [aiResponse, setAiResponse] = useState('');
  const navigationInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen && mode === 'navigation') {
      navigationInputRef.current?.focus();
    }
  }, [isOpen, mode]);

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
    const handleOpenRequest = () => {
      setIsOpen(true);
      setMode('navigation');
      setQuery('');
      setAiResponse('');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tabula:open-command-palette', handleOpenRequest);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tabula:open-command-palette', handleOpenRequest);
    };
  }, []);

  const routes = navigationItems.map(item => ({ name: item.label, path: item.path, icon: item.icon }));

  const filteredRoutes = routes.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));

  const chatMutation = useMutation({
    mutationFn: (message: string) => aiAssistantAPI.chat(message, true, true),
    onSuccess: (res) => {
      setAiResponse(res.response);
      if (res.has_mutations) {
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

  const navigateToRoute = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <Modal onClose={() => setIsOpen(false)} label={'Buscar y navegar'}>
      <button
        type="button"
        aria-label="Cerrar paleta de comandos"
        className="absolute inset-0 bg-overlay "
        onClick={() => setIsOpen(false)}
      />
      <div className="relative bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {mode === 'navigation' ? (
          <>
            <div className="flex items-center px-4 border-b border-line">
              <Search className="w-5 h-5 text-muted" />
              <input
                type="text"
                className="w-full bg-transparent border-0 text-primary px-4 py-4 focus:ring-0 placeholder:text-muted outline-none"
                aria-label="Buscar sección"
                role="combobox" aria-expanded={filteredRoutes.length > 0} aria-controls="command-routes" aria-activedescendant={filteredRoutes[selectedRouteIndex] ? `command-route-${selectedRouteIndex}` : undefined}
                placeholder="Buscar una sección…"
                value={query}
                ref={navigationInputRef}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedRouteIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedRouteIndex((current) => filteredRoutes.length ? (current + 1) % filteredRoutes.length : 0);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedRouteIndex((current) => filteredRoutes.length ? (current - 1 + filteredRoutes.length) % filteredRoutes.length : 0);
                  } else if (e.key === 'Enter' && filteredRoutes[selectedRouteIndex]) {
                    e.preventDefault();
                    navigateToRoute(filteredRoutes[selectedRouteIndex].path);
                  }
                }}
              />
              <kbd className="hidden sm:inline-block bg-surface text-muted text-xs px-2 py-1 rounded-md">ESC</kbd>
            </div>
            {filteredRoutes.length > 0 ? (
              <ul
                id="command-routes" role="listbox"
                aria-label="Rutas disponibles"
                className="max-h-72 overflow-y-auto p-2"
              >
                {filteredRoutes.map((route) => {
                  const Icon = route.icon;
                  return (
                    <li role="presentation" key={route.path}>
                      <button
                        type="button"
                        id={`command-route-${filteredRoutes.indexOf(route)}`} role="option"
                        aria-selected={selectedRouteIndex === filteredRoutes.indexOf(route)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left text-muted hover:bg-surface hover:text-primary rounded-xl transition-colors ${selectedRouteIndex === filteredRoutes.indexOf(route) ? 'bg-accent-soft' : ''}`}
                        onMouseEnter={() => setSelectedRouteIndex(filteredRoutes.indexOf(route))}
                        onClick={() => navigateToRoute(route.path)}
                      >
                        <Icon className="w-4 h-4 text-accent-strong" />
                        {route.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-8 text-center text-muted">No se encontraron resultados para "{query}"</div>
            )}
            {query && (
              <div className="p-3 border-t border-line">
                <button
                  onClick={() => setMode('ai')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-soft   text-primary rounded-lg   transition-all text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Consultar al asistente
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 border-b border-line">
              <div className="flex items-center gap-2 flex-1">
                <Sparkles className="w-5 h-5 text-accent-strong" />
                <input
                  type="text"
                  className="w-full bg-transparent border-0 text-primary px-4 py-4 focus:ring-0 placeholder:text-muted outline-none"
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
                className="ml-2 text-muted hover:text-primary text-sm"
              >
                Navegación
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-4">
              {chatMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2 className="w-8 h-8 text-accent-strong animate-spin" />
                  <div className="space-y-2 text-center flex flex-col items-center">
                    <span className="text-accent-strong font-medium animate-pulse flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      La IA está pensando y ejecutando acciones...
                    </span>
                    <span className="text-xs text-muted">Esto puede tomar unos segundos...</span>
                  </div>
                </div>
              )}
              {!chatMutation.isPending && aiResponse && (
                <div className="space-y-4">
                  <div className="bg-surface-soft    rounded-xl border border-line p-4 prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                    <ReactMarkdown>{aiResponse}</ReactMarkdown>
                  </div>
                  <button
                    onClick={() => {
                      setQuery('');
                      setAiResponse('');
                    }}
                    className="w-full text-center text-sm text-muted hover:text-primary"
                  >
                    Hacer otra pregunta
                  </button>
                </div>
              )}
              {!chatMutation.isPending && !aiResponse && (
                <div className="text-center py-8">
                  <p className="text-muted text-sm mb-4">Ejemplos de preguntas:</p>
                  <ul className="text-left text-sm text-muted space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-strong">•</span>{' '}
                      ¿Cuánto presupuesto me queda en Comida?
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-strong">•</span>{' '}
                      ¿Cuál es el saldo de mi cuenta principal?
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-strong">•</span>{' '}
                      ¿Cuánto dinero tengo en total?
                    </li>
                  </ul>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-3 border-t border-line">
              <button
                type="submit"
                disabled={chatMutation.isPending || !query.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-soft   text-primary rounded-lg   transition-all text-sm disabled:opacity-50"
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
    </Modal>
  );
};

export default CommandPalette;
