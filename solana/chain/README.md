# Solana batch registry

Each publisher initializes a registry using its own signature. The publisher is also the transaction fee payer in this CLI. Publish requires the same signer, the canonical writable registry account and the canonical writable batch account. Batch IDs start at 1 and advance by exactly one. A batch contains a nonzero digest and 1–32 leaves. The program records the runtime slot and Unix timestamp. Its instruction set supports initialization and append. Transactions competing for the next ID are serialized through the registry account.

Each publisher PDA corresponds to one deployed instance of the original EVM registry. An auditor pins the cluster genesis hash, executable program ID, and publisher. The append-only guarantee assumes the deployed code stays fixed. A retained program upgrade authority can change future behavior. Pass `--bpf-program` when starting the local validator as below to load the demo program with upgrades disabled.

## Build and test

Run from the project root with Node 22+, Rust, and the Solana SBF build tools installed.

```sh
npm ci --prefix chain
npm test --prefix chain
cargo test --locked --manifest-path chain/Cargo.toml
(cd chain && cargo build-sbf --tools-version v1.58 --arch v0)
python3 -m pip install solders==0.29.0
python3 chain/test/runtime.py chain/target/deploy/trust404_anchor.so
```

To run the full demonstration on a fresh local validator, run these commands in two terminals. Use a fresh ledger directory for a new genesis. The program address below is a local demo address. The command loads the SBF binary at that address.

```sh
solana-test-validator --ledger trust404-test-ledger \
  --bpf-program 7HinTb3byVqLMJCxDK2P7zrUBJYzYwyrU1L5si3afUrG chain/target/deploy/trust404_anchor.so
```

```sh
node tools/localnet.mjs 7HinTb3byVqLMJCxDK2P7zrUBJYzYwyrU1L5si3afUrG
```

Use `chain/cli.mjs` to submit individual instructions or independently retrieve a finalized record. `read` derives the expected account, requests finalized commitment, checks its program owner and binary layout, and exports the cluster, program, publisher, batch ID, count, root, and original inclusion slot. A trusted observer must export the values over a trusted RPC connection before an offline verifier can use them. A JSON file copied from a receipt sender does not independently establish the chain state.

## Binary interface

Every integer uses little-endian encoding. Seeds listed as strings use their ASCII bytes, addresses use their 32 raw bytes, and IDs in seeds use an eight-byte unsigned encoding. Addresses use the canonical PDA bump.

| Account | Seeds | Value |
| --- | --- | --- |
| Registry | `publisher`, publisher key | `T404REG1` (8), publisher (32), last ID (u64) |
| Batch | `batch`, publisher key, batch ID | `T404BAT1` (8), publisher (32), ID (u64), count (u16), root (32), slot (u64), Unix time (i64) |

| Instruction | Payload | Account order |
| --- | --- | --- |
| Initialize | tag 0 (u8) | publisher writable signer, registry writable, System Program |
| Publish | tag 1 (u8), ID (u64), count (u16), root (32) | publisher writable signer, registry writable, batch writable, System Program |
