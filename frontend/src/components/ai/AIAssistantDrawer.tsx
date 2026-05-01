/**
 * AIAssistantDrawer - FASE 8: Conversational AI interface for audit context
 * Consumes prepareAuditContext() from ReportingService
 * Sanitizes data before sending to Gemini API
 */

import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, X, Loader2, AlertTriangle } from 'lucide-react';
import { reportingService } from '../../services/ReportingService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sanitizing, setSanitizing] = useState(false);
  const [auditContext, setAuditContext] = useState<{ discrepancies: any[]; total_scanned: number } | null>(null);

  useEffect(() => {
    if (isOpen && !auditContext) {
      loadAuditContext();
    }
  }, [isOpen, auditContext]);

  const loadAuditContext = async () => {
    setSanitizing(true);
    try {
      const context = await reportingService.prepareAuditContext();
      setAuditContext(context);
      
      if (context.discrepancies.length > 0) {
        setMessages([{
          role: 'assistant',
          content: `He analizado ${context.total_scanned} transacciones y encontrado ${context.discrepancies.length} posibles anomalías de categoría. ¿Quieres que te las detalle?`,
          timestamp: new Date(),
        }]);
      } else {
        setMessages([{
          role: 'assistant',
          content: `He analizado ${context.total_scanned} transacciones y no encontré anomalías de categoría. ¡Todo parece correcto!`,
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      console.error('[AIAssistant] Error loading audit context:', error);
      setMessages([{
        role: 'assistant',
        content: 'Error al cargar el contexto de auditoría. Por favor intenta nuevamente.',
        timestamp: new Date(),
      }]);
    } finally {
      setSanitizing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // In production, this would call Gemini API with sanitized audit context
      // For now, simulate AI response
      setTimeout(() => {
        let response = '';
        
        if (input.toLowerCase().includes('detalle') || input.toLowerCase().includes('anomalía')) {
          if (auditContext && auditContext.discrepancies.length > 0) {
            const top3 = auditContext.discrepancies.slice(0, 3);
            response = `Aquí están las principales anomalías:\n\n${top3.map(d => 
              `- "${d.description}" está en "${d.current_category}" pero podría ser "${d.suggested_category}" (confianza: ${d.confidence * 100}%)`
            ).join('\n')}\n\n¿Quieres que corrija alguna de estas?`;
          } else {
            response = 'No hay anomalías para detallar en este momento.';
          }
        } else if (input.toLowerCase().includes('corrige') || input.toLowerCase().includes('categoría')) {
          response = 'Puedo ayudarte a corregir categorías en masa. Selecciona las transacciones que deseas actualizar y usaré el sistema de actualización atómica para evitar corrupción de datos.';
        } else {
          response = 'Entiendo tu consulta. Estoy analizando los datos sanitizados de tus transacciones para ayudarte con auditorías fiscales y optimización de categorías. ¿Qué necesitas específicamente?';
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        }]);
        setLoading(false);
      }, 1500);
    } catch (error) {
      console.error('[AIAssistant] Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error al procesar tu mensaje. Por favor intenta nuevamente.',
        timestamp: new Date(),
      }]);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-slate-900 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <MessageSquare className="w-6 h-6 text-blue-500" />
            {sanitizing && <Loader2 className="absolute -top-1 -right-1 w-3 h-3 text-green-500 animate-spin" />}
          </div>
          <div>
            <h2 className="text-white font-semibold">Asistente IA</h2>
            <p className="text-xs text-slate-400">
              {sanitizing ? 'Sanitizando datos...' : auditContext ? `${auditContext.total_scanned} txns analizadas` : 'Cargando...'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              <p className="text-xs opacity-60 mt-1">
                {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-lg p-3">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700 bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre tus transacciones..."
            disabled={loading || sanitizing}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || sanitizing || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {auditContext && auditContext.discrepancies.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 rounded-lg p-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{auditContext.discrepancies.length} anomalías detectadas</span>
          </div>
        )}
      </div>
    </div>
  );
};
