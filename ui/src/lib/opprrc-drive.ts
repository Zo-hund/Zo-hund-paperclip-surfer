/**
 * AMX OPPRRC Google Drive folder URLs.
 * Verified via Google Drive MCP on 2026-04-27 — all IDs confirmed live.
 * G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS\
 *
 * Deliverable type → Drive folder mapping:
 *   01-TEXT  (document/text)        → 05_REPORTS  (BOARD-INTERNAL subfolder)
 *   01-TEXT-EXT (external reports)  → 05_REPORTS  (CLIENTS-EXTERNAL subfolder)
 *   02-IMAGE (image/visual)         → 11_MEDIA_LIBRARY
 *   03-VIDEO (video)                → 11_MEDIA_LIBRARY
 *   04-CODE  (code/PR/branch)       → 14_DEVELOPMENT
 *   05-SKILLS (runtime/audit)       → 04_RESOURCES
 *   06-PROGRAMS  (content/social)   → 02_PROGRAMS
 *   MASTERS-BRIEFCASE (default)     → AMX-LABS root
 *   _root                           → AMX-AIR-HUB-FOLDER-OPPRRC (header button)
 *
 * Section folders (all 16):
 *   00_HUB_CONFIG    1jZGJCtaDndreDwB1F-Xue6JhrstPKRub
 *   01_ORGANIZATIONS 1OKZZKd4DcFBhGvC9t5lAwaanyyRWk_5G
 *   02_PROGRAMS      1Z1ZewhqFwP41yfcdgkpi78LIXcExXmY7
 *   03_PROJECTS      1MTZokIzWztvHueEQeJkbl3BArazSWisk
 *   04_RESOURCES     1XrnHms4a-kAsfpqlnvybzzgH8h48Arkm
 *   05_REPORTS       1GFGH3zGEelTmxz4m9ZzqbxVAGUqCWV95
 *   06_CERTIFICATES  1njntC3tZiJN1ieSOHa9r4xyS-gc2ln5V
 *   09_DEPLOYMENTS   1dMD0qBGcSi8CrQNB7E4O9RVlqW9Q_QGI
 *   11_MEDIA_LIBRARY 1Og8heTBcBNlzD2WQIelfMenPtgwjKM7H
 *   14_DEVELOPMENT   1DpcdWqaEvv5V9oPOW-0ncsSpbB4xMVsa
 */
export const OPPRRC_DRIVE_FOLDERS: Record<string, string> = {
  // Deliverable-type shortcuts (used by DeliverablesBriefcase cards)
  "01-TEXT":           "https://drive.google.com/drive/folders/1MEeeCXGb8vg4Ktnp_sJ4RZ9BO2WtFgO0", // 05_REPORTS/BOARD-INTERNAL
  "01-TEXT-EXT":       "https://drive.google.com/drive/folders/1QQ2Drb_Tc03qJvQMfPX5Zu4hZVT-Ii8j", // 05_REPORTS/CLIENTS-EXTERNAL
  "02-IMAGE":          "https://drive.google.com/drive/folders/1Og8heTBcBNlzD2WQIelfMenPtgwjKM7H", // 11_MEDIA_LIBRARY
  "03-VIDEO":          "https://drive.google.com/drive/folders/1Og8heTBcBNlzD2WQIelfMenPtgwjKM7H", // 11_MEDIA_LIBRARY
  "04-CODE":           "https://drive.google.com/drive/folders/1DpcdWqaEvv5V9oPOW-0ncsSpbB4xMVsa", // 14_DEVELOPMENT
  "05-SKILLS":         "https://drive.google.com/drive/folders/1XrnHms4a-kAsfpqlnvybzzgH8h48Arkm", // 04_RESOURCES
  "06-PROGRAMS":       "https://drive.google.com/drive/folders/1Z1ZewhqFwP41yfcdgkpi78LIXcExXmY7", // 02_PROGRAMS
  "MASTERS-BRIEFCASE": "https://drive.google.com/drive/folders/1kVgFmf7fyZ7sj6Fa0rIC4T7qenhkx4Zc", // AMX-LABS root
  "_root":             "https://drive.google.com/drive/folders/1jhPpwSLYKIQPju7RNLWOgmn-R0trl69k", // OPPRRC root (header btn)

  // Direct section access (for pipeline and advanced linking)
  "00_HUB_CONFIG":    "https://drive.google.com/drive/folders/1jZGJCtaDndreDwB1F-Xue6JhrstPKRub",
  "01_ORGANIZATIONS": "https://drive.google.com/drive/folders/1OKZZKd4DcFBhGvC9t5lAwaanyyRWk_5G",
  "02_PROGRAMS":      "https://drive.google.com/drive/folders/1Z1ZewhqFwP41yfcdgkpi78LIXcExXmY7",
  "03_PROJECTS":      "https://drive.google.com/drive/folders/1MTZokIzWztvHueEQeJkbl3BArazSWisk",
  "04_RESOURCES":     "https://drive.google.com/drive/folders/1XrnHms4a-kAsfpqlnvybzzgH8h48Arkm",
  "05_REPORTS":       "https://drive.google.com/drive/folders/1GFGH3zGEelTmxz4m9ZzqbxVAGUqCWV95",
  "05_REPORTS_BOARD": "https://drive.google.com/drive/folders/1MEeeCXGb8vg4Ktnp_sJ4RZ9BO2WtFgO0",
  "05_REPORTS_EXT":   "https://drive.google.com/drive/folders/1QQ2Drb_Tc03qJvQMfPX5Zu4hZVT-Ii8j",
  "06_CERTIFICATES":  "https://drive.google.com/drive/folders/1njntC3tZiJN1ieSOHa9r4xyS-gc2ln5V",
  "09_DEPLOYMENTS":   "https://drive.google.com/drive/folders/1dMD0qBGcSi8CrQNB7E4O9RVlqW9Q_QGI",
  "09_DEPLOYMENTS_SIM":  "https://drive.google.com/drive/folders/1_kBqkF_ORMpNdCBKmOx5twYXzjpdjs8a",
  "09_DEPLOYMENTS_LIVE": "https://drive.google.com/drive/folders/1hM6dICF2uvv5B1IK8CLh-8Ix0z95wymz",
  "11_MEDIA_LIBRARY": "https://drive.google.com/drive/folders/1Og8heTBcBNlzD2WQIelfMenPtgwjKM7H",
  "14_DEVELOPMENT":   "https://drive.google.com/drive/folders/1DpcdWqaEvv5V9oPOW-0ncsSpbB4xMVsa",
};

/**
 * Returns the Google Drive URL for a given OPPRRC folder key.
 * Falls back to the root folder if the key isn't found.
 */
export function getDriveFolderUrl(opprcFolder: string): string {
  return OPPRRC_DRIVE_FOLDERS[opprcFolder] ?? OPPRRC_DRIVE_FOLDERS["_root"]!;
}
