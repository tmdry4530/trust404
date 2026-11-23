import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { initInstruction, publishInstruction, readFinalized } from './client.mjs';

const usage = [
  'node chain/cli.mjs init --rpc URL --program ADDRESS --keypair FILE',
  'node chain/cli.mjs publish --rpc URL --program ADDRESS --keypair FILE --batch-id N --count N --root HEX',
  'node chain/cli.mjs read --rpc URL --program ADDRESS --publisher ADDRESS --batch-id N',
].join('\n');

async function main([command, ...args]) {
  const commandFlags = {
    init: ['keypair'],
    publish: ['keypair', 'batch-id', 'count', 'root'],
    read: ['publisher', 'batch-id'],
  };
  if (!Object.hasOwn(commandFlags, command)) throw new Error(usage);
  const required = ['rpc', 'program', ...commandFlags[command]];
  const options = Object.fromEntries(required.map((name) => [name, { type: 'string' }]));
  const { values } = parseArgs({ args, options, strict: true });
  if (!required.every((name) => values[name]?.length > 0)) throw new Error(usage);
  const connection = new Connection(values.rpc, 'finalized');
  const program = new PublicKey(values.program);
  if (command === 'read')
    return readFinalized(connection, program, new PublicKey(values.publisher), values['batch-id']);

  const raw = JSON.parse(await readFile(values.keypair, 'utf8'));
  if (
    !Array.isArray(raw) ||
    raw.length !== 64 ||
    !raw.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
  )
    throw new Error('Invalid 64-byte Solana CLI keypair');
  const payer = Keypair.fromSecretKey(Uint8Array.from(raw));
  const instruction =
    command === 'init'
      ? initInstruction(program, payer.publicKey)
      : publishInstruction(
          program,
          payer.publicKey,
          values['batch-id'],
          Number(values.count),
          values.root
        );
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer],
    {
      commitment: 'finalized',
      preflightCommitment: 'confirmed',
    }
  );
  return { signature, commitment: 'finalized' };
}

try {
  console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
