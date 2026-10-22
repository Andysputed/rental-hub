export function formatKSh(amount: number, includePrefix = true): string {
  const formatted = Math.round(amount).toLocaleString('en-KE');
  return includePrefix ? `KSh ${formatted}` : formatted;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateLong(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Convert numbers to words for receipt (e.g. 7500 -> "Kenyan Shillings seven thousand five hundred")
export function numberToWordsKSh(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

  function convertLessThanOneThousand(n: number): string {
    let result = '';
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      result += teens[n - 10] + ' ';
      n = 0;
    }
    if (n > 0) {
      result += ones[n] + ' ';
    }
    return result.trim();
  }

  if (num === 0) return 'Kenyan Shillings zero';

  let remaining = Math.round(num);
  let words = '';

  if (remaining >= 1000000) {
    words += convertLessThanOneThousand(Math.floor(remaining / 1000000)) + ' million ';
    remaining %= 1000000;
  }

  if (remaining >= 1000) {
    words += convertLessThanOneThousand(Math.floor(remaining / 1000)) + ' thousand ';
    remaining %= 1000;
  }

  if (remaining > 0) {
    words += convertLessThanOneThousand(remaining);
  }

  return `Kenyan Shillings ${words.trim()}`;
}
