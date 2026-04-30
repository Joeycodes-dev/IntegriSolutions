import crypto from 'crypto';

export function hashData(data: object | string): string {
    // converting object data into consistent JSON string for same hash results
    const str = typeof data === 'string' ? data : JSON.stringify(data);

    // creating SHA-256 hash and returning hexadecimal string
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}