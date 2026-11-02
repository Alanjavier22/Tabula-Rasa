import { navigationItems } from '../utils/navigation';
import Modal from './common/Modal';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  Bot,
  CornerDownLeft,
  PlusCircle,
  X,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aiAssistantAPI } from '../services/AIAssistantService';

interface PaletteItem {
  id: string;
  name: string;
  subtitle: string;
  path?: string;
  action?: () => void;
  icon: typeof Search;
  kind: 'section' | 'action';
}

const AI_QUICK_PROMPTS = [
  '¿Cuánto presupuesto disponible me queda este mes?',
  '¿Cuál es el saldo actual de mis cuentas principales?',
  '¿En qué categorías he gastado más durante el mes?',
];

const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [aiResponse, setAiResponse] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 15);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setQuery('');
        setAiResponse('');
      }
    };
    const handleOpenRequest = () => {
      setIsOpen(true);
      setQuery('');
      setAiResponse('');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tabula:open-command-palette', handleOpenRequest);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tabula:open-command-palette', handleOpenRequest);
    };
  }, [isOpen]);

  const closePalette = () => {
    setIsOpen(false);
    setQuery('');
    setAiResponse('');
  };

  const navigateToRoute = (path: string) => {
    navigate(path);
    closePalette();
  };

  const allItems = useMemo<PaletteItem[]>(() => {
    const sectionDescriptions: Record<string, string> = {
      '/': 'Panorama general, liquidez proyectada y análisis del mes',
      '/transactions': 'Libro de movimientos, filtros y registro de operaciones',
      '/accounts': 'Saldos bancarios, efectivo y estados de cuenta de tarjetas',
      '/budgets': 'Límites de gasto mensual por categoría y ritmo de ejecución',
      '/goals': 'Metas de ahorro y seguimiento de fondos reservados',
      '/reminders': 'Vencimientos y compromisos de pago programados',
      '/subscriptions': 'Cargos recurrentes, membresías y servicios activos',
      '/categories': 'Estructura de rubros de ingresos, gastos y transferencias',
      '/snapshots': 'Historial de cierres contables y evolución patrimonial',
      '/fiscal': 'Resumen tributario, retenciones e IVA',
      '/settings': 'Preferencias del sistema, reglas y respaldo de datos',
    };

    const quickActions: PaletteItem[] = [
      {
        id: 'action-new-txn',
        name: 'Registrar nuevo movimiento',
        subtitle: 'Abrir el libro de movimientos para anotar un ingreso o gasto',
        path: '/transactions?action=new',
        icon: PlusCircle,
        kind: 'action',
      },
    ];

    const routeItems: PaletteItem[] = navigationItems.map((item) => ({
      id: `route-${item.path}`,
      name: item.label,
      subtitle: sectionDescriptions[item.path] ?? 'Ir a la sección',
      path: item.path,
      icon: item.icon,
      kind: 'section',
    }));

    return [...routeItems, ...quickActions];
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allItems;
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.subtitle.toLowerCase().includes(normalized),
    );
  }, [allItems, query]);

  const chatMutation = useMutation({
    mutationFn: (message: string) => aiAssistantAPI.chat(message, true, true),
    onSuccess: (res) => {
      setAiResponse(res.response);
      if (res.has_mutations) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
        queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['budgets'] });
      }
    },
    onError: () => {
      setAiResponse(
        'No fue posible procesar tu consulta en este momento. Verifica la conexión o tu clave de IA en Configuración.',
      );
    },
  });

  const handleAIQuery = (customPrompt?: string) => {
    const messageToSend = (customPrompt ?? query).trim();
    if (!messageToSend || chatMutation.isPending) return;
    if (customPrompt) {
      setQuery(customPrompt);
    }
    setAiResponse('');
    chatMutation.mutate(messageToSend);
  };

  const executeItem = (item: PaletteItem) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.path) {
      navigateToRoute(item.path);
    }
  };

  if (!isOpen) return null;

  const isShowingAI = chatMutation.isPending || Boolean(aiResponse);
  const activeIndex =
    filteredItems.length > 0
      ? Math.min(selectedRouteIndex, filteredItems.length - 1)
      : 0;

  return (
    <Modal onClose={closePalette} label="Buscar y navegar">
      <div className="command-palette-panel">
        <div className="command-palette-topbar">
          <span className="command-palette-section-label">
            {isShowingAI
              ? 'Respuesta del asistente financiero IA'
              : 'Navegación rápida y consultas con IA'}
          </span>

          <div className="command-palette-topbar-actions">
            {isShowingAI && (
              <button
                type="button"
                className="command-palette-tab is-active"
                onClick={() => {
                  setAiResponse('');
                  chatMutation.reset();
                  inputRef.current?.focus();
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a resultados</span>
              </button>
            )}
            <kbd className="command-palette-kbd">ESC</kbd>
            <button
              type="button"
              className="command-palette-close"
              onClick={closePalette}
              aria-label="Cerrar ventana de búsqueda"
              title="Cerrar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="command-palette-search">
          {isShowingAI || (query.trim() && filteredItems.length === 0) ? (
            <Sparkles className="command-palette-search-icon is-ai" />
          ) : (
            <Search className="command-palette-search-icon" />
          )}
          <input
            type="text"
            className="command-palette-input"
            aria-label="Buscar sección o preguntar al asistente IA"
            role="combobox"
            aria-expanded={!isShowingAI && filteredItems.length > 0}
            aria-controls="command-routes"
            aria-activedescendant={
              !isShowingAI && filteredItems[activeIndex]
                ? `command-route-${activeIndex}`
                : undefined
            }
            placeholder="Ir a una sección o escribe una pregunta financiera para la IA…"
            value={query}
            ref={inputRef}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedRouteIndex(0);
              if (aiResponse) {
                setAiResponse('');
              }
            }}
            onKeyDown={(e) => {
              if (!isShowingAI && e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedRouteIndex((current) =>
                  filteredItems.length ? (current + 1) % filteredItems.length : 0,
                );
              } else if (!isShowingAI && e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedRouteIndex((current) =>
                  filteredItems.length
                    ? (current - 1 + filteredItems.length) % filteredItems.length
                    : 0,
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (!isShowingAI && filteredItems[activeIndex]) {
                  executeItem(filteredItems[activeIndex]);
                } else if (query.trim()) {
                  handleAIQuery();
                }
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="command-palette-clear"
              onClick={() => {
                setQuery('');
                setAiResponse('');
                setSelectedRouteIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="command-palette-scroll-area">
          {isShowingAI ? (
            <div className="command-palette-ai-body">
              {chatMutation.isPending && (
                <div className="command-palette-ai-loading">
                  <Loader2 className="w-6 h-6 text-accent-strong animate-spin" />
                  <div className="command-palette-ai-loading-copy">
                    <strong>
                      <Bot className="w-4 h-4 inline mr-1.5" />
                      Analizando tus registros contables…
                    </strong>
                    <span>Esto puede tomar unos segundos.</span>
                  </div>
                </div>
              )}

              {!chatMutation.isPending && aiResponse && (
                <div className="command-palette-ai-result">
                  <div className="command-palette-ai-answer">
                    <ReactMarkdown>{aiResponse}</ReactMarkdown>
                  </div>
                  <div className="command-palette-ai-result-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setAiResponse('');
                        inputRef.current?.focus();
                      }}
                      className="app-btn app-btn-ghost"
                    >
                      Nueva búsqueda o pregunta
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {filteredItems.length > 0 ? (
                <div
                  id="command-routes"
                  role="listbox"
                  aria-label="Rutas disponibles"
                  className="command-palette-list"
                >
                  {filteredItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isSelected = activeIndex === idx;
                    const isCurrentRoute =
                      item.path && item.path === location.pathname;

                    return (

                        <button key={item.id}
                          type="button"
                          id={`command-route-${idx}`}
                          role="option"
                          aria-selected={isSelected}
                          className={`command-palette-item ${isSelected ? 'is-selected' : ''}`}
                          onMouseEnter={() => setSelectedRouteIndex(idx)}
                          onClick={() => executeItem(item)}
                        >
                          <span className="command-palette-item-icon">
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="command-palette-item-copy">
                            <span className="command-palette-item-title-row">
                              <span className="command-palette-item-title">
                                {item.name}
                              </span>
                              {isCurrentRoute && (
                                <span className="command-palette-current-badge">
                                  Actual
                                </span>
                              )}
                              {item.kind === 'action' && (
                                <span className="command-palette-kind-badge">
                                  Acción rápida
                                </span>
                              )}
                            </span>
                            <span className="command-palette-item-subtitle">
                              {item.subtitle}
                            </span>
                          </span>
                          <span
                            className="command-palette-item-ActionHint"
                            aria-hidden="true"
                          >
                            <CornerDownLeft className="w-3.5 h-3.5" />
                          </span>
                        </button>

                    );
                  })}
                </div>
              ) : (
                <div className="command-palette-empty">
                  <p className="command-palette-empty-title">
                    Ninguna sección coincide con «{query}»
                  </p>
                  <p className="command-palette-empty-copy">
                    Pulsa <kbd className="command-palette-kbd">↵ Enter</kbd> o haz clic abajo para preguntarle directamente a la IA.
                  </p>
                </div>
              )}

              {query.trim() ? (
                <div className="command-palette-ai-PromptBar">
                  <button
                    type="button"
                    onClick={() => handleAIQuery()}
                    className="command-palette-ai-trigger"
                  >
                    <Sparkles className="w-4 h-4 text-accent-strong shrink-0" />
                    <span className="command-palette-ai-trigger-text">
                      Preguntar a la IA: <strong>«{query.trim()}»</strong>
                    </span>
                    <ArrowRight className="w-4 h-4 ml-auto shrink-0" />
                  </button>
                </div>
              ) : (
                <div className="command-palette-ai-PromptBar">
                  <span className="command-palette-section-label">
                    Consultas rápidas con IA
                  </span>
                  <div className="command-palette-prompt-grid">
                    {AI_QUICK_PROMPTS.map((promptText) => (
                      <button
                        key={promptText}
                        type="button"
                        className="command-palette-prompt-chip"
                        onClick={() => handleAIQuery(promptText)}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>{promptText}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="command-palette-footer">
          <span>
            <kbd className="command-palette-kbd">↑</kbd>{' '}
            <kbd className="command-palette-kbd">↓</kbd> navegar
          </span>
          <span>
            <kbd className="command-palette-kbd">↵</kbd>{' '}
            {!isShowingAI && filteredItems.length === 0 && query.trim()
              ? 'consultar a la IA'
              : 'seleccionar'}
          </span>
          <span>
            <kbd className="command-palette-kbd">ESC</kbd> cerrar
          </span>
        </div>
      </div>
    </Modal>
  );
};

export default CommandPalette;
