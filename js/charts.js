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
    : lineByGroupOption(viewConfig, rows, compact);
  chart.setOption(option, true);
  chart.resize();
  if (!container.dataset.resizeObserverAttached) {
    new ResizeObserver(() => chart.resize()).observe(container);
    container.dataset.resizeObserverAttached = "1";
  }
}

function lineByGroupOption(viewConfig, rows, compact) {
  const chartConfig = viewConfig.chart;
  const groupField = chartConfig.group_field;
  const xField = chartConfig.x_field;
  const yField = chartConfig.y_field;
  const limit = compact ? chartConfig.compact_series_limit : chartConfig.series_limit;
  const groups = [...new Set(rows.map(row => row[groupField]).filter(Boolean))].slice(0, limit || 12);
  return {
    tooltip: { trigger: "axis" },
    legend: compact ? { show: false } : { top: 8, textStyle: { color: "#cbd5e1" } },
    grid: compact ? { left: 46, right: 14, top: 22, bottom: 32 } : { left: 56, right: 24, top: 56, bottom: 38 },
    xAxis: { type: "category", axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", name: compact ? "" : chartConfig.y_axis_label || "", axisLabel: { color: "#94a3b8" } },
    series: groups.map(group => ({
      name: group,
      type: "line",
      smooth: true,
      showSymbol: false,
      areaStyle: viewConfig.mobile_layout === "grouped_cards" ? { opacity: 0.12 } : undefined,
      data: rows
        .filter(row => row[groupField] === group)
        .sort((a, b) => String(a[xField]).localeCompare(String(b[xField])))
        .map(row => [row[xField], row[yField]])
    }))
  };
}

function barByCategoryOption(viewConfig, rows, compact, metric) {
  const chartConfig = viewConfig.chart;
  const metricConfig = optionByValue(viewConfig.metric_filter?.options, metric) || viewConfig.metric_filter?.options?.[0] || {};
  const dataKey = metricConfig.value;
  const categoryField = chartConfig.category_field;
  const sortField = chartConfig.sort_field || categoryField;
  const choiceField = chartConfig.choice_field;
  const ranked = rows
    .filter(row => row[categoryField] && row[dataKey] !== null)
    .sort((a, b) => Number(a[sortField] || 0) - Number(b[sortField] || 0));
  const choice = ranked[0]?.[choiceField];
  return {
    tooltip: { trigger: "axis" },
    grid: compact
      ? { left: 70, right: 16, top: 18, bottom: 28, containLabel: true }
      : { left: 88, right: 24, top: 28, bottom: 28, containLabel: true },
    xAxis: { type: "value", name: compact ? "" : metricConfig.label || "", axisLabel: { color: "#94a3b8" } },
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

function optionByValue(options = [], value) {
  return options.find(option => option.value === value);
}
