// End-to-end demo against a local validator with the deployed anchor program.
// Each run uses fresh transient publisher and agent keys and a fresh output directory.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { base58, keyBytes } from '../core/protocol.mjs';
import { verifyReceipt } from '../core/verifier.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
function run(file, args, parseJSON = true) {
  const out = execFileSync(process.execPath, [join(project, file), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return parseJSON ? JSON.parse(out) : undefined;
}
function keypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { address: base58(raw), bytes: Array.from(Buffer.concat([seed, raw])) };
}
async function main([programId, outputRoot = 'localnet-output']) {
  if (!programId) throw new Error('Usage: node tools/localnet.mjs PROGRAM_ID [OUTPUT_PARENT]');
  keyBytes(programId);
  const endpoint = 'http://127.0.0.1:8899';
  async function rpc(method, params = []) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || data.error)
      throw new Error(method + ': ' + JSON.stringify(data.error || response.status));
    return data.result;
  }
  const genesisHash = await rpc('getGenesisHash');
  const account = await rpc('getAccountInfo', [
    programId,
    { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'finalized' },
  ]);
  if (!account.value?.executable)
    throw new Error('Deploy the program to the local validator first');
  const [agent, issuer] = [keypair(), keypair()];
  const args = ['--rpc', endpoint, '--program', programId];
  const temp = await mkdtemp(join(tmpdir(), 'trust404-keys-'));
  await mkdir(outputRoot, { recursive: true });
  const out = await mkdtemp(join(resolve(outputRoot), 'case-'));
  const save = async (path, value) => {
    await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    return path;
  };
  try {
    const signer = await save(join(temp, 'publisher.json'), issuer.bytes);
    const requester = await save(join(temp, 'agent.json'), agent.bytes);
    const recipient = base58(randomBytes(32)),
      mint = base58(randomBytes(32));
    const config = {
      context: { genesisHash, programId, publisher: issuer.address },
      issuer: issuer.address,
      agentKeys: [agent.address],
      policy: {
        id: 'agent-payments-v1',
        asset: 'TEST',
        mint,
        decimals: 6,
        perPaymentLimitMinor: '100000000',
        allowedRecipients: [recipient],
      },
    };
    const cfg = await save(join(out, 'config.json'), config);
    const request = await save(join(out, 'request.json'), {
      id: 'PAY-LOCAL-1',
      agent: 'Local agent',
      agentKey: agent.address,
      merchant: 'Compute supplier',
      recipient,
      amountMinor: '185000000',
      asset: 'TEST',
      mint,
      decimals: 6,
    });
    await rpc('requestAirdrop', [issuer.address, 1000000000]);
    const until = Date.now() + 90000;
    while (
      (await rpc('getBalance', [issuer.address, { commitment: 'finalized' }])).value < 1000000000
    ) {
      if (Date.now() > until) throw new Error('Local faucet did not finalize in time');
      await delay(500);
    }
    run('chain/cli.mjs', ['init', ...args, '--keypair', signer], false);
    const publish = ({ batchId, count, root }) =>
      run(
        'chain/cli.mjs',
        [
          'publish',
          ...args,
          '--keypair',
          signer,
          '--batch-id',
          batchId,
          '--count',
          String(count),
          '--root',
          root,
        ],
        false
      );
    const read = (id) =>
      run('chain/cli.mjs', ['read', ...args, '--publisher', issuer.address, '--batch-id', id]);
    const draft = run('tools/case.mjs', ['request', cfg, request, requester, '1']);
    const draftFile = await save(join(out, 'request-draft.json'), draft);
    publish(draft.batch);
    const observed = await save(join(out, 'request-observation.json'), read('1'));
    const decision = run('tools/case.mjs', ['decide', cfg, draftFile, observed, signer, '2']);
    publish(decision.batch);
    const confirmed = await save(join(out, 'decision-observation.json'), read('2'));
    const profile = run('tools/case.mjs', ['profile', cfg, observed, confirmed]);
    await save(join(out, 'trusted-profile.json'), profile);
    await save(join(out, 'receipt.json'), decision.receipt);
    const verdict = await verifyReceipt(decision.receipt, profile);
    if (!verdict.ok) throw new Error(JSON.stringify(verdict.checks));
    console.log('Verified ' + verdict.reasonCode + ' with two finalized localnet anchors.\n' + out);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
