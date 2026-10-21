import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { effectiveDatabase, inspectEmbeddedPath } from './database-backup-probe.mjs';

const embedded = { database: { mode: 'embedded-postgres', embeddedPostgresDataDir: '~/db' } };
const external = { database: { mode: 'postgres', connectionString: 'postgres://fixture:secret@db/live' } };
const resolve = value => value.replace('~', '/paperclip');
for (const [name, config, env, mode, target] of [
  ['unset URL with embedded config', embedded, {}, 'embedded-postgres', '/paperclip/db'],
  ['empty URL with embedded config', embedded, { DATABASE_URL: '' }, 'embedded-postgres', '/paperclip/db'],
  ['unset URL with config-only external', external, {}, 'external-postgres', external.database.connectionString],
  ['empty URL overrides config-only external', external, { DATABASE_URL: '' }, 'embedded-postgres', '/paperclip/default-db'],
  ['environment external wins embedded mode', embedded, { DATABASE_URL: 'postgres://fixture:other@other/live' }, 'external-postgres', 'postgres://fixture:other@other/live'],
  ['postgres mode without connection falls back embedded', { database: { mode: 'postgres' } }, {}, 'embedded-postgres', '/paperclip/default-db'],
  ['absent config selects actual default', null, {}, 'embedded-postgres', '/paperclip/default-db'],
]) {
  test(name, () => {
    const actual = effectiveDatabase(config, env, '/paperclip/default-db', resolve);
    assert.equal(actual.mode, mode);
    assert.equal(actual.database_url ?? actual.data_dir, target);
  });
}

function fixture(callback) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'amx-db-probe-'));
  const root = path.join(base, 'paperclip');
  const db = path.join(root, '.paperclip', 'instances', 'default', 'db');
  fs.mkdirSync(path.join(db, 'pg_wal'), { recursive: true });
  fs.writeFileSync(path.join(db, 'PG_VERSION'), '18\n');
  try { callback({ base, root, db }); }
  finally {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('amx-db-probe-'));
    fs.rmSync(base, { recursive: true, force: true });
  }
}
test('identifies the actual tilde-expanded PG18 cluster inside storage', () => fixture(({ root, db }) => {
  assert.deepEqual(inspectEmbeddedPath(db, root), { data_dir: db, real_data_dir: fs.realpathSync(db), postgres_major: '18' });
}));
test('rejects an outside path and a sibling with a matching prefix', () => fixture(({ root }) => {
  assert.throws(() => inspectEmbeddedPath(root + '-other/db', root), /inside/);
  assert.throws(() => inspectEmbeddedPath(path.join(root, '..', 'outside'), root), /inside/);
}));
test('rejects storage root as the cluster and missing version', () => fixture(({ root, db }) => {
  assert.throws(() => inspectEmbeddedPath(root, root), /inside/);
  fs.unlinkSync(path.join(db, 'PG_VERSION'));
  assert.throws(() => inspectEmbeddedPath(db, root));
}));
test('rejects an unidentified version', () => fixture(({ root, db }) => {
  fs.writeFileSync(path.join(db, 'PG_VERSION'), 'not a cluster');
  assert.throws(() => inspectEmbeddedPath(db, root), /version/);
}));
test('rejects a symlink-backed directory even when its target is inside storage', () => fixture(({ root, db }) => {
  const alias = path.join(root, 'alias');
  fs.symlinkSync(db, alias, 'junction');
  assert.throws(() => inspectEmbeddedPath(alias, root), /Symlink/);
}));
test('rejects an external tablespace or WAL symlink inside the cluster', () => fixture(({ base, root, db }) => {
  const outside = path.join(base, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(db, 'external-tablespace'), 'junction');
  assert.throws(() => inspectEmbeddedPath(db, root), /symlinks/);
}));
