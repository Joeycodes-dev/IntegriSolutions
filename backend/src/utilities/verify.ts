import { hashData } from "./hash";

export function checkData(data: object | string, storedHash: string): boolean {
    // rehashing the data using same SHA256 algorithm
    const currentHash = hashData(data);

    // comparing current hash to stored one: match = unchanged data & no match = modifieed data
    return currentHash === storedHash;
}