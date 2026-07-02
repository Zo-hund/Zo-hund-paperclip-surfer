import { api } from "./client";

export interface StripePrice {
  tier: string;
  priceId: string;
  amount: number;
  interval: string;
  memberTypes: string[];
}

export interface CheckoutResponse {
  url: string | null;
  sessionId?: string;
  provisioned?: boolean;
  tier?: string;
}

export const stripeApi = {
  getPrices: (companyId: string) =>
    api.get<{ prices: StripePrice[] }>(`/companies/${companyId}/stripe/prices`),

  createCheckout: (companyId: string, data: {
    tierName: string;
    userId: string;
    successUrl?: string;
    cancelUrl?: string;
  }) => api.post<CheckoutResponse>(`/companies/${companyId}/stripe/checkout`, data),
};
