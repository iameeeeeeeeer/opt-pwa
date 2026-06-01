export function renderChart(container, viewConfig, rows, options = {}) {
  if (!window.echarts || !container || !viewConfig?.chart) return;
  const compact = window.matchMedia("(max-width: 860px)").matches || container.clientWidth < 640;
  if (viewConfig.chart.type === "bar_by_category" && compact) {
    const height = Math.min(Math.max(rows.length * 22 + 96, 420), 3600);
    container.style.height = `${height}px`;
  } else {
    container.style.height = "";
  }
  const chart = window.echarts.getInstanceByDom(container) || window.echarts.init(container, "dark");
  const option = viewConfig.chart.type === "bar_by_category"
    ? barByCategoryOption(viewConfig, rows, compact, options.metric)
    : lineByGroupOption(viewConfig, rows, compact, options.metric);
  chart.setOption(option, true);
  chart.resize();
  if (!container.dataset.resizeObserverAttached) {
    new ResizeObserver(() => chart.resize()).observe(container);
    container.dataset.resizeObserverAttached = "1";
  }
}

function lineByGroupOption(viewConfig, rows, compact, metric) {
  const chartConfig = viewConfig.chart;
  const metricConfig = optionByValue(viewConfig.metric_filter?.options, metric) || viewConfig.metric_filter?.options?.[0] || {};
  const groupField = chartConfig.group_field;
  const xField = chartConfig.x_field;
  const yField = chartConfig.y_field === "$metric" ? metricConfig.value : chartConfig.y_field;
  const valueFormat = chartConfig.y_field === "$metric"
    ? metricConfig.value_format || chartConfig.value_format || ""
    : chartConfig.value_format || "";
  const limit = compact ? chartConfig.compact_series_limit : chartConfig.series_limit;
  const groups = [...new Set(rows.map(row => row[groupField]).filter(Boolean))].slice(0, limit || 12);
  return {
    tooltip: { trigger: "axis", valueFormatter: value => formatAxisValue(value, valueFormat) },
    legend: compact ? { show: false } : { top: 8, textStyle: { color: "#cbd5e1" } },
    grid: compact
      ? { left: 8, right: 16, top: 24, bottom: 36, containLabel: true }
      : { left: 16, right: 24, top: 58, bottom: 42, containLabel: true },
    xAxis: {
      type: "category",
      name: compact ? "" : chartConfig.x_axis_label || "",
      axisLabel: { color: "#94a3b8", hideOverlap: true, margin: 10 }
    },
    yAxis: {
      type: "value",
      name: compact ? "" : metricConfig.label || chartConfig.y_axis_label || "",
      nameTextStyle: { color: "#cbd5e1", padding: [0, 0, 0, 8] },
      axisLabel: { color: "#94a3b8", formatter: value => formatAxisValue(value, valueFormat), margin: 10 }
    },
    series: groups.map(group => ({
      name: group,
      type: "line",
      smooth: true,
      showSymbol: false,
      areaStyle: viewConfig.mobile_layout === "grouped_cards" ? { opacity: 0.12 } : undefined,
      data: rows
        .filter(row => row[groupField] === group)
        .sort((a, b) => String(a[xField]).localeCompare(String(b[xField]), "zh-Hant", { numeric: true }))
        .map(row => [row[xField], row[yField]])
    }))
  };
}

function barByCategoryOption(viewConfig, rows, compact, metric) {
  const chartConfig = viewConfig.chart;
  const metricConfig = optionByValue(viewConfig.metric_filter?.options, metric) || viewConfig.metric_filter?.options?.[0] || {};
  const dataKey = metricConfig.value;
  const valueFormat = metricConfig.value_format || chartConfig.value_format || "";
  const categoryField = chartConfig.category_field;
  const sortField = chartConfig.sort_field || categoryField;
  const choiceField = chartConfig.choice_field;
  const ranked = rows
    .filter(row => row[categoryField] && row[dataKey] !== null)
    .sort((a, b) => Number(a[sortField] || 0) - Number(b[sortField] || 0));
  const choice = ranked[0]?.[choiceField];
  return {
    tooltip: { trigger: "axis", valueFormatter: value => formatAxisValue(value, valueFormat) },
    grid: compact
      ? { left: 72, right: 16, top: 18, bottom: 34, containLabel: true }
      : { left: 88, right: 24, top: 28, bottom: 34, containLabel: true },
    xAxis: {
      type: "value",
      name: compact ? "" : metricConfig.label || "",
      axisLabel: { color: "#94a3b8", formatter: value => formatAxisValue(value, valueFormat), margin: 10 }
    },
    yAxis: {
      type: "category",
      inverse: true,
      axisLabel: { color: "#94a3b8", fontSize: compact ? 10 : 12 },
      data: ranked.map(row => String(row[categoryField]))
    },
    series: [{
      name: metricConfig.label || "",
      type: "bar",
      data: ranked.map(row => row[dataKey]),
      itemStyle: {
        color: params => {
          const value = ranked[params.dataIndex]?.[dataKey] || 0;
          if (metricConfig.color_mode === "delta") return value >= 0 ? "#22c55e" : "#fb7185";
          return choice === "C" ? "#38bdf8" : "#fb7185";
        }
      }
    }]
  };
}

function formatAxisValue(value, format) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value ?? "";
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  if (format === "twd_compact") {
    if (abs >= 100000000) return `${sign}${trimNumber(abs / 100000000, abs >= 1000000000 ? 1 : 2)}億`;
    if (abs >= 10000) return `${sign}${trimNumber(abs / 10000, abs >= 1000000 ? 0 : 1)}萬`;
  }
  if (format === "twd_wan") return `${sign}${trimNumber(abs / 10000, abs >= 1000000 ? 0 : 1)}萬`;
  if (format === "integer_compact" && abs >= 10000) return `${sign}${trimNumber(abs / 10000, 1)}萬`;
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function trimNumber(value, digits) {
  return Number(value.toFixed(digits)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function optionByValue(options = [], value) {
  return options.find(option => option.value === value);
}
