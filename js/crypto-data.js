const DB_NAME = "static-viewer-device";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "primary-device";
const ENVELOPE_CALLBACK_PREFIX = "__staticPack";

let cachedPayloadPromise = null;

export async function getDeviceState() {
  const record = await getDeviceRecord();
  return {
    hasKey: Boolean(record?.privateKey),
    deviceId: record?.deviceId || "",
    label: record?.label || "",
    createdAt: record?.createdAt || ""
  };
}

export async function getConnectionDiagnostics(lastError = "") {
  const record = await getDeviceRecord();
  const config = getConfig();
  const diagnostics = {
    v: "option-pwa-diagnostics-v1",
    t: new Date().toISOString(),
    href: window.location.href,
    origin: window.location.origin,
    standalone: window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    supports: {
      indexedDB: "indexedDB" in window,
      cryptoSubtle: Boolean(window.crypto?.subtle),
      decompressionStream: "DecompressionStream" in window,
      serviceWorker: "serviceWorker" in navigator,
      pushManager: "PushManager" in window,
      notification: "Notification" in window
    },
    notification: await getNotificationDiagnostics(),
    device: {
      hasKey: Boolean(record?.privateKey),
      deviceId: record?.deviceId || "",
      label: record?.label || "",
      createdAt: record?.createdAt || ""
    },
    endpoint: {
      configured: Boolean(config.encryptedDataEndpoint),
      host: endpointHost(config.encryptedDataEndpoint || "")
    },
    envelope: {
      reachable: false,
      version: "",
      updatedAt: "",
      recipients: 0,
      hasCurrentDevice: false,
      error: ""
    },
    lastError: lastError || ""
  };

  if (config.encryptedDataEndpoint && !config.encryptedDataEndpoint.includes("REPLACE_WITH")) {
    try {
      const envelope = await loadEnvelopeJsonp(config.encryptedDataEndpoint);
      diagnostics.envelope.reachable = true;
      diagnostics.envelope.version = envelope.v || "";
      diagnostics.envelope.updatedAt = envelope.m?.u || "";
      diagnostics.envelope.recipients = Array.isArray(envelope.r) ? envelope.r.length : 0;
      diagnostics.envelope.hasCurrentDevice = Boolean(record?.deviceId && envelope.r?.some(item => item.i === record.deviceId));
    } catch (error) {
      diagnostics.envelope.error = error.message || String(error);
    }
  }

  return diagnostics;
}

async function getNotificationDiagnostics() {
  const diagnostics = {
    permission: "Notification" in window ? Notification.permission : "unsupported",
    serviceWorkerReady: false,
    serviceWorkerScope: "",
    activeServiceWorkerState: "",
    pushSubscription: {
      present: false,
      endpointHost: "",
      hasKeys: false
    },
    error: ""
  };
  if (!("serviceWorker" in navigator)) {
    diagnostics.error = "serviceWorker unsupported";
    return diagnostics;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    diagnostics.serviceWorkerReady = true;
    diagnostics.serviceWorkerScope = registration.scope || "";
    diagnostics.activeServiceWorkerState = registration.active?.state || "";
    if ("pushManager" in window) {
      const subscription = await registration.pushManager.getSubscription();
      diagnostics.pushSubscription.present = Boolean(subscription);
      if (subscription) {
        const payload = subscription.toJSON();
        diagnostics.pushSubscription.endpointHost = endpointHost(payload.endpoint || "");
        diagnostics.pushSubscription.hasKeys = Boolean(payload.keys?.p256dh && payload.keys?.auth);
      }
    }
  } catch (error) {
    diagnostics.error = error.message || String(error);
  }
  return diagnostics;
}

export async function createDeviceRegistrationCode() {
  const config = getConfig();
  const deviceId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    false,
    ["encrypt", "decrypt"]
  );
  const publicKeySpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const record = {
    id: DEVICE_KEY_ID,
    deviceId,
    label: config.registrationLabel || "iPhone",
    createdAt,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey
  };
  await putDeviceRecord(record);
  cachedPayloadPromise = null;
  return JSON.stringify({
    v: "device-registration-v1",
    i: deviceId,
    l: record.label,
    a: "RSA-OAEP-SHA256",
    k: arrayBufferToBase64(publicKeySpki),
    t: createdAt
  }, null, 2);
}

export async function getDeviceRegistrationCode() {
  const record = await getDeviceRecord();
  if (!record?.publicKey) return "";
  const publicKeySpki = await crypto.subtle.exportKey("spki", record.publicKey);
  return JSON.stringify({
    v: "device-registration-v1",
    i: record.deviceId,
    l: record.label,
    a: "RSA-OAEP-SHA256",
    k: arrayBufferToBase64(publicKeySpki),
    t: record.createdAt
  }, null, 2);
}

export async function clearDeviceKey() {
  const db = await openDb();
  await requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(DEVICE_KEY_ID));
  cachedPayloadPromise = null;
}

export function clearPayloadCache() {
  cachedPayloadPromise = null;
}

export async function getStatusPayload() {
  const bundle = await loadDecryptedPayload();
  if (!bundle.s) {
    throw new Error("資料封包缺少狀態資訊");
  }
  return bundle.s;
}

export async function getViewPayload(kind, date) {
  const bundle = await loadDecryptedPayload();
  const view = bundle.x?.[kind];
  if (!view?.q) {
    throw new Error("資料封包缺少視圖資料");
  }
  const normalizedDate = String(date || "latest").replaceAll("_", "-");
  const payload = view.q[normalizedDate] || view.q.latest;
  if (!payload) {
    throw new Error("資料封包缺少指定日期");
  }
  return payload;
}

export async function getLayoutConfig() {
  const bundle = await loadDecryptedPayload();
  if (!bundle.u?.views?.length) {
    throw new Error("資料封包缺少介面設定");
  }
  return bundle.u;
}

async function loadDecryptedPayload() {
  if (!cachedPayloadPromise) {
    cachedPayloadPromise = loadDecryptedPayloadOnce();
  }
  return cachedPayloadPromise;
}

async function loadDecryptedPayloadOnce() {
  const config = getConfig();
  if (!config.encryptedDataEndpoint || config.encryptedDataEndpoint.includes("REPLACE_WITH")) {
    throw new Error("尚未設定 Apps Script encryptedDataEndpoint");
  }
  const record = await getDeviceRecord();
  if (!record?.privateKey || !record?.deviceId) {
    throw new Error("此手機尚未建立解密金鑰");
  }
  const envelope = await loadEnvelopeJsonp(config.encryptedDataEndpoint);
  const recipient = envelope.r?.find(item => item.i === record.deviceId);
  if (!recipient?.k) {
    throw new Error("此手機尚未授權或金鑰已失效");
  }
  const dataKeyBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    record.privateKey,
    base64ToArrayBuffer(recipient.k)
  );
  const aesKey = await crypto.subtle.importKey("raw", dataKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const packedBytes = base64ToArrayBuffer((envelope.d || []).join(""));
  const aadText = config.cryptoAad || "static-envelope-v1";
  const compressedPlaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(envelope.n)),
      additionalData: new TextEncoder().encode(aadText)
    },
    aesKey,
    packedBytes
  );
  const plaintext = envelope.e === "gzip"
    ? await gunzip(compressedPlaintext)
    : compressedPlaintext;
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function getConfig() {
  return window.OptionPwaConfig || {};
}

function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

function loadEnvelopeJsonp(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = `${ENVELOPE_CALLBACK_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(endpoint);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", `${Date.now()}`);
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("資料封包讀取逾時"));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = envelope => {
      cleanup();
      resolve(envelope);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("無法載入資料封包"));
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function gunzip(buffer) {
  if (!("DecompressionStream" in window)) {
    throw new Error("此瀏覽器不支援 gzip 解壓縮，請更新 iOS/Safari");
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function getDeviceRecord() {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DEVICE_KEY_ID));
}

async function putDeviceRecord(record) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
