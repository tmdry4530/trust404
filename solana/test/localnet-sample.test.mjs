import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseEvidenceJSON } from '../core/json.mjs';
import { verifyReceipt } from '../core/verifier.mjs';
const load = async (name) =>
  parseEvidenceJSON(
    await readFile(new URL('../examples/localnet/' + name + '.json', import.meta.url), 'utf8')
  );

test('exported localhost receipt and both finalized observations match the pinned offline profile', async () => {
  const [receipt, trust, request, decision] = await Promise.all(
    ['receipt', 'trusted-profile', 'request-observation', 'decision-observation'].map(load)
  );
  for (const [i, b] of [request, decision].entries()) {
    assert.deepEqual(b.context, trust.context);
    assert.equal(b.commitment, 'finalized');
    const { batchId, slot, count, root } = b;
    assert.deepEqual(trust.batches[i], { batchId, slot, count, root });
  }
  assert.ok(BigInt(decision.slot) > BigInt(request.slot));
  const result = await verifyReceipt(receipt, trust);
  assert.equal(result.reasonCode, 'LIMIT_EXCEEDED');
  assert.ok(result.ok);
  assert.ok(result.checks.every((c) => c.ok));
});
