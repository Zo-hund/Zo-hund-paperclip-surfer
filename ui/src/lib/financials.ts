/**
 * AMX Platform Financial Utilities
 * Implements the "Seller Pays 10%" fee model for all smart contracts on the AMX Chain.
 */

export const AMX_PLATFORM_FEE_RATE = 0.10; // 10%

/**
 * Calculates the platform fee for a given total contract amount.
 * @param total The total amount paid by the buyer.
 * @returns The fee amount auto-deducted for the AMX Platform.
 */
export function calculatePlatformFee(total: number): number {
  return Math.floor(total * AMX_PLATFORM_FEE_RATE);
}

/**
 * Calculates the net payout for the seller.
 * @param total The total amount paid by the buyer.
 * @returns The amount the seller receives after the 10% platform fee.
 */
export function calculateSellerPayout(total: number): number {
  return total - calculatePlatformFee(total);
}

/**
 * Formats a credit amount with the platform's currency suffix.
 */
export function formatCurrency(amount: number, currency: string = "SIMS"): string {
  return `${amount.toLocaleString()} ${currency}`;
}
