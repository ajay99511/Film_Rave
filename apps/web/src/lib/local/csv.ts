/**
 * IMDb / Letterboxd ratings CSV parsing — the browser twin of the API's import
 * service. Produces neutral `{ title, score, source }` rows on a 1..10 scale;
 * the backend then matches titles against the catalog and stages ratings.
 */
import type { RatingSource } from '@filmrave/shared';

export interface ParsedRatingRow {
  title: string;
  score: number; // normalized to 1..10
  source: RatingSource;
}

export type CsvFormat = 'auto' | 'imdb' | 'letterboxd';

/** RFC-4180-ish line splitter: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

const clampScore = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

function detectFormat(header: string[]): 'imdb' | 'letterboxd' | null {
  const lower = header.map((h) => h.trim().toLowerCase());
  if (lower.includes('your rating') && lower.includes('title')) return 'imdb';
  if (lower.includes('name') && lower.includes('rating')) return 'letterboxd';
  return null;
}

export function parseRatingsCsv(
  text: string,
  format: CsvFormat = 'auto',
): ParsedRatingRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const resolved = format === 'auto' ? detectFormat(rows[0]) : format;
  if (!resolved) return [];

  const idx = (name: string) => header.indexOf(name);
  const out: ParsedRatingRow[] = [];

  if (resolved === 'imdb') {
    const titleI = idx('title');
    const ratingI = idx('your rating');
    for (const r of rows.slice(1)) {
      const title = r[titleI]?.trim();
      const raw = Number(r[ratingI]);
      if (!title || !Number.isFinite(raw)) continue;
      out.push({ title, score: clampScore(raw), source: 'imdb' });
    }
  } else {
    // Letterboxd uses a 0.5..5 star scale.
    const titleI = idx('name');
    const ratingI = idx('rating');
    for (const r of rows.slice(1)) {
      const title = r[titleI]?.trim();
      const raw = Number(r[ratingI]);
      if (!title || !Number.isFinite(raw)) continue;
      out.push({ title, score: clampScore(raw * 2), source: 'letterboxd' });
    }
  }
  return out;
}
