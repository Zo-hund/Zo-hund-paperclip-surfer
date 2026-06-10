# 2026-06-10: Hermes Research Hub Agents Setup Plan

Configure the agents of the Hermes Research Hub (AMX Research Lab) with resumes, cover letters, skills, tools, roles, and context memory. Generate detailed professional files in the repository and sync them to the database on the Hostinger VPS.

## Proposed Changes

### Repository Files

#### [NEW] [resume.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/director/resume.md)
#### [NEW] [cover_letter.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/director/cover_letter.md)
#### [NEW] [skills.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/director/skills.md)
#### [NEW] [tools.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/director/tools.md)
#### [NEW] [memory.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/director/memory.md)

#### [NEW] [resume.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/hermes-sentinel/resume.md)
#### [NEW] [cover_letter.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/hermes-sentinel/cover_letter.md)
#### [NEW] [skills.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/hermes-sentinel/skills.md)
#### [NEW] [tools.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/hermes-sentinel/tools.md)
#### [NEW] [memory.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/hermes-sentinel/memory.md)

#### [NEW] [resume.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/nous-specialist/resume.md)
#### [NEW] [cover_letter.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/nous-specialist/cover_letter.md)
#### [NEW] [skills.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/nous-specialist/skills.md)
#### [NEW] [tools.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/nous-specialist/tools.md)
#### [NEW] [memory.md](file:///c:/Users/Techa/.paperclip/tmp_surfers/research-lab-team/agents/nous-specialist/memory.md)

### Database Update Script

#### [NEW] [update-research-agents.ps1](file:///c:/Users/Techa/.paperclip/tmp_surfers/packages/db/update-research-agents.ps1)

---

## Verification Plan

### Automated Verification
- Verify the script compiles and can connect to the database.
- Inspect the database records on the VPS to verify the update matches the schemas.

### Manual Verification
- Check the agent roster on the VPS UI (briefcase/agent view) and verify that the system prompts are correctly updated and the agents display their new roles and titles.
