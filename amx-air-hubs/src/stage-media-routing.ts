import type { StageShot } from "./stage-production";
export const STAGE_MEDIA_ROUTE_EVENT = "amx-stage-media-route";
export interface StageMediaRouteAsset { id: string; name: string; url: string; contentType: string }
export function routeStageMedia(shot: StageShot, asset: StageMediaRouteAsset) {
  window.dispatchEvent(new CustomEvent(STAGE_MEDIA_ROUTE_EVENT, { detail: { shot, asset } }));
}
