import { jsPDF } from 'jspdf';
import { formatKSh, formatDateLong, numberToWordsKSh } from './format';
import type { Payment, Room, Tenant, PropertySettings } from '../types';

export interface ReceiptPdfData {
  payment: Payment;
  room?: Room;
  tenant?: Tenant;
  settings: PropertySettings;
  chargeAmount: number;
  remainingBalance: number;
  monthName?: string;
}

/**
 * Generates an official, beautifully styled PDF document for a rent payment receipt.
 * Returns the jsPDF instance which can be saved (.save()) or converted to a Blob (.output('blob')).
 */
export function generateReceiptPdf(data: ReceiptPdfData): jsPDF {
  const { payment, room, tenant, settings, chargeAmount, remainingBalance, monthName } = data;

  // A4 portrait dimensions: 210mm x 297mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2; // 174mm

  // -------------------------------------------------------------
  // TOP BRANDING BANNER & HEADER
  // -------------------------------------------------------------
  // Emerald top brand bar
  doc.setFillColor(13, 92, 70); // #0D5C46
  doc.rect(0, 0, pageWidth, 6, 'F');

  let y = 18;

  // Logo Badge Box
  doc.setFillColor(13, 92, 70);
  doc.roundedRect(margin, y, 12, 12, 2.5, 2.5, 'F');

  // Roof / House icon drawn with vector lines
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.7);
  // Roof triangle
  doc.line(margin + 2.5, y + 6.5, margin + 6, y + 3);
  doc.line(margin + 6, y + 3, margin + 9.5, y + 6.5);
  // House walls
  doc.line(margin + 3.5, y + 6.5, margin + 3.5, y + 10);
  doc.line(margin + 3.5, y + 10, margin + 8.5, y + 10);
  doc.line(margin + 8.5, y + 10, margin + 8.5, y + 6.5);

  // Brand Name & Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39); // #111827
  doc.text(settings.propertyName || 'Acacia House', margin + 16, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128); // #6B7280
  doc.text('RENT PAYMENT RECEIPT  ·  OFFICIAL ACKNOWLEDGMENT', margin + 16, y + 10.5);

  // Status Badge on Right: "PAID / RECEIVED"
  const badgeWidth = 28;
  const badgeHeight = 7;
  const badgeX = pageWidth - margin - badgeWidth;
  doc.setFillColor(235, 245, 240); // #EBF5F0
  doc.setDrawColor(205, 229, 218); // #CDE5DA
  doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, y + 2.5, badgeWidth, badgeHeight, 3.5, 3.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 92, 70);
  doc.text('✓  RECEIVED', badgeX + badgeWidth / 2, y + 7, { align: 'center' });

  y += 18;

  // Thin separator line
  doc.setDrawColor(229, 231, 235); // #E5E7EB
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;

  // -------------------------------------------------------------
  // RECEIPT NUMBER & METADATA BAR
  // -------------------------------------------------------------
  // Left: Receipt Number
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('RECEIPT NUMBER', margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text(payment.receiptNumber, margin, y + 5.5);

  // Right: Payment Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('PAYMENT DATE', pageWidth - margin, y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(formatDateLong(payment.date) || payment.date, pageWidth - margin, y + 5.5, { align: 'right' });

  y += 14;

  // -------------------------------------------------------------
  // HERO HIGHLIGHT BOX: AMOUNT RECEIVED
  // -------------------------------------------------------------
  const heroHeight = 28;
  doc.setFillColor(243, 249, 246); // #F3F9F6 - very soft emerald
  doc.setDrawColor(205, 229, 218); // #CDE5DA
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, heroHeight, 3, 3, 'FD');

  // Amount Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(13, 92, 70);
  doc.text('AMOUNT RECEIVED (KES)', margin + contentWidth / 2, y + 6.5, { align: 'center' });

  // Big Bold Amount
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(13, 92, 70);
  doc.text(formatKSh(payment.amount), margin + contentWidth / 2, y + 16, { align: 'center' });

  // Words description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  const words = `${numberToWordsKSh(payment.amount)} only`;
  doc.text(words, margin + contentWidth / 2, y + 22.5, { align: 'center' });

  y += heroHeight + 8;

  // -------------------------------------------------------------
  // TWO-COLUMN TRANSACTION & TENANCY DETAILS
  // -------------------------------------------------------------
  const cardHeight = 44;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, cardHeight, 2.5, 2.5, 'FD');

  // Section Title inside card
  doc.setFillColor(249, 250, 251); // #F9FAFB
  doc.roundedRect(margin, y, contentWidth, 8, 2.5, 2.5, 'F');
  // Bottom square out corners of title
  doc.rect(margin, y + 4, contentWidth, 4, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y + 8, margin + contentWidth, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('TRANSACTION & TENANT INFORMATION', margin + 4, y + 5.5);

  const col1X = margin + 5;
  const col2X = margin + contentWidth / 2 + 5;

  const row1Y = y + 14;
  const row2Y = y + 23;
  const row3Y = y + 32;

  // Row 1: Received from / Room
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Received from:', col1X, row1Y);
  doc.text('Room / Unit:', col2X, row1Y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(tenant?.fullName || 'Tenant', col1X + 28, row1Y);
  doc.text(room?.name || 'Room', col2X + 26, row1Y);

  // Row 2: Payment Method / Reference Code
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Payment method:', col1X, row2Y);
  doc.text('Transaction ref:', col2X, row2Y);

  const methodLabel = payment.method === 'mpesa' ? 'M-Pesa' : payment.method === 'cash' ? 'Cash' : 'Bank Transfer';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(methodLabel, col1X + 28, row2Y);

  doc.setFont('courier', 'bold'); // Monospace font for reference
  doc.text(payment.reference || 'N/A', col2X + 26, row2Y);

  // Row 3: Tenant Phone / Property
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Phone number:', col1X, row3Y);
  doc.text('Property location:', col2X, row3Y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(31, 41, 55);
  doc.text(tenant?.phone || 'Not recorded', col1X + 28, row3Y);
  doc.text(settings.location || 'Nairobi, Kenya', col2X + 26, row3Y);

  y += cardHeight + 8;

  // -------------------------------------------------------------
  // RENT ALLOCATION & BALANCE RECONCILIATION
  // -------------------------------------------------------------
  const allocHeight = 36;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, allocHeight, 2.5, 2.5, 'FD');

  // Header bar
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, contentWidth, 8, 2.5, 2.5, 'F');
  doc.rect(margin, y + 4, contentWidth, 4, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y + 8, margin + contentWidth, y + 8);

  const billingLabel = monthName ? `ALLOCATION · ${monthName.toUpperCase()} RENT` : 'RENT CHARGE ALLOCATION';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(billingLabel, margin + 4, y + 5.5);

  // Allocation line items
  let allocY = y + 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text('Monthly Rent Charge', margin + 6, allocY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(formatKSh(chargeAmount), pageWidth - margin - 6, allocY, { align: 'right' });

  allocY += 6.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('Payment Applied / Allocated', margin + 6, allocY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 92, 70); // Emerald green for payment
  doc.text(`- ${formatKSh(payment.amount)}`, pageWidth - margin - 6, allocY, { align: 'right' });

  allocY += 6.5;
  doc.setDrawColor(243, 244, 246);
  doc.line(margin + 6, allocY - 1.5, pageWidth - margin - 6, allocY - 1.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text('Remaining Rent Balance', margin + 6, allocY + 1);

  if (remainingBalance > 0) {
    doc.setTextColor(180, 83, 9); // Amber
    doc.text(formatKSh(remainingBalance), pageWidth - margin - 6, allocY + 1, { align: 'right' });
  } else {
    doc.setTextColor(13, 92, 70); // Emerald
    doc.text('KSh 0  (Paid in Full)', pageWidth - margin - 6, allocY + 1, { align: 'right' });
  }

  y += allocHeight + 10;

  // -------------------------------------------------------------
  // LANDLORD SIGNATURE & ACKNOWLEDGMENT FOOTER
  // -------------------------------------------------------------
  // Box for footer note
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(17, 24, 39);
  doc.text('Thank you for your payment.', margin + contentWidth / 2, y + 6, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  const landlordContact = settings.landlordPhone ? ` · Contact: ${settings.landlordPhone}` : '';
  doc.text(
    `Issued electronically by ${settings.landlordName || 'the landlord'} (${settings.propertyName})${landlordContact}`,
    margin + contentWidth / 2,
    y + 11.5,
    { align: 'center' }
  );

  doc.setFontSize(6.8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    'RentalHub Property Management System · Official audit-compliant tenant receipt',
    margin + contentWidth / 2,
    y + 17.5,
    { align: 'center' }
  );

  // Bottom decorative green accent line
  doc.setFillColor(13, 92, 70);
  doc.rect(0, 294, pageWidth, 3, 'F');

  return doc;
}

/**
 * Helper to download the receipt directly as a PDF file.
 */
export function downloadReceiptPdf(data: ReceiptPdfData): void {
  const doc = generateReceiptPdf(data);
  const filename = `${data.payment.receiptNumber || 'Receipt'}.pdf`;
  doc.save(filename);
}

/**
 * Helper to get a File instance of the generated PDF (for navigator.share).
 */
export function getReceiptPdfFile(data: ReceiptPdfData): File {
  const doc = generateReceiptPdf(data);
  const blob = doc.output('blob');
  const filename = `${data.payment.receiptNumber || 'Receipt'}.pdf`;
  return new File([blob], filename, { type: 'application/pdf' });
}
