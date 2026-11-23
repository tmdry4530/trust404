import { parseEvidenceJSON } from '../core/json.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENARIOS } from '../core/scenarios.mjs';
import { DEMO_TRUST } from '../core/demo-trust.mjs';
import { verifyReceipt } from '../core/verifier.mjs';
import { base58, keyBytes, evaluate, included, leaf, tree } from '../core/protocol.mjs';
const sample = (id) => structuredClone(SCENARIOS.find((s) => s.id === id).receipt);
const firstFail = (r) => r.checks.find((c) => c.ok === false)?.id;
for (const [id, reason] of [
  ['limit', 'LIMIT_EXCEEDED'],
  ['merchant', 'MERCHANT_NOT_ALLOWED'],
]) {
  test(id + ' is reproducible offline', async () => {
    const r = await verifyReceipt(sample(id));
    assert.ok(r.ok);
    assert.equal(r.reasonCode, reason);
  });
}
test('valid signatures and two valid anchors cannot make a false refusal pass', async () => {
  const r = await verifyReceipt(sample('false-reason'));
  assert.deepEqual(
    r.checks.map((c) => c.ok),
    [true, true, true, true, true, false]
  );
  assert.equal(r.reasonCode, 'APPROVED');
});
test('unsigned edit fails requester signature', async () =>
  assert.equal(firstFail(await verifyReceipt(sample('tamper'))), 'agent'));
test('replacing policy, issuer, cluster or changing token precision fails profile check', async () => {
  for (const change of [
    (r) => (r.policy.perPaymentLimitMinor = '1'),
    (r) => (r.issuer = r.request.agentKey),
    (r) => (r.context.genesisHash = r.issuer),
    (r) => (r.request.decimals = 5),
    (r) => (r.request.mint = r.issuer),
  ]) {
    const r = sample('limit');
    change(r);
    assert.equal(firstFail(await verifyReceipt(r)), 'profile');
  }
});
test('receipt cannot supply its own trusted roots', async () => {
  const r = sample('limit');
  r.batches = DEMO_TRUST.batches;
  assert.equal(firstFail(await verifyReceipt(r)), 'profile');
});
test('edited request proof, decision proof and decision linkage each fail independently', async () => {
  for (const [stage, change] of [
    ['request', (r) => r.proofs.request.siblings.reverse()],
    ['decision', (r) => (r.proofs.decision.index = 1)],
    ['issuer', (r) => (r.decision.requestRef.slot = '1')],
    ['issuer', (r) => (r.signature = r.requestSignature)],
  ]) {
    const r = sample('limit');
    change(r);
    assert.equal(firstFail(await verifyReceipt(r)), stage);
  }
});
test('same or earlier decision slot fails anti-backdating check', async () => {
  for (const slot of ['4201', '4200']) {
    const t = structuredClone(DEMO_TRUST);
    t.batches[1].slot = slot;
    assert.equal(firstFail(await verifyReceipt(sample('limit'), t)), 'decision');
  }
});
test('no receipt verification without previously obtained batch roots', async () => {
  const t = structuredClone(DEMO_TRUST);
  t.batches = [];
  assert.equal(firstFail(await verifyReceipt(sample('limit'), t)), 'profile');
});
test('unknown fields, untyped integers and invalid decimal quantities fail closed', async () => {
  for (const change of [
    (r) => (r.request.balance = '1'),
    (r) => (r.request.amountMinor = 185000000),
    (r) => (r.request.amountMinor = '1e6'),
    (r) => (r.request.amountMinor = '18446744073709551616'),
    (r) => (r.request.amountMinor = '0'),
    (r) => (r.request.amountMinor = '01'),
    (r) => (r.request.decimals = 6.2),
  ]) {
    const r = sample('limit');
    change(r);
    assert.equal(firstFail(await verifyReceipt(r)), 'profile');
  }
});
test('strict amount boundary and deterministic precedence for simultaneous refusals', () => {
  const { request, policy } = sample('limit');
  assert.equal(
    evaluate({ ...request, amountMinor: policy.perPaymentLimitMinor }, policy),
    'APPROVED'
  );
  assert.equal(evaluate({ ...request, recipient: 'unlisted' }, policy), 'MERCHANT_NOT_ALLOWED');
});
test('RFC6962 proof shapes at every tree size and leaf position, baselines for singleton and forbidding padded paths', async () => {
  for (let n = 1; n <= 32; n++) {
    const records = Array.from({ length: n }, (_, i) => ({ i }));
    const t = await tree(records);
    for (const [i, record] of records.entries()) {
      const h = await leaf(record);
      assert.ok(await included(h, i, n, t.paths[i], t.root));
      assert.equal(await included(h, i, n, [...t.paths[i], t.root], t.root), false);
    }
  }
});
test('base58 round trip preserves leading zero bytes', () => {
  const b = Uint8Array.from({ length: 32 }, (_, i) => (i < 4 ? 0 : i));
  assert.deepEqual(keyBytes(base58(b)), b);
  assert.throws(() => keyBytes('1'.repeat(31)));
  assert.throws(() => keyBytes('1'.repeat(33)));
});

test('JSON import rejects duplicate keys, including escape aliases, but accepts whitespace and strings containing punctuation', () => {
  assert.throws(() => parseEvidenceJSON(String.raw`{"a":"x","\u0061":"y"}`), /Duplicate/);
  assert.deepEqual(parseEvidenceJSON(' {"x": ["{a:b}", {"x":5}]} '), { x: ['{a:b}', { x: 5 }] });
});
