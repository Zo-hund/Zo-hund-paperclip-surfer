import { useCallback, useEffect, useState } from "react";
import { pushApi } from "../api/push";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

/**
 * Push-notification opt-in for mobile/desktop dispatch (meeting started,
 * etc.) — never auto-prompts; subscribe() must be called from a user
 * gesture (e.g. a settings toggle), since browsers block/penalize
 * unsolicited permission prompts.
 */
export function usePushNotifications(companyId?: string) {
  const isSupported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(Boolean(sub)))
      .finally(() => setIsLoading(false));
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) throw new Error("Push notifications aren't supported in this browser");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted");
    }

    const { publicKey } = await pushApi.getVapidPublicKey();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await pushApi.subscribe({ companyId, subscription: sub.toJSON() as PushSubscriptionJSON });
    setIsSubscribed(true);
  }, [isSupported, companyId]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
    setIsSubscribed(false);
  }, [isSupported]);

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe };
}
