"""Offline regression tests: no app database, network or installed JS packages."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from inventory import inspect, main, migration_check, snapshot_check


def entry(index=0, **changes):
    value = {'idx': index, 'tag': f'{index:04d}_fixture', 'version': '7',
             'when': 1000 + index, 'breakpoints': True}
    value.update(changes)
    return value


class JournalTests(unittest.TestCase):
    def compare(self, before, after, left=None, right=None):
        left = left if left is not None else {r['tag']: 'sql-a' for r in before}
        right = right if right is not None else {r['tag']: 'sql-a' for r in after}
        return migration_check(before, after, left, right)

    def test_append_only_journal(self):
        self.assertTrue(self.compare([entry()], [entry(), entry(1)])['direct_journal_upgrade_compatible'])

    def test_existing_sql_change_blocks(self):
        result = self.compare([entry()], [entry()], {'0000_fixture': 'a'}, {'0000_fixture': 'b'})
        self.assertFalse(result['direct_journal_upgrade_compatible'])
        self.assertEqual(len(result['index_collisions']), 1)

    def test_same_index_different_tag_blocks(self):
        result = self.compare([entry()], [entry(tag='0000_other')])
        self.assertFalse(result['direct_journal_upgrade_compatible'])

    def test_metadata_change_blocks_even_with_identical_sql(self):
        for changes in ({'when': 1001}, {'version': '6'}, {'breakpoints': False}):
            with self.subTest(changes=changes):
                self.assertFalse(self.compare([entry()], [entry(**changes)])['direct_journal_upgrade_compatible'])

    def test_missing_sql_on_both_sides_cannot_pass(self):
        self.assertFalse(self.compare([entry()], [entry()], {}, {})['direct_journal_upgrade_compatible'])

    def test_downgrade_blocks(self):
        self.assertFalse(self.compare([entry(), entry(1)], [entry()])['direct_journal_upgrade_compatible'])

    def test_invalid_entries_fail(self):
        for bad in ([], [entry(idx=-1)], [entry(when=True)], [entry(tag='../escape')], [{}]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                migration_check([entry()], bad, {}, {})

    def test_duplicate_tags_block(self):
        bad = [entry(), entry(1, tag='0000_fixture')]
        self.assertFalse(self.compare(bad, bad)['direct_journal_upgrade_compatible'])

    def test_historical_timestamp_order_is_reported_without_rewriting(self):
        rows = [entry(), entry(1, when=999)]
        result = self.compare(rows, rows)
        self.assertTrue(result['direct_journal_upgrade_compatible'])
        self.assertEqual(len(result['timestamp_notes']), 2)

    def test_historical_index_gaps_do_not_hide_sql_identity(self):
        rows = [entry(), entry(3)]
        result = self.compare(rows, rows)
        self.assertTrue(result['direct_journal_upgrade_compatible'])
        self.assertEqual(result['index_notes']['baseline']['non_positional_entries'], 1)

    def test_historical_duplicate_index_is_not_cross_tree_drift(self):
        rows = [entry(), entry(0, tag='0001_other', when=1001)]
        result = self.compare(rows, rows)
        self.assertTrue(result['direct_journal_upgrade_compatible'])
        self.assertEqual(result['index_collisions'], [])
        self.assertEqual(result['index_notes']['baseline']['duplicate_indexes'], [0])


class SnapshotTests(unittest.TestCase):
    def test_removed_table_column_and_changed_type_are_visible(self):
        def snapshot(tables):
            return {'path': 'fixture_snapshot.json', 'data': {'tables': tables}}
        column = {'name': 'id', 'type': 'uuid', 'notNull': True}
        table = {'columns': {'id': column, 'amx_flag': {'type': 'boolean'}}}
        updated = {'columns': {'id': {**column, 'type': 'text'}, 'added': {'type': 'text'}}}
        result = snapshot_check({'baseline': snapshot({'public.core': table, 'public.amx': table}),
                                 'candidate': snapshot({'public.core': updated})})
        self.assertEqual(result['baseline_only_tables'], ['public.amx'])
        change = result['shared_table_column_changes']['public.core']
        self.assertEqual(change['baseline_only_columns'], ['amx_flag'])
        self.assertEqual(change['candidate_only_columns'], ['added'])
        self.assertEqual(change['changed_columns']['id']['candidate']['type'], 'text')


class GitIntegrationTests(unittest.TestCase):
    def setUp(self):
        # The caller sets TMP/TEMP to the F-drive report scratch directory on Windows.
        self.temp = tempfile.TemporaryDirectory(prefix='amx-migration-test-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.run_git('init', '-q')
        self.run_git('config', 'user.name', 'Offline Migration Test')
        self.run_git('config', 'user.email', 'migration-test@example.invalid')
        self.run_git('config', 'core.autocrlf', 'false')
        self.run_git('config', 'commit.gpgsign', 'false')
        self.run_git('config', 'core.hooksPath', str(self.repo / 'no-hooks'))
        self.journal = self.repo / 'packages/db/src/migrations/meta/_journal.json'
        self.journal.parent.mkdir(parents=True)
        self.write_journal([entry()])
        self.write('packages/db/src/migrations/0000_fixture.sql', 'CREATE TABLE fixture (id integer);\n')
        self.write('packages/db/src/migrations/meta/0000_snapshot.json', json.dumps({'tables': {}}))
        self.write('server/src/routes/amx.ts', 'router.get("/:id", handler);\n')
        self.baseline = self.commit()

    def run_git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], capture_output=True,
                              text=True, check=True).stdout.strip()

    def write(self, path, value):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding='utf-8')

    def write_journal(self, entries):
        self.journal.write_text(json.dumps({'dialect': 'postgresql', 'version': '7', 'entries': entries}), encoding='utf-8')

    def commit(self):
        self.run_git('add', '.')
        self.run_git('commit', '-qm', 'offline fixture')
        return self.run_git('rev-parse', 'HEAD')

    def test_committed_objects_ignore_dirty_files_and_route_matches_include_file(self):
        self.write('server/src/routes/amx.ts', '// moved or removed; requires review\n')
        self.write('server/src/routes/other.ts', 'router.get("/:id", otherHandler);\n')
        candidate = self.commit()
        self.write_journal([entry(tag='0000_dirty')])
        result = inspect(self.repo, self.baseline, candidate)
        self.assertTrue(result['migration_journal']['direct_journal_upgrade_compatible'])
        self.assertEqual(result['routes']['baseline_only_declarations'], [
            {'method': 'GET', 'path': '/:id', 'file': 'server/src/routes/amx.ts'}])
        self.assertEqual(result['refs']['candidate'], candidate)
        self.assertEqual(result['release_readiness'], 'not_assessed')

    def test_cli_incompatible_exit_and_write_once_evidence(self):
        self.write_journal([entry(when=2000)])
        candidate = self.commit()
        report = self.repo / 'report.json'
        arguments = ['--repo', str(self.repo), '--baseline', self.baseline, '--candidate', candidate,
                     '--output', str(report), '--require-compatible-journal']
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(arguments), 2)
            original = report.read_bytes()
            with self.assertRaises(FileExistsError):
                main(arguments)
        self.assertEqual(report.read_bytes(), original)

    def test_cli_prefix_success(self):
        with contextlib.redirect_stdout(io.StringIO()):
            result = main(['--repo', str(self.repo), '--baseline', self.baseline,
                           '--candidate', self.baseline, '--require-compatible-journal'])
        self.assertEqual(result, 0)


if __name__ == '__main__':
    unittest.main()
