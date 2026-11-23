// Only JSON values admitted by the v1 schemas are serialized. Objects have ASCII keys.
const utf8 = new TextEncoder();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const version = 'trust404.solana.payment-refusal.v1';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
export function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}
export function fromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) throw new Error('Invalid hex');
  return Uint8Array.from(value.match(/../g), (b) => parseInt(b, 16));
}
export function base58(bytes) {
  let n = 0n;
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  let result = '';
  while (n > 0n) {
    result = alphabet[Number(n % 58n)] + result;
    n /= 58n;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + result;
}
export function keyBytes(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44)
    throw new Error('Invalid public key');
  let value = 0n;
  for (const char of s) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid base58');
    value = value * 58n + BigInt(digit);
  }
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & 255n);
    value >>= 8n;
  }
  if (value || base58(bytes) !== s) throw new Error('Invalid key length');
  return bytes;
}
export function signedBytes(kind, message) {
  return utf8.encode(version + '/' + kind + '\0' + canonical(message));
}
export async function digest(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
export async function objectDigest(value) {
  return digest(utf8.encode(canonical(value)));
}

export function requestMessage(r) {
  return {
    context: r.context,
    issuer: r.issuer,
    policyHash: r.decision.policyHash,
    request: r.request,
  };
}
export function requestRecord(r) {
  return {
    domain: version + '/request',
    message: requestMessage(r),
    signature: r.requestSignature,
  };
}
export function decisionMessage(r) {
  return { context: r.context, issuer: r.issuer, decision: r.decision };
}
export function decisionRecord(r) {
  return { domain: version + '/decision', message: decisionMessage(r), signature: r.signature };
}
export async function leaf(record) {
  const data = utf8.encode(canonical(record));
  const bytes = new Uint8Array(data.length + 1);
  bytes.set(data, 1);
  return digest(bytes);
}
async function branch(left, right) {
  const data = new Uint8Array(65);
  data[0] = 1;
  data.set(fromHex(left), 1);
  data.set(fromHex(right), 33);
  return digest(data);
}
const split = (n) => 2 ** Math.floor(Math.log2(n - 1));
export async function tree(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 32)
    throw new Error('Invalid batch size');
  async function build(start, count) {
    if (count === 1) return { root: await leaf(records[start]), paths: [[]] };
    const k = split(count);
    const [a, b] = await Promise.all([build(start, k), build(start + k, count - k)]);
    return {
      root: await branch(a.root, b.root),
      paths: [
        ...a.paths.map((path) => [...path, b.root]),
        ...b.paths.map((path) => [...path, a.root]),
      ],
    };
  }
  return build(0, records.length);
}
export async function included(hash, index, count, siblings, root) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 32 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= count ||
    !Array.isArray(siblings)
  )
    return false;
  const left = [];
  for (let n = count, i = index; n > 1; ) {
    const k = split(n);
    left.push(i >= k);
    if (i < k) n = k;
    else {
      i -= k;
      n -= k;
    }
  }
  if (left.length !== siblings.length) return false;
  for (const [i, onLeft] of left.reverse().entries()) {
    const other = siblings[i];
    if (typeof other !== 'string' || !/^[0-9a-f]{64}$/.test(other)) return false;
    hash = onLeft ? await branch(other, hash) : await branch(hash, other);
  }
  return hash === root;
}
export function evaluate(request, policy) {
  if (!policy.allowedRecipients.includes(request.recipient)) return 'MERCHANT_NOT_ALLOWED';
  if (BigInt(request.amountMinor) > BigInt(policy.perPaymentLimitMinor)) return 'LIMIT_EXCEEDED';
  return 'APPROVED';
}
