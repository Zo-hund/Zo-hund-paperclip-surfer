"""Seed only the fresh, named source rehearsal database with synthetic records."""
import argparse
import json
from pathlib import Path
from rehearsal import Rehearsal, BASELINE, literal

A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
AGENT = "33333333-3333-4333-8333-333333333333"
SECRET = "44444444-4444-4444-8444-444444444444"
RUN = "55555555-5555-4555-8555-555555555555"
PLUGIN = "66666666-6666-4666-8666-666666666666"
PLUGIN_CONFIG = "77777777-7777-4777-8777-777777777777"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--plugin-owners", type=Path, required=True)
    args = parser.parse_args()
    if args.plugin_owners.exists():
        raise ValueError("Synthetic owner map already exists")
    db = Rehearsal(Path(__file__).resolve().parents[2], args.container)
    count = int(db.sql("amx_rehearsal_source", "SELECT count(*) FROM companies;"))
    if count:
        raise ValueError("Rehearsal source already contains companies")
    db.sql("amx_rehearsal_source", f"""
    BEGIN;
    CREATE SCHEMA amx_rehearsal_metadata;
    CREATE TABLE amx_rehearsal_metadata.fixture (baseline text NOT NULL);
    INSERT INTO amx_rehearsal_metadata.fixture VALUES ({literal(BASELINE)});
    INSERT INTO companies (id,name,issue_prefix,require_board_approval_for_new_agents,brand_color,deployment_target,is_public,tagline)
      VALUES ('{A}','Synthetic Tenant A','SYNTA',true,'#123456','cloud',false,'Private synthetic tenant'),
             ('{B}','Synthetic Tenant B','SYNTB',false,'#654321','local',true,'Public opt-in preserved');
    INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES
      ('synthetic-user','Synthetic Operator','operator@example.invalid','2026-01-02 03:04:05.123456+00','2026-01-02 03:04:05.123456+00');
    INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES
      ('synthetic-account','synthetic-user','credential','synthetic-user','synthetic-password-hash-no-login','2026-01-02 03:04:05.123456+00','2026-01-02 03:04:05.123456+00');
    INSERT INTO agents (id,company_id,name,role,status,adapter_type,adapter_config,runtime_config,schedule_enabled,cron_expression,skills)
      VALUES ('{AGENT}','{A}','Synthetic Agent','engineer','idle','openrouter',
        '{{"model":"anthropic/example","env":{{"OPENROUTER_API_KEY":{{"type":"secret_ref","secretId":"{SECRET}","version":"latest"}}}}}}',
        '{{"heartbeat":{{"enabled":true}}}}',true,'0 * * * *','["synthetic-security"]');
    INSERT INTO company_secrets (id,company_id,name,provider) VALUES ('{SECRET}','{A}','Synthetic Router Key','local_encrypted');
    INSERT INTO company_secret_versions (secret_id,version,material,value_sha256)
      VALUES ('{SECRET}',1,'{{"scheme":"synthetic-material-not-a-real-key","nested":{{"number":9007199254740993}},"text":"newline\\nand unicode Ω"}}',repeat('a',64));
    INSERT INTO heartbeat_runs (id,company_id,agent_id,status,run_mode,swarm_batch_id,log_bytes,created_at)
      VALUES ('{RUN}','{A}','{AGENT}','running','simulation','synthetic-batch',9007199254740993,'2026-01-02 03:04:05.123456+00');
    INSERT INTO heartbeat_run_events (id,company_id,run_id,agent_id,seq,event_type,message)
      VALUES (9007199254740993,'{A}','{RUN}','{AGENT}',2147483647,'log','Synthetic history; preserve exactly');
    INSERT INTO amx_ledger (company_id,principal_type,principal_id,token_balance,credit_balance,auto_top_up_enabled)
      VALUES ('{A}','user','synthetic-user',1234567,7654321,true),('{B}','user','synthetic-user',100,200,false);
    INSERT INTO amx_transactions (from_company_id,to_company_id,from_principal_type,from_principal_id,to_principal_type,to_principal_id,amount,transaction_type)
      VALUES ('{A}','{B}','user','synthetic-user','user','synthetic-user',100,'synthetic-transfer');
    INSERT INTO company_webhooks (company_id,url,secret,enabled) VALUES ('{A}','https://example.invalid/synthetic','synthetic-not-a-provider-key',true);
    INSERT INTO plugins (id,plugin_key,package_name,version,manifest_json)
      VALUES ('{PLUGIN}','synthetic-plugin','synthetic-plugin','0.0.0','{{}}');
    INSERT INTO plugin_config (id,plugin_id,config_json) VALUES ('{PLUGIN_CONFIG}','{PLUGIN}','{{"synthetic":true}}');
    COMMIT;
    """)
    with args.plugin_owners.open("x", encoding="utf-8") as stream:
        json.dump({PLUGIN_CONFIG: A}, stream, indent=2)
        stream.write("\n")
    print("Seeded two synthetic companies and explicit plugin ownership. No provider credentials or calls.")


if __name__ == "__main__":
    main()
