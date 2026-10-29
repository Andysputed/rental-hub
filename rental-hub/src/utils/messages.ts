/**
 * Message generation utilities for RentalHub tenant communication.
 * Generates pre-filled WhatsApp and SMS message bodies.
 */

import { formatKSh, formatDateShort } from './format';

export interface RentReminderParams {
  tenantName: string;
  roomName: string;
  propertyName: string;
  /** Total outstanding balance in KSh */
  totalBalance: number;
  /** Overdue charge details */
  charges: Array<{
    month: string;
    balance: number;
    dueDate: string;
  }>;
  landlordName?: string;
  landlordPhone?: string;
}

export interface ReceiptShareParams {
  tenantName: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  roomName: string;
  propertyName: string;
}

/**
 * Generates a polite rent reminder message for WhatsApp or SMS.
 */
export function generateRentReminder(params: RentReminderParams): string {
  const {
    tenantName,
    roomName,
    propertyName,
    totalBalance,
    charges,
    landlordName,
    landlordPhone,
  } = params;

  const firstName = tenantName.split(' ')[0];

  let chargeDetails = '';
  if (charges.length === 1) {
    const c = charges[0];
    const [year, month] = c.month.split('-');
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-KE', {
      month: 'long',
      year: 'numeric',
    });
    chargeDetails = `Outstanding: ${formatKSh(c.balance)} for ${monthName} (due ${formatDateShort(c.dueDate)}).`;
  } else if (charges.length > 1) {
    chargeDetails = `You have ${charges.length} outstanding months totalling ${formatKSh(totalBalance)}.`;
  }

  const lines = [
    `Dear ${firstName},`,
    '',
    `This is a friendly reminder regarding your rent for *${roomName}* at *${propertyName}*.`,
    '',
    chargeDetails,
    `*Total outstanding: ${formatKSh(totalBalance)}*`,
    '',
    'Kindly arrange payment at your earliest convenience. You can pay via M-Pesa, cash, or bank transfer.',
  ];

  if (landlordPhone) {
    lines.push('');
    lines.push(`For any queries, please reach out: ${landlordPhone}`);
  }

  if (landlordName) {
    lines.push('');
    lines.push(`Thank you,`);
    lines.push(landlordName);
  }

  return lines.join('\n');
}

/**
 * Generates a receipt-sharing message for WhatsApp.
 */
export function generateReceiptShareMessage(params: ReceiptShareParams): string {
  const { tenantName, receiptNumber, amount, paymentDate, roomName, propertyName } = params;

  const firstName = tenantName.split(' ')[0];

  const lines = [
    `Dear ${firstName},`,
    '',
    `Please find your rent payment receipt below.`,
    '',
    `🏠 *${propertyName}* — ${roomName}`,
    `📋 Receipt No: *${receiptNumber}*`,
    `💰 Amount: *${formatKSh(amount)}*`,
    `📅 Date: ${formatDateShort(paymentDate)}`,
    '',
    'Thank you for your payment!',
  ];

  return lines.join('\n');
}

