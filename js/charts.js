const HOMEWORK_METRIC_LABELS = {
  amount: "當日未平倉金額",
  oi: "當日未沖銷契約量",
  market_value_change: "金額的變化量",
  oi_change: "未沖銷的變化量"
};

export function renderChart(container, view, rows, options = {}) {
  if (!window.echarts || !container) return;
  const compact = window.matchMedia("(max-width: 860px)").matches || container.clientWidth < 640;
  if (view === "homework" && compact) {
    const height = Math.min(Math.max(rows.length * 22 + 96, 420), 3600);
    container.style.height = `${height}px`;
  } else {
    container.style.height = "";
  }
  const chart = window.echarts.getInstanceByDom(container) || window.echarts.init(container, "dark");
  const option = view === "homework"
    ? homeworkOption(rows, compact, options.homeworkMetric)
    : view === "largetrader"
      ? largeTraderOption(rows, compact)
      : pcRatioOption(rows, compact);
  chart.setOption(option, true);
  chart.resize();
  if (!container.dataset.resizeObserverAttached) {
    new ResizeObserver(() => chart.resize()).observe(container);
    container.dataset.resizeObserverAttached = "1";
  }
}

function pcRatioOption(rows, compact) {
  const expiries = [...new Set(rows.map(row => row.expiry).filter(Boolean))].slice(0, compact ? 5 : 10);
  return {
    tooltip: { trigger: "axis" },
    legend: compact ? { show: false } : { top: 8, textStyle: { color: "#cbd5e1" } },
    grid: compact ? { left: 42, right: 14, top: 22, bottom: 32 } : { left: 48, right: 24, top: 56, bottom: 38 },
    xAxis: { type: "category", axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", name: compact ? "" : "PC Ratio %", axisLabel: { color: "#94a3b8" } },
    dataset: [],
    series: expiries.map(expiry => ({
      name: expiry,
      type: "line",
      smooth: true,
      showSymbol: false,
      data: rows
        .filter(row => row.expiry === expiry)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(row => [row.date, row.pc_ratio_volume])
    }))
  };
}

function homeworkOption(rows, compact, metric = "market_value_change") {
  const metricKey = HOMEWORK_METRIC_LABELS[metric] ? metric : "market_value_change";
  const dataKey = metricKey;
  const metricLabel = HOMEWORK_METRIC_LABELS[metricKey];
  const ranked = rows
    .filter(row => row.strike && row[dataKey] !== null)
    .sort((a, b) => Number(a.strike || 0) - Number(b.strike || 0));
  const side = ranked[0]?.type;
  const usesChangeColors = dataKey.includes("change");
  return {
    tooltip: { trigger: "axis" },
    grid: compact
      ? { left: 70, right: 16, top: 18, bottom: 28, containLabel: true }
      : { left: 88, right: 24, top: 28, bottom: 28, containLabel: true },
    xAxis: { type: "value", name: compact ? "" : metricLabel, axisLabel: { color: "#94a3b8" } },
    yAxis: {
      type: "category",
      inverse: true,
      axisLabel: { color: "#94a3b8", fontSize: compact ? 10 : 12 },
      data: ranked.map(row => String(row.strike))
    },
    series: [{
      name: metricLabel,
      type: "bar",
      data: ranked.map(row => row[dataKey]),
      itemStyle: {
        color: params => {
          const value = ranked[params.dataIndex]?.[dataKey] || 0;
          if (usesChangeColors) return value >= 0 ? "#22c55e" : "#fb7185";
          return side === "C" ? "#38bdf8" : "#fb7185";
        }
      }
    }]
  };
}

function largeTraderOption(rows, compact) {
  const identities = [...new Set(rows.map(row => row.identity).filter(Boolean))];
  return {
    tooltip: { trigger: "axis" },
    legend: compact ? { show: false } : { top: 8, textStyle: { color: "#cbd5e1" } },
    grid: compact ? { left: 46, right: 14, top: 22, bottom: 32 } : { left: 56, right: 24, top: 56, bottom: 38 },
    xAxis: { type: "category", axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", name: compact ? "" : "Net OI", axisLabel: { color: "#94a3b8" } },
    series: identities.map(identity => ({
      name: identity,
      type: "line",
      smooth: true,
      areaStyle: { opacity: 0.12 },
      data: rows
        .filter(row => row.identity === identity)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(row => [row.date, row.net_oi])
    }))
  };
}
