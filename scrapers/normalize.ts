// Turning whatever each site says into the shared vocabulary in constants/cabins.ts.

import { AMENITY_PATTERNS, TOWNS } from '../constants/cabins';

/**
 * Extract canonical amenity keys from free text. Most of these sites cram their
 * amenities into one comma-joined blob ("Indoor Heated Pool, Fire Table, Arcade,
 * Foosball, Hot Tub"), so we match per-phrase rather than over the whole string —
 * otherwise "Indoor Heated Pool" and a later bare "pool" both fire and the more
 * specific match gets diluted.
 */
export function extractAmenities(...sources: (string | string[] | null | undefined)[]): string[] {
  const phrases: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) phrases.push(...src);
    else phrases.push(...src.split(/[,;•|\n]/));
  }

  const found = new Set<string>();
  for (const phrase of phrases) {
    const text = phrase.trim();
    if (!text) continue;
    for (const [pattern, key] of AMENITY_PATTERNS) {
      if (pattern.test(text)) {
        found.add(key);
        break; // first (most specific) match wins for this phrase
      }
    }
  }
  return [...found];
}

const TOWN_LOOKUP = new Map(TOWNS.map((t) => [t.toLowerCase(), t]));

/** Snap a scraped locality string onto our town vocabulary; null if unrecognized. */
export function normalizeTownName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,?\s*(TN|Tennessee)\.?$/i, '').trim();
  const exact = TOWN_LOOKUP.get(cleaned.toLowerCase());
  if (exact) return exact;

  // Substring pass catches "Gatlinburg / Pigeon Forge area" and similar.
  const lower = cleaned.toLowerCase();
  for (const [key, label] of TOWN_LOOKUP) {
    if (lower.includes(key)) return label;
  }
  return cleaned || null;
}

/** Parse "$1,234.56", ".0000", "from $89", 1234 → number | null. Rejects zero. */
export function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseInteger(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  const m = /(\d+)/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseDecimal(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const m = /(\d+(?:\.\d+)?)/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function absoluteUrl(base: string, path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
