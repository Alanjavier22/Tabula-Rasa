/**
 * AIAssistantDrawer - FASE 8: Conversational AI interface for audit context
 * Consumes prepareAuditContext() from ReportingService
 * Sanitizes data before sending to Gemini API
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Loader2, AlertTriangle, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { reportingService } from '../../services/ReportingService';
import { aiAssistantAPI } from '../../services/api';

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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || loading) return;

    let base64File: string | undefined;
    let mimeType: string | undefined;

    if (attachedFile) {
      mimeType = attachedFile.type;
      base64File = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(attachedFile);
      });
    }

    const userMessage: Message = {
      role: 'user',
      content: attachedFile ? `[Adjunto: ${attachedFile.name}]\n${input}` : input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedFile(null); // Clear file after sending
    if (fileInputRef.current) fileInputRef.current.value = '';
    setLoading(true);

    try {
      // Pide flujo de caja y activos context si es relevante
      const wantsCashFlow = input.toLowerCase().includes('presupuesto') || input.toLowerCase().includes('flujo') || input.toLowerCase().includes('dinero') || input.toLowerCase().includes('saldo');
      const wantsAssets = input.toLowerCase().includes('vehículo') || input.toLowerCase().includes('computadora') || input.toLowerCase().includes('valor');

      const response = await aiAssistantAPI.chat(input || "Por favor analiza el archivo adjunto.", wantsCashFlow, wantsAssets, base64File, mimeType);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.response || 'No recibí respuesta de la IA.',
        timestamp: new Date(),
      }]);
    } catch (error) {
      console.error('[AIAssistant] Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error al procesar tu mensaje. Verifica tu conexión o tu API Key.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[800px] bg-slate-900 shadow-2xl z-50 flex flex-col">
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
              className={`max-w-[90%] rounded-lg p-4 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              <p className="text-base whitespace-pre-wrap">{msg.content}</p>
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
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2 bg-slate-700/50 rounded-lg p-2 border border-slate-600 w-fit max-w-[90%]">
            {attachedFile.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-blue-400" /> : <FileText className="w-4 h-4 text-orange-400" />}
            <span className="text-xs text-slate-300 truncate">{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="text-slate-400 hover:text-white ml-2">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,.pdf"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 h-10"
            title="Adjuntar PDF o Imagen"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta o adjunta un PDF..."
            disabled={loading || sanitizing}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 h-10"
          />
          <button
            onClick={handleSend}
            disabled={loading || sanitizing || (!input.trim() && !attachedFile)}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 rounded-lg transition-colors h-10 flex items-center justify-center"
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
