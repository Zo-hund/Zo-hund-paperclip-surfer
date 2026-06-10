# Memory: Research Director (Director)

## 1. System Topology & Environment
* **Local Environment**: Run on the local developer machine/device.
* **Sentinel Node**: The `Hermes Sentinel` agent (`ccb14b20-84bf-40f7-9a74-e9ee39945262`) runs locally on this node using the `hermes_local` adapter.
* **Nous Specialist Node**: The `Nous Specialist` agent (`06f3c2aa-9fcb-46aa-ad31-07f242b6deb7`) runs using `hermes_advanced` and connects to the remote Hostinger VPS (`82.29.197.221`).

## 2. Dynamic Memory Rules
* **Hostinger VPS**: Cloud production node is located at IP `82.29.197.221`. Staged files, container logs, and database migrations are managed on this node.
* **Google Drive Folders**: Mapped OPPRRC folder ids must remain synchronized:
  * `01_organizations`: `1mt1gW80-ifMs1YOi2VLUIK1-GKbtyj7D` (Board Internal) / `1g7RwTOjyAwIDAqcfC459cqXiYFjYAruC` (Clients External)
  * `02_programs`: `1Lq7sUNGdmZWu8XL0wB4h6yOQIgJbLhIP` (Board Internal) / `1U88FXmIvCA6gaA_b_LtbBuNlaY5VYKRs` (Clients External)
  * `03_projects`: `1WvapNf0sGQEm_fdeJBwE2hm63plxessX` (Board Internal) / `1AWB4pMt5IU3APRq87ex3igKvgYgevJWG` (Clients External)
  * `04_resources`: `1u0xWeSNcNbgEzkj7BSL_9NA7pcUespNl` (Board Internal) / `1poJpArhsTjdd20v5sIW1C4UeJeMzqlX4` (Clients External)
  * `05_reports`: `1ZzE45t0ws8sKn1HimIR7Ty_c7hw4VHFQ` (Board Internal) / `1I7LrWC-dLKoCIYK1HNt9_Ek1iRjOA2UD` (Clients External)
  * `06_certificates`: `1pveOQdJ-2WO3D7JPr6NOG_aVRnumaYOA` (Board Internal) / `1-HhxtE39SD2q3rW79zA_mMM-Sew3kK8e` (Clients External)
