import { useEffect, useRef, useState } from "react";
import { Gamepad2, Glasses, Hand, LoaderCircle, Move3d } from "lucide-react";
import type { ComfortSettings, ExperienceMode } from "./immersive";
import { createAmxIwsdkRuntime, type AmxIwsdkRuntime, type IwsdkRuntimeEvent } from "./iwsdk-runtime";

interface Props {
  mode: "vr" | "mr";
  comfort: ComfortSettings;
  onInteract: (label: string) => void;
  onFallback: (mode: ExperienceMode, reason: string) => void;
}

type RuntimeState = "loading" | "ready" | "entering" | "live" | "error";

export function IwsdkWorld({ mode, comfort, onInteract, onFallback }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<AmxIwsdkRuntime | null>(null);
  const onInteractRef = useRef(onInteract);
  const onFallbackRef = useRef(onFallback);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("loading");
  const [selected, setSelected] = useState("Full-scale data-center pod");
  const [controllers, setControllers] = useState({ left: false, right: false, leftTrigger: false, rightTrigger: false });

  useEffect(() => { onInteractRef.current = onInteract; }, [onInteract]);
  useEffect(() => { onFallbackRef.current = onFallback; }, [onFallback]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let runtime: AmxIwsdkRuntime | null = null;

    const handleEvent = (event: IwsdkRuntimeEvent) => {
      if (event.kind === "interaction") {
        const message = `${event.label} ${event.action}`;
        setSelected(message);
        onInteractRef.current(message);
      } else if (event.kind === "controllers") {
        setControllers(event);
      } else {
        setRuntimeState(event.state === "live" ? "live" : "ready");
      }
    };

    // Deferring one turn avoids creating two WebXR renderers during React's
    // development-only Strict Mode setup/cleanup probe.
    const startTimer = window.setTimeout(() => {
      void createAmxIwsdkRuntime(host, {
        mode,
        turning: comfort.turning,
        movementSpeed: comfort.movementSpeed,
        turnSpeed: comfort.turnSpeed,
        snapAngle: comfort.snapAngle,
        vignetteStrength: comfort.vignetteStrength,
        onEvent: handleEvent,
      }).then(async (createdRuntime) => {
        runtime = createdRuntime;
        if (disposed) {
          await createdRuntime.dispose();
          return;
        }
        runtimeRef.current = createdRuntime;
        setRuntimeState("ready");
      }).catch((error: unknown) => {
        if (disposed) return;
        setRuntimeState("error");
        setSelected(error instanceof Error ? error.message : "IWSDK world initialization failed");
      });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      runtimeRef.current = null;
      if (runtime) void runtime.dispose();
    };
  }, [comfort.movementSpeed, comfort.snapAngle, comfort.turning, comfort.turnSpeed, comfort.vignetteStrength, mode]);

  const enterXR = async () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setRuntimeState("entering");
    try {
      await runtime.enterXR();
      setRuntimeState("live");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Quest WebXR session could not start";
      setRuntimeState("ready");
      setSelected(reason);
      onFallbackRef.current(mode === "mr" ? "vr" : "3d", reason);
    }
  };

  return <div className={`immersive-world mode-${mode} iwsdk-world`}>
    <div ref={hostRef} className="immersive-world-host" aria-label="IWSDK Quest data-center training world"/>
    <div className="world-signal">
      <span className="live-dot"/>
      <b>{mode === "mr" ? "IWSDK Passthrough Data Center" : "IWSDK Data Center Pod"}</b>
      <small>{selected} / {runtimeState === "live" ? "immersive" : runtimeState}</small>
    </div>
    <button className="button primary compact xr-session-button" onClick={() => void enterXR()} disabled={runtimeState === "loading" || runtimeState === "entering" || runtimeState === "error"}>
      {runtimeState === "loading" || runtimeState === "entering" ? <LoaderCircle className="spin"/> : <Glasses/>}
      {runtimeState === "live" ? "Quest session live" : runtimeState === "entering" ? "Opening Quest" : runtimeState === "loading" ? "Loading world" : `Enter Quest ${mode.toUpperCase()}`}
    </button>
    <div className="iwsdk-controller-status" aria-label="Quest controller status">
      <span className={controllers.left ? "connected" : ""}><Gamepad2/><b>L</b><i className={controllers.leftTrigger ? "pressed" : ""}/></span>
      <span className={controllers.right ? "connected" : ""}><Gamepad2/><b>R</b><i className={controllers.rightTrigger ? "pressed" : ""}/></span>
    </div>
    <div className="world-input-hint"><Move3d/><span>Locomotion active</span><Hand/><span>Grab tools</span></div>
  </div>;
}
