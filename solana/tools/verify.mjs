import { parseEvidenceJSON } from '../core/json.mjs';
import { readFile } from 'node:fs/promises';
import { verifyReceipt } from '../core/verifier.mjs';
import { SCENARIOS } from '../core/scenarios.mjs';

const [receiptFile, trustFile] = process.argv.slice(2);
if (!receiptFile || (receiptFile === '--demo' && trustFile)) {
  console.error('Usage: node tools/verify.mjs receipt.json trusted-profile.json | --demo');
  process.exitCode = 2;
} else if (receiptFile === '--demo') {
  for (const { id, receipt } of SCENARIOS) {
    const result = await verifyReceipt(receipt);
    const failed = result.checks.find((c) => c.ok === false);
    console.log(id, result.ok ? 'PASS' : 'FAIL', failed?.label || result.reasonCode);
    if (result.ok !== ['limit', 'merchant'].includes(id)) process.exitCode = 1;
  }
} else if (!trustFile) {
  console.error('Supply a separately trusted profile including the checkpoint roots.');
  process.exitCode = 2;
} else {
  try {
    const load = async (p) => parseEvidenceJSON(await readFile(p, 'utf8'));
    const result = await verifyReceipt(await load(receiptFile), await load(trustFile));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
