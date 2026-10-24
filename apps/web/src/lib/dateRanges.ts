export type DatePreset = 'Today' | 'Yesterday' | 'Current Week' | 'Last 7 Days' | 'Current Month' | 'Custom';

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRangeForPreset(preset: DatePreset, now = new Date()): { startDate: string; endDate: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'Yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const v = toYmd(y);
      return { startDate: v, endDate: v };
    }
    case 'Current Week': {
      const start = new Date(today);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      return { startDate: toYmd(start), endDate: toYmd(today) };
    }
    case 'Last 7 Days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { startDate: toYmd(start), endDate: toYmd(today) };
    }
    case 'Current Month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toYmd(start), endDate: toYmd(today) };
    }
    case 'Today':
    case 'Custom':
    default: {
      const v = toYmd(today);
      return { startDate: v, endDate: v };
    }
  }
}

export function toApiDateTimeRange(startDate: string, endDate: string): { dateFrom: string; dateTo: string } {
  // Include full selected days to avoid dropping same-day rows.
  return {
    dateFrom: `${startDate}T00:00:00.000Z`,
    dateTo: `${endDate}T23:59:59.999Z`,
  };
}
