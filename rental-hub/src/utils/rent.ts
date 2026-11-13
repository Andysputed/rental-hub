export interface FirstMonthRentPreview {
  monthlyRent: number;
  moveInDate: string;
  monthLabel: string;
  daysInMonth: number;
  chargeableDays: number;
  firstMonthRent: number;
  followingMonthRent: number;
  followingMonthLabel: string;
  isProrated: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function label(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Mirrors the backend's first-month proration exactly: rent is charged per
 * actual calendar day, the move-in day included, rounded half-up to cents.
 * Integer cent arithmetic avoids floating-point drift.
 */
export function calculateFirstMonthRent(
  monthlyRent: number,
  moveInDate: string,
): FirstMonthRentPreview | null {
  if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(moveInDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  const chargeableDays = daysInMonth - day + 1;
  const rentCents = Math.round(monthlyRent * 100);
  const firstMonthCents = Math.floor(
    (rentCents * chargeableDays * 2 + daysInMonth) / (2 * daysInMonth),
  );
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    monthlyRent: rentCents / 100,
    moveInDate,
    monthLabel: label(year, month),
    daysInMonth,
    chargeableDays,
    firstMonthRent: firstMonthCents / 100,
    followingMonthRent: rentCents / 100,
    followingMonthLabel: label(nextMonthYear, nextMonth),
    isProrated: chargeableDays < daysInMonth,
  };
}

/**
 * Rent owed for a specific billing month. Only the move-in month is prorated;
 * every later month is charged the full agreed rent. Returns null when the
 * inputs are invalid or the month falls before the tenancy starts.
 */
export function calculateRentForMonth(
  monthlyRent: number,
  moveInDate: string,
  month: string,
): number | null {
  const preview = calculateFirstMonthRent(monthlyRent, moveInDate);
  if (!preview) return null;

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const startMonth = moveInDate.slice(0, 7);
  if (month < startMonth) return null;
  return month === startMonth ? preview.firstMonthRent : preview.monthlyRent;
}
