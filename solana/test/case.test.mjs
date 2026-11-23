import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58 } from '../core/protocol.mjs';
import { verifyReceipt } from '../core/verifier.mjs';

test('gateway and auditor CLI exchange files with external checkpoints and issuer-provided evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trust404-test-'));
  const run = (...args) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL('../tools/case.mjs', import.meta.url)), ...args],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    );
  const save = async (name, value) => {
    const path = join(dir, name);
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    return path;
  };
  const keys = async (name) => {
    const pair = generateKeyPairSync('ed25519'),
      pub = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const raw = Buffer.concat([
      pair.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32),
      pub,
    ]);
    return { address: base58(pub), file: await save(name, Array.from(raw)) };
  };
  const addr = () => base58(randomBytes(32));
  try {
    const agent = await keys('agent'),
      issuer = await keys('issuer'),
      to = addr(),
      mint = addr();
    const context = { genesisHash: addr(), programId: addr(), publisher: issuer.address };
    const policy = {
      id: 'agent-payments-v1',
      asset: 'TEST',
      mint,
      decimals: 6,
      perPaymentLimitMinor: '100',
      allowedRecipients: [to],
    };
    const cfg = await save('cfg', {
      context,
      policy,
      issuer: issuer.address,
      agentKeys: [agent.address],
    });
    const request = {
      agent: 'buyer',
      agentKey: agent.address,
      id: 'pay-1',
      merchant: 'supplier',
      recipient: to,
      amountMinor: '101',
      mint,
      asset: 'TEST',
      decimals: 6,
    };
    const requestFile = await save('request', request);
    const draft = run('request', cfg, requestFile, agent.file, '13');
    const draftFile = await save('draft', draft);
    const observation = (batch, slot) => ({ commitment: 'finalized', context, ...batch, slot });
    const first = await save('first', observation(draft.batch, '80'));
    const decision = run('decide', cfg, draftFile, first, issuer.file, '16');
    const last = await save('last', observation(decision.batch, '82'));
    const profile = run('profile', cfg, first, last);
    assert.equal((await verifyReceipt(decision.receipt, profile)).ok, true);
    assert.equal((await verifyReceipt(decision.receipt)).ok, false);
    const changed = structuredClone(draft);
    changed.receipt.request.amountMinor = '102';
    const forged = await save('forged', changed);
    assert.throws(
      () => run('decide', cfg, forged, first, issuer.file, '16'),
      /Invalid agent signature/
    );
    const different = await save('different', {
      ...observation(draft.batch, '80'),
      context: { ...context, programId: addr() },
    });
    assert.throws(
      () => run('profile', cfg, different, last),
      /another cluster, program or publisher/
    );
    const permissible = await save('ok-request', { ...request, amountMinor: '100' });
    const ok = run('request', cfg, permissible, agent.file, '17');
    const okDraft = await save('ok-draft', ok),
      okObserve = await save('ok-observe', observation(ok.batch, '85'));
    assert.throws(
      () => run('decide', cfg, okDraft, okObserve, issuer.file, '18'),
      /Policy permits/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
