import axios from 'axios';
import { prepareForAI, hydrateAIResponse } from '../utils/privacy';
import { toCents } from '../utils/money';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface AICategorySuggestion {
  transaction_id: string;
  suggested_category_id: string;
  confidence: number;
  reasoning: string;
}

export interface WhatIfProjection {
  month: number;
  baseline_net_worth: number;
  projected_net_worth: number;
}

export interface WhatIfScenario {
  scenario_title: string;
  summary: string;
  projection: WhatIfProjection[];
}

export interface ZombieSubscription {
  description: string;
  estimated_amount: number;
  confidence: number;
  reasoning: string;
}

export interface SpendingSpike {
  category_id: string;
  normal_average: number;
  current_spike: number;
  reasoning: string;
}

export interface AnomalyScanResult {
  zombie_subscriptions: ZombieSubscription[];
  spending_spikes: SpendingSpike[];
}

export class AIAgentService {
  static async suggestCategorizations(
    transactions: any[],
    categories: any[],
    apiKey: string
  ): Promise<AICategorySuggestion[]> {
    // Sanitize transactions before sending to AI
    const { sanitized: sanitizedTxns, hydrationMap } = prepareForAI(transactions);
    
    // Prepare category list for AI context
    const categoryList = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
    }));

    const response = await axios.post(
      `${API_BASE_URL}/api/ai/suggest-categories`,
      {
        transactions: sanitizedTxns,
        categories: categoryList,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-AI-API-Key': apiKey,
        },
      }
    );

    // Hydrate reasoning field with original values
    const hydratedSuggestions = response.data.map((suggestion: AICategorySuggestion) => ({
      ...suggestion,
      reasoning: hydrateAIResponse(suggestion.reasoning, hydrationMap),
    }));

    return hydratedSuggestions;
  }

  static async simulateWhatIfScenario(
    userPrompt: string,
    categoryTransactions: any[],
    currentNetWorth: number,
    apiKey: string
  ): Promise<WhatIfScenario> {
    const { sanitized: sanitizedTxns, hydrationMap } = prepareForAI(categoryTransactions);

    const avgMonthlySpend = Math.round(categoryTransactions.reduce((sum, t) => sum + t.amount, 0) / 12);

    const response = await axios.post(
      `${API_BASE_URL}/api/ai/simulate-what-if`,
      {
        user_prompt: userPrompt,
        avg_monthly_spend: avgMonthlySpend,
        current_net_worth: currentNetWorth,
        transactions: sanitizedTxns,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-AI-API-Key': apiKey,
        },
      }
    );

    // Sanitize monetary fields: force integers, cast to Cents
    const sanitizedProjection = response.data.projection.map((p: WhatIfProjection) => ({
      ...p,
      baseline_net_worth: toCents(Math.round(p.baseline_net_worth)),
      projected_net_worth: toCents(Math.round(p.projected_net_worth)),
    }));

    const hydratedScenario: WhatIfScenario = {
      ...response.data,
      summary: hydrateAIResponse(response.data.summary, hydrationMap),
      scenario_title: hydrateAIResponse(response.data.scenario_title, hydrationMap),
      projection: sanitizedProjection,
    };

    return hydratedScenario;
  }

  static async scanForAnomalies(
    recentTransactions: any[],
    currentSubscriptions: any[],
    apiKey: string
  ): Promise<AnomalyScanResult> {
    // FIX: Use single hydrationMap for token coherence across txns and subscriptions
    const combinedData = [...recentTransactions, ...currentSubscriptions];
    const { sanitized: sanitizedCombined, hydrationMap } = prepareForAI(combinedData);
    
    const sanitizedTxns = sanitizedCombined.slice(0, recentTransactions.length);
    const sanitizedSubs = sanitizedCombined.slice(recentTransactions.length);

    const response = await axios.post(
      `${API_BASE_URL}/api/ai/scan-anomalies`,
      {
        transactions: sanitizedTxns,
        subscriptions: sanitizedSubs,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-AI-API-Key': apiKey,
        },
      }
    );

    // Sanitize monetary fields in zombie subscriptions
    const sanitizedZombieSubscriptions = response.data.zombie_subscriptions.map((z: ZombieSubscription) => ({
      ...z,
      estimated_amount: toCents(Math.round(z.estimated_amount)),
    }));

    // Sanitize monetary fields in spending spikes
    const sanitizedSpendingSpikes = response.data.spending_spikes.map((s: SpendingSpike) => ({
      ...s,
      normal_average: toCents(Math.round(s.normal_average)),
      current_spike: toCents(Math.round(s.current_spike)),
    }));

    const hydratedResult: AnomalyScanResult = {
      zombie_subscriptions: sanitizedZombieSubscriptions.map((z: ZombieSubscription) => ({
        ...z,
        description: hydrateAIResponse(z.description, hydrationMap),
        reasoning: hydrateAIResponse(z.reasoning, hydrationMap),
      })),
      spending_spikes: sanitizedSpendingSpikes.map((s: SpendingSpike) => ({
        ...s,
        reasoning: hydrateAIResponse(s.reasoning, hydrationMap),
      })),
    };

    return hydratedResult;
  }
}
