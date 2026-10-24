export interface QtyPreset {
  value: number;
  label: string;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const normalizeUnit = (unit?: string | null): string => String(unit || '').trim().toLowerCase();

export const isKgLike = (unit?: string | null): boolean => ['kg', 'kilogram', 'kilograms'].includes(normalizeUnit(unit));

export const isLiterLike = (unit?: string | null): boolean => ['l', 'liter', 'litre', 'liters', 'litres'].includes(normalizeUnit(unit));

export const hasSmallUnitConversion = (unit?: string | null): boolean => isKgLike(unit) || isLiterLike(unit);

export const toSmallUnitLabel = (qty: number, unit?: string | null): string => {
  const n = Number(qty || 0);
  if (isKgLike(unit)) return `${Math.round(n * 1000)}g`;
  if (isLiterLike(unit)) return `${Math.round(n * 1000)}ml`;
  const clean = round3(n);
  const normalized = Number.isInteger(clean) ? String(clean) : clean.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const u = normalizeUnit(unit);
  return u ? `${normalized} ${u}` : normalized;
};

export const formatQtyDisplay = (qty: number, unit?: string | null): string => {
  const n = Number(qty || 0);
  if (hasSmallUnitConversion(unit)) {
    if (n >= 1) {
      const clean = round3(n);
      const normalized = Number.isInteger(clean) ? String(clean) : clean.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      const symbol = isKgLike(unit) ? 'kg' : 'l';
      return `${normalized} ${symbol}`;
    }
    return toSmallUnitLabel(n, unit);
  }

  const clean = round3(n);
  const normalized = Number.isInteger(clean) ? String(clean) : clean.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const u = normalizeUnit(unit);
  return u ? `${normalized} ${u}` : normalized;
};

export const getQtyPresets = (unit?: string | null): QtyPreset[] => {
  if (hasSmallUnitConversion(unit)) {
    const values = [0.1, 0.25, 0.5, 0.75, 1];
    return values.map((v) => ({ value: v, label: toSmallUnitLabel(v, unit) }));
  }
  return [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
};

export const parseQtyInput = (raw: string): number | null => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return round3(n);
};
