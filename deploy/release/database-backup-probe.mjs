// Read-only preflight. Do not import config.js: its legacy-worktree repair can write.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function effectiveDatabase(config, env, defaultDataDir, resolvePath) {
  const fileMode = config?.database?.mode === 'postgres' ? 'postgres' : 'embedded-postgres';
  // Match loadConfig() and startServer(): empty is an override, not an unset value.
  const url = env.DATABASE_URL ?? (fileMode === 'postgres' ? config?.database?.connectionString : undefined);
  if (url) return { mode: 'external-postgres', database_url: url };
  return { mode: 'embedded-postgres', data_dir: resolvePath(config?.database?.embeddedPostgresDataDir ?? defaultDataDir) };
}

export function inspectEmbeddedPath(dataDir, root = '/paperclip') {
  if (!path.isAbsolute(dataDir) || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsupported embedded database root');
  const relative = path.relative(root, dataDir);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Embedded database must be inside /paperclip');
  }
  let component = root;
  for (const part of relative.split(path.sep)) {
    component = path.join(component, part);
    if (fs.lstatSync(component).isSymbolicLink()) throw new Error('Symlink-backed embedded database is unsupported');
  }
  const realRoot = fs.realpathSync(root);
  const realData = fs.realpathSync(dataDir);
  if (!realData.startsWith(realRoot + path.sep) || !fs.statSync(realData).isDirectory()) throw new Error('Embedded database is outside storage');
  const pending = [realData];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      // Includes pg_wal / pg_tblspc links; docker cp preserves links, not their targets.
      if (entry.isSymbolicLink()) throw new Error('Embedded cluster contains symlinks; operator reconciliation required');
      if (entry.isDirectory()) pending.push(filename);
      else if (!entry.isFile()) throw new Error('Embedded cluster contains unsupported filesystem objects');
    }
  }
  const major = fs.readFileSync(path.join(realData, 'PG_VERSION'), 'utf8').trim();
  if (!/^\d{1,2}$/.test(major)) throw new Error('Unidentified embedded database version');
  return { data_dir: dataDir, real_data_dir: realData, postgres_major: major };
}

export async function probeDatabase({ startedAt } = {}) {
  const modulePath = name => pathToFileURL(path.resolve('server/dist', name)).href;
  const { resolvePaperclipConfigPath, resolvePaperclipEnvPath } = await import(modulePath('paths.js'));
  const { resolveDefaultEmbeddedPostgresDir, resolveHomeAwarePath } = await import(modulePath('home-paths.js'));
  const require = createRequire(path.resolve('server/package.json'));
  const { parse } = require('dotenv');
  const observedFiles = new Set();
  const loadEnv = filename => {
    if (!fs.existsSync(filename)) return;
    observedFiles.add(filename);
    for (const [key, value] of Object.entries(parse(fs.readFileSync(filename)))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  };
  // Same precedence as config.ts, without its write-capable repair import.
  loadEnv(resolvePaperclipEnvPath());
  loadEnv(path.resolve('.env'));
  if (process.env.PAPERCLIP_IN_WORKTREE === 'true') throw new Error('Worktree database configuration needs separate operator review');
  const configPath = resolvePaperclipConfigPath();
  const { readConfigFile } = await import(modulePath('config-file.js'));
  const config = readConfigFile();
  if (fs.existsSync(configPath)) {
    observedFiles.add(configPath);
    if (!config) throw new Error('Invalid database configuration');
  }
  if (startedAt) {
    const started = Date.parse(startedAt);
    if (!Number.isFinite(started)) throw new Error('Unidentified container start time');
    for (const filename of observedFiles) {
      if (fs.statSync(filename).mtimeMs > started) throw new Error('Configuration changed since container startup; active database is ambiguous');
    }
  }
  const state = effectiveDatabase(config, process.env, resolveDefaultEmbeddedPostgresDir(), resolveHomeAwarePath);
  if (state.mode === 'embedded-postgres') Object.assign(state, inspectEmbeddedPath(state.data_dir));
  return state;
}
