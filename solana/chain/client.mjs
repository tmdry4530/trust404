import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';

const U64_MAX = (1n << 64n) - 1n;
const BATCH_TAG = Buffer.from('T404BAT1');

export function batchIdBytes(id) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,19}$/.test(id) || BigInt(id) > U64_MAX)
    throw new Error('Batch ID must be a positive u64 decimal string');
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(id));
  return bytes;
}

function rootBytes(root) {
  if (typeof root !== 'string' || !/^[0-9a-fA-F]{64}$/.test(root) || /^0+$/.test(root))
    throw new Error('Root must be a nonzero 32-byte hex digest without 0x');
  return Buffer.from(root, 'hex');
}

export function publisherAddress(program, publisher) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('publisher'), publisher.toBuffer()],
    program
  )[0];
}

export function batchAddress(program, publisher, id) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('batch'), publisher.toBuffer(), batchIdBytes(id)],
    program
  )[0];
}

function writable(pubkey, isSigner = false) {
  return { pubkey, isSigner, isWritable: true };
}
const systemAccount = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false };

export function initInstruction(program, publisher) {
  return new TransactionInstruction({
    programId: program,
    keys: [
      writable(publisher, true),
      writable(publisherAddress(program, publisher)),
      systemAccount,
    ],
    data: Buffer.from([0]),
  });
}

export function publishInstruction(program, publisher, id, count, root) {
  if (!Number.isInteger(count) || count < 1 || count > 32)
    throw new Error('Count must be an integer between 1 and 32');
  const data = Buffer.alloc(43);
  data[0] = 1;
  batchIdBytes(id).copy(data, 1);
  data.writeUInt16LE(count, 9);
  rootBytes(root).copy(data, 11);
  return new TransactionInstruction({
    programId: program,
    keys: [
      writable(publisher, true),
      writable(publisherAddress(program, publisher)),
      writable(batchAddress(program, publisher, id)),
      systemAccount,
    ],
    data,
  });
}

export function decodeBatch(account, program, publisher, id, responseSlot) {
  if (!account || account.executable || !account.owner.equals(program))
    throw new Error('Missing batch account or unexpected owner');
  const data = Buffer.from(account.data);
  if (
    data.length !== 98 ||
    !data.subarray(0, 8).equals(BATCH_TAG) ||
    !data.subarray(8, 40).equals(publisher.toBuffer()) ||
    !data.subarray(40, 48).equals(batchIdBytes(id))
  )
    throw new Error('Batch record type, size, publisher or ID mismatch');
  const count = data.readUInt16LE(48);
  const root = data.subarray(50, 82).toString('hex');
  const slot = data.readBigUInt64LE(82);
  if (count < 1 || count > 32 || /^0+$/.test(root))
    throw new Error('Invalid count or root in batch account');
  if (!Number.isSafeInteger(responseSlot) || responseSlot < 0 || slot > BigInt(responseSlot))
    throw new Error('Batch slot exceeds finalized RPC observation');
  return { batchId: id, count, root, slot: slot.toString() };
}

export async function readFinalized(connection, program, publisher, id) {
  const address = batchAddress(program, publisher, id);
  const [genesisHash, response] = await Promise.all([
    connection.getGenesisHash(),
    connection.getAccountInfoAndContext(address, 'finalized'),
  ]);
  const batch = decodeBatch(response.value, program, publisher, id, response.context.slot);
  return {
    context: { genesisHash, programId: program.toBase58(), publisher: publisher.toBase58() },
    commitment: 'finalized',
    ...batch,
  };
}
