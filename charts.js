/**
 * ElectraGuard — Charts Module
 * 
 * Manages all Chart.js visualizations with a consistent dark theme.
 */

class ChartManager {
    constructor() {
        this.charts = {};
        this.initDefaults();
    }

    initDefaults() {
        Chart.defaults.color = '#8892a8';
        Chart.defaults.borderColor = 'rgba(0, 212, 255, 0.06)';
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.plugins.legend.labels.usePointStyle = true;
        Chart.defaults.plugins.legend.labels.pointStyleWidth = 10;
        Chart.defaults.plugins.legend.labels.padding = 16;
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10, 14, 30, 0.95)';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(0, 212, 255, 0.2)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
        Chart.defaults.scale.grid = { color: 'rgba(0, 212, 255, 0.04)' };
    }

    destroyAll() {
        Object.values(this.charts).forEach(chart => chart.destroy());
        this.charts = {};
    }

    /**
     * Consumption Distribution — Bar/Line
     */
    renderConsumptionChart(results, type = 'bar') {
        const ctx = document.getElementById('consumptionChart');
        if (!ctx) return;

        if (this.charts.consumption) this.charts.consumption.destroy();

        // Group by region
        const regionData = {};
        results.forEach(r => {
            if (!regionData[r.region]) regionData[r.region] = { total: 0, count: 0, suspicious: 0 };
            regionData[r.region].total += r.consumption;
            regionData[r.region].count++;
            if (r.riskLevel === 'critical' || r.riskLevel === 'high') regionData[r.region].suspicious++;
        });

        const labels = Object.keys(regionData);
        const avgConsumption = labels.map(l => Math.round(regionData[l].total / regionData[l].count));
        const suspiciousCounts = labels.map(l => regionData[l].suspicious);

        this.charts.consumption = new Chart(ctx, {
            type,
            data: {
                labels,
                datasets: [
                    {
                        label: 'Avg Consumption (kWh)',
                        data: avgConsumption,
                        backgroundColor: type === 'bar' 
                            ? avgConsumption.map(() => 'rgba(0, 212, 255, 0.25)')
                            : 'rgba(0, 212, 255, 0.1)',
                        borderColor: '#00d4ff',
                        borderWidth: type === 'bar' ? 1 : 2,
                        borderRadius: type === 'bar' ? 6 : 0,
                        fill: type === 'line',
                        tension: 0.4,
                        pointBackgroundColor: '#00d4ff',
                        pointBorderColor: '#00d4ff',
                        pointRadius: type === 'line' ? 4 : 0,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Suspicious Cases',
                        data: suspiciousCounts,
                        backgroundColor: type === 'bar' 
                            ? 'rgba(239, 68, 68, 0.3)' 
                            : 'rgba(239, 68, 68, 0.1)',
                        borderColor: '#ef4444',
                        borderWidth: type === 'bar' ? 1 : 2,
                        borderRadius: type === 'bar' ? 6 : 0,
                        fill: type === 'line',
                        tension: 0.4,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#ef4444',
                        pointRadius: type === 'line' ? 4 : 0,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Avg kWh' },
                        beginAtZero: true
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Suspicious' },
                        beginAtZero: true,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    /**
     * Risk Distribution — Doughnut
     */
    renderRiskPie(summary) {
        const ctx = document.getElementById('riskPieChart');
        if (!ctx) return;

        if (this.charts.riskPie) this.charts.riskPie.destroy();

        this.charts.riskPie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low', 'Normal'],
                datasets: [{
                    data: [summary.critical, summary.high, summary.medium, summary.low, summary.normal],
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(249, 115, 22, 0.8)',
                        'rgba(245, 158, 11, 0.7)',
                        'rgba(59, 130, 246, 0.6)',
                        'rgba(16, 185, 129, 0.6)'
                    ],
                    borderColor: [
                        '#ef4444',
                        '#f97316',
                        '#f59e0b',
                        '#3b82f6',
                        '#10b981'
                    ],
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 12 }
                    }
                }
            }
        });
    }

    /**
     * Anomaly Scatter Plot — Consumption vs Risk Score
     */
    renderAnomalyScatter(results) {
        const ctx = document.getElementById('anomalyScatter');
        if (!ctx) return;

        if (this.charts.anomalyScatter) this.charts.anomalyScatter.destroy();

        const colorMap = {
            critical: 'rgba(239, 68, 68, 0.8)',
            high: 'rgba(249, 115, 22, 0.7)',
            medium: 'rgba(245, 158, 11, 0.6)',
            low: 'rgba(59, 130, 246, 0.5)',
            normal: 'rgba(16, 185, 129, 0.4)'
        };

        const datasets = ['critical', 'high', 'medium', 'low', 'normal'].map(level => ({
            label: level.charAt(0).toUpperCase() + level.slice(1),
            data: results.filter(r => r.riskLevel === level).map(r => ({
                x: r.consumption,
                y: r.riskScore,
                id: r.id
            })),
            backgroundColor: colorMap[level],
            borderColor: colorMap[level],
            pointRadius: level === 'critical' ? 6 : level === 'high' ? 5 : 4,
            pointHoverRadius: 8
        }));

        this.charts.anomalyScatter = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 10 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.id}: ${ctx.raw.x} kWh, Score: ${ctx.raw.y}`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Consumption (kWh)' } },
                    y: { title: { display: true, text: 'Risk Score' }, min: 0, max: 100 }
                }
            }
        });
    }

    /**
     * Loss Breakdown — Doughnut
     */
    renderLossChart(summary, results) {
        const ctx = document.getElementById('lossChart');
        if (!ctx) return;

        if (this.charts.lossChart) this.charts.lossChart.destroy();

        const normalConsumption = results
            .filter(r => r.riskLevel === 'normal' || r.riskLevel === 'low')
            .reduce((s, r) => s + r.consumption, 0);

        const suspiciousConsumption = results
            .filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high')
            .reduce((s, r) => s + r.consumption, 0);

        const estimatedLoss = parseFloat(summary.estimatedLoss);

        this.charts.lossChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Normal Usage', 'Suspicious Usage', 'Estimated Loss'],
                datasets: [{
                    data: [Math.round(normalConsumption), Math.round(suspiciousConsumption), Math.round(estimatedLoss)],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.6)',
                        'rgba(245, 158, 11, 0.7)',
                        'rgba(239, 68, 68, 0.8)'
                    ],
                    borderColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 12 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.parsed.toLocaleString()} kWh`
                        }
                    }
                }
            }
        });
    }

    /**
     * Consumption Histogram
     */
    renderHistogram(results) {
        const ctx = document.getElementById('histogramChart');
        if (!ctx) return;

        if (this.charts.histogram) this.charts.histogram.destroy();

        const consumptions = results.map(r => r.consumption).filter(c => c > 0);
        if (consumptions.length === 0) return;

        const min = Math.min(...consumptions);
        const max = Math.max(...consumptions);
        const binCount = 15;
        const binWidth = (max - min) / binCount;

        const bins = Array(binCount).fill(0);
        const binLabels = [];
        
        for (let i = 0; i < binCount; i++) {
            const low = Math.round(min + i * binWidth);
            const high = Math.round(min + (i + 1) * binWidth);
            binLabels.push(`${low}-${high}`);
        }

        consumptions.forEach(c => {
            let idx = Math.floor((c - min) / binWidth);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
        });

        this.charts.histogram = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: binLabels,
                datasets: [{
                    label: 'Consumers',
                    data: bins,
                    backgroundColor: bins.map((_, i) => {
                        const ratio = i / binCount;
                        if (ratio < 0.15) return 'rgba(239, 68, 68, 0.5)';
                        return 'rgba(0, 212, 255, 0.25)';
                    }),
                    borderColor: bins.map((_, i) => {
                        const ratio = i / binCount;
                        if (ratio < 0.15) return '#ef4444';
                        return '#00d4ff';
                    }),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Consumption Range (kWh)' },
                        ticks: { maxRotation: 45, minRotation: 45, font: { size: 10 } }
                    },
                    y: {
                        title: { display: true, text: 'Count' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Risk Score Distribution — Analytics page
     */
    renderRiskScoreChart(results) {
        const ctx = document.getElementById('riskScoreChart');
        if (!ctx) return;

        if (this.charts.riskScore) this.charts.riskScore.destroy();

        // Group by score ranges
        const ranges = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];
        const counts = ranges.map((_, i) => {
            const lo = i * 10;
            const hi = (i + 1) * 10;
            return results.filter(r => r.riskScore >= lo && r.riskScore < hi).length;
        });
        // Handle score=100
        counts[9] += results.filter(r => r.riskScore === 100).length;

        const getColor = (i) => {
            if (i >= 7) return { bg: 'rgba(239, 68, 68, 0.5)', border: '#ef4444' };
            if (i >= 5) return { bg: 'rgba(249, 115, 22, 0.4)', border: '#f97316' };
            if (i >= 3) return { bg: 'rgba(245, 158, 11, 0.35)', border: '#f59e0b' };
            if (i >= 1) return { bg: 'rgba(59, 130, 246, 0.3)', border: '#3b82f6' };
            return { bg: 'rgba(16, 185, 129, 0.3)', border: '#10b981' };
        };

        this.charts.riskScore = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ranges,
                datasets: [{
                    label: 'Consumers',
                    data: counts,
                    backgroundColor: ranges.map((_, i) => getColor(i).bg),
                    borderColor: ranges.map((_, i) => getColor(i).border),
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { title: { display: true, text: 'Risk Score Range' } },
                    y: { title: { display: true, text: 'Consumer Count' }, beginAtZero: true }
                }
            }
        });
    }

    /**
     * Top 10 Suspicious — Horizontal Bar
     */
    renderTopSuspicious(results) {
        const ctx = document.getElementById('topSuspiciousChart');
        if (!ctx) return;

        if (this.charts.topSuspicious) this.charts.topSuspicious.destroy();

        const top10 = results.filter(r => r.riskScore > 0).slice(0, 10);

        this.charts.topSuspicious = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(r => r.id),
                datasets: [{
                    label: 'Risk Score',
                    data: top10.map(r => r.riskScore),
                    backgroundColor: top10.map(r => {
                        if (r.riskLevel === 'critical') return 'rgba(239, 68, 68, 0.6)';
                        if (r.riskLevel === 'high') return 'rgba(249, 115, 22, 0.5)';
                        if (r.riskLevel === 'medium') return 'rgba(245, 158, 11, 0.4)';
                        return 'rgba(59, 130, 246, 0.4)';
                    }),
                    borderColor: top10.map(r => {
                        if (r.riskLevel === 'critical') return '#ef4444';
                        if (r.riskLevel === 'high') return '#f97316';
                        if (r.riskLevel === 'medium') return '#f59e0b';
                        return '#3b82f6';
                    }),
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterLabel: (ctx) => {
                                const item = top10[ctx.dataIndex];
                                return `Consumption: ${item.consumption} kWh\nFlags: ${item.flags.join(', ')}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Risk Score' }, min: 0, max: 100 },
                    y: { ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } } }
                }
            }
        });
    }

    /**
     * Render all dashboard charts
     */
    renderAll(results, summary) {
        this.renderConsumptionChart(results, 'bar');
        this.renderRiskPie(summary);
        this.renderAnomalyScatter(results);
        this.renderLossChart(summary, results);
        this.renderHistogram(results);
        this.renderRiskScoreChart(results);
        this.renderTopSuspicious(results);
    }
}

// Chart type switcher
function switchChartType(chartId, type, btn) {
    if (!window.chartManager) return;
    
    // Update active button
    btn.parentElement.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (chartId === 'consumptionChart') {
        window.chartManager.renderConsumptionChart(window.currentResults, type);
    }
}

window.ChartManager = ChartManager;
