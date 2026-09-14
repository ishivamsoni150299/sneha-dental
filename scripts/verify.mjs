import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH };
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && command.endsWith('.cmd') });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node.js 22 for the supported build.');
const backend = path.join(root, 'backend');
const wrapper = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
run(wrapper, ['-B', 'validate'], backend);
run(process.execPath, ['node_modules/eslint/bin/eslint.js', 'src', '--max-warnings', '0']);
run(process.execPath, ['scripts/sync-public-env.mjs', 'development']);
run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--browsers=ChromeHeadless']);
run(process.execPath, ['scripts/sync-public-env.mjs', 'production']);
run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build']);
run(process.execPath, ['-e', "const fs=require('node:fs'); const p='dist/mydentalplatform/browser/'; if(fs.existsSync(p+'index.csr.html')) fs.copyFileSync(p+'index.csr.html',p+'index.html');"]);
run(process.execPath, ['scripts/e2e-smoke-test.mjs']);
run(wrapper, ['-B', 'verify'], backend);
console.log('PASS local verification: lint, browser unit tests, production build, artifacts, backend tests and disposable PostgreSQL journeys.');
