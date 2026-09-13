"""Explicit AMX data conversion rehearsal. Synthetic fixtures only, no live URL."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from rehearsal import Rehearsal, identifier as ident, literal, command, BASELINE

SOURCE = "amx_rehearsal_source"
TARGET = "amx_rehearsal_target"
ARCHIVE = "amx_migration_source"
REQUIRED = {"account.issuer", "company_secret_versions.fingerprint_sha256",
            "company_secrets.key", "plugin_config.company_id"}


def fail_unless(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def schema_digest(columns: dict) -> str:
    return hashlib.sha256(json.dumps(columns, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def make_map(db: Rehearsal) -> dict:
    comparison = db.compare()
    fail_unless(not comparison["missing_source_columns"], "Unmapped source columns")
    fail_unless(comparison["type_transformations_required"] == [
        {"column": "heartbeat_run_events.seq", "from": "int4", "to": "int8"}], "Unreviewed type conversion")
    fail_unless(set(comparison["required_target_columns_without_defaults"]) == REQUIRED, "Unreviewed required target fields")
    source, target = db.columns(SOURCE), db.columns(TARGET)
    return {"version": 1, "baseline": BASELINE, "scope": "synthetic-only",
            "source_schema_sha256": schema_digest(source), "target_schema_sha256": schema_digest(target),
            "tables": {table: list(columns) for table, columns in source.items()},
            "rules": {"account.issuer": "credential -> local:credential; otherwise local:oauth:<provider_id>",
                      "company_secret_versions.fingerprint_sha256": "copy value_sha256; preserve encrypted material",
                      "company_secrets.key": "normalized name plus full immutable secret UUID; preserve original display name",
                      "plugin_config.company_id": "explicit per-config owner map; never duplicate a global credential across tenants",
                      "heartbeat_run_events.seq": "lossless int4 to int8 widening"}}


def defer_foreign_keys(db: Rehearsal) -> tuple[str, str]:
    rows = json.loads(db.sql(TARGET, """SELECT coalesce(json_agg(x), '[]') FROM (
      SELECT c.relname AS tbl, con.conname AS name, con.condeferrable AS deferrable, con.condeferred AS deferred
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND con.contype='f') x;"""))
    before, after = [], ["SET CONSTRAINTS ALL IMMEDIATE;"]
    for row in rows:
        prefix = f"ALTER TABLE public.{ident(row['tbl'])} ALTER CONSTRAINT {ident(row['name'])} "
        before.append(prefix + "DEFERRABLE INITIALLY DEFERRED;")
        state = ("DEFERRABLE INITIALLY DEFERRED" if row["deferred"] else "DEFERRABLE INITIALLY IMMEDIATE") if row["deferrable"] else "NOT DEFERRABLE"
        after.append(prefix + state + ";")
    # Constraints remain enabled. Their checks run before restoring the original
    # deferral settings and committing. Cycles never require disabled triggers.
    return "\n".join(before) + "\nSET CONSTRAINTS ALL DEFERRED;", "\n".join(after)


def copy_rows(db: Rehearsal, database: str, schema: str, table: str, columns: list[str]) -> bytes:
    names = ",".join(map(ident, columns))
    return db.sql(database, f"COPY (SELECT {names} FROM {ident(schema)}.{ident(table)} t ORDER BY to_jsonb(t)::text COLLATE \"C\") TO STDOUT;")


def convert(db: Rehearsal, mapping: dict, plugin_owners: dict[str, str]) -> dict:
    fail_unless(mapping["scope"] == "synthetic-only" and mapping["baseline"] == BASELINE, "Unsupported conversion map")
    fail_unless(schema_digest(db.columns(SOURCE)) == mapping["source_schema_sha256"], "Source schema drift")
    fail_unless(schema_digest(db.columns(TARGET)) == mapping["target_schema_sha256"], "Target schema drift")
    # Only a seeded, synthetic harness database is accepted, even if a caller
    # renames another database or points this at a differently labelled server.
    marker = db.sql(SOURCE, "SELECT baseline FROM amx_rehearsal_metadata.fixture;").decode().strip()
    fail_unless(marker == BASELINE, "Synthetic fixture marker is absent")
    tables = mapping["tables"]
    source_columns = db.columns(SOURCE)
    config_ids = json.loads(db.sql(SOURCE, "SELECT coalesce(json_agg(id::text ORDER BY id),'[]') FROM plugin_config;"))
    company_ids = json.loads(db.sql(SOURCE, "SELECT coalesce(json_agg(id::text ORDER BY id),'[]') FROM companies;"))
    fail_unless(set(plugin_owners) == set(config_ids), "Every legacy plugin config needs exactly one explicit owner mapping")
    fail_unless(all(owner in company_ids for owner in plugin_owners.values()), "Plugin owner does not exist in source")
    counts = json.loads(db.sql(TARGET, "SELECT json_object_agg(table_name, rows) FROM (" + " UNION ALL ".join(
        f"SELECT {literal(table)} AS table_name, count(*) AS rows FROM public.{ident(table)}" for table in tables) + ") counts;"))
    # Upstream migration 0105 creates one instance settings row. Keep it as
    # separately archived target seed state only when the AMX source has none.
    # A populated AMX settings table needs an explicit merge, never overwrite.
    seeded_settings = counts.get("instance_settings") == 1
    fail_unless(all(count == 0 or (table == "instance_settings" and seeded_settings)
                    for table, count in counts.items()), "Target already contains application data; refusing overwrite")
    if seeded_settings:
        fail_unless(int(db.sql(SOURCE, "SELECT count(*) FROM instance_settings;")) == 0,
                    "Populated AMX instance settings require an explicit target seed merge")
        fail_unless(int(db.sql(TARGET, "SELECT count(*) FROM instance_settings WHERE singleton_key='default' AND general='{}'::jsonb AND experimental='{}'::jsonb;")) == 1,
                    "Target instance settings differ from the fresh upstream seed")
    before, after = defer_foreign_keys(db)
    statements = ["BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';", before,
                  f"CREATE SCHEMA {ident(ARCHIVE)}; REVOKE ALL ON SCHEMA {ident(ARCHIVE)} FROM PUBLIC;"]
    if seeded_settings:
        statements.append(f"CREATE TABLE {ident(ARCHIVE)}.target_seed_instance_settings AS SELECT * FROM public.instance_settings;")
    original_hashes = {}
    for table, columns in tables.items():
        # Preserve the exact source column types, values, timestamps and JSON.
        definitions = []
        for name in columns:
            column = source_columns[table][name]
            pg_type = ident(column["udt_name"])
            if column["data_type"] == "ARRAY":
                pg_type = ident(column["udt_name"][1:]) + "[]"
            definitions.append(f"{ident(name)} {pg_type}")
        statements.append(f"CREATE TABLE {ident(ARCHIVE)}.{ident(table)} ({','.join(definitions)});")
        raw = copy_rows(db, SOURCE, "public", table, columns)
        original_hashes[table] = hashlib.sha256(raw).hexdigest()
        statements.append(f"COPY {ident(ARCHIVE)}.{ident(table)} ({','.join(map(ident,columns))}) FROM STDIN;\n" + raw.decode() + "\\.\n")

    statements.append(f"CREATE TABLE {ident(ARCHIVE)}.plugin_owners (config_id uuid PRIMARY KEY, company_id uuid NOT NULL);")
    for config_id, owner in plugin_owners.items():
        statements.append(f"INSERT INTO {ident(ARCHIVE)}.plugin_owners VALUES ({literal(config_id)}::uuid,{literal(owner)}::uuid);")

    for table, columns in tables.items():
        target_columns = list(columns)
        expressions = ["s." + ident(column) for column in columns]
        if table == "account":
            target_columns.append("issuer")
            expressions.append("CASE WHEN s.provider_id='credential' THEN 'local:credential' ELSE 'local:oauth:'||s.provider_id END")
        elif table == "company_secret_versions":
            target_columns.append("fingerprint_sha256")
            expressions.append("s.value_sha256")
        elif table == "company_secrets":
            target_columns += ["key", "last_rotated_at"]
            expressions += ["coalesce(nullif(left(trim(both '-' from regexp_replace(lower(s.name),'[^a-z0-9_.-]+','-','g')),80),''),'secret')||'-'||s.id::text", "s.updated_at"]
        elif table == "plugin_config":
            target_columns.append("company_id")
            expressions.append(f"(SELECT company_id FROM {ident(ARCHIVE)}.plugin_owners p WHERE p.config_id=s.id)")
        statements.append(f"INSERT INTO public.{ident(table)} ({','.join(map(ident,target_columns))}) SELECT {','.join(expressions)} FROM {ident(ARCHIVE)}.{ident(table)} s;")

    # Validate every source value before applying explicit quarantine changes.
    for table, columns in tables.items():
        names = ",".join(map(ident, columns))
        seed_filter = f" WHERE id NOT IN (SELECT id FROM {ident(ARCHIVE)}.target_seed_instance_settings)" if table == "instance_settings" and seeded_settings else ""
        destination = f"SELECT {names} FROM public.{ident(table)}{seed_filter}"
        statements.append(f"DO $$ BEGIN IF EXISTS ((SELECT {names} FROM {ident(ARCHIVE)}.{ident(table)} EXCEPT ALL {destination}) UNION ALL ({destination} EXCEPT ALL SELECT {names} FROM {ident(ARCHIVE)}.{ident(table)})) THEN RAISE EXCEPTION 'Preservation mismatch: {table}'; END IF; END $$;")

    statements.append((Path(__file__).with_name("materialize-bindings.sql")).read_text(encoding="utf-8"))

    # Archive retains the original state. This target is never started as an
    # application; network isolation remains in force throughout rehearsal.
    statements += [
        "UPDATE companies SET status='paused';",
        "UPDATE agents SET status=CASE WHEN status IN ('terminated','pending_approval') THEN status ELSE 'paused' END, schedule_enabled=false, next_scheduled_at=NULL, runtime_config=jsonb_set(runtime_config,'{heartbeat}',coalesce(runtime_config->'heartbeat','{}'::jsonb)||'{\"enabled\":false}'::jsonb);",
        "UPDATE company_webhooks SET enabled=false;",
        "UPDATE amx_ledger SET auto_top_up_enabled=false;",
        "UPDATE routines SET status='paused'; UPDATE routine_triggers SET enabled=false,next_run_at=NULL;",
        "UPDATE plugin_jobs SET status='paused',next_run_at=NULL; UPDATE plugins SET status='disabled';",
        "UPDATE heartbeat_runs SET status='cancelled' WHERE status IN ('queued','running');",
        "UPDATE agent_wakeup_requests SET status='cancelled' WHERE status IN ('queued','claimed');",
        "UPDATE workspace_runtime_services SET status='stopped',stop_policy=NULL;",
        "UPDATE environments SET status='disabled'; UPDATE instance_settings SET default_environment_id=NULL, experimental=experimental||'{\"enableManagedSandboxOnly\":true}'::jsonb;",
    ]
    # Advance sequences after copying explicit identities, never nextval during
    # readback. The original journal is separate from the candidate journal.
    statements.append("""DO $$ DECLARE r record; m bigint; BEGIN
      FOR r IN SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND column_default LIKE 'nextval(%' LOOP
        EXECUTE format('SELECT max(%I) FROM public.%I', r.column_name,r.table_name) INTO m;
        IF m IS NOT NULL THEN PERFORM setval(pg_get_serial_sequence('public.'||quote_ident(r.table_name),r.column_name),m,true); END IF;
      END LOOP; END $$;""")
    statements += [after, "COMMIT;"]
    db.sql(TARGET, "\n".join(statements))
    verified = []
    for table, columns in tables.items():
        fail_unless(hashlib.sha256(copy_rows(db, SOURCE, "public", table, columns)).hexdigest() == original_hashes[table], "Source changed during conversion")
        fail_unless(hashlib.sha256(copy_rows(db, TARGET, ARCHIVE, table, columns)).hexdigest() == original_hashes[table], "Archived source checksum mismatch")
        count = int(db.sql(TARGET, f"SELECT count(*) FROM public.{ident(table)};"))
        verified.append({"table": table, "rows": count, "source_sha256": original_hashes[table], "source_unchanged": True, "archived_values_verified": True})
    return {"scope": "synthetic-only", "production_ready": False, "tables_verified": verified,
            "constraints": "all foreign keys checked before commit; original deferral settings restored",
            "application_started": False, "quarantine": "original states retained in private source archive"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--map", type=Path, required=True)
    parser.add_argument("--generate-map", action="store_true")
    parser.add_argument("--plugin-owners", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    db = Rehearsal(Path(__file__).resolve().parents[2], args.container)
    if args.generate_map:
        with args.map.open("x", encoding="utf-8") as stream:
            json.dump(make_map(db), stream, indent=2)
            stream.write("\n")
        print("Explicit source-column map generated; no application data changed.")
    else:
        fail_unless(args.report is not None and args.plugin_owners is not None, "Report and explicit plugin owner map required")
        fail_unless(not args.report.exists(), "Report already exists")
        result = convert(db, json.loads(args.map.read_text()), json.loads(args.plugin_owners.read_text()))
        with args.report.open("x", encoding="utf-8") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
        print(f"Verified {len(result['tables_verified'])} source tables in isolated synthetic conversion.")


if __name__ == "__main__":
    main()
