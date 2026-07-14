import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TwinForecast, TwinTelemetry } from "./digital-twin";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";

interface Props {
  telemetry: TwinTelemetry;
  forecast: TwinForecast;
  reducedMotion?: boolean;
  onBackend?: (backend: RendererBackend) => void;
}

export function DigitalTwinScene({ telemetry, forecast, reducedMotion, onBackend }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const telemetryRef = useRef(telemetry);
  const forecastRef = useRef(forecast);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { telemetryRef.current = telemetry; forecastRef.current = forecast; }, [forecast, telemetry]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030b12);
    scene.fog = new THREE.FogExp2(0x030b12, 0.018);
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.05, 80);
    camera.position.set(7.8, 5.4, 9.6);
    const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: "high-performance", forceWebGL: forceWebGLDiagnostic() });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.45, 0);
    controls.enableDamping = true;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.24;
    controls.minDistance = 5.5;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.52;
    scene.add(new THREE.AmbientLight(0xdaf8ff, 1.4));
    scene.add(new THREE.HemisphereLight(0x8cecff, 0x07111a, 2.2));
    const key = new THREE.DirectionalLight(0xc6f5ff, 5.2);
    key.position.set(-5, 8, 6);
    scene.add(key);
    const fill = new THREE.PointLight(0xff4fea, 55, 24, 1.2);
    fill.position.set(5, 4, 4);
    scene.add(fill);
    let model: THREE.Object3D | null = null;
    new GLTFLoader().load("/models/amx-digital-twin.glb", (gltf) => {
      model = gltf.scene;
      modelRef.current = model;
      scene.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z);
      controls.target.copy(center);
      camera.position.set(center.x + radius * 0.8, center.y + radius * 0.52, center.z + radius * 1.05);
      camera.near = Math.max(0.05, radius / 100);
      camera.far = Math.max(80, radius * 12);
      camera.updateProjectionMatrix();
      controls.update();
      host.dataset.modelBounds = `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
      host.dataset.modelCenter = `${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}`;
      setLoading(false);
    }, undefined, (loadError) => {
      setLoading(false);
      setError(loadError instanceof Error ? loadError.message : "The Blender twin could not be loaded");
    });

    const clock = new THREE.Clock();
    let frame = 0;
    let animationFrame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const current = telemetryRef.current;
      const currentForecast = forecastRef.current;
      if (model) {
        const rotor = model.getObjectByName("Actuator_Cooling_Rotor");
        if (rotor && !reducedMotion) rotor.rotation.y = elapsed * (0.9 + current.coolingPercent / 20);
        const core = model.getObjectByName("Twin_Asset_Core") as THREE.Mesh | undefined;
        if (core?.material && "emissive" in core.material) {
          const material = core.material as THREE.MeshStandardMaterial;
          const color = currentForecast.state === "critical" ? 0xff5a4f : currentForecast.state === "watch" ? 0xf4c96b : 0x55e6ff;
          material.emissive.setHex(color);
          material.emissiveIntensity = 0.65 + currentForecast.riskPercent / 90;
        }
        const vibration = model.getObjectByName("Sensor_Vibration");
        if (vibration && !reducedMotion) vibration.rotation.z = Math.sin(elapsed * 12) * current.vibrationMmS * 0.006;
        const thermal = model.getObjectByName("Sensor_Temperature") as THREE.Mesh | undefined;
        if (thermal?.material && "emissive" in thermal.material) {
          const material = thermal.material as THREE.MeshStandardMaterial;
          material.emissive.setHSL(Math.max(0, 0.55 - current.temperatureC / 130), 0.95, 0.55);
          material.emissiveIntensity = 2.5;
        }
      }
      controls.update();
      renderer.render(scene, camera);
      host.dataset.frames = String(frame++);
      if (frame % 30 === 0) {
        host.dataset.drawCalls = String(renderer.info.render.drawCalls);
        host.dataset.triangles = String(renderer.info.render.triangles);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    void renderer.init().then(() => {
      if (disposed) return;
      const backend = getRendererBackend(renderer);
      host.dataset.renderer = backend;
      onBackend?.(backend);
      animate();
    }).catch((reason: unknown) => {
      setLoading(false);
      setError(reason instanceof Error ? reason.message : "The GPU renderer could not initialize");
    });
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      void renderer.dispose();
      modelRef.current = null;
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [onBackend, reducedMotion]);

  return <div className="digital-twin-scene" ref={hostRef} aria-label="Interactive Blender AI digital twin">
    {loading && <div className="nexus-scene-loading"><span/><b>Loading Blender digital twin</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
  </div>;
}
