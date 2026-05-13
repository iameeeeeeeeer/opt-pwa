const DB_NAME = "option-pwa-device-keys";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "primary-device";
const ENVELOPE_CALLBACK_PREFIX = "__optionPwaEnvelope";

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
    schema_version: "option-pwa-device-registration-v1",
    device_id: deviceId,
    label: record.label,
    algorithm: "RSA-OAEP-SHA256",
    public_key_spki_b64: arrayBufferToBase64(publicKeySpki),
    created_at: createdAt
  }, null, 2);
}

export async function getDeviceRegistrationCode() {
  const record = await getDeviceRecord();
  if (!record?.publicKey) return "";
  const publicKeySpki = await crypto.subtle.exportKey("spki", record.publicKey);
  return JSON.stringify({
    schema_version: "option-pwa-device-registration-v1",
    device_id: record.deviceId,
    label: record.label,
    algorithm: "RSA-OAEP-SHA256",
    public_key_spki_b64: arrayBufferToBase64(publicKeySpki),
    created_at: record.createdAt
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
  if (!bundle.status) {
    throw new Error("解密資料缺少 status payload");
  }
  return bundle.status;
}

export async function getViewPayload(kind, date) {
  const bundle = await loadDecryptedPayload();
  const view = bundle.views?.[kind];
  if (!view?.queries) {
    throw new Error(`解密資料缺少 ${kind} payload`);
  }
  const normalizedDate = String(date || "latest").replaceAll("_", "-");
  const payload = view.queries[normalizedDate] || view.queries.latest;
  if (!payload) {
    throw new Error(`解密資料沒有 ${kind}/${normalizedDate}`);
  }
  return payload;
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
  const recipient = envelope.recipients?.find(item => item.device_id === record.deviceId);
  if (!recipient?.encrypted_data_key_b64) {
    throw new Error("此手機尚未授權或金鑰已失效");
  }
  const dataKeyBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    record.privateKey,
    base64ToArrayBuffer(recipient.encrypted_data_key_b64)
  );
  const aesKey = await crypto.subtle.importKey("raw", dataKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const ciphertext = base64ToArrayBuffer((envelope.ciphertext_chunks || []).join(""));
  const aadText = envelope.aad || config.cryptoAad || "option-pwa-envelope-v1";
  const compressedPlaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(base64ToArrayBuffer(envelope.iv_b64)),
      additionalData: new TextEncoder().encode(aadText)
    },
    aesKey,
    ciphertext
  );
  const plaintext = envelope.payload_encoding === "gzip+json"
    ? await gunzip(compressedPlaintext)
    : compressedPlaintext;
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function getConfig() {
  return window.OptionPwaConfig || {};
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
      reject(new Error("Apps Script encrypted envelope timeout"));
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
      reject(new Error("無法載入 Apps Script encrypted envelope"));
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
