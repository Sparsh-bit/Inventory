/** Value of a purchase line including tax, in minor units. Shared by the form and the server so totals match. */
export function purchaseLineValue(qty: number, unitCost: number, scale: number, rateBp: number) {
  const base = Math.round((unitCost * qty) / scale);
  return base + Math.round((base * rateBp) / 10000);
}

export const ATTACHMENT_URL = /^\/api\/docs\/[a-f0-9]{32}\.(png|jpg|webp|pdf)$/;
export const MAX_ATTACHMENTS = 10;
