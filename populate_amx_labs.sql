-- AMX Labs Test Data Population
-- Run this against the Paperclip Database

-- 1. Create Company
INSERT INTO companies (id, name, status, "issue_prefix") 
VALUES ('7668541e-3551-408c-9411-9e794358897c', 'AMX Labs', 'active', 'AMX')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. Create Agents
INSERT INTO agents (id, company_id, name, role, status)
VALUES 
('a1111111-1111-1111-1111-111111111111', '7668541e-3551-408c-9411-9e794358897c', 'Audit Lead', 'lead', 'active'),
('a2222222-2222-2222-2222-222222222222', '7668541e-3551-408c-9411-9e794358897c', 'Chain Watcher', 'watcher', 'active')
ON CONFLICT (id) DO NOTHING;

-- 3. Memories
INSERT INTO agent_memories (id, company_id, agent_id, content, category, importance)
VALUES 
('m1111111-1111-1111-1111-111111111111', '7668541e-3551-408c-9411-9e794358897c', 'a1111111-1111-1111-1111-111111111111', 'Validated security protocol for V3 deployment. No anomalies detected.', 'decision', 4),
('m2222222-2222-2222-2222-222222222222', '7668541e-3551-408c-9411-9e794358897c', 'a2222222-2222-2222-2222-222222222222', 'Observed high-frequency trading pattern in the exchange. Applying noise filter.', 'pattern', 3)
ON CONFLICT (id) DO NOTHING;

-- 4. Ledger
INSERT INTO amx_ledger (id, company_id, token_balance, total_earned, total_spent, currency)
VALUES ('l1111111-1111-1111-1111-111111111111', '7668541e-3551-408c-9411-9e794358897c', 5000, 15000, 10000, 'XP')
ON CONFLICT (company_id) DO UPDATE SET token_balance = 5000;

-- 5. Transactions
INSERT INTO amx_transactions (id, company_id, type, amount, description, status)
VALUES 
('t1111111-1111-1111-1111-111111111111', '7668541e-3551-408c-9411-9e794358897c', 'credit', 1000, 'Store credit purchase via XpWallet', 'completed'),
('t2222222-2222-2222-2222-222222222222', '7668541e-3551-408c-9411-9e794358897c', 'debit', 450, 'Payment for Neural Python Optimizer skill', 'completed')
ON CONFLICT (id) DO NOTHING;

-- 6. Chain Events
INSERT INTO amx_chain_events (id, company_id, action, principal_type, principal_id, payload, signature)
VALUES 
('e1111111-1111-1111-1111-111111111111', '7668541e-3551-408c-9411-9e794358897c', 'LEDGER_CREDIT', 'user', 'admin', '{"amount": 1000}', '0x8888888888888888')
ON CONFLICT (id) DO NOTHING;
