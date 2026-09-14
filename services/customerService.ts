import { apiRequest } from './apiClient';
import type { ApiMarketResponse, RoundId } from '../types';

/**
 * Read-only market access. The human-buyer endpoints (customers/budget,
 * market/:id/buy, market/:id/return) are gone: customers are simulated now and the
 * AI engine writes purchases directly, so all three 404 against the real backend.
 * `market` is the one route that still exists, and it only reads.
 */
export const customerService = {
  market(round_id: RoundId): Promise<ApiMarketResponse> {
    return apiRequest<ApiMarketResponse>(`/v1/rounds/${round_id}/market`, { method: 'GET' });
  },
};
