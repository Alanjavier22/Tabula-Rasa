import api from './api';
import { prepareForAI, hydrateAIResponse } from '../utils/privacy';
import { aiCashFlowService } from './AICashFlowService';
import type { AiAssistantChatResponse } from '../types';

// Lives outside api.ts on purpose: api.ts is the base HTTP client and
// shouldn't depend on higher-level services. AICashFlowService (and
// AssetDepreciationService, which it also pulls from) both import `api` for
// their own HTTP calls, so keeping this here avoids the api.ts <-> AICashFlowService
// import cycle that used to exist when this lived inside api.ts.
export const aiAssistantAPI = {
  // Heavy request: uses 15 min timeout (900000ms)
  chat: async (
    message: string,
    includeCashFlow: boolean = false,
    includeAssets: boolean = false,
    documentBase64?: string,
    documentMimeType?: string
  ) => {
    // Sanitize message with hydration map
    const { sanitized: sanitizedMessage, hydrationMap: messageMap } = prepareForAI(message);

    // Get CashFlow context if requested
    let cashFlowContext = null;
    if (includeCashFlow) {
      const context = await aiCashFlowService.getAIContext();
      cashFlowContext = {
        current_balance_cents: context.current_balance_cents,
        safe_to_spend_30d: context.safe_to_spend_30d,
        safe_to_spend_60d: context.safe_to_spend_60d,
        safe_to_spend_90d: context.safe_to_spend_90d,
        projected_income_30d: context.projected_income_30d,
        projected_expenses_30d: context.projected_expenses_30d,
        seasonal_adjustment_30d: context.seasonal_adjustment_30d,
        subscriptions_due_30d: context.subscriptions_due_30d,
        ious_pending_30d: context.ious_pending_30d,
      };
    }

    // Get Assets context if requested
    let assetsContext = null;
    if (includeAssets) {
      const context = await aiCashFlowService.getAIContext();
      assetsContext = {
        assets_total_value_cents: context.assets_total_value_cents,
        assets_details: context.assets_details,
      };
    }

    const response = await api.post<AiAssistantChatResponse>('/ai-assistant/chat', {
      message: sanitizedMessage,
      cash_flow_context: cashFlowContext,
      assets_context: assetsContext,
      document_base64: documentBase64,
      document_mime_type: documentMimeType,
    }, { timeout: 900000 });

    // Hydrate response with original values
    const hydratedResponse = hydrateAIResponse(response.data.response || '', messageMap);

    return {
      ...response.data,
      response: hydratedResponse,
    };
  },
};
