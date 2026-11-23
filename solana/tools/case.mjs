import { parseEvidenceJSON } from '../core/json.mjs';
// Create a single-record batch through each phase of an agent payment rejection.
// All input/output is local. Publishing and independent finalized reads use chain/.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validRequest, validPolicy } from '../core/verifier.mjs';
import {
  base58,
  canonical,
  decisionMessage,
  decisionRecord,
  evaluate,
  fromHex,
  hex,
  keyBytes,
  leaf,
  objectDigest,
  requestMessage,
  requestRecord,
  signedBytes,
  version,
} from '../core/protocol.mjs';
const load = async (f) => parseEvidenceJSON(await readFile(f, 'utf8'));
const requireValue = (ok, reason) => {
  if (!ok) throw new Error(reason);
};
function loadSigner(raw) {
  requireValue(
    Array.isArray(raw) &&
      raw.length === 64 &&
      raw.every((n) => Number.isInteger(n) && n >= 0 && n <= 255),
    'Invalid Solana CLI keypair file'
  );
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKey = createPrivateKey({
    format: 'der',
    type: 'pkcs8',
    key: Buffer.concat([prefix, Buffer.from(raw.slice(0, 32))]),
  });
  const publicKey = createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);
  requireValue(publicKey.equals(Buffer.from(raw.slice(32))), 'Keypair public key mismatch');
  return {
    address: base58(publicKey),
    sign: (kind, msg) => hex(sign(null, signedBytes(kind, msg), privateKey)),
  };
}
function validPublicContext(context) {
  for (const k of ['genesisHash', 'programId', 'publisher']) keyBytes(context[k]);
}
function makeRequest(config, request, agent, batchId) {
  const { context, policy, issuer } = config;
  validPublicContext(context);
  keyBytes(issuer);
  requireValue(validRequest(request) && validPolicy(policy), 'Invalid request or policy schema');
  requireValue(
    request.agentKey === agent.address,
    'The request agent key must match the signing key'
  );
  requireValue(
    config.agentKeys.includes(agent.address),
    'The signer must be in the configured agents'
  );
  requireValue(
    request.asset === policy.asset &&
      request.mint === policy.mint &&
      request.decimals === policy.decimals,
    'Asset configuration mismatch'
  );
  requireValue(
    /^[1-9][0-9]{0,19}$/.test(batchId) && BigInt(batchId) <= 18446744073709551615n,
    'Invalid request batchId'
  );
  return {
    schema: version,
    context,
    issuer,
    request,
    policy,
    decision: {},
    proofs: { request: { batchId, index: 0, siblings: [] } },
  };
}
function checkObservation(batch, context) {
  requireValue(
    canonical(batch.context) === canonical(context),
    'Observation belongs to another cluster, program or publisher'
  );
  requireValue(batch.commitment === 'finalized', 'A finalized observation is required');
  requireValue(
    /^[1-9][0-9]{0,19}$/.test(batch.batchId) &&
      BigInt(batch.batchId) <= 18446744073709551615n &&
      /^(0|[1-9][0-9]{0,19})$/.test(batch.slot) &&
      BigInt(batch.slot) <= 18446744073709551615n &&
      /^[0-9a-f]{64}$/.test(batch.root) &&
      Number.isInteger(batch.count) &&
      batch.count >= 1 &&
      batch.count <= 32,
    'Malformed batch observation'
  );
}
async function main([command, ...args]) {
  if (command === 'request' && args.length === 4) {
    const [cfg, request, key, batchId] = args;
    const config = await load(cfg),
      agent = loadSigner(await load(key));
    const r = makeRequest(config, await load(request), agent, batchId);
    r.decision.policyHash = await objectDigest(config.policy);
    r.requestSignature = agent.sign('request', requestMessage(r));
    return { receipt: r, batch: { batchId, count: 1, root: await leaf(requestRecord(r)) } };
  }
  if (command === 'decide' && args.length === 5) {
    const [cfg, draft, observed, key, decisionId] = args;
    const config = await load(cfg),
      r = (await load(draft)).receipt,
      batch = await load(observed),
      issuer = loadSigner(await load(key));
    checkObservation(batch, config.context);
    requireValue(
      validRequest(r.request) && validPolicy(r.policy),
      'Invalid request or policy schema'
    );
    requireValue(
      canonical(config.context) === canonical(r.context) &&
        issuer.address === r.issuer &&
        r.issuer === config.issuer &&
        config.agentKeys.includes(r.request.agentKey) &&
        canonical(config.policy) === canonical(r.policy) &&
        (await objectDigest(config.policy)) === r.decision.policyHash,
      'Request does not match local configuration'
    );
    requireValue(
      r.request.asset === r.policy.asset &&
        r.request.mint === r.policy.mint &&
        r.request.decimals === r.policy.decimals,
      'Asset mismatch'
    );
    const pub = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        keyBytes(r.request.agentKey),
      ]),
      format: 'der',
      type: 'spki',
    });
    requireValue(
      verify(null, signedBytes('request', requestMessage(r)), pub, fromHex(r.requestSignature)),
      'Invalid agent signature'
    );
    requireValue(
      /^[1-9][0-9]{0,19}$/.test(decisionId) &&
        BigInt(decisionId) <= 18446744073709551615n &&
        BigInt(decisionId) > BigInt(batch.batchId),
      'Invalid decision batch ID'
    );
    const requestLeaf = await leaf(requestRecord(r));
    requireValue(
      requestLeaf === batch.root && batch.count === 1 && batch.batchId === r.proofs.request.batchId,
      'Finalized request observation differs from draft'
    );
    const reasonCode = evaluate(r.request, r.policy);
    requireValue(
      reasonCode !== 'APPROVED',
      'Policy permits this request; no refusal receipt can be issued'
    );
    Object.assign(r.decision, {
      requestLeaf,
      reasonCode,
      issuedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      requestRef: { batchId: batch.batchId, slot: batch.slot, root: batch.root, index: 0 },
    });
    r.proofs.decision = { batchId: decisionId, index: 0, siblings: [] };
    r.signature = issuer.sign('decision', decisionMessage(r));
    return {
      receipt: r,
      batch: { batchId: decisionId, count: 1, root: await leaf(decisionRecord(r)) },
    };
  }
  if (command === 'profile' && args.length === 3) {
    const [config, req, dec] = await Promise.all(args.map(load));
    requireValue(validPolicy(config.policy), 'Invalid trusted policy');
    for (const b of [req, dec]) checkObservation(b, config.context);
    requireValue(
      BigInt(dec.batchId) > BigInt(req.batchId) && BigInt(dec.slot) > BigInt(req.slot),
      'Decision must be in a later batch and slot'
    );
    return {
      source: 'auditor-rpc-export',
      context: config.context,
      issuer: config.issuer,
      agentKeys: config.agentKeys,
      policyHash: await objectDigest(config.policy),
      batches: [req, dec].map(({ batchId, slot, count, root }) => ({ batchId, slot, count, root })),
    };
  }
  if (command === 'receipt' && args.length === 1) return (await load(args[0])).receipt;
  throw new Error(
    'Usage: case.mjs request CONFIG REQUEST AGENT_KEY NEXT_ID | decide CONFIG DRAFT REQUEST_OBSERVATION ISSUER_KEY NEXT_ID | profile CONFIG REQUEST_OBSERVATION DECISION_OBSERVATION | receipt DECISION_DRAFT'
  );
}
try {
  console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
