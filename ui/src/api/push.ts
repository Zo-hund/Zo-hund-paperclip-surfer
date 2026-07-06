import { api } from "./client";

export const pushApi = {
  getVapidPublicKey: () => api.get<{ publicKey: string }>("/push/vapid-public-key"),

  subscribe: (input: { companyId?: string; subscription: PushSubscriptionJSON }) =>
    api.post<{ id: string }>("/push/subscribe", input),

  unsubscribe: (endpoint: string) => api.post<{ ok: boolean }>("/push/unsubscribe", { endpoint }),
};
