import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, RefreshCw, Loader2 } from 'lucide-react';
import { AIAgentService } from '../../services/AIAgentService';
import type { AnomalyScanResult, ZombieSubscription } from '../../services/AIAgentService';
import { subscriptionsAPI } from '../../services/api';

interface AIAnomalyScannerProps {
  recentTransactions: any[];
  currentSubscriptions: any[];
  categories: any[];
  goals: any[];
  apiKey: string;
  onClose?: () => void;
}

export const AIAnomalyScanner: React.FC<AIAnomalyScannerProps> = ({
  recentTransactions,
  currentSubscriptions,
  categories,
  goals,
  apiKey,
  onClose,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<AnomalyScanResult | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setResult(null);
    try {
      const scanResult = await AIAgentService.scanForAnomalies(
        recentTransactions,
        currentSubscriptions,
        categories,
        goals,
        apiKey
      );
      setResult(scanResult);
    } catch (error: any) {
      console.error('Error scanning for anomalies:', error);
      alert('Error al escanear anomalías. Por favor, verifica tu conexión o API Key.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSubscription = async (zombie: ZombieSubscription) => {
    try {
      await subscriptionsAPI.create({
        name: zombie.description,
        amount: zombie.estimated_amount, // Already in cents from backend
        frequency: 'monthly',
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      alert('Subscription added successfully');
    } catch (error) {
      console.error('Error adding subscription:', error);
      alert('Failed to add subscription');
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || categoryId; // Show category_id if name not found
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
          Escáner de Anomalías
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {!result && !isScanning && (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            Escanea tus finanzas para detectar suscripciones olvidadas (zombies) y gastos anormalmente altos.
          </p>
          <button
            onClick={handleScan}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Escanear Anomalías
          </button>
        </div>
      )}

      {isScanning && (
        <div className="flex flex-col items-center justify-center py-10">
          <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mb-4" />
          <p className="text-slate-400">Analizando patrones financieros...</p>
        </div>
      )}

      {result && !isScanning && (
        <div className="space-y-4">
          <button
            onClick={handleScan}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Escanear Nuevamente
          </button>

          {!result.zombie_subscriptions.length && !result.spending_spikes.length && (
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-green-400 font-semibold">¡Finanzas limpias!</p>
                <p className="text-slate-400 text-sm">No se detectaron anomalías.</p>
              </div>
            </div>
          )}

          {result.zombie_subscriptions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Suscripciones Olvidadas ({result.zombie_subscriptions.length})
              </h3>
              {result.zombie_subscriptions.map((zombie, idx) => (
                <div key={idx} className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold">{zombie.description}</p>
                      <p className="text-red-400">${(zombie.estimated_amount / 100).toFixed(2)}/mes</p>
                    </div>
                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded">
                      {Math.round(zombie.confidence * 100)}% confianza
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mb-3">{zombie.reasoning}</p>
                  <button
                    onClick={() => handleAddSubscription(zombie)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    Agregar a Suscripciones
                  </button>
                </div>
              ))}
            </div>
          )}

          {result.spending_spikes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Gastos Anormales ({result.spending_spikes.length})
              </h3>
              {result.spending_spikes.map((spike, idx) => (
                <div key={idx} className="bg-orange-900/20 border border-orange-700 rounded-lg p-4">
                  <p className="text-white font-semibold mb-2">{getCategoryName(spike.category_id)}</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-slate-400 text-xs">Promedio Normal</p>
                      <p className="text-white">${(spike.normal_average / 100).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Gasto Actual</p>
                      <p className="text-orange-400">${(spike.current_spike / 100).toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="text-orange-400 text-sm mb-2">
                    Exceso: ${((spike.current_spike - spike.normal_average) / 100).toFixed(2)}
                  </p>
                  <p className="text-slate-400 text-sm">{spike.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
