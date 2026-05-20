import crypto from 'crypto';

function canonicalStringify(data: object): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(data).sort()) {
        sorted[key] = (data as Record<string, unknown>)[key];
    }
    return JSON.stringify(sorted);
}

export function hashData(data: object | string): string {
    // converting object data into consistent JSON string for same hash results
    const str = typeof data === 'string' ? data : canonicalStringify(data);

    // creating SHA-256 hash and returning hexadecimal string
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}
