"""Back up and restore the synthetic AMX source, then compare every source table."""
import argparse
import hashlib
import json
from pathlib import Path
from rehearsal import Rehearsal, command, identifier, BASELINE
from convert_synthetic import copy_rows, schema_digest


def logical_schema(columns):
    # pg_dump removes physical ordinal gaps left by DROP COLUMN. Compare the
    # surviving order and every type/default/nullability, not those empty slots.
    return {table: {name: {**column, "ordinal_position": index}
                   for index, (name, column) in enumerate(fields.items(), 1)}
            for table, fields in columns.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--verify-existing", action="store_true")
    args = parser.parse_args()
    if (args.backup.exists() and not args.verify_existing) or args.report.exists():
        raise ValueError("Backup/report already exists; refusing overwrite")
    db = Rehearsal(Path(__file__).resolve().parents[2], args.container)
    if db.sql("amx_rehearsal_source", "SELECT baseline FROM amx_rehearsal_metadata.fixture;").decode().strip() != BASELINE:
        raise ValueError("Synthetic marker is required")
    if args.verify_existing:
        archive = args.backup.read_bytes()
    else:
        archive = command(["docker", "exec", args.container, "pg_dump", "-U", "postgres", "-Fc", "amx_rehearsal_source"])
        with args.backup.open("xb") as stream:
            stream.write(archive)
        db.sql("postgres", 'CREATE DATABASE "amx_rehearsal_restore";')
        command(["docker", "exec", "-i", args.container, "pg_restore", "-U", "postgres", "--exit-on-error", "--single-transaction", "--no-owner", "-d", "amx_rehearsal_restore"], archive)
    source, restored = db.columns("amx_rehearsal_source"), db.columns("amx_rehearsal_restore")
    if schema_digest(logical_schema(source)) != schema_digest(logical_schema(restored)):
        raise ValueError("Restored schema differs from source")
    verified = []
    for table, columns in source.items():
        original = copy_rows(db, "amx_rehearsal_source", "public", table, list(columns))
        recovered = copy_rows(db, "amx_rehearsal_restore", "public", table, list(columns))
        if original != recovered:
            raise ValueError(f"Restored values differ: {table}")
        verified.append({"table": table, "sha256": hashlib.sha256(original).hexdigest()})
    original_journal = db.sql("amx_rehearsal_source", 'COPY (SELECT hash,created_at,name FROM drizzle.__drizzle_migrations ORDER BY id) TO STDOUT;')
    restored_journal = db.sql("amx_rehearsal_restore", 'COPY (SELECT hash,created_at,name FROM drizzle.__drizzle_migrations ORDER BY id) TO STDOUT;')
    if original_journal != restored_journal:
        raise ValueError("Restored migration journal differs")
    report = {"scope": "synthetic database restore only", "production_ready": False,
              "backup_sha256": hashlib.sha256(archive).hexdigest(), "backup_bytes": len(archive),
              "tables_verified": verified, "journal_verified": True,
              "real_secret_decryption_verified": False, "external_storage_restore_verified": False}
    with args.report.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(f"Synthetic restore verified for {len(verified)} tables and the original AMX migration journal.")


if __name__ == "__main__":
    main()
