import { renderChart } from "./charts.js";
import {
  clearDeviceKey,
  clearPayloadCache,
  createDeviceRegistrationCode,
  getDeviceRegistrationCode,
  getDeviceState,
  getStatusPayload,
  getViewPayload
} from "./crypto-data.js";

const views = {
  pcratio: { label: "PC Ratio", endpoint: "/api/pcratio", defaultDate: "latest5" },
  homework: { label: "Homework", endpoint: "/api/homework", defaultDate: "latest" },
  largetrader: { label: "Large Trader", endpoint: "/api/largetrader", defaultDate: "latest5" }
};

const columnLabels = {
  pcratio: {
    date: "交易日期",
    expiry: "到期月份(週別)",
    weekday: "Weekday",
    weeknum: "WeekNum",
    pc_ratio_volume: "未平倉量PC比率",
    pc_ratio_amount: "未平倉金額PC比率",
    put_oi: "P未平倉量",
    call_oi: "C未平倉量",
    put_amount: "P未平倉金額",
    call_amount: "C未平倉金額",
    total_amount: "總未平倉金額",
    delta_put_oi: "P未平倉量_變化",
    delta_call_oi: "C未平倉量_變化",
    delta_put_amount: "P未平倉金額_變化",
    delta_call_amount: "C未平倉金額_變化",
    delta_total_amount: "總未平倉金額_變化"
  },
  homework: {
    expiry: "到期月份",
    strike: "履約價",
    type: "C/P",
    code: "Opt_code_C/P",
    close: "當日收盤價_C/P",
    oi: "當日未沖銷契約量_C/P",
    oi_change: "未沖銷契約變化量_C/P",
    prev_amount: "前日未平倉金額_C/P",
    amount: "當日未平倉金額_C/P",
    market_value_change: "未平倉市值變化_C/P",
    defense_price: "當日防守價_C/P",
    high: "當日歷史最高價_C/P",
    low: "當日歷史最低價_C/P"
  },
  largetrader: {
    date: "Datetime",
    product: "商品名稱",
    option_type: "權別",
    identity: "身份別",
    buy_volume: "買方交易口數",
    buy_amount: "買方契約金額",
    sell_volume: "賣方交易口數",
    sell_amount: "賣方契約金額",
    net_volume: "買賣差額口數",
    net_amount: "買賣契約金額",
    buy_oi: "買方未平倉口數",
    buy_oi_amount: "買方契約未平倉契約金額",
    sell_oi: "賣方未平倉口數",
    sell_oi_amount: "賣方契約未平倉契約金額",
    net_oi: "買賣差額未平倉口數",
    net_oi_amount: "買賣淨額未平倉契約金額"
  }
};

const mobileDefaultColumns = {
  homework: ["expiry", "strike", "type", "close", "oi", "oi_change", "amount"],
  largetrader: ["date", "option_type", "identity", "net_volume", "net_oi"]
};

const fixedVisibleColumns = {
  pcratio: [
    "date",
    "expiry",
    "pc_ratio_volume",
    "pc_ratio_amount",
    "put_oi",
    "call_oi",
    "put_amount",
    "call_amount",
    "total_amount",
    "delta_put_amount",
    "delta_call_amount",
    "delta_total_amount"
  ]
};

const homeworkMetricOptions = [
  { value: "amount", label: "當日未平倉金額" },
  { value: "oi", label: "當日未沖銷契約量" },
  { value: "market_value_change", label: "金額的變化量" },
  { value: "oi_change", label: "未沖銷的變化量" }
];

const homeworkThresholdOptions = [
  { value: "important", label: "重要履約價" },
  { value: "strict", label: "高門檻" },
  { value: "all", label: "全部" }
];

const state = {
  view: "pcratio",
  payload: null,
  rows: [],
  selectedColumns: [],
  selectedExpiry: "all",
  selectedIdentity: "all",
  selectedOptionType: "",
  selectedHomeworkExpiry: "",
  selectedHomeworkSide: "C",
  selectedHomeworkMetric: "amount",
  selectedHomeworkThreshold: "important",
  sortKey: null,
  sortDir: "asc",
  statusText: ""
};

const elements = {
  appTitle: document.getElementById("appTitle"),
  statusLine: document.getElementById("statusLine"),
  refreshButton: document.getElementById("refreshButton"),
  toolbar: document.querySelector(".toolbar"),
  filterToggle: document.getElementById("filterToggle"),
  secondaryControls: document.getElementById("secondaryControls"),
  dateControl: document.querySelector(".date-control"),
  dateSelect: document.getElementById("dateSelect"),
  expiryControl: document.getElementById("expiryControl"),
  expirySelect: document.getElementById("expirySelect"),
  identityControl: document.getElementById("identityControl"),
  identitySelect: document.getElementById("identitySelect"),
  optionTypeControl: document.getElementById("optionTypeControl"),
  optionTypeSelect: document.getElementById("optionTypeSelect"),
  homeworkExpiryControl: document.getElementById("homeworkExpiryControl"),
  homeworkExpirySelect: document.getElementById("homeworkExpirySelect"),
  sideControl: document.getElementById("sideControl"),
  sideSelect: document.getElementById("sideSelect"),
  metricControl: document.getElementById("metricControl"),
  metricSelect: document.getElementById("metricSelect"),
  thresholdControl: document.getElementById("thresholdControl"),
  thresholdSelect: document.getElementById("thresholdSelect"),
  columnControl: document.getElementById("columnControl"),
  columnSelect: document.getElementById("columnSelect"),
  searchInput: document.getElementById("searchInput"),
  offlineBanner: document.getElementById("offlineBanner"),
  installHint: document.getElementById("installHint"),
  installHintClose: document.getElementById("installHintClose"),
  keyPanel: document.getElementById("keyPanel"),
  keyPanelTitle: document.getElementById("keyPanelTitle"),
  keyPanelStatus: document.getElementById("keyPanelStatus"),
  createKeyButton: document.getElementById("createKeyButton"),
  showRegistrationButton: document.getElementById("showRegistrationButton"),
  clearKeyButton: document.getElementById("clearKeyButton"),
  registrationCode: document.getElementById("registrationCode"),
  rowCount: document.getElementById("rowCount"),
  sourceDate: document.getElementById("sourceDate"),
  sourceName: document.getElementById("sourceName"),
  mobilePcRatioDetail: document.getElementById("mobilePcRatioDetail"),
  mobileLargeTraderDetail: document.getElementById("mobileLargeTraderDetail"),
  chart: document.getElementById("chart"),
  table: document.getElementById("dataTable")
};

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    state.sortKey = null;
    state.selectedColumns = [];
    state.selectedExpiry = "all";
    state.selectedIdentity = "all";
    state.selectedOptionType = "";
    state.selectedHomeworkExpiry = "";
    state.selectedHomeworkSide = "C";
    state.selectedHomeworkThreshold = "important";
    document.querySelectorAll(".tab").forEach(node => node.classList.toggle("is-active", node === tab));
    loadView();
  });
});

elements.refreshButton.addEventListener("click", () => {
  clearPayloadCache();
  loadStatus();
  loadView();
});
elements.filterToggle?.addEventListener("click", () => {
  const expanded = !elements.toolbar.classList.contains("is-expanded");
  elements.toolbar.classList.toggle("is-expanded", expanded);
  elements.filterToggle.setAttribute("aria-expanded", String(expanded));
});
elements.dateSelect.addEventListener("change", () => loadView(elements.dateSelect.value));
elements.expirySelect?.addEventListener("change", () => {
  state.selectedExpiry = elements.expirySelect.value;
  render();
});
elements.identitySelect?.addEventListener("change", () => {
  state.selectedIdentity = elements.identitySelect.value;
  render();
});
elements.optionTypeSelect?.addEventListener("change", () => {
  state.selectedOptionType = elements.optionTypeSelect.value;
  render();
});
elements.homeworkExpirySelect?.addEventListener("change", () => {
  state.selectedHomeworkExpiry = elements.homeworkExpirySelect.value;
  render();
});
elements.sideSelect?.addEventListener("change", () => {
  state.selectedHomeworkSide = elements.sideSelect.value;
  render();
});
elements.metricSelect?.addEventListener("change", () => {
  state.selectedHomeworkMetric = elements.metricSelect.value;
  render();
});
elements.thresholdSelect?.addEventListener("change", () => {
  state.selectedHomeworkThreshold = elements.thresholdSelect.value;
  render();
});
elements.searchInput.addEventListener("input", () => render());
elements.columnSelect.addEventListener("change", () => {
  state.selectedColumns = [...elements.columnSelect.selectedOptions].map(option => option.value);
  render();
});
elements.createKeyButton?.addEventListener("click", async () => {
  await showRegistrationCode(await createDeviceRegistrationCode());
  await syncKeyPanel();
});
elements.showRegistrationButton?.addEventListener("click", async () => {
  const code = await getDeviceRegistrationCode();
  if (code) await showRegistrationCode(code);
});
elements.clearKeyButton?.addEventListener("click", async () => {
  await clearDeviceKey();
  await syncKeyPanel();
  elements.registrationCode.hidden = true;
  elements.registrationCode.value = "";
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => {});
}

initInstallHint();
syncKeyPanel();
loadStatus();
loadView();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function responseErrorMessage(response) {
  let detail = "";
  try {
    const payload = await response.clone().json();
    if (payload?.source) detail += ` source=${payload.source}`;
    if (payload?.error) detail += ` error=${payload.error}`;
    if (payload?.reason) detail += ` reason=${payload.reason}`;
  } catch {
    // Non-JSON API failures still surface through HTTP status.
  }
  return `${response.status} ${response.statusText}${detail}`;
}

async function apiFetch(url, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return cloudDataFetch(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function cloudDataFetch(url) {
  const parsed = new URL(withCacheBuster(url), window.location.origin);
  if (parsed.pathname === "/api/status") {
    return getStatusPayload();
  }
  const kind = parsed.pathname.split("/").filter(Boolean).pop();
  const date = parsed.searchParams.get("date") || "latest";
  if (!views[kind]) {
    throw new Error(`未知資料類型: ${kind}`);
  }
  return getViewPayload(kind, date);
}

async function loadStatus() {
  try {
    const status = await apiFetch("/api/status");
    const version = status.data_versions || {};
    state.statusText = `PC ${version.pcratio || "-"} / Homework ${version.homework || "-"} / Large Trader ${version.largetrader || "-"}`;
    syncHeader();
  } catch (error) {
    state.statusText = "狀態暫不可用";
    elements.statusLine.textContent = "狀態暫不可用";
    await syncKeyPanel(error.message);
  }
}

async function loadView(dateOverride) {
  const view = views[state.view];
  const date = dateOverride || (["pcratio", "homework", "largetrader"].includes(state.view) && isCompactLayout() ? "latest" : view.defaultDate);
  syncViewControls();
  elements.offlineBanner.hidden = true;
  try {
    const payload = await apiFetch(`${view.endpoint}?date=${encodeURIComponent(date)}`);
    state.payload = payload;
    state.rows = payload.data || [];
    syncDateSelect(payload, date);
    syncExpirySelect();
    syncIdentitySelect();
    syncOptionTypeSelect();
    syncHomeworkControls();
    syncColumnSelect();
    render();
  } catch (error) {
    elements.offlineBanner.hidden = false;
    elements.statusLine.textContent = `API 錯誤: ${error.message}`;
    await syncKeyPanel(error.message);
  }
}

function syncDateSelect(payload, selectedValue) {
  const dates = payload.available_dates || [];
  const selectedDates = payload.selected_dates || [];
  const options = [];
  const exactDatesOnly = ["homework", "largetrader"].includes(state.view) && isCompactLayout();
  if (state.view !== "homework" && !exactDatesOnly) {
    options.push({ value: "latest5", label: "最新 5 日" });
  }
  if (!exactDatesOnly) {
    options.push({ value: "latest", label: "最新日期" });
  }
  dates.slice(0, 40).forEach(date => options.push({ value: date, label: date }));
  elements.dateSelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  const exactDateValue = payload.date || selectedDates[0] || dates[0] || selectedValue;
  const value = exactDatesOnly
    ? (dates.includes(selectedValue) ? selectedValue : exactDateValue)
    : (selectedValue === "latest5" && selectedDates.length <= 1 ? "latest" : selectedValue);
  elements.dateSelect.value = options.some(option => option.value === value) ? value : options[0]?.value || "";
}

function syncColumnSelect() {
  const columns = columnsForRows(state.rows);
  if (isCompactLayout() && fixedVisibleColumns[state.view]) {
    state.selectedColumns = fixedVisibleColumns[state.view].filter(column => columns.includes(column));
  }
  if (!state.selectedColumns.length && isCompactLayout()) {
    state.selectedColumns = mobileDefaultColumns[state.view]?.filter(column => columns.includes(column)) || columns;
  }
  if (!state.selectedColumns.length) state.selectedColumns = columns;
  elements.columnSelect.innerHTML = columns
    .map(column => `<option value="${escapeHtml(column)}" ${state.selectedColumns.includes(column) ? "selected" : ""}>${escapeHtml(labelForColumn(column))}</option>`)
    .join("");
}

function syncExpirySelect() {
  if (state.view !== "pcratio" || !elements.expirySelect) return;
  const rows = [...state.rows].sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0));
  const compact = isCompactLayout();
  const options = compact
    ? rows
      .filter(row => row.expiry)
      .map(row => ({ value: row.expiry, label: row.expiry }))
    : [{ value: "all", label: "全部月份/週別" }, ...rows
      .filter(row => row.expiry)
      .map(row => ({ value: row.expiry, label: row.expiry }))];
  elements.expirySelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (!options.some(option => option.value === state.selectedExpiry)) {
    state.selectedExpiry = compact ? options[0]?.value || "all" : "all";
  }
  elements.expirySelect.value = state.selectedExpiry;
}

function syncIdentitySelect() {
  if (state.view !== "largetrader" || !elements.identitySelect) return;
  const preferredOrder = ["外資", "自營商", "投信"];
  const rowIdentities = new Set(state.rows.map(row => row.identity).filter(Boolean));
  const identities = preferredOrder.filter(identity => rowIdentities.has(identity));
  const options = identities.map(identity => ({ value: identity, label: identity }));
  elements.identitySelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (!options.some(option => option.value === state.selectedIdentity)) {
    state.selectedIdentity = options[0]?.value || "";
  }
  elements.identitySelect.value = state.selectedIdentity;
}

function syncOptionTypeSelect() {
  if (state.view !== "largetrader" || !elements.optionTypeSelect) return;
  const optionTypes = [...new Set(state.rows.map(row => row.option_type).filter(Boolean))];
  const options = optionTypes.map(optionType => ({ value: optionType, label: optionType }));
  elements.optionTypeSelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (!options.some(option => option.value === state.selectedOptionType)) {
    state.selectedOptionType = options[0]?.value || "";
  }
  elements.optionTypeSelect.value = state.selectedOptionType;
}

function syncHomeworkControls() {
  if (state.view !== "homework") return;
  const expiries = [...new Set(state.rows.map(row => row.expiry).filter(Boolean))]
    .sort(compareExpiryValues);
  const expiryOptions = expiries.map(expiry => ({ value: expiry, label: expiry }));
  if (elements.homeworkExpirySelect) {
    elements.homeworkExpirySelect.innerHTML = expiryOptions
      .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    if (!expiryOptions.some(option => option.value === state.selectedHomeworkExpiry)) {
      state.selectedHomeworkExpiry = expiryOptions[0]?.value || "";
    }
    elements.homeworkExpirySelect.value = state.selectedHomeworkExpiry;
  }

  if (elements.sideSelect) {
    const sideOptions = [
      { value: "C", label: "Call" },
      { value: "P", label: "Put" }
    ];
    elements.sideSelect.innerHTML = sideOptions
      .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    elements.sideSelect.value = state.selectedHomeworkSide;
  }

  if (elements.metricSelect) {
    elements.metricSelect.innerHTML = homeworkMetricOptions
      .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    if (!homeworkMetricOptions.some(option => option.value === state.selectedHomeworkMetric)) {
      state.selectedHomeworkMetric = homeworkMetricOptions[0].value;
    }
    elements.metricSelect.value = state.selectedHomeworkMetric;
  }

  if (elements.thresholdSelect) {
    elements.thresholdSelect.innerHTML = homeworkThresholdOptions
      .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join("");
    if (!homeworkThresholdOptions.some(option => option.value === state.selectedHomeworkThreshold)) {
      state.selectedHomeworkThreshold = homeworkThresholdOptions[0].value;
    }
    elements.thresholdSelect.value = state.selectedHomeworkThreshold;
  }
}

function columnsForRows(rows) {
  const keys = [];
  rows.slice(0, 20).forEach(row => {
    Object.keys(row).forEach(key => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  return keys;
}

function render() {
  const payload = state.payload || {};
  let rows = [...state.rows];
  if (state.view === "pcratio" && isCompactLayout()) {
    rows.sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0));
  }
  if (state.view === "pcratio" && state.selectedExpiry !== "all") {
    rows = rows.filter(row => row.expiry === state.selectedExpiry);
  }
  if (state.view === "homework" && isCompactLayout()) {
    const filteredRows = rows
      .filter(row => row.expiry === state.selectedHomeworkExpiry && row.type === state.selectedHomeworkSide)
      .sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
    rows = applyHomeworkThreshold(filteredRows);
  }
  if (state.view === "largetrader" && state.selectedIdentity) {
    rows = rows.filter(row => row.identity === state.selectedIdentity);
  }
  if (state.view === "largetrader" && state.selectedOptionType) {
    rows = rows.filter(row => row.option_type === state.selectedOptionType);
  }
  const query = elements.searchInput.value.trim().toLowerCase();
  if (query) {
    rows = rows.filter(row => Object.values(row).some(value => String(value ?? "").toLowerCase().includes(query)));
  }
  if (state.sortKey) {
    rows.sort((a, b) => compareValues(a[state.sortKey], b[state.sortKey]) * (state.sortDir === "asc" ? 1 : -1));
  }

  elements.rowCount.textContent = rows.length.toLocaleString();
  elements.sourceDate.textContent = formatSourceDate(payload);
  elements.sourceName.textContent = basename(payload.source || "-");
  renderTable(rows);
  renderMobilePcRatioDetail(rows);
  renderMobileLargeTraderDetail(rows);
  renderChart(elements.chart, state.view, rows, { homeworkMetric: state.selectedHomeworkMetric });
  syncHeader(payload);
}

function renderTable(rows) {
  const columns = state.selectedColumns.length ? state.selectedColumns : columnsForRows(rows);
  elements.table.tHead.innerHTML = `<tr>${columns.map(column => `<th data-key="${escapeHtml(column)}">${escapeHtml(labelForColumn(column))}${sortMarker(column)}</th>`).join("")}</tr>`;
  elements.table.tBodies[0].innerHTML = rows.slice(0, 500).map(row => (
    `<tr>${columns.map(column => renderCell(row[column])).join("")}</tr>`
  )).join("");
  elements.table.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      render();
    });
  });
}

function renderCell(value) {
  const isNumber = typeof value === "number";
  const text = isNumber ? formatNumber(value) : (value ?? "");
  return `<td class="${isNumber ? "number" : ""}">${escapeHtml(text)}</td>`;
}

function sortMarker(column) {
  if (state.sortKey !== column) return "";
  return state.sortDir === "asc" ? " ▲" : " ▼";
}

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "zh-Hant");
}

function applyHomeworkThreshold(rows) {
  if (state.selectedHomeworkThreshold === "all") return rows;
  const limits = state.selectedHomeworkThreshold === "strict"
    ? { amount: 5000000, oi: 1000, amountChange: 1000000, oiChange: 300, fallback: 24 }
    : { amount: 1000000, oi: 500, amountChange: 500000, oiChange: 100, fallback: 40 };
  const filtered = rows.filter(row => (
    Math.abs(Number(row.amount || 0)) >= limits.amount ||
    Math.abs(Number(row.oi || 0)) >= limits.oi ||
    Math.abs(Number(row.market_value_change || 0)) >= limits.amountChange ||
    Math.abs(Number(row.oi_change || 0)) >= limits.oiChange
  ));
  return filtered.length ? filtered : rows.slice(0, limits.fallback);
}

function compareExpiryValues(a, b) {
  const parsedA = parseExpiryValue(a);
  const parsedB = parseExpiryValue(b);
  if (parsedA.month !== parsedB.month) return parsedA.month - parsedB.month;
  if (parsedA.rank !== parsedB.rank) return parsedA.rank - parsedB.rank;
  return parsedA.suffix.localeCompare(parsedB.suffix, "zh-Hant", { numeric: true });
}

function parseExpiryValue(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{6})(.*)$/);
  const suffix = match?.[2] || "";
  const suffixRank = suffix.startsWith("W") ? 1 : suffix.startsWith("F") ? 2 : suffix ? 3 : 0;
  return {
    month: Number(match?.[1] || Number.MAX_SAFE_INTEGER),
    rank: suffixRank,
    suffix
  };
}

function basename(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1] || path;
}

function labelForColumn(column) {
  return columnLabels[state.view]?.[column] || column;
}

function syncViewControls() {
  const isMobilePcRatio = state.view === "pcratio" && isCompactLayout();
  const isMobileHomework = state.view === "homework" && isCompactLayout();
  const isMobileLargeTrader = state.view === "largetrader" && isCompactLayout();
  document.body.dataset.view = state.view;
  if (elements.dateControl) elements.dateControl.hidden = isMobilePcRatio;
  if (elements.expiryControl) elements.expiryControl.hidden = !isMobilePcRatio;
  if (elements.identityControl) elements.identityControl.hidden = !isMobileLargeTrader;
  if (elements.optionTypeControl) elements.optionTypeControl.hidden = !isMobileLargeTrader;
  if (elements.homeworkExpiryControl) elements.homeworkExpiryControl.hidden = !isMobileHomework;
  if (elements.sideControl) elements.sideControl.hidden = !isMobileHomework;
  if (elements.metricControl) elements.metricControl.hidden = !isMobileHomework;
  if (elements.thresholdControl) elements.thresholdControl.hidden = !isMobileHomework;
  if (elements.columnControl) elements.columnControl.hidden = isMobilePcRatio || isMobileHomework || isMobileLargeTrader;
  if (isMobilePcRatio || isMobileHomework || isMobileLargeTrader) {
    elements.toolbar?.classList.remove("is-expanded");
    elements.filterToggle?.setAttribute("aria-expanded", "false");
  }
}

function syncHeader(payload = state.payload) {
  const isMobilePcRatio = state.view === "pcratio" && isCompactLayout();
  const isMobileHomework = state.view === "homework" && isCompactLayout();
  const isMobileLargeTrader = state.view === "largetrader" && isCompactLayout();
  if (isMobilePcRatio) {
    elements.appTitle.textContent = formatDateForTitle(payload?.date);
    elements.statusLine.textContent = state.selectedExpiry && state.selectedExpiry !== "all" ? `PC Ratio / ${state.selectedExpiry}` : "PC Ratio";
    elements.refreshButton.textContent = "更新";
  } else if (isMobileHomework) {
    elements.appTitle.textContent = formatDateForTitle(payload?.date);
    const sideLabel = state.selectedHomeworkSide === "P" ? "Put" : "Call";
    elements.statusLine.textContent = `Homework / ${state.selectedHomeworkExpiry || "-"} / ${sideLabel}`;
    elements.refreshButton.textContent = "更新";
  } else if (isMobileLargeTrader) {
    elements.appTitle.textContent = formatDateForTitle(payload?.date);
    const filters = [state.selectedIdentity, state.selectedOptionType].filter(Boolean).join(" / ");
    elements.statusLine.textContent = filters ? `Large Trader / ${filters}` : "Large Trader";
    elements.refreshButton.textContent = "更新";
  } else {
    elements.appTitle.textContent = "台灣選擇權分析";
    elements.statusLine.textContent = state.statusText || elements.statusLine.textContent;
    elements.refreshButton.textContent = "Refresh";
  }
}

function renderMobilePcRatioDetail(rows) {
  if (!elements.mobilePcRatioDetail) return;
  const isMobilePcRatio = state.view === "pcratio" && isCompactLayout();
  const row = rows[0];
  elements.mobilePcRatioDetail.hidden = !isMobilePcRatio || !row;
  if (!isMobilePcRatio || !row) {
    elements.mobilePcRatioDetail.innerHTML = "";
    return;
  }

  const cards = [
    ["到期月份(週別)", row.expiry, "wide"],
    ["總未平倉金額", row.total_amount, "wide highlight"],
    ["總未平倉金額_變化", row.delta_total_amount, "wide"],
    ["未平倉量PC比率", row.pc_ratio_volume, "ratio"],
    ["未平倉金額PC比率", row.pc_ratio_amount, "ratio"],
    ["P未平倉量", row.put_oi, ""],
    ["C未平倉量", row.call_oi, ""],
    ["P未平倉量_變化", row.delta_put_oi, ""],
    ["C未平倉量_變化", row.delta_call_oi, ""],
    ["P未平倉金額", row.put_amount, "wide"],
    ["C未平倉金額", row.call_amount, "wide"],
    ["P未平倉金額_變化", row.delta_put_amount, "wide"],
    ["C未平倉金額_變化", row.delta_call_amount, "wide"]
  ];

  elements.mobilePcRatioDetail.innerHTML = cards.map(([label, value, extraClass]) => (
    `<article class="mobile-stat ${extraClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatDisplayValue(value, extraClass))}</strong></article>`
  )).join("");
}

function renderMobileLargeTraderDetail(rows) {
  if (!elements.mobileLargeTraderDetail) return;
  const isMobileLargeTrader = state.view === "largetrader" && isCompactLayout();
  elements.mobileLargeTraderDetail.hidden = !isMobileLargeTrader || !rows.length;
  if (!isMobileLargeTrader || !rows.length) {
    elements.mobileLargeTraderDetail.innerHTML = "";
    return;
  }

  elements.mobileLargeTraderDetail.innerHTML = rows.map(row => {
    const cards = [
      ["權別", row.option_type, ""],
      ["身份別", row.identity, ""],
      ["買賣淨額未平倉契約金額", row.net_oi_amount, "wide"],
      ["買方契約未平倉契約金額", row.buy_oi_amount, "wide"],
      ["賣方契約未平倉契約金額", row.sell_oi_amount, "wide"],
      ["買方未平倉口數", row.buy_oi, ""],
      ["賣方未平倉口數", row.sell_oi, ""],
      ["買賣差額未平倉口數", row.net_oi, "wide highlight"],
      ["買賣差額口數", row.net_volume, ""],
      ["買賣契約金額", row.net_amount, ""],
      ["買方交易口數", row.buy_volume, ""],
      ["賣方交易口數", row.sell_volume, ""],
      ["買方契約金額", row.buy_amount, ""],
      ["賣方契約金額", row.sell_amount, ""]
    ];
    return `<section class="mobile-group">${cards.map(([label, value, extraClass]) => (
      `<article class="mobile-stat ${extraClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatDisplayValue(value))}</strong></article>`
    )).join("")}</section>`;
  }).join("");
}

function formatDateForTitle(date) {
  return date ? String(date).replaceAll("-", "/") : "PC Ratio";
}

function formatSourceDate(payload) {
  if (payload.selected_dates?.length > 1) {
    return isCompactLayout() ? `${payload.selected_dates[0]} 等 ${payload.selected_dates.length} 日` : payload.selected_dates.join(" ~ ");
  }
  return payload.date || "-";
}

function formatDisplayValue(value, valueType = "") {
  if (typeof value !== "number") return value ?? "-";
  const suffix = String(valueType).includes("ratio") ? "%" : "";
  return `${formatNumber(value)}${suffix}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isCompactLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initInstallHint() {
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(platform) || /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!CriOS|FxiOS|EdgiOS|OPiOS).)*Safari/i.test(userAgent);
  const dismissed = localStorage.getItem("optionPwaInstallHintDismissed") === "1";

  if (elements.installHint && isIOS && isSafari && !isStandalone && !dismissed) {
    elements.installHint.hidden = false;
    document.body.classList.add("has-install-hint");
  }

  elements.installHintClose?.addEventListener("click", () => {
    localStorage.setItem("optionPwaInstallHintDismissed", "1");
    elements.installHint.hidden = true;
    document.body.classList.remove("has-install-hint");
  });
}

async function syncKeyPanel(errorMessage = "") {
  if (!elements.keyPanel) return;
  const device = await getDeviceState();
  const endpoint = window.OptionPwaConfig?.encryptedDataEndpoint || "";
  const endpointReady = endpoint && !endpoint.includes("REPLACE_WITH");
  elements.createKeyButton.hidden = device.hasKey;
  elements.showRegistrationButton.hidden = !device.hasKey;
  elements.clearKeyButton.hidden = !device.hasKey;
  elements.keyPanelTitle.textContent = device.hasKey ? "手機金鑰已建立" : "手機金鑰尚未建立";
  if (!endpointReady) {
    elements.keyPanelStatus.textContent = "尚未設定 Apps Script 資料來源";
    return;
  }
  if (!device.hasKey) {
    elements.keyPanelStatus.textContent = "建立金鑰後，將註冊碼加入 Mac mini recipient 設定";
    return;
  }
  elements.keyPanelStatus.textContent = errorMessage
    ? errorMessage
    : `Device ${device.deviceId.slice(0, 8)} / ${device.createdAt.slice(0, 10)}`;
}

async function showRegistrationCode(code) {
  if (!elements.registrationCode) return;
  elements.registrationCode.value = code;
  elements.registrationCode.hidden = false;
  elements.registrationCode.focus();
  elements.registrationCode.select();
  try {
    await navigator.clipboard.writeText(code);
    elements.keyPanelStatus.textContent = "註冊碼已複製";
  } catch {
    elements.keyPanelStatus.textContent = "註冊碼已顯示";
  }
}
