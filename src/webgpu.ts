import type { WebGPURenderer } from "three/webgpu";

export type RendererBackend = "webgpu" | "webgl2";

export function forceWebGLDiagnostic() {
  return new URLSearchParams(window.location.search).get("renderer") === "webgl2";
}

export function getRendererBackend(renderer: WebGPURenderer): RendererBackend {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl2";
}
