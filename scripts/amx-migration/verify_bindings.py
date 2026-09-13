"""Validate explicit bindings and rejection rollback on the synthetic target."""
import argparse
import hashlib
import json
from pathlib import Path
from rehearsal import Rehearsal, BASELINE
from seed_synthetic import A, B, AGENT, SECRET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.report.exists():
        raise ValueError("Report exists")
    db = Rehearsal(Path(__file__).resolve().parents[2], args.container)
    if db.sql("amx_rehearsal_source", "SELECT baseline FROM amx_rehearsal_metadata.fixture;").decode().strip() != BASELINE:
        raise ValueError("Synthetic source required")
    binding_sql = Path(__file__).with_name("materialize-bindings.sql").read_text(encoding="utf-8")
    db.sql("amx_rehearsal_target", "BEGIN;\n" + binding_sql + "\nCOMMIT;")
    checks = {
        "explicit_agent_binding": f"SELECT count(*) FROM company_secret_bindings WHERE company_id='{A}' AND target_id='{AGENT}' AND secret_id='{SECRET}' AND config_path='env.OPENROUTER_API_KEY';",
        "no_cross_company_binding": f"SELECT count(*) FROM company_secret_bindings WHERE company_id='{B}';",
    }
    if int(db.sql("amx_rehearsal_target", checks["explicit_agent_binding"])) != 1 or int(db.sql("amx_rehearsal_target", checks["no_cross_company_binding"])) != 0:
        raise ValueError("Synthetic binding ownership mismatch")
    rejected = []
    for name, mutation, expected in [
        ("cross_company_reference", f"UPDATE company_secrets SET company_id='{B}' WHERE id='{SECRET}';", "belongs to another company"),
        ("conflicting_existing_binding", f"UPDATE company_secret_bindings SET version_selector='99' WHERE target_id='{AGENT}';", "conflicts with preserved agent configuration"),
        ("privileged_projection", f"UPDATE agents SET adapter_config=jsonb_set(adapter_config,'{{env,OPENROUTER_API_KEY,projectionClass}}','\"class_3_static_lease\"') WHERE id='{AGENT}';", "Invalid legacy secret binding"),
    ]:
        try:
            db.sql("amx_rehearsal_target", "BEGIN;\n" + mutation + "\n" + binding_sql + "\nROLLBACK;")
        except RuntimeError as error:
            if expected not in str(error):
                raise
            rejected.append(name)
        else:
            raise ValueError(f"Unsafe binding was not rejected: {name}")
    # Verify rollback and idempotence, not just exception text.
    db.sql("amx_rehearsal_target", "BEGIN;\n" + binding_sql + "\nCOMMIT;")
    if int(db.sql("amx_rehearsal_target", checks["explicit_agent_binding"])) != 1:
        raise ValueError("Binding was changed or duplicated by rejected transactions")
    if int(db.sql("amx_rehearsal_target", f"SELECT count(*) FROM company_secrets WHERE id='{SECRET}' AND company_id='{A}';")) != 1:
        raise ValueError("Rejected transaction did not roll back")
    result = {"scope": "synthetic-only", "binding_sql_sha256": hashlib.sha256(binding_sql.encode()).hexdigest(),
              "explicit_binding_verified": True, "rejected_cases": rejected, "rollback_verified": True,
              "idempotence_verified": True, "provider_called": False}
    with args.report.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print("Explicit tenant binding, three rejection cases, rollback and idempotence verified.")


if __name__ == "__main__":
    main()
