import { validTrustProfile } from './trust.mjs';
import { DEMO_TRUST } from './demo-trust.mjs';
import {
  canonical,
  decisionMessage,
  decisionRecord,
  evaluate,
  fromHex,
  included,
  keyBytes,
  leaf,
  objectDigest,
  requestMessage,
  requestRecord,
  signedBytes,
  version,
} from './protocol.mjs';

const labels = [
  ['profile', '신뢰 프로필과 결제 자산'],
  ['agent', '에이전트 요청 서명'],
  ['request', '요청 배치 포함 증명'],
  ['issuer', '발행자 서명과 요청 연결'],
  ['decision', '판단 배치 포함 증명'],
  ['replay', '거절 정책 재실행'],
];
const shape = (o, names) =>
  o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.keys(o).length === names.split(' ').length &&
  names.split(' ').every((k) => Object.hasOwn(o, k));
const hash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const sig = (s) => typeof s === 'string' && /^[a-f0-9]{128}$/.test(s);
const uint = (s) =>
  typeof s === 'string' && /^(?:0|[1-9][0-9]{0,19})$/.test(s) && BigInt(s) <= 18446744073709551615n;
const key = (s) => {
  try {
    keyBytes(s);
    return true;
  } catch {
    return false;
  }
};
const label = (s) =>
  typeof s === 'string' && s.length > 0 && s.length <= 96 && !/[\u0000-\u001f\u007f]/.test(s);
const proof = (p) =>
  shape(p, 'batchId index siblings') &&
  uint(p.batchId) &&
  Number.isInteger(p.index) &&
  Array.isArray(p.siblings) &&
  p.siblings.length <= 5 &&
  p.siblings.every(hash);
export function validRequest(q) {
  return (
    shape(q, 'id agent agentKey merchant recipient amountMinor asset mint decimals') &&
    [q.id, q.agent, q.merchant, q.asset].every(label) &&
    [q.agentKey, q.recipient, q.mint].every(key) &&
    uint(q.amountMinor) &&
    BigInt(q.amountMinor) > 0n &&
    Number.isInteger(q.decimals) &&
    q.decimals >= 0 &&
    q.decimals <= 18
  );
}
export function validPolicy(p) {
  return (
    shape(p, 'id asset mint decimals perPaymentLimitMinor allowedRecipients') &&
    p.id === 'agent-payments-v1' &&
    uint(p.perPaymentLimitMinor) &&
    Array.isArray(p.allowedRecipients) &&
    p.allowedRecipients.length <= 64 &&
    p.allowedRecipients.every(key) &&
    label(p.asset) &&
    key(p.mint) &&
    Number.isInteger(p.decimals) &&
    p.decimals >= 0 &&
    p.decimals <= 18
  );
}
function validReceipt(r) {
  if (
    !shape(r, 'schema context issuer request requestSignature policy decision signature proofs') ||
    r.schema !== version
  )
    return false;
  const { request: q, decision: d, policy: p } = r;
  return (
    shape(r.context, 'genesisHash programId publisher') &&
    Object.values(r.context).every(key) &&
    key(r.issuer) &&
    validRequest(q) &&
    validPolicy(p) &&
    shape(d, 'requestLeaf policyHash requestRef issuedAt reasonCode') &&
    hash(d.requestLeaf) &&
    hash(d.policyHash) &&
    shape(d.requestRef, 'batchId slot root index') &&
    uint(d.requestRef.batchId) &&
    uint(d.requestRef.slot) &&
    hash(d.requestRef.root) &&
    Number.isInteger(d.requestRef.index) &&
    typeof d.issuedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(d.issuedAt) &&
    Number.isFinite(Date.parse(d.issuedAt)) &&
    ['LIMIT_EXCEEDED', 'MERCHANT_NOT_ALLOWED'].includes(d.reasonCode) &&
    sig(r.requestSignature) &&
    sig(r.signature) &&
    shape(r.proofs, 'request decision') &&
    proof(r.proofs.request) &&
    proof(r.proofs.decision)
  );
}
async function verifySig(pubkey, purpose, msg, signature) {
  const pub = await crypto.subtle.importKey('raw', keyBytes(pubkey), 'Ed25519', false, ['verify']);
  return crypto.subtle.verify('Ed25519', pub, fromHex(signature), signedBytes(purpose, msg));
}
// The caller selects the trust profile independently of the imported receipt.
export async function verifyReceipt(r, trust = DEMO_TRUST) {
  const checks = labels.map(([id, label]) => ({
    id,
    label,
    ok: null,
    detail: '선행 검증을 통과한 뒤 확인합니다.',
  }));
  const result = { ok: false, reasonCode: null, checks };
  const check = (i, ok, detail) => {
    Object.assign(checks[i], { ok: Boolean(ok), detail });
    return Boolean(ok);
  };
  if (!validTrustProfile(trust)) {
    check(0, false, '신뢰 프로필에 유효한 공개키와 배치 체크포인트가 필요합니다.');
    return result;
  }
  if (!validReceipt(r)) {
    check(0, false, '지원하는 v1 영수증 형식 또는 필드 범위를 벗어났습니다.');
    return result;
  }
  const { request: q, policy: p, decision: d } = r;
  const pinned =
    canonical(r.context) === canonical(trust.context) &&
    r.issuer === trust.issuer &&
    trust.agentKeys.includes(q.agentKey) &&
    d.policyHash === trust.policyHash &&
    (await objectDigest(p)) === trust.policyHash &&
    q.mint === p.mint &&
    q.asset === p.asset &&
    q.decimals === p.decimals;
  if (
    !check(
      0,
      pinned,
      pinned
        ? '발행자·에이전트·민트·정책 해시가 고정된 프로필과 일치합니다.'
        : '발행자, 에이전트, 체인 또는 정책이 신뢰 프로필과 다릅니다.'
    )
  )
    return result;
  const agentOK = await verifySig(q.agentKey, 'request', requestMessage(r), r.requestSignature);
  if (
    !check(
      1,
      agentOK,
      agentOK
        ? '결제 금액과 수취 계정에 대한 Ed25519 서명이 유효합니다.'
        : '금액·수취 계정 등 요청 내용과 서명이 일치하지 않습니다.'
    )
  )
    return result;
  const req = r.proofs.request,
    dec = r.proofs.decision;
  const a = trust.batches.find((b) => b.batchId === req.batchId);
  const b = trust.batches.find((b) => b.batchId === dec.batchId);
  const requestLeaf = await leaf(requestRecord(r));
  const reqOK = a && (await included(requestLeaf, req.index, a.count, req.siblings, a.root));
  if (
    !check(
      2,
      reqOK,
      reqOK
        ? `배치 #${a.batchId} · 리프 ${req.index + 1}/${a.count} · 저장한 루트와 일치합니다.`
        : '요청 머클 경로와 신뢰 체크포인트가 일치하지 않습니다.'
    )
  )
    return result;
  const ref = { batchId: a.batchId, slot: a.slot, root: a.root, index: req.index };
  const issuerOK =
    d.requestLeaf === requestLeaf &&
    canonical(ref) === canonical(d.requestRef) &&
    (await verifySig(r.issuer, 'decision', decisionMessage(r), r.signature));
  if (
    !check(
      3,
      issuerOK,
      issuerOK
        ? '발행자가 같은 요청과 접수 배치를 참조해 서명했습니다.'
        : '판단 서명 또는 서명에 연결된 요청이 일치하지 않습니다.'
    )
  )
    return result;
  const decOK =
    b &&
    uint(a.slot) &&
    uint(b.slot) &&
    BigInt(dec.batchId) > BigInt(req.batchId) &&
    BigInt(b.slot) > BigInt(a.slot) &&
    (await included(await leaf(decisionRecord(r)), dec.index, b.count, dec.siblings, b.root));
  if (
    !check(
      4,
      decOK,
      decOK
        ? `배치 #${b.batchId} · 리프 ${dec.index + 1}/${b.count} · 후속 배치와 일치합니다.`
        : '판단 머클 경로 또는 요청·판단 배치 순서가 일치하지 않습니다.'
    )
  )
    return result;
  const expected = evaluate(q, p);
  const reasons = {
    LIMIT_EXCEEDED: '1회 한도 초과',
    MERCHANT_NOT_ALLOWED: '허용되지 않은 수취 계정',
    APPROVED: '결제 허용',
  };
  result.ok = check(
    5,
    expected === d.reasonCode,
    `정책 판정은 ‘${reasons[expected]}’, 영수증 기록은 ‘${reasons[d.reasonCode]}’입니다.`
  );
  result.reasonCode = expected;
  return result;
}
