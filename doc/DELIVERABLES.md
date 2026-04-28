# Deliverables Output System (V1.1)

This project uses a cloud-synced Google Drive system to manage and store all autonomous agent work products. The goal is to provide unified access to deliverables for both the human board and AI agents.

## Folder Structure

The root directory is `G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AGENT-DELIVERABLES\`.

The directory contains the following routing table:

### BOARD-INTERNAL

Used for intra-company documentation, drafts, strategy, and internal reporting.

*   `CEO-ZOMORPHESUS\`: Human CEO workspace
*   `CTO\`: Technology design, architecture, engineering specs
*   `CMO\`: Marketing strategy, partner ops
*   `AUDIT\`: Both V3 Audit Leads save certificates and verification traces here
*   `SHARED\`: Cross-agent collaboration items

### CLIENTS-EXTERNAL

Used for polished deliverables intended for outside consumption or templates.

*   `PROPOSALS\`
*   `REPORTS\`
*   `MEDIA\`: Media outputs from agents (e.g. UXDesigner)
*   `TEMPLATES\`: Standardized templates used across operations

### ON-DEMAND

Used for ephemeral, temporary, or ad-hoc work requests.

## Naming Convention

All deliverables MUST adhere strictly to the following `OPPRRC` standard format to ensure sortability, parsability, and context:

`OPPRRC-[TYPE]-[NNN]_[AgentCode]_[Description]_[YYYY-MM-DD].[ext]`

**Fields**:
*   `[TYPE]`: Short code for document type (e.g., `DOC`, `REP`, `IMG`, `CERT`, `PLAN`)
*   `[NNN]`: Sequential identifier (001, 002...) or relative ID
*   `[AgentCode]`: 3-4 letter code representing the authoring agent (e.g., `CTO`, `CMO`, `AUD1`, `UXD`)
*   `[Description]`: Concise, CamelCase or kebab-case description (max 4-5 words)
*   `[YYYY-MM-DD]`: Standard ISO date of creation
*   `[ext]`: Standard file extension (`.md`, `.pdf`, `.png`, etc.)

**Example**:
`OPPRRC-DOC-001_CTO_ArchitecturePlan_2026-04-14.md`

## Syncing & Backups

This directory actively syncs to the cloud. Agents must use the local `G:\...` path as their `cwd` (Current Working Directory). 

**Mirrored Backups**: The local repository maintains mirrored backups of critical operational documents (such as the Master Brief) to prevent split-brain scenarios and provide resiliency if cloud sync is unavailable.
