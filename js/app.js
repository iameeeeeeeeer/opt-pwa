import { renderChart } from "./charts.js";
import {
  clearDeviceKey,
  clearPayloadCache,
  createDeviceRegistrationCode,
  getDeviceRegistrationCode,
  getDeviceState,
  getStatusPayload,
  getLayoutConfig,
  getViewPayload
} from "./crypto-data.js";

let layoutConfig = null;
let viewList = [];
let viewMap = new Map();

const state = {
  view: "",
  payload: null,
  rows: [],
  selectedColumns: [],
  filters: {},
  selectedMetric: "",
  selectedThreshold: "",
  sortKey: null,
  sortDir: "asc",
  statusText: ""
};

const elements = {
  appTitle: document.getElementById("appTitle"),
  statusLine: document.getElementById("statusLine"),
  refreshButton: document.getElementById("refreshButton"),
  toolbar: document.querySelector(".toolbar"),
  tabs: document.querySelector(".tabs"),
  filterToggle: document.getElementById("filterToggle"),
  secondaryControls: document.getElementById("secondaryControls"),
  dateControl: document.querySelector(".date-control"),
  dateControlLabel: document.getElementById("dateControlLabel"),
  dateSelect: document.getElementById("dateSelect"),
  primaryControl: document.getElementById("primaryControl"),
  primaryControlLabel: document.getElementById("primaryControlLabel"),
  primarySelect: document.getElementById("primarySelect"),
  secondaryControlA: document.getElementById("secondaryControlA"),
  secondaryControlALabel: document.getElementById("secondaryControlALabel"),
  secondarySelectA: document.getElementById("secondarySelectA"),
  secondaryControlB: document.getElementById("secondaryControlB"),
  secondaryControlBLabel: document.getElementById("secondaryControlBLabel"),
  secondarySelectB: document.getElementById("secondarySelectB"),
  tertiaryControl: document.getElementById("tertiaryControl"),
  tertiaryControlLabel: document.getElementById("tertiaryControlLabel"),
  tertiarySelect: document.getElementById("tertiarySelect"),
  choiceControl: document.getElementById("choiceControl"),
  choiceControlLabel: document.getElementById("choiceControlLabel"),
  choiceSelect: document.getElementById("choiceSelect"),
  metricControl: document.getElementById("metricControl"),
  metricControlLabel: document.getElementById("metricControlLabel"),
  metricSelect: document.getElementById("metricSelect"),
  thresholdControl: document.getElementById("thresholdControl"),
  thresholdControlLabel: document.getElementById("thresholdControlLabel"),
  thresholdSelect: document.getElementById("thresholdSelect"),
  columnControl: document.getElementById("columnControl"),
  columnControlLabel: document.getElementById("columnControlLabel"),
  columnSelect: document.getElementById("columnSelect"),
  searchControlLabel: document.getElementById("searchControlLabel"),
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
  mobilePrimaryDetail: document.getElementById("mobilePrimaryDetail"),
  mobileGroupedDetail: document.getElementById("mobileGroupedDetail"),
  chart: document.getElementById("chart"),
  table: document.getElementById("dataTable")
};

elements.refreshButton.addEventListener("click", () => {
  clearPayloadCache();
  layoutConfig = null;
  viewList = [];
  viewMap = new Map();
  loadApp();
});

elements.filterToggle?.addEventListener("click", () => {
  const expanded = !elements.toolbar.classList.contains("is-expanded");
  elements.toolbar.classList.toggle("is-expanded", expanded);
  elements.filterToggle.setAttribute("aria-expanded", String(expanded));
});

elements.dateSelect.addEventListener("change", () => loadView(elements.dateSelect.value));
elements.primarySelect?.addEventListener("change", () => {
  setFilter(getViewConfig()?.primary_filter?.field, elements.primarySelect.value);
  render();
});
elements.secondarySelectA?.addEventListener("change", () => {
  setFilter(getViewConfig()?.secondary_filters?.[0]?.field, elements.secondarySelectA.value);
  render();
});
elements.secondarySelectB?.addEventListener("change", () => {
  setFilter(getViewConfig()?.secondary_filters?.[1]?.field, elements.secondarySelectB.value);
  render();
});
elements.tertiarySelect?.addEventListener("change", () => {
  setFilter(getViewConfig()?.tertiary_filter?.field, elements.tertiarySelect.value);
  render();
});
elements.choiceSelect?.addEventListener("change", () => {
  setFilter(getViewConfig()?.choice_filter?.field, elements.choiceSelect.value);
  render();
});
elements.metricSelect?.addEventListener("change", () => {
  state.selectedMetric = elements.metricSelect.value;
  render();
});
elements.thresholdSelect?.addEventListener("change", () => {
  state.selectedThreshold = elements.thresholdSelect.value;
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
  navigator.serviceWorker
    .register(new URL("../sw.js", import.meta.url), { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(() => {});
}

initInstallHint();
syncKeyPanel();
loadApp();

async function loadApp() {
  elements.offlineBanner.hidden = true;
  try {
    await loadLayoutConfig();
    await loadStatus();
    await loadView();
  } catch (error) {
    elements.offlineBanner.hidden = false;
    elements.statusLine.textContent = error.message;
    await syncKeyPanel(error.message);
  }
}

async function loadLayoutConfig() {
  layoutConfig = await getLayoutConfig();
  viewList = layoutConfig.views || [];
  viewMap = new Map(viewList.map(view => [view.id, view]));
  if (!state.view || !viewMap.has(state.view)) {
    state.view = layoutConfig.default_view || viewList[0]?.id || "";
  }
  syncTabs();
  syncStaticLabels();
}

async function loadStatus() {
  try {
    const status = await getStatusPayload();
    const version = status.v || {};
    const segments = layoutConfig?.status_segments || [];
    state.statusText = segments.length
      ? segments.map(segment => `${segment.label} ${version[segment.version_key] || "-"}`).join(" / ")
      : "";
    syncHeader();
  } catch (error) {
    state.statusText = "狀態暫不可用";
    elements.statusLine.textContent = "狀態暫不可用";
    await syncKeyPanel(error.message);
  }
}

async function loadView(dateOverride) {
  const view = getViewConfig();
  if (!view) return;
  const date = dateOverride || defaultDateForView(view);
  syncViewControls();
  elements.offlineBanner.hidden = true;
  try {
    const payload = await getViewPayload(view.id, date);
    state.payload = payload;
    state.rows = payload.r || [];
    syncDateSelect(payload, date, view);
    syncPrimarySelect(view);
    syncSecondarySelects(view);
    syncTertiarySelect(view);
    syncChoiceSelect(view);
    syncMetricSelect(view);
    syncThresholdSelect(view);
    syncColumnSelect(view);
    render();
  } catch (error) {
    elements.offlineBanner.hidden = false;
    elements.statusLine.textContent = `資料錯誤: ${error.message}`;
    await syncKeyPanel(error.message);
  }
}

function syncTabs() {
  if (!elements.tabs) return;
  elements.tabs.innerHTML = viewList.map((view, index) => (
    `<button class="tab ${view.id === state.view ? "is-active" : ""}" data-k="${escapeHtml(view.id)}" type="button">${escapeHtml(view.label || `Item ${index + 1}`)}</button>`
  )).join("");
  elements.tabs.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.k;
      state.sortKey = null;
      state.selectedColumns = [];
      state.filters = {};
      state.selectedMetric = "";
      state.selectedThreshold = "";
      syncTabs();
      loadView();
    });
  });
}

function syncStaticLabels() {
  elements.refreshButton.textContent = isCompactLayout() ? "更新" : "Refresh";
  if (elements.dateControlLabel) elements.dateControlLabel.textContent = "日期";
  if (elements.columnControlLabel) elements.columnControlLabel.textContent = "欄位";
  if (elements.searchControlLabel) elements.searchControlLabel.textContent = "搜尋";
}

function syncDateSelect(payload, selectedValue, view) {
  const dates = payload.a || [];
  const selectedDates = payload.s || [];
  const exactDatesOnly = Boolean(view.exact_dates_compact && isCompactLayout());
  const options = [];
  if (!exactDatesOnly && view.default_date !== "latest") {
    options.push({ value: view.default_date, label: "最新 5 日" });
  }
  if (!exactDatesOnly) {
    options.push({ value: "latest", label: "最新日期" });
  }
  dates.slice(0, 40).forEach(date => options.push({ value: date, label: date }));
  elements.dateSelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  const exactDateValue = payload.d || selectedDates[0] || dates[0] || selectedValue;
  const value = exactDatesOnly
    ? (dates.includes(selectedValue) ? selectedValue : exactDateValue)
    : (selectedValue === view.default_date && selectedDates.length <= 1 ? "latest" : selectedValue);
  elements.dateSelect.value = options.some(option => option.value === value) ? value : options[0]?.value || "";
}

function syncPrimarySelect(view) {
  const filter = view.primary_filter;
  if (!filter || !elements.primarySelect) return;
  setControlLabel(elements.primaryControlLabel, filter.label);
  const compact = isCompactLayout();
  const rows = filter.sort_field
    ? [...state.rows].sort((a, b) => Number(b[filter.sort_field] || 0) - Number(a[filter.sort_field] || 0))
    : state.rows;
  const values = uniqueValues(rows, filter.field);
  const options = compact
    ? values.map(value => ({ value, label: value }))
    : [{ value: filter.all_value || "all", label: filter.all_label || "全部" }, ...values.map(value => ({ value, label: value }))];
  syncSelect(elements.primarySelect, options, filter.field, compact ? options[0]?.value : filter.all_value || "all");
}

function syncSecondarySelects(view) {
  syncConfiguredSelect(view.secondary_filters?.[0], elements.secondarySelectA, elements.secondaryControlALabel, false);
  syncConfiguredSelect(view.secondary_filters?.[1], elements.secondarySelectB, elements.secondaryControlBLabel, false);
}

function syncTertiarySelect(view) {
  const filter = view.tertiary_filter;
  if (!filter || !elements.tertiarySelect) return;
  setControlLabel(elements.tertiaryControlLabel, filter.label);
  const values = uniqueValues(state.rows, filter.field).sort(compareConfiguredValues);
  syncSelect(elements.tertiarySelect, values.map(value => ({ value, label: value })), filter.field, values[0] || "");
}

function syncChoiceSelect(view) {
  const filter = view.choice_filter;
  if (!filter || !elements.choiceSelect) return;
  setControlLabel(elements.choiceControlLabel, filter.label);
  syncSelect(elements.choiceSelect, filter.options || [], filter.field, filter.default || filter.options?.[0]?.value || "");
}

function syncMetricSelect(view) {
  const filter = view.metric_filter;
  if (!filter || !elements.metricSelect) return;
  setControlLabel(elements.metricControlLabel, filter.label || "圖形指標");
  elements.metricSelect.innerHTML = (filter.options || [])
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (!(filter.options || []).some(option => option.value === state.selectedMetric)) {
    state.selectedMetric = filter.default || filter.options?.[0]?.value || "";
  }
  elements.metricSelect.value = state.selectedMetric;
}

function syncThresholdSelect(view) {
  const filter = view.threshold_filter;
  if (!filter || !elements.thresholdSelect) return;
  setControlLabel(elements.thresholdControlLabel, filter.label || "顯示門檻");
  elements.thresholdSelect.innerHTML = (filter.options || [])
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  if (!(filter.options || []).some(option => option.value === state.selectedThreshold)) {
    state.selectedThreshold = filter.default || filter.options?.[0]?.value || "";
  }
  elements.thresholdSelect.value = state.selectedThreshold;
}

function syncConfiguredSelect(filter, select, labelNode, includeAll) {
  if (!filter || !select) return;
  setControlLabel(labelNode, filter.label);
  const values = uniqueValues(state.rows, filter.field, filter.preferred_order);
  const options = [
    ...(includeAll ? [{ value: "all", label: "全部" }] : []),
    ...values.map(value => ({ value, label: value }))
  ];
  syncSelect(select, options, filter.field, includeAll ? "all" : options[0]?.value || "");
}

function syncSelect(select, options, field, fallbackValue) {
  select.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  const currentValue = state.filters[field];
  if (!options.some(option => option.value === currentValue)) {
    setFilter(field, fallbackValue || options[0]?.value || "");
  }
  select.value = state.filters[field] || "";
}

function syncColumnSelect(view) {
  const columns = columnsForRows(state.rows);
  if (isCompactLayout() && view.fixed_compact_columns) {
    state.selectedColumns = view.fixed_compact_columns.filter(column => columns.includes(column));
  }
  if (!state.selectedColumns.length && isCompactLayout()) {
    state.selectedColumns = view.mobile_default_columns?.filter(column => columns.includes(column)) || columns;
  }
  if (!state.selectedColumns.length) state.selectedColumns = columns;
  elements.columnSelect.innerHTML = columns
    .map(column => `<option value="${escapeHtml(column)}" ${state.selectedColumns.includes(column) ? "selected" : ""}>${escapeHtml(labelForColumn(view, column))}</option>`)
    .join("");
}

function render() {
  const view = getViewConfig();
  const payload = state.payload || {};
  if (!view) return;
  let rows = applyViewFilters(view, [...state.rows]);
  const query = elements.searchInput.value.trim().toLowerCase();
  if (query) {
    rows = rows.filter(row => Object.values(row).some(value => String(value ?? "").toLowerCase().includes(query)));
  }
  if (state.sortKey) {
    rows.sort((a, b) => compareValues(a[state.sortKey], b[state.sortKey]) * (state.sortDir === "asc" ? 1 : -1));
  }

  elements.rowCount.textContent = rows.length.toLocaleString();
  elements.sourceDate.textContent = formatSourceDate(payload);
  elements.sourceName.textContent = basename(payload.o || "-");
  renderTable(view, rows);
  renderMobileDetails(view, rows);
  renderChart(elements.chart, view, rows, { metric: state.selectedMetric });
  syncHeader(payload);
}

function applyViewFilters(view, rows) {
  if (view.primary_filter?.sort_field && isCompactLayout()) {
    rows.sort((a, b) => Number(b[view.primary_filter.sort_field] || 0) - Number(a[view.primary_filter.sort_field] || 0));
  }
  rows = applyFieldFilter(rows, view.primary_filter?.field, view.primary_filter?.all_value || "all");
  (view.secondary_filters || []).forEach(filter => {
    rows = applyFieldFilter(rows, filter.field, "all");
  });
  rows = applyFieldFilter(rows, view.tertiary_filter?.field, "all");
  rows = applyFieldFilter(rows, view.choice_filter?.field, "all");
  if (view.threshold_filter && isCompactLayout()) {
    rows = applyThreshold(rows, view.threshold_filter);
  }
  return rows;
}

function applyFieldFilter(rows, field, allValue) {
  if (!field) return rows;
  const value = state.filters[field];
  if (!value || value === allValue) return rows;
  return rows.filter(row => row[field] === value);
}

function applyThreshold(rows, filter) {
  const option = optionByValue(filter.options, state.selectedThreshold) || optionByValue(filter.options, filter.default);
  if (!option || option.value === "all") return rows;
  const conditions = option.conditions || [];
  const filtered = rows.filter(row => conditions.some(condition => (
    Math.abs(Number(row[condition.field] || 0)) >= Number(condition.min_abs || 0)
  )));
  return filtered.length ? filtered : rows.slice(0, Number(option.fallback || 0) || rows.length);
}

function renderTable(view, rows) {
  const columns = state.selectedColumns.length ? state.selectedColumns : columnsForRows(rows);
  elements.table.tHead.innerHTML = `<tr>${columns.map(column => `<th data-key="${escapeHtml(column)}">${escapeHtml(labelForColumn(view, column))}${sortMarker(column)}</th>`).join("")}</tr>`;
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

function renderMobileDetails(view, rows) {
  if (elements.mobilePrimaryDetail) {
    const showPrimary = view.mobile_layout === "primary_cards" && isCompactLayout() && rows[0];
    elements.mobilePrimaryDetail.hidden = !showPrimary;
    elements.mobilePrimaryDetail.innerHTML = showPrimary ? mobileCardsHtml(view.mobile_cards || [], rows[0]) : "";
  }
  if (elements.mobileGroupedDetail) {
    const showGrouped = view.mobile_layout === "grouped_cards" && isCompactLayout() && rows.length;
    elements.mobileGroupedDetail.hidden = !showGrouped;
    elements.mobileGroupedDetail.innerHTML = showGrouped
      ? rows.map(row => `<section class="mobile-group">${mobileCardsHtml(view.mobile_cards || [], row)}</section>`).join("")
      : "";
  }
}

function mobileCardsHtml(cards, row) {
  return cards.map(card => (
    `<article class="mobile-stat ${escapeHtml(card.class || "")}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(formatDisplayValue(row[card.field], card.class || ""))}</strong></article>`
  )).join("");
}

function syncViewControls() {
  const view = getViewConfig();
  const compact = isCompactLayout();
  if (!view) return;
  document.body.dataset.view = view.id;
  document.body.dataset.layout = compact ? view.mobile_layout || "compact" : "full";
  setHidden(elements.dateControl, compact && view.hide_date_compact);
  setHidden(elements.primaryControl, !view.primary_filter);
  setHidden(elements.secondaryControlA, !view.secondary_filters?.[0]);
  setHidden(elements.secondaryControlB, !view.secondary_filters?.[1]);
  setHidden(elements.tertiaryControl, !view.tertiary_filter);
  setHidden(elements.choiceControl, !view.choice_filter);
  setHidden(elements.metricControl, !view.metric_filter);
  setHidden(elements.thresholdControl, !view.threshold_filter);
  setHidden(elements.columnControl, compact && (view.hide_table_compact || view.mobile_layout));
  if (compact && (view.hide_table_compact || view.mobile_layout)) {
    elements.toolbar?.classList.remove("is-expanded");
    elements.filterToggle?.setAttribute("aria-expanded", "false");
  }
}

function syncHeader(payload = state.payload) {
  const view = getViewConfig();
  const compact = isCompactLayout();
  if (compact && view) {
    elements.appTitle.textContent = formatDateForTitle(payload?.d);
    const filterText = activeFilterLabels(view).join(" / ");
    elements.statusLine.textContent = filterText ? `${view.label} / ${filterText}` : view.label;
    elements.refreshButton.textContent = "更新";
  } else {
    elements.appTitle.textContent = layoutConfig?.app_title || "Mobile Viewer";
    elements.statusLine.textContent = state.statusText || elements.statusLine.textContent;
    elements.refreshButton.textContent = "Refresh";
  }
}

function activeFilterLabels(view) {
  const labels = [];
  const primary = view.primary_filter;
  if (primary && state.filters[primary.field] && state.filters[primary.field] !== (primary.all_value || "all")) {
    labels.push(state.filters[primary.field]);
  }
  (view.secondary_filters || []).forEach(filter => {
    if (state.filters[filter.field]) labels.push(state.filters[filter.field]);
  });
  if (view.tertiary_filter && state.filters[view.tertiary_filter.field]) labels.push(state.filters[view.tertiary_filter.field]);
  if (view.choice_filter && state.filters[view.choice_filter.field]) {
    labels.push(labelForOption(view.choice_filter.options, state.filters[view.choice_filter.field]));
  }
  return labels.filter(Boolean);
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

function uniqueValues(rows, field, preferredOrder = []) {
  const values = new Set(rows.map(row => row[field]).filter(Boolean));
  const preferred = preferredOrder.filter(value => values.has(value));
  const remaining = [...values].filter(value => !preferred.includes(value));
  return [...preferred, ...remaining];
}

function defaultDateForView(view) {
  return isCompactLayout() ? view.compact_date || view.default_date || "latest" : view.default_date || "latest";
}

function getViewConfig() {
  return viewMap.get(state.view);
}

function setFilter(field, value) {
  if (!field) return;
  state.filters[field] = value;
}

function setHidden(element, hidden) {
  if (element) element.hidden = Boolean(hidden);
}

function setControlLabel(element, value) {
  if (element) element.textContent = value || "";
}

function labelForColumn(view, column) {
  return view.columns?.[column] || column;
}

function labelForOption(options = [], value) {
  return optionByValue(options, value)?.label || value;
}

function optionByValue(options = [], value) {
  return options.find(option => option.value === value);
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

function compareConfiguredValues(a, b) {
  const parsedA = parseSortablePrefix(a);
  const parsedB = parseSortablePrefix(b);
  if (parsedA.number !== parsedB.number) return parsedA.number - parsedB.number;
  if (parsedA.rank !== parsedB.rank) return parsedA.rank - parsedB.rank;
  return parsedA.suffix.localeCompare(parsedB.suffix, "zh-Hant", { numeric: true });
}

function parseSortablePrefix(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d+)(.*)$/);
  const suffix = match?.[2] || "";
  const suffixRank = suffix.startsWith("W") ? 1 : suffix.startsWith("F") ? 2 : suffix ? 3 : 0;
  return {
    number: Number(match?.[1] || Number.MAX_SAFE_INTEGER),
    rank: suffixRank,
    suffix
  };
}

function basename(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1] || path;
}

function formatDateForTitle(date) {
  return date ? String(date).replaceAll("-", "/") : layoutConfig?.app_title || "Mobile Viewer";
}

function formatSourceDate(payload) {
  if (payload.s?.length > 1) {
    return isCompactLayout() ? `${payload.s[0]} 等 ${payload.s.length} 日` : payload.s.join(" ~ ");
  }
  return payload.d || "-";
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
  const dismissed = localStorage.getItem("staticViewerInstallHintDismissed") === "1";

  if (elements.installHint && isIOS && isSafari && !isStandalone && !dismissed) {
    elements.installHint.hidden = false;
    document.body.classList.add("has-install-hint");
  }

  elements.installHintClose?.addEventListener("click", () => {
    localStorage.setItem("staticViewerInstallHintDismissed", "1");
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
  elements.keyPanelTitle.textContent = device.hasKey ? "裝置已建立" : "裝置尚未建立";
  if (!endpointReady) {
    elements.keyPanelStatus.textContent = "尚未設定資料來源";
    return;
  }
  if (!device.hasKey) {
    elements.keyPanelStatus.textContent = "建立裝置後，將註冊碼加入同步設定";
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
