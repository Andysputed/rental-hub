/**
 * Phone number utilities for RentalHub.
 * Handles Kenyan phone number normalization for WhatsApp and SMS links.
 *
 * Kenyan number formats in the wild:
 *   0712345678       (local, 10 digits starting with 0)
 *   254712345678     (international without +)
 *   +254712345678    (international with +)
 */

/**
 * Normalizes a Kenyan phone number to E.164 format (+254XXXXXXXXX).
 * Returns null if the number cannot be normalized.
 */
export function normalizeKenyanPhone(phone: string | undefined | null): string | null {
  if (!phone) return null;

  // Strip all whitespace, dashes, parentheses
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // Already E.164 with +254
  if (/^\+254\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  // International without +, e.g. 254712345678
  if (/^254\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Local Kenyan format starting with 0, e.g. 0712345678
  if (/^0\d{9}$/.test(cleaned)) {
    return `+254${cleaned.slice(1)}`;
  }

  // Other valid international formats (preserve as-is when valid)
  if (/^\+\d{7,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Returns the digits-only version of a phone number suitable for wa.me links
 * (no leading +). Returns null if the number cannot be normalized.
 *
 * Example: "+254712345678" → "254712345678"
 */
export function getWhatsAppNumber(phone: string | undefined | null): string | null {
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return null;
  return normalized.replace(/^\+/, '');
}

/**
 * Returns true if the given phone string can be normalized to a valid number.
 */
export function isValidPhone(phone: string | undefined | null): boolean {
  return normalizeKenyanPhone(phone) !== null;
}

