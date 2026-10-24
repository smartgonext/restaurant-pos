const dbUrl = process.env.DATABASE_URL || '';
const isSqliteDb = dbUrl.startsWith('file:') || dbUrl.toLowerCase().includes('sqlite');

export function normalizeStringArray(value, fallback = []) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw)
            return fallback;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((v) => String(v).trim()).filter(Boolean);
            }
        }
        catch {
            // Fallback for comma-separated strings
        }
        return raw.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return fallback;
}

export function toDbArrayField(values, fallback = []) {
    const normalized = normalizeStringArray(values, fallback);
    return JSON.stringify(normalized);
}
