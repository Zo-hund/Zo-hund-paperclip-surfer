"""Read Git objects only; never connects to a database or applies migrations."""
import argparse
import collections
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import sys

def git(repo, *args, data=None):
    return subprocess.run(['git', '-C', str(repo), *args], input=data, capture_output=True, check=True).stdout

def tree(repo, ref):
    result = {}
    for item in git(repo, 'ls-tree', '-r', '-z', ref).split(b'\0'):
        if not item:
            continue
        meta, path = item.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        if kind == 'blob':
            result[path.decode()] = oid
    return result

def read_blobs(repo, ids):
    ids = sorted(set(ids))
    stream = git(repo, 'cat-file', '--batch', data=('\n'.join(ids)+'\n').encode())
    result, pos = {}, 0
    for oid in ids:
        end = stream.index(b'\n', pos)
        actual, kind, size = stream[pos:end].decode().split()
        if actual != oid or kind != 'blob':
            raise ValueError('Unexpected Git blob response')
        pos = end + 1
        result[oid] = stream[pos:pos+int(size)].decode('utf-8')
        pos += int(size) + 1
    return result

def migration_check(before, after, before_sql, after_sql):
    """Prove journal prefix identity only, never live DB/schema compatibility."""
    errors = []
    timestamp_notes = []
    for label, entries in [('baseline', before), ('candidate', after)]:
        if not isinstance(entries, list) or not entries:
            raise ValueError(f'{label} journal must have non-empty entries')
        seen_tags = set()
        for position, row in enumerate(entries):
            valid = (isinstance(row, dict)
                     and type(row.get('idx')) is int and row['idx'] >= 0
                     and isinstance(row.get('tag'), str)
                     and re.fullmatch(r'[0-9]{4}_[A-Za-z0-9_-]+', row['tag'])
                     and isinstance(row.get('version'), str) and row['version']
                     and type(row.get('when')) is int and row['when'] > 0
                     and type(row.get('breakpoints')) is bool)
            if not valid:
                raise ValueError(f'{label} journal entry {position} is malformed')
            if row['tag'] in seen_tags:
                errors.append(f'{label}: duplicate migration tag at index {position}')
            seen_tags.add(row['tag'])
            if position and row['when'] <= entries[position - 1]['when']:
                timestamp_notes.append(f'{label}: non-increasing migration timestamp at position {position}')
    def identical(left, right):
        return (left == right and left['tag'] in before_sql
                and right['tag'] in after_sql
                and before_sql[left['tag']] == after_sql[right['tag']])
    shared_prefix = 0
    for left, right in zip(before, after):
        if not identical(left, right):
            break
        shared_prefix += 1
    collisions = []
    by_index = collections.defaultdict(list)
    for row in after:
        by_index[row['idx']].append(row)
    for left in before:
        peers = by_index[left['idx']]
        matches = [right for right in peers if right['tag'] == left['tag']]
        for right in matches or peers:
            if not identical(left, right):
                collisions.append({'index':left['idx'],'baseline_tag':left['tag'],'candidate_tag':right['tag']})
    complete = all(row['tag'] in before_sql for row in before) and all(row['tag'] in after_sql for row in after)
    return {'baseline_entries':len(before),'candidate_entries':len(after),
            'identical_metadata_and_sql_prefix_entries':shared_prefix,'index_collisions':collisions,
            'all_journal_sql_present':complete,
            'validation_errors':errors,
            'timestamp_notes':timestamp_notes,
            'index_notes':{label:{'duplicate_indexes':sorted(idx for idx,count in collections.Counter(r['idx'] for r in rows).items() if count>1),
                                  'non_positional_entries':sum(row['idx'] != pos for pos,row in enumerate(rows))}
                           for label,rows in [('baseline',before),('candidate',after)]},
            'direct_journal_upgrade_compatible':not errors and complete and shared_prefix == len(before),
            'limitation':'Journal identity only; no live schema, data, application, security or restore validation.'}

def inspect(repo, baseline, candidate):
    refs = {label:git(repo,'rev-parse',f'{ref}^{{commit}}').decode().strip()
            for label,ref in [('baseline',baseline),('candidate',candidate)]}
    trees = {label:tree(repo,ref) for label,ref in refs.items()}
    latest_snapshots = {max((p for p in t if p.startswith('packages/db/src/migrations/meta/')
                            and p.endswith('_snapshot.json')), default='') for t in trees.values()}
    def wanted(path):
        return path in latest_snapshots or (path.startswith(('packages/db/src/schema/','packages/db/src/migrations/','server/src/routes/'))
                and path.endswith(('.ts','.sql','_journal.json')))
    blobs = read_blobs(repo,[oid for t in trees.values() for path,oid in t.items() if wanted(path)])
    out = {'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'refs':refs,
           'scope':'Static Git inventory; presence does not establish equivalent behavior or data compatibility.'}
    left,right = trees['baseline'],trees['candidate']
    out['files'] = {'baseline_only':sorted(left.keys()-right.keys()),'candidate_only':sorted(right.keys()-left.keys()),
                    'changed':sorted(p for p in left.keys() & right.keys() if left[p] != right[p])}
    out['file_counts'] = {k:len(v) for k,v in out['files'].items()}
    out['file_counts']['baseline_only_by_root'] = dict(collections.Counter(p.split('/')[0] for p in out['files']['baseline_only']))
    tables, routes, journals, sql, snapshots = {}, {}, {}, {}, {}
    for label,t in trees.items():
        tables[label],routes[label],sql[label] = {},[],{}
        for path,oid in t.items():
            if not wanted(path):
                continue
            text = blobs[oid]
            if path.startswith('packages/db/src/schema/'):
                for name in re.findall(r'\bpgTable\s*\(\s*[\"\']([^\"\']+)',text):
                    tables[label][name]={'path':path,'blob':oid}
            if path.startswith('server/src/routes/') and not path.endswith('.test.ts'):
                for method,url in re.findall(r'\brouter\.(get|post|put|patch|delete)\s*\(\s*[\"\']([^\"\']+)',text):
                    routes[label].append({'method':method.upper(),'path':url,'file':path})
            if path.endswith('/meta/_journal.json'):
                journals[label]=json.loads(text)
            if path.endswith('_snapshot.json') and '/migrations/meta/' in path:
                if label not in snapshots or path > snapshots[label]['path']:
                    snapshots[label] = {'path':path,'data':json.loads(text)}
            if path.startswith('packages/db/src/migrations/') and path.endswith('.sql'):
                sql[label][pathlib.PurePosixPath(path).stem]=hashlib.sha256(text.encode()).hexdigest()
    out['schema_tables']={'baseline_count':len(tables['baseline']),'candidate_count':len(tables['candidate']),
       'baseline_only':{k:v for k,v in tables['baseline'].items() if k not in tables['candidate']},
       'candidate_only':{k:v for k,v in tables['candidate'].items() if k not in tables['baseline']},
       'common_changed_files':sorted(k for k in tables['baseline'].keys() & tables['candidate'].keys()
                              if tables['baseline'][k]['blob'] != tables['candidate'][k]['blob'])}
    candidate_routes={(r['file'],r['method'],r['path']) for r in routes['candidate']}
    out['routes']={'baseline_declarations':len(routes['baseline']),'candidate_declarations':len(routes['candidate']),
       'baseline_only_declarations':[r for r in routes['baseline'] if (r['file'],r['method'],r['path']) not in candidate_routes],
       'limitation':'Literal router declarations only, without mount prefixes, generated routes or authorization semantics.'}
    for label, journal in journals.items():
        if journal.get('dialect') != 'postgresql' or journal.get('version') != '7':
            raise ValueError(f'{label}: unsupported journal dialect or version')
    out['migration_journal']=migration_check(journals['baseline']['entries'],journals['candidate']['entries'],sql['baseline'],sql['candidate'])
    out['snapshot_comparison'] = snapshot_check(snapshots)
    out['release_readiness']='not_assessed'
    return out


def snapshot_check(snapshots):
    """Compare declarative snapshots; generated snapshot drift remains untested."""
    if set(snapshots) != {'baseline', 'candidate'}:
        raise ValueError('Both Git trees must include a schema snapshot')
    before = snapshots['baseline']['data']['tables']
    after = snapshots['candidate']['data']['tables']
    changes = {}
    for name in sorted(before.keys() & after.keys()):
        left, right = before[name]['columns'], after[name]['columns']
        changed = {c:{'baseline':left[c],'candidate':right[c]}
                   for c in sorted(left.keys() & right.keys()) if left[c] != right[c]}
        if left.keys() != right.keys() or changed:
            changes[name] = {'baseline_only_columns':sorted(left.keys()-right.keys()),
                             'candidate_only_columns':sorted(right.keys()-left.keys()),
                             'changed_columns':changed}
    return {'snapshots':{k:v['path'] for k,v in snapshots.items()},
            'baseline_only_tables':sorted(before.keys()-after.keys()),
            'candidate_only_tables':sorted(after.keys()-before.keys()),
            'shared_table_column_changes':changes,
            'limitation':'Latest filename snapshots only; may lag runtime schema. Does not validate constraints, triggers, rows or snapshot drift.'}


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo',required=True)
    parser.add_argument('--baseline',required=True)
    parser.add_argument('--candidate',required=True)
    parser.add_argument('--output',help='Explicit report path; AMX local reports belong on F: under OPPRRC')
    parser.add_argument('--require-compatible-journal',action='store_true',
                        help='Exit 2 for a non-prefix journal. This does not authorize migration.')
    args=parser.parse_args(argv)
    result=inspect(args.repo,args.baseline,args.candidate)
    if args.output:
        output=pathlib.Path(args.output).resolve()
        output.parent.mkdir(parents=True,exist_ok=True)
        # Refuse to overwrite evidence or source accidentally. Choose a new report filename.
        with output.open('x', encoding='utf-8') as handle:
            handle.write(json.dumps(result,indent=2,sort_keys=True))
        print(json.dumps({key:result[key] for key in ('refs','file_counts','migration_journal')},indent=2))
    else:
        print(json.dumps(result,indent=2,sort_keys=True))
    return 2 if args.require_compatible_journal and not result['migration_journal']['direct_journal_upgrade_compatible'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f'Inventory failed ({type(error).__name__}); no compatibility result is valid.',file=sys.stderr)
        sys.exit(1)
