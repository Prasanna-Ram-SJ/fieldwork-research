// Local owner setup only: no provider requests, no automatic allowance reset.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.local'), dir = path.join(root, '.redesign-backup');
const ledger = path.join(dir, 'judge-allowance.json'), card = path.join(dir, 'judge-access.txt');
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
if (/^JUDGE_/m.test(env) || fs.existsSync(ledger) || fs.existsSync(card)) {
  console.log('Judge setup already exists. Nothing changed; the shared allowance was not reset.');
  process.exit(0);
}
fs.mkdirSync(dir, { recursive: true });
const code = 'FW-' + randomBytes(12).toString('hex');
const codeHash = createHash('sha256').update(code).digest('hex');
const secret = randomBytes(32).toString('hex');
const expires = new Date(Date.now() + 7 * 86400000).toISOString();
fs.writeFileSync(ledger, JSON.stringify({ version: 1, codeHash, used: 0, attempts: 0, window: Date.now(), lastAttempt: 0, reservations: [] }), { flag: 'wx', mode: 0o600 });
fs.writeFileSync(card, 'Fieldwork — private judge access\n\nCode: ' + code + '\n\nOpen http://localhost:3011/demo and choose a demo. Expand “Have a judge access code?” to unlock live actions.\n\nAllowance: 3 new live actions TOTAL, shared across all judges and both demos.\nEach new paper analysis or web question consumes one action. Failed attempts count. Refreshing, new sessions and server restarts do not refill the allowance.\n\nCode expires: ' + expires + ' (UTC). Sessions last up to 4 hours.\nPrepared results, local edits and exports do not use live actions.\n\nLocal prototype: the allowance ledger is a persistent file on this computer. Do not enable this configuration on multiple servers or ephemeral/serverless storage. Deploying judge access requires a shared transactional ledger. Do not delete or reset the ledger automatically.\n', { flag: 'wx', mode: 0o600 });
fs.writeFileSync(envFile, env.trimEnd() + '\n\n# Optional local judge access. Never expose the session secret.\nJUDGE_ACCESS_CODE_HASH=' + codeHash + '\nJUDGE_SESSION_SECRET=' + secret + '\nJUDGE_ACCESS_EXPIRES_AT=' + expires + '\nJUDGE_REQUEST_LIMIT=3\nJUDGE_LEDGER_PATH="' + ledger.replace(/\\/g, '/') + '"\n');
console.log('Local judge access configured: 3 shared actions, expires in 7 days. Private access card: .redesign-backup/judge-access.txt. No paid request was made.');
