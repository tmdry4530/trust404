//! Publisher-scoped, append-only batch commitments. Each publisher PDA represents
//! one instance of the original registry. Clients pin the publisher and program.
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

const REG_TAG: &[u8; 8] = b"T404REG1";
const BATCH_TAG: &[u8; 8] = b"T404BAT1";
const REG_LEN: usize = 48;
const BATCH_LEN: usize = 98;

#[derive(Debug, PartialEq)]
struct Publish {
    id: u64,
    count: u16,
    root: [u8; 32],
}

impl Publish {
    fn decode(bytes: &[u8]) -> Result<Self, ProgramError> {
        if bytes.len() != 42 {
            return Err(ProgramError::InvalidInstructionData);
        }
        let id = u64::from_le_bytes(bytes[..8].try_into().unwrap());
        let count = u16::from_le_bytes(bytes[8..10].try_into().unwrap());
        let root: [u8; 32] = bytes[10..].try_into().unwrap();
        if id == 0 || !(1..=32).contains(&count) || root == [0; 32] {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(Self { id, count, root })
    }

    fn encode_record(&self, publisher: &Pubkey, slot: u64, time: i64) -> [u8; BATCH_LEN] {
        let mut record = [0; BATCH_LEN];
        record[..8].copy_from_slice(BATCH_TAG);
        record[8..40].copy_from_slice(publisher.as_ref());
        record[40..48].copy_from_slice(&self.id.to_le_bytes());
        record[48..50].copy_from_slice(&self.count.to_le_bytes());
        record[50..82].copy_from_slice(&self.root);
        record[82..90].copy_from_slice(&slot.to_le_bytes());
        record[90..98].copy_from_slice(&time.to_le_bytes());
        record
    }
}

fn check_successor(registry: &[u8], publisher: &Pubkey, next: u64) -> ProgramResult {
    if registry.len() != REG_LEN
        || &registry[..8] != REG_TAG
        || &registry[8..40] != publisher.as_ref()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let last = u64::from_le_bytes(registry[40..48].try_into().unwrap());
    if last.checked_add(1) != Some(next) {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

fn canonical_bump(key: &Pubkey, seeds: &[&[u8]], program_id: &Pubkey) -> Result<u8, ProgramError> {
    let (expected, bump) = Pubkey::find_program_address(seeds, program_id);
    if &expected != key {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(bump)
}

// Allocate and assign separately so a PDA that already holds donated lamports
// can be initialized. All steps and the caller's state update commit atomically.
fn initialize_pda<'a>(
    payer: &AccountInfo<'a>,
    target: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    program_id: &Pubkey,
    signer_seeds: &[&[u8]],
    space: usize,
) -> ProgramResult {
    if !target.is_writable || target.executable {
        return Err(ProgramError::InvalidAccountData);
    }
    if target.owner != &system_program::id() || !target.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let rent = Rent::get()?.minimum_balance(space);
    let due = rent.saturating_sub(target.lamports());
    if due > 0 {
        invoke(
            &system_instruction::transfer(payer.key, target.key, due),
            &[payer.clone(), target.clone(), system.clone()],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(target.key, space as u64),
        &[target.clone(), system.clone()],
        &[signer_seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(target.key, program_id),
        &[target.clone(), system.clone()],
        &[signer_seeds],
    )
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let (tag, payload) = data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    let mut iter = accounts.iter();
    let publisher = next_account_info(&mut iter)?;
    let registry = next_account_info(&mut iter)?;
    if !publisher.is_signer || publisher.key == &Pubkey::default() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !publisher.is_writable || !registry.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    let reg_bump = canonical_bump(
        registry.key,
        &[b"publisher", publisher.key.as_ref()],
        program_id,
    )?;
    match tag {
        0 if payload.is_empty() => {
            let system = next_account_info(&mut iter)?;
            check_system(system)?;
            initialize_pda(
                publisher,
                registry,
                system,
                program_id,
                &[b"publisher", publisher.key.as_ref(), &[reg_bump]],
                REG_LEN,
            )?;
            let mut state = registry.try_borrow_mut_data()?;
            state[..8].copy_from_slice(REG_TAG);
            state[8..40].copy_from_slice(publisher.key.as_ref());
            state[40..48].copy_from_slice(&0u64.to_le_bytes());
            Ok(())
        }
        1 => {
            let publish = Publish::decode(payload)?;
            let batch = next_account_info(&mut iter)?;
            let system = next_account_info(&mut iter)?;
            check_system(system)?;
            if registry.owner != program_id {
                return Err(ProgramError::IncorrectProgramId);
            }
            check_successor(&registry.try_borrow_data()?, publisher.key, publish.id)?;
            let id = publish.id.to_le_bytes();
            let bump = canonical_bump(
                batch.key,
                &[b"batch", publisher.key.as_ref(), &id],
                program_id,
            )?;
            let clock = Clock::get()?;
            initialize_pda(
                publisher,
                batch,
                system,
                program_id,
                &[b"batch", publisher.key.as_ref(), &id, &[bump]],
                BATCH_LEN,
            )?;
            let record = publish.encode_record(publisher.key, clock.slot, clock.unix_timestamp);
            batch.try_borrow_mut_data()?.copy_from_slice(&record);
            registry.try_borrow_mut_data()?[40..48].copy_from_slice(&id);
            msg!(
                "BatchAnchored id={} count={} slot={}",
                publish.id,
                publish.count,
                clock.slot
            );
            Ok(())
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn check_system(system: &AccountInfo) -> ProgramResult {
    if !system_program::check_id(system.key) || !system.executable {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(id: u64, count: u16, root: u8) -> Vec<u8> {
        [
            id.to_le_bytes().as_slice(),
            count.to_le_bytes().as_slice(),
            &[root; 32],
        ]
        .concat()
    }

    #[test]
    fn batch_payload_bounds() {
        for count in [1, 2, 32] {
            assert_eq!(
                Publish::decode(&payload(1, count, 0x55)).unwrap().count,
                count
            );
        }
        for data in [
            payload(0, 1, 1),
            payload(1, 0, 1),
            payload(1, 33, 1),
            payload(1, 1, 0),
            vec![0; 43],
        ] {
            assert!(Publish::decode(&data).is_err());
        }
    }

    #[test]
    fn order_and_publisher() {
        let key = Pubkey::new_unique();
        let mut reg = [0u8; REG_LEN];
        reg[..8].copy_from_slice(REG_TAG);
        reg[8..40].copy_from_slice(key.as_ref());
        assert!(check_successor(&reg, &key, 1).is_ok());
        assert!(check_successor(&reg, &key, 2).is_err());
        reg[40..48].copy_from_slice(&1u64.to_le_bytes());
        assert!(check_successor(&reg, &key, 1).is_err());
        assert!(check_successor(&reg, &Pubkey::new_unique(), 2).is_err());
        reg[40..48].copy_from_slice(&u64::MAX.to_le_bytes());
        assert!(check_successor(&reg, &key, 0).is_err());
    }

    #[test]
    fn batch_layout_stores_chain_clock() {
        let key = Pubkey::new_unique();
        let p = Publish::decode(&payload(7, 3, 77)).unwrap();
        let record = p.encode_record(&key, 9, -2);
        assert_eq!(&record[..8], BATCH_TAG);
        assert_eq!(&record[8..40], key.as_ref());
        assert_eq!(&record[40..48], &7u64.to_le_bytes());
        assert_eq!(&record[48..50], &3u16.to_le_bytes());
        assert_eq!(&record[50..82], &[77; 32]);
        assert_eq!(&record[82..90], &9u64.to_le_bytes());
        assert_eq!(&record[90..98], &(-2i64).to_le_bytes());
    }
}
