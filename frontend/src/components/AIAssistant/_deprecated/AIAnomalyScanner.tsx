import React, { useState } from 'react';
import { AIAgentService } from '../../services/AIAgentService';
import type { AnomalyScanResult, ZombieSubscription } from '../../services/AIAgentService';
import { subscriptionsAPI } from '../../services/api';

interface AIAnomalyScannerProps {
  recentTransactions: any[];
  currentSubscriptions: any[];
  categories: any[];
  apiKey: string;
}

export const AIAnomalyScanner: React.FC<AIAnomalyScannerProps> = ({
  recentTransactions,
  currentSubscriptions,
  categories,
  apiKey,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<AnomalyScanResult | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const scanResult = await AIAgentService.scanForAnomalies(
        recentTransactions,
        currentSubscriptions,
        apiKey
      );
      setResult(scanResult);
    } catch (error) {
      console.error('Error scanning for anomalies:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSubscription = async (zombie: ZombieSubscription) => {
    try {
      await subscriptionsAPI.create({
        name: zombie.description,
        amount: zombie.estimated_amount,
        billing_cycle: 'monthly',
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
    return category?.name || 'Unknown';
  };

  if (!result) {
    return (
      <div className="ai-anomaly-scanner">
        <button onClick={handleScan} disabled={isScanning}>
          {isScanning ? '🔍 Scanning...' : '🔍 Scan Finances'}
        </button>
      </div>
    );
  }

  const hasZombies = result.zombie_subscriptions.length > 0;
  const hasSpikes = result.spending_spikes.length > 0;

  if (!hasZombies && !hasSpikes) {
    return (
      <div className="ai-anomaly-scanner">
        <div className="clean-state">
          <p>✅ Your finances are clean. No leaks detected.</p>
          <button onClick={() => setResult(null)}>Scan Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-anomaly-scanner">
      <div className="scanner-header">
        <h3>Anomaly Detection Results</h3>
        <button onClick={() => setResult(null)}>Scan Again</button>
      </div>

      {hasZombies && (
        <div className="anomaly-section">
          <h4>🔴 Ghost Subscriptions (Zombies)</h4>
          {result.zombie_subscriptions.map((zombie, idx) => (
            <div key={idx} className="zombie-item">
              <div className="zombie-info">
                <strong>{zombie.description}</strong>
                <span>${zombie.estimated_amount.toFixed(2)}/mo</span>
                <span>Confidence: {Math.round(zombie.confidence * 100)}%</span>
                <p>{zombie.reasoning}</p>
              </div>
              <button onClick={() => handleAddSubscription(zombie)}>
                Add to Subscriptions
              </button>
            </div>
          ))}
        </div>
      )}

      {hasSpikes && (
        <div className="anomaly-section">
          <h4>🟠 Spending Spikes</h4>
          {result.spending_spikes.map((spike, idx) => (
            <div key={idx} className="spike-item">
              <div className="spike-info">
                <strong>{getCategoryName(spike.category_id)}</strong>
                <span>Normal: ${spike.normal_average.toFixed(2)}</span>
                <span>Current: ${spike.current_spike.toFixed(2)}</span>
                <span>Excess: ${(spike.current_spike - spike.normal_average).toFixed(2)}</span>
                <p>{spike.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
