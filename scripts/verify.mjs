// `npm run verify`: everything an EAS build would trip on, checked here in a couple of minutes, before spending a
// build. Stops at the first failure and says which check failed. `--fast` skips the Android bundle.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fast = process.argv.includes('--fast');
const out = mkdtempSync(join(tmpdir(), 'ugb-verify-'));

const checks = [
  ['Types', 'npx', ['tsc', '--noEmit'], 'a type error (a variable declared twice after a merge, a wrong prop…)'],
  ['Lint', 'npx', ['expo', 'lint', '--max-warnings', '0'], 'a lint error or warning'],
  ['SDK versions', 'npx', ['expo', 'install', '--check'], 'a package missing or not matching the Expo SDK: run `npx expo install --fix`'],
  ['App config', 'npx', ['expo', 'config', '--type', 'prebuild', '--json'], 'app.json or a config plugin that fails to load'],
  ...(fast
    ? []
    : [['Android bundle', 'npx', ['expo', 'export:embed', '--eager', '--platform', 'android', '--dev', 'false', '--bundle-output', join(out, 'index.android.bundle'), '--assets-dest', join(out, 'res')], 'code that fails when bundled for Android (the step EAS runs first)']]),
];

let failed = null;
for (const [name, cmd, args, hint] of checks) {
  const started = Date.now();
  process.stdout.write(`▸ ${name}… `);
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' } });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`ok (${secs}s)`);
    continue;
  }
  console.log(`FAILED (${secs}s)\n`);
  console.log([r.stdout, r.stderr].filter(Boolean).join('\n').trim().split('\n').slice(-40).join('\n'));
  console.log(`\n✖ ${name}: ${hint}.`);
  failed = name;
  break;
}

rmSync(out, { recursive: true, force: true });
if (failed) process.exit(1);
console.log(`\n✔ Ready to build${fast ? ' (Android bundle not checked: run without --fast before an APK)' : ''}.`);
