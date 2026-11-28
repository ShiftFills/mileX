import type { jsPDF } from 'jspdf';

/**
 * Draws the customer's refund statement (Refund screen, "Download Refund Statement") into a jsPDF document: A4, in
 * points. RefundService formats every value; this file only lays them out. The colours are the storefront's design
 * tokens (styles.scss). Text uses the PDF's built-in Helvetica, which has no "₹", so amounts come as "INR 3,000.00".
 */
// CHANGED (new): the statement is a PDF (it was a plain-text file).

export type StatementTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface RefundStatementRow {
  label: string;
  value: string;
  /** Bold (the amount). */
  strong?: boolean;
  /** Coloured by the refund's state (the status). */
  tone?: StatementTone;
}

/** One refund (return request) of the statement. */
export interface RefundStatementRecord {
  /** "Refund 1 of 2 · Return RTN0025". */
  title: string;
  status: string;
  tone: StatementTone;
  rows: readonly RefundStatementRow[];
}

export interface RefundStatement {
  orderNumber: string;
  /** The day the statement was made, formatted ("28 Nov 2026"). */
  generatedOn: string;
  /** The credited refunds' amounts added up, formatted. */
  totalRefunded: string;
  records: readonly RefundStatementRecord[];
}

const COLORS = {
  primary: '#073e7b',
  accent: '#ffca05',
  text: '#1c2738',
  muted: '#718096',
  border: '#dce3ec',
  borderSubtle: '#edf1f6',
  bg: '#f6f8fb',
  white: '#ffffff',
} as const;

/** Status text and pill colours. Warning text is a darker amber than --color-warning, to stay legible on paper. */
const TONES: Readonly<Record<StatementTone, { text: string; fill: string }>> = {
  success: { text: '#07815f', fill: '#e6f3ef' },
  warning: { text: '#9a6400', fill: '#fdf3dc' },
  danger: { text: '#b52d46', fill: '#f8e6ea' },
  neutral: { text: '#718096', fill: '#edf1f6' },
};

const MARGIN = 40;
const HEADER_HEIGHT = 72;
/** Space kept free at the bottom of each page for the footer. */
const FOOTER_SPACE = 56;
const FONT_SIZE = 9;
const LINE_HEIGHT_FACTOR = 1.35;
const LINE_HEIGHT = FONT_SIZE * LINE_HEIGHT_FACTOR;
const ROW_PADDING = 7;
const ROW_INSET = 14;
const LABEL_WIDTH = 130;
const RECORD_TITLE_HEIGHT = 24;
const RECORD_GAP = 22;

/** A row with its value split into the lines that fit the value column. */
interface LaidOutRow {
  row: RefundStatementRow;
  lines: string[];
  height: number;
}

function setText(doc: jsPDF, size: number, style: 'normal' | 'bold', color: string): void {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color);
}

/** The MileX band across the top of the first page. */
function drawHeader(doc: jsPDF, statement: RefundStatement, pageWidth: number): void {
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F');
  doc.setFillColor(COLORS.accent);
  doc.rect(0, HEADER_HEIGHT, pageWidth, 4, 'F');

  setText(doc, 22, 'bold', COLORS.white);
  doc.text('MileX', MARGIN, 40);
  setText(doc, 11, 'normal', COLORS.accent);
  doc.text('Refund Statement', MARGIN, 58);
  setText(doc, 9, 'normal', COLORS.white);
  doc.text(`Generated on ${statement.generatedOn}`, pageWidth - MARGIN, 40, { align: 'right' });
  doc.text(`Order No. ${statement.orderNumber}`, pageWidth - MARGIN, 56, { align: 'right' });
}

/** Order number, number of refunds and total refunded, in a shaded box. Returns the y below it. */
function drawOverview(doc: jsPDF, statement: RefundStatement, top: number, contentWidth: number): number {
  const height = 54;
  doc.setFillColor(COLORS.bg);
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, top, contentWidth, height, 6, 6, 'FD');

  const columns: [string, string][] = [
    ['Order No.', statement.orderNumber],
    ['Refund records', String(statement.records.length)],
    ['Total refunded', statement.totalRefunded],
  ];
  const columnWidth = contentWidth / columns.length;
  columns.forEach(([label, value], index) => {
    const x = MARGIN + ROW_INSET + index * columnWidth;
    setText(doc, 8, 'normal', COLORS.muted);
    doc.text(label, x, top + 21);
    setText(doc, 12, 'bold', COLORS.text);
    doc.text(value, x, top + 39);
  });
  return top + height + 26;
}

/** The small heading of every page after the first. Returns the y below it. */
function drawContinuationHeader(doc: jsPDF, statement: RefundStatement, pageWidth: number): number {
  setText(doc, 9, 'bold', COLORS.primary);
  doc.text('MileX Refund Statement', MARGIN, 44);
  setText(doc, 9, 'normal', COLORS.muted);
  doc.text(`Order No. ${statement.orderNumber} (continued)`, pageWidth - MARGIN, 44, { align: 'right' });
  doc.setDrawColor(COLORS.accent);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 52, pageWidth - MARGIN, 52);
  return 76;
}

function layOutRows(doc: jsPDF, record: RefundStatementRecord, valueWidth: number): LaidOutRow[] {
  return record.rows.map((row) => {
    doc.setFont('helvetica', row.strong ? 'bold' : 'normal');
    doc.setFontSize(FONT_SIZE);
    const lines = (doc.splitTextToSize(row.value, valueWidth) as string[]).filter((line) => line.length > 0);
    const shown = lines.length ? lines : [row.value];
    return { row, lines: shown, height: ROW_PADDING * 2 + shown.length * LINE_HEIGHT };
  });
}

/** One refund: its title and status pill, then a bordered table of label / value rows. Returns the y below it. */
function drawRecord(doc: jsPDF, record: RefundStatementRecord, rows: LaidOutRow[], top: number, contentWidth: number): number {
  const right = MARGIN + contentWidth;
  setText(doc, 11, 'bold', COLORS.text);
  doc.text(record.title, MARGIN, top + 13);

  if (record.status) {
    const tone = TONES[record.tone];
    setText(doc, 8, 'bold', tone.text);
    const pillWidth = doc.getTextWidth(record.status) + 16;
    doc.setFillColor(tone.fill);
    doc.roundedRect(right - pillWidth, top + 1, pillWidth, 16, 8, 8, 'F');
    doc.text(record.status, right - pillWidth / 2, top + 12, { align: 'center' });
  }

  let y = top + RECORD_TITLE_HEIGHT;
  const tableHeight = rows.reduce((sum, row) => sum + row.height, 0);
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.75);
  doc.roundedRect(MARGIN, y, contentWidth, tableHeight, 6, 6, 'S');

  rows.forEach(({ row, lines, height }, index) => {
    const baseline = y + ROW_PADDING + FONT_SIZE * 0.85;
    setText(doc, FONT_SIZE, 'normal', COLORS.muted);
    doc.text(row.label, MARGIN + ROW_INSET, baseline);
    setText(doc, FONT_SIZE, row.strong ? 'bold' : 'normal', row.tone ? TONES[row.tone].text : COLORS.text);
    doc.text(lines, right - ROW_INSET, baseline, { align: 'right' });
    y += height;
    if (index < rows.length - 1) {
      doc.setDrawColor(COLORS.borderSubtle);
      doc.setLineWidth(0.75);
      doc.line(MARGIN + ROW_INSET, y, right - ROW_INSET, y);
    }
  });
  return y + RECORD_GAP;
}

/** The note and "Page n of m" at the bottom of every page. */
function drawFooters(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const y = pageHeight - 32;
    doc.setDrawColor(COLORS.border);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y - 12, pageWidth - MARGIN, y - 12);
    setText(doc, 8, 'normal', COLORS.muted);
    doc.text('This is a system-generated refund statement from MileX. For help, contact MileX Support.', MARGIN, y);
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, y, { align: 'right' });
  }
}

/** Draws the whole statement: header, overview, one block per refund (a block never splits across pages), footers. */
export function drawRefundStatement(doc: jsPDF, statement: RefundStatement): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const valueWidth = contentWidth - ROW_INSET * 2 - LABEL_WIDTH;

  doc.setProperties({
    title: `MileX Refund Statement - Order ${statement.orderNumber}`,
    subject: 'Refund statement',
    author: 'MileX',
    creator: 'MileX',
  });
  doc.setLineHeightFactor(LINE_HEIGHT_FACTOR);

  drawHeader(doc, statement, pageWidth);
  let y = drawOverview(doc, statement, HEADER_HEIGHT + 30, contentWidth);
  for (const record of statement.records) {
    const rows = layOutRows(doc, record, valueWidth);
    const height = RECORD_TITLE_HEIGHT + rows.reduce((sum, row) => sum + row.height, 0);
    if (y + height > pageHeight - FOOTER_SPACE) {
      doc.addPage();
      y = drawContinuationHeader(doc, statement, pageWidth);
    }
    y = drawRecord(doc, record, rows, y, contentWidth);
  }
  drawFooters(doc, pageWidth, pageHeight);
}
