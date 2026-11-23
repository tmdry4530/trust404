import { keyBytes } from './protocol.mjs';

const uint64 = (value) =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,19})$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (object, names) =>
  object !== null &&
  typeof object === 'object' &&
  !Array.isArray(object) &&
  Object.keys(object).length === names.length &&
  names.every((name) => Object.hasOwn(object, name));

function publicKey(value) {
  try {
    keyBytes(value);
    return true;
  } catch {
    return false;
  }
}

export function validTrustProfile(profile) {
  if (!keys(profile, ['source', 'context', 'issuer', 'agentKeys', 'policyHash', 'batches']))
    return false;
  if (
    typeof profile.source !== 'string' ||
    !profile.source.trim() ||
    /[\u0000-\u001f\u007f]/.test(profile.source)
  )
    return false;
  if (
    !keys(profile.context, ['genesisHash', 'programId', 'publisher']) ||
    !Object.values(profile.context).every(publicKey) ||
    !publicKey(profile.issuer) ||
    !hash(profile.policyHash)
  )
    return false;
  if (
    !Array.isArray(profile.agentKeys) ||
    !profile.agentKeys.length ||
    !profile.agentKeys.every(publicKey) ||
    new Set(profile.agentKeys).size !== profile.agentKeys.length
  )
    return false;
  if (!Array.isArray(profile.batches) || !profile.batches.length) return false;
  const batchIds = new Set();
  for (const batch of profile.batches) {
    if (
      !keys(batch, ['batchId', 'slot', 'count', 'root']) ||
      !uint64(batch.batchId) ||
      batch.batchId === '0' ||
      !uint64(batch.slot) ||
      !Number.isInteger(batch.count) ||
      batch.count < 1 ||
      batch.count > 32 ||
      !hash(batch.root) ||
      batchIds.has(batch.batchId)
    )
      return false;
    batchIds.add(batch.batchId);
  }
  return true;
}
