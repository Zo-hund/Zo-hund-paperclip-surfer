import json
import unittest
from pathlib import Path
from unittest.mock import patch
from rehearsal import Rehearsal
from restore_synthetic import logical_schema


class ConversionContainmentTests(unittest.TestCase):
    def test_rejects_non_rehearsal_container_before_docker_access(self):
        with patch("rehearsal.command") as run:
            with self.assertRaises(ValueError):
                Rehearsal(Path.cwd(), "production-postgres")
            run.assert_not_called()

    def test_rejects_unlabelled_networked_or_shared_storage_targets(self):
        base = {"Config": {"Labels": {"com.amx.migration.rehearsal": "true"}},
                "HostConfig": {"NetworkMode": "none", "PortBindings": {}},
                "Mounts": [{"Type": "volume", "Name": "amx-migration-db-20260913"}]}
        for mutate in [
            lambda x: x["Config"].update(Labels={}),
            lambda x: x["HostConfig"].update(NetworkMode="bridge"),
            lambda x: x["HostConfig"].update(PortBindings={"5432/tcp": [{"HostPort": "5432"}]}),
            lambda x: x.update(Mounts=[{"Type": "bind", "Source": "production-data"}]),
            lambda x: x.update(Mounts=[{"Type": "volume", "Name": "existing-production-data"}]),
        ]:
            state = json.loads(json.dumps(base))
            mutate(state)
            with patch("rehearsal.command", return_value=json.dumps([state]).encode()) as run:
                with self.assertRaises(ValueError):
                    Rehearsal(Path.cwd(), "amx-migration-db-20260913")
                self.assertEqual(run.call_count, 1)

    def test_restore_allows_physical_gaps_but_preserves_types_and_column_order(self):
        source = {"agents": {"id": {"udt_name": "uuid", "ordinal_position": 1},
                             "name": {"udt_name": "text", "ordinal_position": 3}}}
        restored = {"agents": {"id": {"udt_name": "uuid", "ordinal_position": 1},
                               "name": {"udt_name": "text", "ordinal_position": 2}}}
        self.assertEqual(logical_schema(source), logical_schema(restored))
        restored["agents"]["name"]["udt_name"] = "int4"
        self.assertNotEqual(logical_schema(source), logical_schema(restored))
        restored["agents"]["name"]["udt_name"] = "text"
        restored["agents"] = dict(reversed(list(restored["agents"].items())))
        self.assertNotEqual(logical_schema(source), logical_schema(restored))


if __name__ == "__main__":
    unittest.main()
