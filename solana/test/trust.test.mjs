import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_TRUST } from '../core/demo-trust.mjs';
import { SCENARIOS } from '../core/scenarios.mjs';
import { validTrustProfile } from '../core/trust.mjs';
import { verifyReceipt } from '../core/verifier.mjs';

test('accepts the detached profile emitted by the localnet workflow', () => {
  assert(validTrustProfile({ ...DEMO_TRUST, source: 'auditor-rpc-export' }));
  assert(!validTrustProfile(SCENARIOS[0].receipt));
});

test('rejects duplicate checkpoints, malformed accounts and invalid batch bounds', () => {
  for (const change of [
    (p) => p.batches.push(p.batches[0]),
    (p) => (p.batches[0].slot = '18446744073709551616'),
    (p) => (p.batches[0].batchId = '0'),
    (p) => (p.batches[0].count = 33),
    (p) => (p.context.programId = 'invalid'),
    (p) => (p.policyHash = 'abcd'),
    (p) => (p.agentKeys = []),
  ]) {
    const profile = structuredClone(DEMO_TRUST);
    change(profile);
    assert(!validTrustProfile(profile));
  }
});

test('switching and restoring detached checkpoints replays the same receipt', async () => {
  const receipt = SCENARIOS[0].receipt;
  const external = structuredClone(DEMO_TRUST);
  external.source = 'auditor-rpc-export';
  external.batches[0].root = '00'.repeat(32);
  assert(validTrustProfile(external));
  const mismatch = await verifyReceipt(receipt, external);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.checks.find((check) => check.id === 'request').ok, false);
  assert.equal((await verifyReceipt({ ...receipt, trust: DEMO_TRUST }, external)).ok, false);
  assert.equal((await verifyReceipt(receipt, DEMO_TRUST)).ok, true);
});
