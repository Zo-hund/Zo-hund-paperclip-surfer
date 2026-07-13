import { useEffect, useRef } from "react";
import * as THREE from "three";

export function BrandScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 50);
    camera.position.set(0, 0.2, 7.7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.domElement.className = "brand-canvas";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x8dcfff, 1.8));
    const cyan = new THREE.PointLight(0x16d9ff, 18, 15);
    cyan.position.set(3, 2, 4);
    scene.add(cyan);
    const magenta = new THREE.PointLight(0xff36de, 14, 15);
    magenta.position.set(-3, -2, 3);
    scene.add(magenta);

    let model: THREE.Object3D | null = null;
    let disposed = false;
    import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
      new GLTFLoader().load("/models/amx-mark.bin", (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        model.rotation.x = 0.1;
        scene.add(model);
        host.dataset.loaded = "true";
      });
    });

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      if (model) {
        model.rotation.y = Math.sin(clock.elapsedTime * 0.42) * 0.24;
        model.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.06;
      }
      renderer.render(scene, camera);
    });
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className="brand-scene" role="img" aria-label="Interactive Blender model of the AMX AIR Hubs mark"/>;
}
