import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { batchAddress, initInstruction, publishInstruction, readFinalized } from '../client.mjs';

const program = new PublicKey(Buffer.alloc(32, 125));
const publisher = new PublicKey(Buffer.alloc(32, 185));
const root = 'ab'.repeat(32);
const id = '18446744073709551615';

test('instruction encoding and distinct canonical addresses', () => {
  const init = initInstruction(program, publisher);
  const publish = publishInstruction(program, publisher, id, 32, root);
  assert.deepEqual(init.data, Buffer.from([0]));
  assert.deepEqual(publish.data, Buffer.from('01' + 'ff'.repeat(8) + '2000' + root, 'hex'));
  assert.deepEqual(
    publish.keys.map((k) => [k.isSigner, k.isWritable]),
    [
      [true, true],
      [false, true],
      [false, true],
      [false, false],
    ]
  );
  assert.ok(init.keys[1].pubkey.equals(publish.keys[1].pubkey));
  assert.ok(!publish.keys[2].pubkey.equals(batchAddress(program, publisher, '1')));
  assert.ok(!publish.keys[2].pubkey.equals(batchAddress(program, program, id)));
  for (const args of [
    ['0', 32, root],
    ['01', 1, root],
    ['18446744073709551616', 1, root],
    [id, 0, root],
    [id, 33, root],
    [id, 1, '00'.repeat(32)],
  ])
    assert.throws(() => publishInstruction(program, publisher, ...args));
});

test('RPC reader validates the finalized account from its derived address', async () => {
  const data = Buffer.alloc(98);
  data.write('T404BAT1');
  publisher.toBuffer().copy(data, 8);
  data.writeBigUInt64LE(BigInt(id), 40);
  data.writeUInt16LE(2, 48);
  Buffer.from(root, 'hex').copy(data, 50);
  data.writeBigUInt64LE(98n, 82);
  data.writeBigInt64LE(1700000000n, 90);
  let account = { data, executable: false, owner: program };
  const connection = {
    getGenesisHash: async () => program.toBase58(),
    async getAccountInfoAndContext(key, commitment) {
      assert.ok(key.equals(batchAddress(program, publisher, id)));
      assert.equal(commitment, 'finalized');
      return { context: { slot: 100 }, value: account };
    },
  };
  const read = () => readFinalized(connection, program, publisher, id);
  assert.deepEqual(await read(), {
    context: {
      genesisHash: program.toBase58(),
      programId: program.toBase58(),
      publisher: publisher.toBase58(),
    },
    commitment: 'finalized',
    batchId: id,
    count: 2,
    root,
    slot: '98',
  });
  for (const offset of [0, 8, 40, 48, 82]) {
    const old = data[offset];
    data[offset] = 0xff - old;
    await assert.rejects(read);
    data[offset] = old;
  }
  account = { ...account, owner: publisher };
  await assert.rejects(read);
  account = null;
  await assert.rejects(read);
});
