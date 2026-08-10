import type { StageEventState } from "./stage-events";

export type AdmissionIdentityType = "member" | "partner" | "guest";

export interface StageAdmissionReservation {
  id: string;
  seatId: string;
  tierId: string;
  identityType: AdmissionIdentityType;
  displayLabel: string;
  profilePath: string;
  avatarUrl: string;
  status: "reserved" | "checked-in";
}

export interface StageAdmissionSnapshot {
  eventId: string;
  room: string;
  reservations: StageAdmissionReservation[];
  availableByTier: Record<string, number>;
  availableSeats: number;
  capacity: number;
  updatedAt: string;
}

async function admissionRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json() as StageAdmissionSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error || "Event admission is unavailable.");
  return body;
}

export function loadStageAdmissions(eventId: string) {
  return admissionRequest(`/api/stage/admissions/${encodeURIComponent(eventId)}`);
}

export function publishStageAdmissions(room: string, event: StageEventState) {
  return admissionRequest(`/api/stage/admissions/${encodeURIComponent(event.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, event }),
  });
}

export function reserveStageAdmission(eventId: string, input: { tierId: string; seatId?: string; displayName?: string }, accessToken?: string) {
  return admissionRequest(`/api/stage/admissions/${encodeURIComponent(eventId)}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(input),
  });
}
