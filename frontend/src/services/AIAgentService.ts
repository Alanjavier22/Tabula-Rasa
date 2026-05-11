import api from './api';
import { prepareForAI, hydrateAIResponse } from '../utils/privacy';
import { toCents } from '../utils/money';

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

    const response = await api.post(
      '/api/ai/suggest-categories',
      {
        transactions: sanitizedTxns,
        categories: categoryList,
      },
      {
        headers: {
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
    apiKey: string,
    monthlyIncome: number = 0,
    fixedExpenses: number = 0,
    totalDebt: number = 0,
    monthlyDebtPayment: number = 0,
    monthlyCashFlow: number = 0
  ): Promise<WhatIfScenario> {
    const { sanitized: sanitizedTxns, hydrationMap } = prepareForAI(categoryTransactions);

    const avgMonthlySpend = Math.round(categoryTransactions.reduce((sum, t) => sum + t.amount, 0) / 12);

    const response = await api.post(
      '/api/ai/simulate-what-if',
      {
        user_prompt: userPrompt,
        avg_monthly_spend: Math.round(avgMonthlySpend),
        current_net_worth: currentNetWorth,
        transactions: sanitizedTxns,
        monthly_income: Math.round(monthlyIncome),
        fixed_expenses: Math.round(fixedExpenses),
        total_debt: Math.round(totalDebt),
        monthly_debt_payment: Math.round(monthlyDebtPayment),
        monthly_cash_flow: Math.round(monthlyCashFlow),
      },
      {
        headers: {
          'X-AI-API-Key': apiKey,
        },
      }
    );

    // Backend now returns values in cents correctly, no need to convert
    const hydratedScenario: WhatIfScenario = {
      ...response.data,
      summary: hydrateAIResponse(response.data.summary, hydrationMap),
      scenario_title: hydrateAIResponse(response.data.scenario_title, hydrationMap),
      projection: response.data.projection,
    };

    return hydratedScenario;
  }

  static async scanForAnomalies(
    recentTransactions: any[],
    currentSubscriptions: any[],
    categories: any[],
    goals: any[],
    apiKey: string
  ): Promise<AnomalyScanResult> {
    // FIX: Use single hydrationMap for token coherence across txns and subscriptions
    const combinedData = [...recentTransactions, ...currentSubscriptions];
    const { sanitized: sanitizedCombined, hydrationMap } = prepareForAI(combinedData);
    
    const sanitizedTxns = sanitizedCombined.slice(0, recentTransactions.length);
    const sanitizedSubs = sanitizedCombined.slice(recentTransactions.length);

    const response = await api.post(
      '/api/ai/scan-anomalies',
      {
        transactions: sanitizedTxns,
        subscriptions: sanitizedSubs,
        categories: categories.map(c => ({ id: c.id, name: c.name })),
        goals: goals.map(g => ({ name: g.name, target_amount: g.target_amount, current_amount: g.current_amount })),
      },
      {
        headers: {
          'X-AI-API-Key': apiKey,
        },
      }
    );

    // Backend already sends amounts in cents, no conversion needed
    const sanitizedZombieSubscriptions = response.data.zombie_subscriptions.map((z: ZombieSubscription) => ({
      ...z,
      estimated_amount: Math.round(z.estimated_amount),
    }));

    // Backend already sends amounts in cents, no conversion needed
    const sanitizedSpendingSpikes = response.data.spending_spikes.map((s: SpendingSpike) => ({
      ...s,
      normal_average: Math.round(s.normal_average),
      current_spike: Math.round(s.current_spike),
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
