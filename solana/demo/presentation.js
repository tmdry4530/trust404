function displayString(value, max = 240) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}

function formatAmount(minor, decimals) {
  const integer = typeof minor === 'number' && Number.isSafeInteger(minor) ? String(minor) : minor;
  if (typeof integer !== 'string' || !/^\d{1,32}$/.test(integer)) return '—';
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return '—';
  const padded = integer.padStart(decimals + 1, '0');
  const whole = (decimals ? padded.slice(0, -decimals) : padded).replace(/^0+(?=\d)/, '');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!decimals) return formatted;
  const fraction = padded.slice(-decimals).replace(/0+$/, '').padEnd(Math.min(2, decimals), '0');
  return formatted + '.' + fraction;
}

export function receiptView(receipt) {
  const request = receipt?.request || {};
  const code = displayString(receipt?.decision?.reasonCode, 70);
  const asset = displayString(request.asset, 18);
  const limit = formatAmount(receipt?.policy?.perPaymentLimitMinor, request.decimals);
  let reason = '';
  if (code === 'LIMIT_EXCEEDED')
    reason = '영수증에 기록된 1회 결제 한도는 ' + limit + ' ' + asset + '입니다.';
  else if (code === 'MERCHANT_NOT_ALLOWED')
    reason = '결제 수취 주소가 정책의 허용 목록에 없다는 사유가 기록되어 있습니다.';
  else if (code) reason = '영수증에 기록된 사유 코드를 표시합니다.';
  let comparison = null;
  if (
    code === 'LIMIT_EXCEEDED' &&
    limit !== '—' &&
    formatAmount(request.amountMinor, request.decimals) !== '—'
  ) {
    const amountMinor = BigInt(request.amountMinor),
      limitMinor = BigInt(receipt.policy.perPaymentLimitMinor);
    const highest = (amountMinor > limitMinor ? amountMinor : limitMinor) || 1n;
    comparison = {
      amountRatio: Number((amountMinor * 1000n) / highest),
      limitRatio: Number((limitMinor * 1000n) / highest),
      limit,
    };
  }
  const recipient = displayString(request.recipient);
  const shortRecipient =
    recipient.length > 20 ? recipient.slice(0, 10) + '…' + recipient.slice(-8) : recipient;
  return {
    amount: formatAmount(request.amountMinor, request.decimals),
    asset,
    paymentState: code ? '거절 기록' : '기록 없음',
    isDenied: Boolean(code),
    fields: [
      { label: '에이전트', value: displayString(request.agent) || '—' },
      { label: '가맹점', value: displayString(request.merchant) || '—' },
      { label: '수취 주소', value: shortRecipient || '—', title: recipient, mono: true },
      { label: '요청 ID', value: displayString(request.id) || '—', mono: true },
    ],
    comparison,
    reasonCode: code,
    reason,
  };
}

export function resultView(result, receipt) {
  const ok = result?.ok === true;
  const rows = (Array.isArray(result?.checks) ? result.checks : []).map((check) => ({
    id: check.id,
    label: displayString(check.label) || displayString(check.id) || '검증 단계',
    detail: displayString(check.detail, 400),
    state: check.ok === true ? 'passed' : check.ok === false ? 'failed' : 'skipped',
  }));
  const failed = rows.find((check) => check.state === 'failed');
  const info = receiptView(receipt);
  let title = '거절 사유 일치';
  let note =
    info.reasonCode === 'LIMIT_EXCEEDED'
      ? info.amount +
        ' ' +
        info.asset +
        ' 요청이 1회 한도 ' +
        formatAmount(receipt?.policy?.perPaymentLimitMinor, receipt?.request?.decimals) +
        ' ' +
        info.asset +
        '를 초과했습니다.'
      : (displayString(receipt?.request?.merchant) || '가맹점') +
        '의 수취 주소가 허용 목록에 없습니다.';
  if (!ok) {
    title = '거절 사유 검증 실패';
    note = failed?.detail || '영수증에서 일치하는 근거를 확인할 수 없습니다.';
    if (failed?.id === 'agent') title = '요청 서명 불일치';
    if (failed?.id === 'replay') {
      title = result.reasonCode === 'APPROVED' ? '정책상 허용 · 영수증은 거절' : '거절 사유 불일치';
      note = '서명과 배치 포함 증명은 유효합니다. ' + failed.detail;
    }
  }
  return { state: ok ? 'verified' : 'failed', title, note, rows };
}
