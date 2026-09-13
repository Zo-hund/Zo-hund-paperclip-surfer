"""Exercise settings overwrite rejection in the isolated synthetic harness."""
import argparse
import json
from pathlib import Path
from rehearsal import Rehearsal, BASELINE
from convert_synthetic import convert, SOURCE, TARGET, fail_unless


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--map", type=Path, required=True)
    parser.add_argument("--plugin-owners", type=Path, required=True)
    args = parser.parse_args()
    db = Rehearsal(Path(__file__).resolve().parents[2], args.container)
    fail_unless(db.sql(SOURCE, "SELECT baseline FROM amx_rehearsal_metadata.fixture;").decode().strip() == BASELINE,
                "Synthetic fixture marker is absent")
    fail_unless(int(db.sql(TARGET, "SELECT count(*) FROM companies;")) == 0, "Target is not fresh")
    fail_unless(int(db.sql(TARGET, "SELECT count(*) FROM instance_settings WHERE singleton_key='default' AND general='{}'::jsonb AND experimental='{}'::jsonb AND default_environment_id IS NULL;")) == 1,
                "Target settings are not the empty seed")
    mapping = json.loads(args.map.read_text())
    owners = json.loads(args.plugin_owners.read_text())

    def expect_rejection(message):
        try:
            convert(db, mapping, owners)
        except ValueError as error:
            fail_unless(message in str(error), "Unexpected rejection reason")
        else:
            raise AssertionError("Conversion accepted an unmapped settings state")
        fail_unless(int(db.sql(TARGET, "SELECT count(*) FROM companies;")) == 0, "Rejected conversion changed target rows")
        fail_unless(db.sql(TARGET, "SELECT to_regnamespace('amx_migration_source') IS NULL;").strip() == b"t",
                    "Rejected conversion created its archive")

    db.sql(TARGET, "UPDATE instance_settings SET general='{\"preserveOperatorSetting\":true}'::jsonb;")
    expect_rejection("Target instance settings differ")
    fail_unless(db.sql(TARGET, "SELECT general->>'preserveOperatorSetting' FROM instance_settings;").strip() == b"true",
                "Customized target settings changed on rejection")
    # Only this harness's deliberate synthetic mutation is reset.
    db.sql(TARGET, "UPDATE instance_settings SET general='{}'::jsonb;")
    db.sql(SOURCE, "UPDATE instance_settings SET singleton_key='synthetic-unknown';")
    expect_rejection("Unknown source settings singleton")
    db.sql(SOURCE, "UPDATE instance_settings SET singleton_key='default' WHERE singleton_key='synthetic-unknown';")
    print("Customized target settings and unknown source singletons were rejected without target mutation.")


if __name__ == "__main__":
    main()
