import { getDeviceState } from "./crypto-data.js";

const PUSH_SCHEMA_VERSION = "push-subscription-v1";

export function isPushSupported() {
  const config = getConfig();
  return Boolean(
    config.vapidPublicKey &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function createPushRegistrationCode() {
  if (!isPushSupported()) {
    throw new Error("此裝置或瀏覽器不支援通知");
  }
  const device = await getDeviceState();
  if (!device.hasKey || !device.deviceId) {
    throw new Error("請先建立裝置");
  }
  if (Notification.permission === "denied") {
    throw new Error("通知權限已被拒絕，請到 iOS 設定重新允許");
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("尚未允許通知");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(getConfig().vapidPublicKey)
  });
  const payload = subscription.toJSON();
  return JSON.stringify({
    v: PUSH_SCHEMA_VERSION,
    i: device.deviceId,
    l: device.label || "Device",
    e: payload.endpoint,
    k: payload.keys,
    t: new Date().toISOString()
  }, null, 2);
}

export async function showLocalNotificationTest() {
  if (!isPushSupported()) {
    throw new Error("此裝置或瀏覽器不支援通知");
  }
  if (Notification.permission === "denied") {
    throw new Error("通知權限已被拒絕，請到 iOS 設定重新允許");
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("尚未允許通知");
  }

  const registration = await navigator.serviceWorker.ready;
  const tag = `local-notification-test-${Date.now()}`;
  const title = `本機通知測試 ${new Date().toLocaleTimeString("zh-TW", { hour12: false })}`;
  await registration.showNotification(title, {
    body: "這則通知不經過 Mac mini 或 Apple Push，只測試本機 PWA 顯示通知。",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag,
    data: { url: "./" }
  });
  return {
    v: "local-notification-test-v1",
    ok: true,
    permission,
    title,
    tag,
    t: new Date().toISOString()
  };
}

function getConfig() {
  return window.OptionPwaConfig || {};
}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}
