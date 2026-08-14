// Pure-logic tests (no server). Run: node test/logic.test.mjs
import { feeFor, FEE_BPS, AUTO_RELEASE_SECONDS } from '../functions/_lib/util.js';
import assert from 'node:assert';

// 10% platform fee, rounded to the nearest cent.
assert.equal(FEE_BPS, 1000);
assert.equal(feeFor(25000), 2500, '$250 → $25');
assert.equal(feeFor(9000), 900, '$90 → $9');
assert.equal(feeFor(12345), 1235, 'rounds to nearest cent (1234.5 → 1235)');
assert.equal(feeFor(1), 0, 'sub-cent fee rounds to 0');

// Pro payout = amount - fee; platform keeps exactly the fee.
const amt = 25000, fee = feeFor(amt);
assert.equal(amt - fee, 22500, 'pro receives amount - fee');

// 5-day auto-release window.
assert.equal(AUTO_RELEASE_SECONDS, 5 * 24 * 60 * 60);

console.log('ok — logic tests passed');
