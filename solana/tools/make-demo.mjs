// Rebuild fictional evidence and its independently distributed demo profile together.
// The signing keys exist in memory for this build only.
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  base58,
  decisionMessage,
  decisionRecord,
  evaluate,
  hex,
  leaf,
  objectDigest,
  requestMessage,
  requestRecord,
  signedBytes,
  tree,
  version,
} from '../core/protocol.mjs';
const keys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    address: base58(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)),
  };
};
const addr = () => base58(randomBytes(32));
const [agent, issuer] = [keys(), keys()];
const signRecord = (pair, kind, message) =>
  hex(sign(null, signedBytes(kind, message), pair.privateKey));
const context = { genesisHash: addr(), programId: addr(), publisher: issuer.address };
const allowed = addr();
const policy = {
  id: 'agent-payments-v1',
  asset: 'USDC',
  mint: addr(),
  decimals: 6,
  perPaymentLimitMinor: '100000000',
  allowedRecipients: [allowed],
};
const policyHash = await objectDigest(policy);
const examples = [
  ['limit', '1회 결제 한도 초과', '185000000', allowed, 'Northstar Compute'],
  ['merchant', '허용 목록 밖 가맹점', '42000000', addr(), 'Orbit Index'],
  ['false-reason', '유효한 서명 · 잘못된 거절', '64000000', allowed, 'Northstar Compute'],
];
const rows = examples.map(([id, label, amountMinor, recipient, merchant], i) => {
  const r = {
    schema: version,
    context,
    issuer: issuer.address,
    policy,
    request: {
      id: 'PAY-404-' + String(i + 1).padStart(4, '0'),
      agent: 'Atlas Procurement',
      agentKey: agent.address,
      merchant,
      recipient,
      amountMinor,
      asset: policy.asset,
      mint: policy.mint,
      decimals: policy.decimals,
    },
    decision: { policyHash, issuedAt: '2026-11-23T03:20:00Z' },
    proofs: {},
  };
  r.requestSignature = signRecord(agent, 'request', requestMessage(r));
  return { id, label, receipt: r };
});
const requests = await tree(rows.map(({ receipt }) => requestRecord(receipt)));
const reqBatch = { batchId: '1', slot: '4201', count: rows.length, root: requests.root };
for (const [i, { id, receipt: r }] of rows.entries()) {
  r.proofs.request = { batchId: reqBatch.batchId, index: i, siblings: requests.paths[i] };
  Object.assign(r.decision, {
    reasonCode: id === 'false-reason' ? 'LIMIT_EXCEEDED' : evaluate(r.request, policy),
    requestLeaf: await leaf(requestRecord(r)),
    requestRef: { batchId: reqBatch.batchId, slot: reqBatch.slot, root: reqBatch.root, index: i },
  });
  r.signature = signRecord(issuer, 'decision', decisionMessage(r));
}
const decisions = await tree(rows.map(({ receipt }) => decisionRecord(receipt)));
const decBatch = { batchId: '2', slot: '4207', count: rows.length, root: decisions.root };
for (const [i, { receipt: r }] of rows.entries())
  r.proofs.decision = { batchId: decBatch.batchId, index: i, siblings: decisions.paths[i] };
const tampered = structuredClone(rows[0].receipt);
tampered.request.amountMinor = '85000000';
rows.push({ id: 'tamper', label: '서명 후 결제 금액 변조', receipt: tampered });
const trust = {
  source: 'demo-fixture',
  context,
  issuer: issuer.address,
  agentKeys: [agent.address],
  policyHash,
  batches: [reqBatch, decBatch],
};
const save = (file, name, value) =>
  writeFile(
    new URL('../core/' + file, import.meta.url),
    '// Generated demonstration data. No chain RPC was used.\nexport const ' +
      name +
      ' = ' +
      JSON.stringify(value, null, 2) +
      ';\n'
  );
await Promise.all([
  save('scenarios.mjs', 'SCENARIOS', rows),
  save('demo-trust.mjs', 'DEMO_TRUST', trust),
]);
