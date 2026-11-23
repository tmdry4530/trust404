"""Run signed transactions against a compiled SBF program in an in-process Solana VM.

Requires solders 0.29.0. No RPC, network, or funded key is used.
"""
import argparse
import hashlib
import struct
from pathlib import Path

try:
    from solders.instruction import AccountMeta, Instruction
    from solders.keypair import Keypair
    from solders.litesvm import LiteSVM
    from solders.pubkey import Pubkey
    from solders.system_program import ID, TransferParams, transfer
    from solders.transaction import Transaction
    from solders.transaction_metadata import TransactionMetadata
except ImportError as error:
    raise SystemExit("Install the runtime with python3 -m pip install solders==0.29.0") from error

class LocalProgram:
    def __init__(self, binary):
        self.vm = LiteSVM()
        self.program = Keypair().pubkey()
        self.payer = Keypair()
        self.publisher = self.payer.pubkey()
        self.registry = self.pda([b"publisher", bytes(self.publisher)])
        self.vm.add_program_from_file(self.program, binary)
        self.vm.airdrop(self.publisher, 1_000_000_000)

    def pda(self, seeds):
        return Pubkey.find_program_address(seeds, self.program)[0]

    def batch_address(self, index):
        return self.pda([b"batch", bytes(self.publisher), struct.pack("<Q", index)])

    def instruction(self, data, batch=None, signer=True, author=None):
        accounts = [AccountMeta(author or self.publisher, signer, True),
                    AccountMeta(self.registry, False, True)]
        if batch is not None:
            accounts.append(AccountMeta(batch, False, True))
        accounts.append(AccountMeta(ID, False, False))
        return Instruction(self.program, data, accounts)

    def publish(self, index, count, root, address=None, **metadata):
        data = struct.pack("<BQH", 1, index, count) + bytes.fromhex(root)
        return self.instruction(data, address or self.batch_address(index), **metadata)

    def send(self, label, ix, expected_error=None, fee_payer=None):
        fee_payer = fee_payer or self.payer
        self.vm.expire_blockhash()
        tx = Transaction.new_signed_with_payer(
            [ix], fee_payer.pubkey(), [fee_payer], self.vm.latest_blockhash()
        )
        outcome = self.vm.send_transaction(tx)
        if expected_error is None:
            assert isinstance(outcome, TransactionMetadata), (label, outcome)
            print(f"PASS {label}")
        else:
            assert not isinstance(outcome, TransactionMetadata), label
            assert expected_error in str(outcome.err()), (label, outcome.err())
            print(f"PASS {label} rejected ({expected_error})")

    def read_batch(self, index, expected):
        account = self.vm.get_account(self.batch_address(index))
        assert account.owner == self.program and not account.executable
        data = account.data
        assert len(data) == 98 and data[:8] == b"T404BAT1" and data[8:40] == bytes(self.publisher)
        recorded_id, count = struct.unpack("<QH", data[40:50])
        slot, timestamp = struct.unpack("<Qq", data[82:98])
        assert recorded_id == index and str(index) == expected["batchId"]
        assert data[50:82].hex() == expected["root"] and count == expected["count"]
        assert (slot, timestamp) == (self.vm.get_clock().slot, self.vm.get_clock().unix_timestamp)
        registry = self.vm.get_account(self.registry)
        assert registry.owner == self.program
        assert registry.data == b"T404REG1" + bytes(self.publisher) + struct.pack("<Q", index)
        return {"batchId": str(recorded_id), "slot": str(slot), "count": count, "root": data[50:82].hex()}


def check_program(binary):
    sim = LocalProgram(binary)
    other = Keypair()
    sim.vm.airdrop(other.pubkey(), 1_000_000_000)
    first_root = hashlib.sha256(b"runtime request record").hexdigest()
    second_root = hashlib.sha256(b"runtime decision record").hexdigest()
    first_batch = {"batchId": "1", "count": 3, "root": first_root}
    last_batch = {"batchId": "2", "count": 32, "root": second_root}
    sim.send("initialize publisher", sim.instruction(b"\x00"))
    sim.send("duplicate initialization", sim.instruction(b"\x00"), "AccountAlreadyInitialized")
    sim.send("publish request batch", sim.publish(1, 3, first_root))
    first = sim.read_batch(1, first_batch)
    saved_first = sim.vm.get_account(sim.batch_address(1)).data
    sim.send("repeated batch", sim.publish(1, 1, second_root), "InvalidArgument")
    sim.send("skipped batch", sim.publish(3, 1, second_root), "InvalidArgument")
    sim.send("empty root", sim.publish(2, 1, "00" * 32), "InvalidInstructionData")
    sim.send("count above 32", sim.publish(2, 33, second_root), "InvalidInstructionData")
    sim.send("unsigned publisher", sim.publish(2, 1, second_root, signer=False), "MissingRequiredSignature", other)
    sim.send("foreign publisher registry", sim.publish(2, 1, second_root, author=other.pubkey()), "InvalidSeeds", other)
    sim.send("incorrect batch address", sim.publish(2, 1, second_root, address=Keypair().pubkey()), "InvalidSeeds")
    assert sim.vm.get_account(sim.batch_address(2)) is None
    assert sim.vm.get_account(sim.registry).data[40:] == struct.pack("<Q", 1)

    sim.vm.warp_to_slot(int(first["slot"]) + 5)
    sim.send("prefund batch PDA", transfer(TransferParams(
        from_pubkey=sim.publisher, to_pubkey=sim.batch_address(2), lamports=1_000_000)))
    sim.send("publish decision into prefunded PDA", sim.publish(2, 32, second_root))
    second = sim.read_batch(2, last_batch)
    assert int(second["slot"]) > int(first["slot"])
    assert sim.vm.get_account(sim.batch_address(1)).data == saved_first
    print(f"PASS roots, counts, publisher, PDA ownership and chain clock at local SVM slots "
          f"{first['slot']} and {second['slot']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path, help="compiled trust404_anchor.so")
    check_program(parser.parse_args().binary.resolve(strict=True))
