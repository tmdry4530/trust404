import localnetReceipt from '../examples/localnet/receipt.json' with { type: 'json' };
import localnetTrust from '../examples/localnet/trusted-profile.json' with { type: 'json' };
import { parseEvidenceJSON } from '../core/json.mjs';
import { paintIcons, paintSeal } from './art.js';
import { SCENARIOS } from '../core/scenarios.mjs';
import { DEMO_TRUST } from '../core/demo-trust.mjs';
import { validTrustProfile } from '../core/trust.mjs';
import { verifyReceipt } from '../core/verifier.mjs';
import { receiptView, resultView } from './presentation.js';

const byId = (id) => document.getElementById(id);
const selector = byId('scenario');
const dialog = byId('raw-dialog');
let currentReceipt, selectedSource, importedReceipt, importedLabel;
let revision = 0;
let activeTrust = DEMO_TRUST;
let profileReadVersion = 0;
let profileVersion = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function option(value, label) {
  const opt = element('option', label);
  opt.value = value;
  return opt;
}
function icon(name) {
  const canvas = element('canvas');
  canvas.dataset.icon = name;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}
function showFileMessage(message = '') {
  byId('file-message').textContent = message;
  byId('file-message').hidden = !message;
}
function setState(state, title, note) {
  byId('verdict-card').dataset.state = state;
  byId('verdict-title').textContent = title;
  byId('verdict-note').textContent = note;
  paintSeal(state);
}
function renderReceipt() {
  const info = receiptView(currentReceipt);
  const sources = { import: '가져온 영수증', localnet: '로컬넷 실측 영수증' };
  byId('source-label').textContent = sources[selectedSource] || '샘플 영수증';
  byId('amount').textContent = info.amount;
  byId('asset').textContent = info.asset;
  byId('amount-label').textContent = info.amountLabel || '요청 금액';
  const badge = byId('payment-state');
  badge.textContent = info.paymentState || '기록 없음';
  badge.className = info.isDenied ? 'pill denied' : 'pill plain';
  byId('payment-fields').replaceChildren(
    ...info.fields.flatMap((field) => {
      const value = element('dd', field.value, field.mono ? 'mono' : '');
      if (field.title) value.title = field.title;
      return [element('dt', field.label), value];
    })
  );
  byId('policy-card').hidden = !info.reason;
  byId('policy-code').textContent = info.reasonCode || '';
  byId('policy-description').textContent = info.reason || '';
  byId('policy-chart').hidden = !info.comparison;
  if (info.comparison) {
    byId('request-bar').value = info.comparison.amountRatio;
    byId('limit-bar').value = info.comparison.limitRatio;
    byId('request-cell').textContent = info.amount + ' ' + info.asset;
    byId('limit-cell').textContent = info.comparison.limit + ' ' + info.asset;
    byId('request-bar').setAttribute('aria-valuetext', byId('request-cell').textContent);
    byId('limit-bar').setAttribute('aria-valuetext', byId('limit-cell').textContent);
  }
}
function renderChecks(rows) {
  const count = rows.filter((row) => row.state === 'passed').length;
  byId('check-summary').textContent = rows.length ? count + ' / ' + rows.length + ' 통과' : '';
  const items = rows.map((row) => {
    const entry = element('li', undefined, 'check-item ' + row.state);
    const indicator = element('span', undefined, 'check-indicator');
    indicator.append(
      icon(row.state === 'passed' ? 'check' : row.state === 'failed' ? 'fail' : 'skip')
    );
    const body = element('div');
    body.append(element('strong', row.label));
    if (row.detail) body.append(element('p', row.detail));
    const status = { passed: '통과', failed: '실패', skipped: '미검사' };
    entry.append(indicator, body, element('span', status[row.state] || '미검사', 'check-result'));
    return entry;
  });
  byId('checks').replaceChildren(...items);
  paintIcons(byId('checks'));
}
async function verify() {
  const task = ++revision;
  const receipt = currentReceipt;
  byId('verify').disabled = true;
  renderChecks([]);
  setState('pending', '영수증 대조 중', '로컬 검증기로 서명과 거절 근거를 확인하고 있습니다.');
  try {
    const result = resultView(await verifyReceipt(receipt, activeTrust), receipt);
    if (task !== revision) return;
    setState(result.state, result.title, result.note);
    renderChecks(result.rows);
  } catch (err) {
    if (task !== revision) return;
    const cryptoUnavailable = !globalThis.crypto?.subtle || err?.name === 'NotSupportedError';
    const note = cryptoUnavailable
      ? 'Ed25519를 지원하는 최신 브라우저에서 이 파일을 열거나 localhost로 접속하세요.'
      : '검증기가 이 영수증을 처리하지 못했습니다. JSON 형식과 필드를 확인하세요.';
    setState('failed', '검증을 완료할 수 없습니다', note);
    renderChecks([{ label: '검증 실행', state: 'failed', detail: note }]);
  } finally {
    if (task === revision) byId('verify').disabled = false;
  }
}
function activate() {
  showFileMessage();
  selectedSource = selector.value;
  const choice = SCENARIOS.find((item) => item.id === selectedSource);
  if (selectedSource === 'localnet') {
    currentReceipt = localnetReceipt;
    renderReceipt();
    profileReadVersion++;
    trustMessage();
    return setTrust(localnetTrust, '');
  }
  currentReceipt = choice ? choice.receipt : importedReceipt;
  renderReceipt();
  // The recorded example travels with its own observed checkpoints.
  // Returning to a synthetic scenario restores its demo roots. Manual profiles stay selected.
  if (choice && activeTrust === localnetTrust) {
    profileReadVersion++;
    return setTrust(DEMO_TRUST, '');
  }
  return verify();
}
function renderTrust(filename) {
  let environment = '데모';
  let marker = '기본 데모 프로필';
  let title = marker;
  let note = '로컬넷 영수증은 독립적으로 확보한 신뢰 프로필 JSON과 함께 검증하세요.';
  let anchor = '머클 경로를 데모에 저장한 체크포인트와 대조합니다. 현재 체인 확정 상태는 조회하지 않았습니다.';
  if (activeTrust === localnetTrust) {
    environment = '로컬넷';
    marker = '로컬넷 · RPC 관측본';
    title = '로컬넷에서 확보한 감사자 체크포인트';
    const [request, decision] = activeTrust.batches;
    note = '요청 슬롯 ' + request.slot + ' · 판단 슬롯 ' + decision.slot + '에서 기록된 배치를 사용합니다.';
    anchor = '로컬 검증자에서 finalized로 조회한 두 배치의 저장본을 사용합니다. 현재 체인 상태는 조회하지 않았습니다.';
  } else if (activeTrust !== DEMO_TRUST) {
    environment = '외부 프로필';
    marker = '외부 프로필 · 수동 신뢰';
    title = '수동으로 신뢰한 프로필 · ' + filename;
    note = '선택한 파일의 키와 체크포인트를 이 세션의 검증 기준으로 사용합니다.';
    anchor = '머클 경로를 외부 프로필의 체크포인트와 대조합니다. 현재 체인 확정 상태는 조회하지 않았습니다.';
  }
  byId('environment-label').textContent = environment;
  byId('hero-profile').textContent = marker;
  byId('trust-label').textContent = title;
  byId('trust-note').textContent = note;
  byId('anchor-note').textContent = anchor;
  byId('anchor-state').textContent = '체인 미조회';
  byId('reset-trust').hidden = activeTrust === DEMO_TRUST;
  const identifiers = [
    ['제네시스 해시', activeTrust.context.genesisHash],
    ['프로그램 ID', activeTrust.context.programId],
    ['게시자', activeTrust.context.publisher],
    ['발급자', activeTrust.issuer],
    ['정책 SHA-256', activeTrust.policyHash],
    ['체크포인트', activeTrust.batches.length + '개'],
  ];
  byId('trust-identifiers').replaceChildren(
    ...identifiers.flatMap(([label, value]) => [element('dt', label), element('dd', value)])
  );
}
function trustMessage(message = '') {
  byId('trust-message').textContent = message;
  byId('trust-message').hidden = !message;
}
async function setTrust(profile, filename) {
  const current = ++profileVersion;
  activeTrust = profile;
  renderTrust(filename);
  // Recheck the selected receipt and renew all scenario summaries against the same profile.
  verify();
  const scenarioTrust = profile === localnetTrust ? DEMO_TRUST : profile;
  const results = await Promise.allSettled(
    SCENARIOS.map((item) => verifyReceipt(item.receipt, scenarioTrust))
  );
  if (current !== profileVersion) return;
  for (const [i, scenario] of SCENARIOS.entries()) {
    const outcome = results[i];
    const label = outcome.status === 'fulfilled' && outcome.value.ok ? '일치' : '검증 실패';
    selector.options[i].textContent = scenario.label + ' · ' + label;
  }
}
byId('import-trust').addEventListener('click', () => byId('trust-file').click());
byId('trust-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const readVersion = ++profileReadVersion;
  if (file.size > 1024 * 1024) {
    trustMessage('프로필 불러오기 실패 · 1 MiB 이하의 신뢰 프로필 JSON을 선택하세요.');
    return;
  }
  try {
    const profile = parseEvidenceJSON(await file.text());
    if (readVersion !== profileReadVersion) return;
    if (!validTrustProfile(profile)) throw new Error('invalid profile');
    trustMessage();
    await setTrust(profile, file.name);
  } catch {
    if (readVersion === profileReadVersion)
      trustMessage(
        '프로필 불러오기 실패 · 키, 정책 해시, 배치 체크포인트의 형식을 확인하세요. 기존 프로필을 유지합니다.'
      );
  }
});
byId('reset-trust').addEventListener('click', () => {
  profileReadVersion++;
  trustMessage();
  return setTrust(DEMO_TRUST, '');
});
selector.replaceChildren(...SCENARIOS.map((item) => option(item.id, item.label)));
selector.addEventListener('change', activate);
byId('load-localnet').addEventListener('click', () => {
  if (!selector.querySelector('option[value="localnet"]')) {
    selector.append(option('localnet', '로컬넷 실측 영수증 · 관측 프로필'));
  }
  selector.value = 'localnet';
  return activate();
});
byId('next-scenario').addEventListener('click', () => {
  const index = SCENARIOS.findIndex((item) => item.id === selector.value);
  selector.value = SCENARIOS[(index + 1) % SCENARIOS.length].id;
  activate();
});
byId('verify').addEventListener('click', verify);
byId('import').addEventListener('click', () => byId('file').click());
byId('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) {
    showFileMessage('불러오기 실패 · 1 MiB 이하의 영수증 JSON을 선택하세요.');
    return;
  }
  try {
    const parsed = parseEvidenceJSON(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    importedReceipt = parsed;
    importedLabel = file.name;
    const existing = selector.querySelector('option[value="import"]');
    existing?.remove();
    selector.append(option('import', '가져온 파일 · ' + importedLabel));
    selector.value = 'import';
    activate();
  } catch {
    showFileMessage('불러오기 실패 · 영수증을 담은 JSON 객체가 필요합니다.');
  }
});
byId('open-data').addEventListener('click', () => {
  byId('raw-json').textContent = JSON.stringify(currentReceipt, null, 2);
  dialog.showModal();
  paintIcons(dialog);
});
byId('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const { left, top, right, bottom } = dialog.getBoundingClientRect();
    if (
      event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom
    )
      dialog.close();
  }
});
byId('download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(currentReceipt, null, 2) + '\n'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download =
    'trust404-' + (selectedSource === 'import' ? 'receipt' : selectedSource) + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
if ('ResizeObserver' in globalThis) {
  new ResizeObserver(() => paintSeal(byId('verdict-card').dataset.state)).observe(
    byId('seal').parentElement
  );
} else window.addEventListener('resize', () => paintSeal(byId('verdict-card').dataset.state));
renderTrust('');
paintIcons();
activate();
