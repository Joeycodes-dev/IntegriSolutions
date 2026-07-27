import { hashData } from "./hash";
import { checkData } from "./verify";

// simulation of test record 
const testRecord = {
    officerId: 'officer-123',
    driverName: 'John Doe',
    driverId: 'ID-456',
    bacReading: 0.04,
    result: 'pass',
    createdAt: '2026-04-29T00:00:00.000Z',
}

// test 1 - hashing
console.log('------ Test 1 - Hashing -----');
const hash = hashData(testRecord);
console.log('Generated hash: ', hash);

console.log('\n');

// test 2 - verifying untampered data
console.log('------ Test 2 - Verify Untampered Data -----');
const isValid = checkData(testRecord, hash);
console.log('Data consistent? ', isValid);

console.log('\n');

// test 3 - verifying tampered data
console.log('------ Test 3 - Verify Tampered Data -----');
const tamperedRecord = { ...testRecord, bacReading: 0.07}; // changing the bac reading
const isTampered = checkData(tamperedRecord, hash);
console.log('Data consistent? ', isTampered);