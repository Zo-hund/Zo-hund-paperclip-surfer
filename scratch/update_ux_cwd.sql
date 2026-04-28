UPDATE agents 
SET adapter_config = jsonb_set(adapter_config, '{cwd}', '"G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AGENT-DELIVERABLES\\CLIENTS-EXTERNAL\\MEDIA"')
WHERE name = 'UXDesigner';
