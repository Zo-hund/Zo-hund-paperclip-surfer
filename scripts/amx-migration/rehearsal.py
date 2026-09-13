"""Build migration evidence in a network-isolated, disposable Docker database.

This command accepts no database URL, password, live backup or production target.
It reconstructs schema history on NEW databases; it never replays the candidate
history over AMX. All database and container names are explicitly constrained.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

BASELINE = "daaae8eb4a885b80e3ac0dcaf611b3ed09361d9d"
MIGRATIONS = "packages/db/src/migrations"
DATABASES = {"amx_rehearsal_source", "amx_rehearsal_target", "amx_rehearsal_restore"}


def command(args: list[str], data: bytes | None = None) -> bytes:
    result = subprocess.run(args, input=data, capture_output=True, check=False)
    if result.returncode:
        # This harness uses only synthetic data. Do not adapt this diagnostic
        # to print errors containing real copied rows or secret values.
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace")[-4000:])
    return result.stdout


def identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


class Rehearsal:
    def __init__(self, root: Path, container: str):
        if not re.fullmatch(r"amx-migration-db-[0-9]{8}(?:-r[1-9][0-9]*)?", container):
            raise ValueError("Only a named AMX disposable migration database is allowed")
        state = json.loads(command(["docker", "inspect", container]))[0]
        if state["Config"].get("Labels", {}).get("com.amx.migration.rehearsal") != "true":
            raise ValueError("Disposable rehearsal label is required")
        if state["HostConfig"]["NetworkMode"] != "none" or state["HostConfig"].get("PortBindings"):
            raise ValueError("Rehearsal database must have no network or published ports")
        if any(m["Type"] != "volume" or not m["Name"].startswith("amx-migration-db-") for m in state["Mounts"]):
            raise ValueError("Only dedicated rehearsal data volumes are allowed")
        self.root, self.container = root, container

    def sql(self, database: str, statement: str) -> bytes:
        if database not in DATABASES | {"postgres"}:
            raise ValueError("Database is outside the synthetic rehearsal")
        return command(["docker", "exec", "-i", self.container, "psql", "-X", "-q", "-A", "-t",
                        "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], statement.encode())

    def source(self, relative: str, baseline: bool) -> bytes:
        if baseline:
            return command(["git", "-C", str(self.root), "show", f"{BASELINE}:{relative}"])
        return (self.root / relative).read_bytes()

    def create(self, database: str, baseline: bool) -> dict:
        # CREATE DATABASE deliberately fails on a previous partial run. No
        # implicit drop, overwrite, journal repair, or existing-data upgrade.
        self.sql("postgres", f"CREATE DATABASE {identifier(database)};")
        self.sql(database, 'CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations '
                 '(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint, name text);')
        journal = json.loads(self.source(f"{MIGRATIONS}/meta/_journal.json", baseline))
        hashes = []
        for entry in journal["entries"]:
            tag = entry["tag"]
            if not re.fullmatch(r"[0-9]{4}_[a-zA-Z0-9_]+", tag):
                raise ValueError("Unexpected migration filename")
            raw = self.source(f"{MIGRATIONS}/{tag}.sql", baseline)
            digest = hashlib.sha256(raw).hexdigest()
            sql = raw.decode("utf-8-sig")
            self.sql(database, "BEGIN;\n" + sql + "\nINSERT INTO drizzle.__drizzle_migrations "
                     f"(hash, created_at, name) VALUES ({literal(digest)}, {int(entry['when'])}, {literal(tag + '.sql')});\nCOMMIT;")
            hashes.append({"name": tag, "sha256": digest})
        if not baseline:
            # Record exact fresh target data, including migration-created IDs
            # and the default environment pointer. Conversion must not infer
            # that an arbitrary existing row is a safe seed to replace.
            statements = ["CREATE SCHEMA amx_rehearsal_metadata;",
                          "CREATE TABLE amx_rehearsal_metadata.target_seed (table_name text PRIMARY KEY, seed_rows jsonb NOT NULL);"]
            for table in self.columns(database):
                statements.append("INSERT INTO amx_rehearsal_metadata.target_seed SELECT "
                                  f"{literal(table)},coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.{identifier(table)} t;")
            self.sql(database, "BEGIN;" + "\n".join(statements) + "COMMIT;")
        return {"database": database, "migrations_executed": hashes}

    def columns(self, database: str) -> dict:
        rows = json.loads(self.sql(database, """
          SELECT coalesce(json_agg(x ORDER BY table_name, ordinal_position), '[]') FROM (
            SELECT table_name, column_name, data_type, udt_name, is_nullable,
                   column_default, ordinal_position
            FROM information_schema.columns WHERE table_schema = 'public'
          ) x;
        """))
        tables: dict[str, dict] = {}
        for row in rows:
            tables.setdefault(row["table_name"], {})[row["column_name"]] = row
        return tables

    def compare(self) -> dict:
        source = self.columns("amx_rehearsal_source")
        target = self.columns("amx_rehearsal_target")
        missing, changes, required = [], [], []
        for table, columns in source.items():
            for name, column in columns.items():
                dest = target.get(table, {}).get(name)
                if not dest:
                    missing.append(f"{table}.{name}")
                elif any(column[key] != dest[key] for key in ("data_type", "udt_name")):
                    changes.append({"column": f"{table}.{name}", "from": column["udt_name"], "to": dest["udt_name"]})
            for name, dest in target.get(table, {}).items():
                if name not in columns and dest["is_nullable"] == "NO" and dest["column_default"] is None:
                    required.append(f"{table}.{name}")
        return {"source_table_count": len(source), "target_table_count": len(target),
                "missing_source_columns": missing, "type_transformations_required": changes,
                "required_target_columns_without_defaults": required}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--compare-only", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    rehearsal = Rehearsal(root, args.container)
    report = {"scope": "synthetic, network-isolated schema rehearsal", "production_ready": False}
    if not args.compare_only:
        report["source"] = rehearsal.create("amx_rehearsal_source", True)
        report["target"] = rehearsal.create("amx_rehearsal_target", False)
    report["schema_comparison"] = rehearsal.compare()
    with args.report.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps(report["schema_comparison"], indent=2))


if __name__ == "__main__":
    main()
