/**
 * Phone number → digits WhatsApp expects (country code, no +). A 10-digit number gets the
 * default country code (91 for India). Returns null when it can't be a phone number.
 */
export function waNumber(raw: string, countryCode = "91"): string | null {
  let d = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) d = d.slice(2);
  else if (!raw.trim().startsWith("+")) {
    d = d.replace(/^0+/, "");
    if (d.length === 10) d = countryCode + d;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** wa.me link that opens a chat with `phone` and the message typed in. */
export function waLink(phone: string, text: string, countryCode?: string): string | null {
  const n = waNumber(phone, countryCode);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export const countryCodeFor = (currency: string) => (currency === "INR" ? "91" : "");
