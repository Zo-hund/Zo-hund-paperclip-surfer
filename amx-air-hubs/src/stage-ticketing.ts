export async function createStageTicketPaymentLink(input: { eventId: string; eventTitle: string; tierId: string; tierLabel: string; priceCents: number; capacity: number; passPath: string }) {
  const response = await fetch("/api/stage/tickets/payment-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json() as { checkoutUrl?: string; error?: string };
  if (!response.ok || !body.checkoutUrl) throw new Error(body.error || "Stripe admission link could not be created.");
  return body.checkoutUrl;
}
