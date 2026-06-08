/**
 * ElectraGuard — Anomaly Detection Engine
 * 
 * Implements multiple detection algorithms:
 *   1. Z-Score Analysis — flags values > 2 standard deviations from mean
 *   2. IQR (Interquartile Range) — detects outliers outside 1.5*IQR
 *   3. Consumption-to-Billing Ratio — detects mismatches
 *   4. Multi-Factor Risk Scoring — composite risk score 0-100
 */

class TheftDetectionEngine {
    constructor() {
        this.data = [];
        this.results = [];
        this.stats = {};
        this.columnMap = {};
    }

    /**
     * Intelligently map spreadsheet columns to expected fields.
     * Supports flexible column naming.
     */
    mapColumns(headers) {
        const mappings = {
            id: ['consumer_id', 'consumer id', 'id', 'cust_id', 'customer_id', 'customer id', 'meter_id', 'meter id', 'account', 'acc_no', 'account_no', 'sr', 'sr_no', 'serial', 's.no', 'sno'],
            name: ['name', 'consumer_name', 'consumer name', 'customer_name', 'customer name', 'cust_name'],
            region: ['region', 'area', 'zone', 'district', 'location', 'address', 'city', 'sector', 'feeder', 'subdivision'],
            consumption: ['consumption', 'consumption_kwh', 'consumption kwh', 'kwh', 'units', 'units_consumed', 'units consumed', 'energy', 'energy_kwh', 'actual_consumption', 'meter_reading', 'reading', 'usage', 'load'],
            billing: ['billing', 'billing_amount', 'billing amount', 'bill', 'bill_amount', 'bill amount', 'amount', 'charge', 'charges', 'total_bill', 'billed_amount', 'revenue'],
            sanctioned_load: ['sanctioned_load', 'sanctioned load', 'sanc_load', 'load_sanctioned', 'contract_demand', 'contract demand', 'connected_load', 'connected load', 'max_demand', 'max demand'],
            actual_load: ['actual_load', 'actual load', 'measured_load', 'measured load', 'current_load', 'peak_load', 'peak load', 'demand'],
            meter_status: ['meter_status', 'meter status', 'status', 'meter_condition', 'meter condition', 'defective', 'faulty'],
            category: ['category', 'type', 'consumer_type', 'consumer type', 'tariff', 'tariff_type', 'connection_type', 'connection type'],
            date: ['date', 'reading_date', 'reading date', 'month', 'period', 'billing_date', 'billing date', 'bill_date'],
            previous_consumption: ['previous_consumption', 'prev_consumption', 'previous consumption', 'last_consumption', 'last consumption', 'prev_reading', 'prev_units']
        };

        const map = {};
        const normalizedHeaders = headers.map(h => h.toString().toLowerCase().trim().replace(/[^a-z0-9_ ]/g, ''));

        for (const [field, aliases] of Object.entries(mappings)) {
            const idx = normalizedHeaders.findIndex(h => aliases.includes(h));
            if (idx !== -1) {
                map[field] = headers[idx];
            }
        }

        // If no consumption found, try to find any numeric column
        if (!map.consumption) {
            // Will be handled in processData
        }

        this.columnMap = map;
        return map;
    }

    /**
     * Process raw spreadsheet data into normalized format
     */
    processData(rawData, headers) {
        this.mapColumns(headers);
        const map = this.columnMap;

        // Auto-detect numeric columns if consumption not mapped
        if (!map.consumption) {
            const numericCols = headers.filter(h => {
                const vals = rawData.slice(0, 10).map(r => parseFloat(r[h])).filter(v => !isNaN(v));
                return vals.length > 5;
            });
            if (numericCols.length > 0) {
                // Pick the column with largest values (likely consumption)
                let maxAvg = 0;
                let bestCol = numericCols[0];
                for (const col of numericCols) {
                    const avg = rawData.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0) / rawData.length;
                    if (avg > maxAvg) { maxAvg = avg; bestCol = col; }
                }
                map.consumption = bestCol;
            }
        }

        this.data = rawData.map((row, idx) => ({
            _index: idx,
            id: row[map.id] || `C-${String(idx + 1).padStart(4, '0')}`,
            name: row[map.name] || `Consumer ${idx + 1}`,
            region: row[map.region] || 'Unknown',
            consumption: parseFloat(row[map.consumption]) || 0,
            billing: parseFloat(row[map.billing]) || 0,
            sanctionedLoad: parseFloat(row[map.sanctioned_load]) || 0,
            actualLoad: parseFloat(row[map.actual_load]) || 0,
            meterStatus: row[map.meter_status] || 'OK',
            category: row[map.category] || 'General',
            date: row[map.date] || '',
            previousConsumption: parseFloat(row[map.previous_consumption]) || 0,
            _raw: row
        }));

        return this.data;
    }

    /**
     * Calculate basic statistics
     */
    calculateStats() {
        const consumptions = this.data.map(d => d.consumption).filter(c => c > 0);
        
        if (consumptions.length === 0) {
            this.stats = { mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0, iqr: 0, min: 0, max: 0 };
            return this.stats;
        }

        const sorted = [...consumptions].sort((a, b) => a - b);
        const n = sorted.length;
        
        const mean = consumptions.reduce((a, b) => a + b, 0) / n;
        const variance = consumptions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        
        const median = n % 2 === 0
            ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
            : sorted[Math.floor(n / 2)];
        
        const q1 = sorted[Math.floor(n * 0.25)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const iqr = q3 - q1;

        this.stats = {
            mean, median, stdDev, q1, q3, iqr,
            min: sorted[0],
            max: sorted[n - 1],
            total: consumptions.reduce((a, b) => a + b, 0),
            count: n
        };

        return this.stats;
    }

    /**
     * Z-Score anomaly detection
     */
    zScoreAnalysis(threshold = 2) {
        const { mean, stdDev } = this.stats;
        if (stdDev === 0) return [];
        
        return this.data.map(d => {
            const zScore = (d.consumption - mean) / stdDev;
            return {
                ...d,
                zScore: parseFloat(zScore.toFixed(3)),
                isZAnomaly: Math.abs(zScore) > threshold || (d.consumption > 0 && zScore < -threshold)
            };
        });
    }

    /**
     * IQR-based outlier detection
     */
    iqrAnalysis(multiplier = 1.5) {
        const { q1, q3, iqr } = this.stats;
        const lowerBound = q1 - multiplier * iqr;
        const upperBound = q3 + multiplier * iqr;

        return this.data.map(d => ({
            ...d,
            isIQRAnomaly: d.consumption < lowerBound || d.consumption > upperBound,
            iqrLower: parseFloat(lowerBound.toFixed(2)),
            iqrUpper: parseFloat(upperBound.toFixed(2))
        }));
    }

    /**
     * Consumption-to-billing ratio analysis
     */
    billingAnalysis() {
        if (!this.columnMap.billing) return this.data.map(d => ({ ...d, billingAnomaly: false, billingRatio: 0 }));

        const ratios = this.data
            .filter(d => d.billing > 0 && d.consumption > 0)
            .map(d => d.consumption / d.billing);
        
        if (ratios.length === 0) return this.data.map(d => ({ ...d, billingAnomaly: false, billingRatio: 0 }));

        const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const ratioStd = Math.sqrt(ratios.reduce((s, r) => s + Math.pow(r - avgRatio, 2), 0) / ratios.length);

        return this.data.map(d => {
            const ratio = d.billing > 0 ? d.consumption / d.billing : 0;
            return {
                ...d,
                billingRatio: parseFloat(ratio.toFixed(3)),
                billingAnomaly: ratioStd > 0 && Math.abs(ratio - avgRatio) > 2 * ratioStd
            };
        });
    }

    /**
     * Load analysis — compare sanctioned vs actual
     */
    loadAnalysis() {
        if (!this.columnMap.sanctioned_load) return this.data.map(d => ({ ...d, loadAnomaly: false }));

        return this.data.map(d => ({
            ...d,
            loadAnomaly: d.sanctionedLoad > 0 && d.actualLoad > d.sanctionedLoad * 1.2,
            loadRatio: d.sanctionedLoad > 0 ? parseFloat((d.actualLoad / d.sanctionedLoad).toFixed(2)) : 0
        }));
    }

    /**
     * Consumption change analysis
     */
    consumptionChangeAnalysis() {
        if (!this.columnMap.previous_consumption) return this.data.map(d => ({ ...d, suddenDrop: false, changePercent: 0 }));

        return this.data.map(d => {
            const change = d.previousConsumption > 0 
                ? ((d.consumption - d.previousConsumption) / d.previousConsumption) * 100 
                : 0;
            return {
                ...d,
                changePercent: parseFloat(change.toFixed(1)),
                suddenDrop: change < -50 // More than 50% drop
            };
        });
    }

    /**
     * Multi-factor risk scoring (0–100)
     */
    calculateRiskScores() {
        const zResults = this.zScoreAnalysis();
        const iqrResults = this.iqrAnalysis();
        const billingResults = this.billingAnalysis();
        const loadResults = this.loadAnalysis();
        const changeResults = this.consumptionChangeAnalysis();
        const { mean } = this.stats;

        this.results = this.data.map((d, i) => {
            let riskScore = 0;
            const flags = [];

            // Factor 1: Z-Score anomaly (weight: 25)
            const zData = zResults[i];
            if (zData.isZAnomaly) {
                riskScore += 25;
                flags.push(`Z-Score anomaly (z=${zData.zScore})`);
            } else if (Math.abs(zData.zScore) > 1.5) {
                riskScore += 10;
            }

            // Factor 2: IQR outlier (weight: 20)
            if (iqrResults[i].isIQRAnomaly) {
                riskScore += 20;
                flags.push('IQR outlier');
            }

            // Factor 3: Very low consumption relative to mean (weight: 20)
            if (d.consumption > 0 && d.consumption < mean * 0.2) {
                riskScore += 20;
                flags.push(`Unusually low consumption (${d.consumption.toFixed(0)} kWh vs avg ${mean.toFixed(0)} kWh)`);
            } else if (d.consumption > 0 && d.consumption < mean * 0.4) {
                riskScore += 10;
            }

            // Factor 4: Billing mismatch (weight: 15)
            if (billingResults[i].billingAnomaly) {
                riskScore += 15;
                flags.push(`Billing ratio anomaly (ratio=${billingResults[i].billingRatio})`);
            }

            // Factor 5: Load exceeds sanctioned (weight: 10)
            if (loadResults[i].loadAnomaly) {
                riskScore += 10;
                flags.push(`Load exceeds sanctioned (${loadResults[i].loadRatio}x)`);
            }

            // Factor 6: Sudden consumption drop (weight: 10)
            if (changeResults[i].suddenDrop) {
                riskScore += 10;
                flags.push(`Sudden drop (${changeResults[i].changePercent}%)`);
            }

            // Factor 7: Zero or near-zero consumption (bonus)
            if (d.consumption <= 0) {
                riskScore += 15;
                flags.push('Zero consumption recorded');
            }

            // Factor 8: Meter status issues
            const meterIssues = ['faulty', 'defective', 'dead', 'stuck', 'tampered', 'bypassed', 'error'];
            if (meterIssues.some(issue => d.meterStatus.toLowerCase().includes(issue))) {
                riskScore += 15;
                flags.push(`Meter issue: ${d.meterStatus}`);
            }

            // Cap at 100
            riskScore = Math.min(100, riskScore);

            // Determine risk level
            let riskLevel;
            if (riskScore >= 75) riskLevel = 'critical';
            else if (riskScore >= 55) riskLevel = 'high';
            else if (riskScore >= 35) riskLevel = 'medium';
            else if (riskScore >= 15) riskLevel = 'low';
            else riskLevel = 'normal';

            return {
                ...d,
                zScore: zData.zScore,
                riskScore,
                riskLevel,
                flags,
                billingRatio: billingResults[i].billingRatio,
                changePercent: changeResults[i].changePercent || 0
            };
        });

        // Sort by risk score descending
        this.results.sort((a, b) => b.riskScore - a.riskScore);

        return this.results;
    }

    /**
     * Get summary statistics for the dashboard
     */
    getSummary() {
        const total = this.results.length;
        const critical = this.results.filter(r => r.riskLevel === 'critical').length;
        const high = this.results.filter(r => r.riskLevel === 'high').length;
        const medium = this.results.filter(r => r.riskLevel === 'medium').length;
        const low = this.results.filter(r => r.riskLevel === 'low').length;
        const normal = this.results.filter(r => r.riskLevel === 'normal').length;
        const suspicious = critical + high;

        const totalConsumption = this.results.reduce((s, r) => s + r.consumption, 0);
        const avgConsumption = total > 0 ? totalConsumption / total : 0;

        // Estimate loss from suspicious consumers
        const estimatedLoss = this.results
            .filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high')
            .reduce((sum, r) => sum + Math.max(0, this.stats.mean - r.consumption), 0);

        const theftRate = total > 0 ? ((suspicious / total) * 100).toFixed(1) : '0.0';

        return {
            total,
            critical,
            high,
            medium,
            low,
            normal,
            suspicious,
            totalConsumption: totalConsumption.toFixed(0),
            avgConsumption: avgConsumption.toFixed(1),
            estimatedLoss: estimatedLoss.toFixed(0),
            theftRate,
            stats: this.stats
        };
    }

    /**
     * Generate alert items for the alerts panel
     */
    getAlerts() {
        return this.results
            .filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high' || r.riskLevel === 'medium')
            .map(r => ({
                id: r.id,
                name: r.name,
                region: r.region,
                riskLevel: r.riskLevel,
                riskScore: r.riskScore,
                consumption: r.consumption,
                flags: r.flags,
                category: r.category
            }));
    }

    /**
     * Generate sample data for demonstration
     */
    static generateSampleData(count = 150) {
        const regions = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central', 'Industrial Area', 'Residential-A', 'Residential-B'];
        const categories = ['Domestic', 'Commercial', 'Industrial', 'Agricultural'];
        const statuses = ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'Faulty', 'Defective', 'Stuck'];
        const months = ['Jan 2025', 'Feb 2025', 'Mar 2025'];

        const data = [];
        for (let i = 0; i < count; i++) {
            const category = categories[Math.floor(Math.random() * categories.length)];
            let baseConsumption;
            let baseBilling;

            switch (category) {
                case 'Industrial':
                    baseConsumption = 800 + Math.random() * 2000;
                    baseBilling = baseConsumption * (6 + Math.random() * 2);
                    break;
                case 'Commercial':
                    baseConsumption = 300 + Math.random() * 800;
                    baseBilling = baseConsumption * (7 + Math.random() * 2);
                    break;
                case 'Agricultural':
                    baseConsumption = 200 + Math.random() * 500;
                    baseBilling = baseConsumption * (3 + Math.random() * 2);
                    break;
                default:
                    baseConsumption = 100 + Math.random() * 400;
                    baseBilling = baseConsumption * (5 + Math.random() * 3);
            }

            // Inject anomalies (~15% of data)
            let consumption = Math.round(baseConsumption);
            let billing = Math.round(baseBilling);
            const sanctionedLoad = Math.round(baseConsumption * 0.01 * (8 + Math.random() * 4)) / 10;
            let actualLoad = sanctionedLoad * (0.6 + Math.random() * 0.4);
            let meterStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const prevConsumption = Math.round(baseConsumption * (0.85 + Math.random() * 0.3));

            if (Math.random() < 0.05) {
                // Theft: very low consumption
                consumption = Math.round(baseConsumption * (0.05 + Math.random() * 0.15));
            } else if (Math.random() < 0.05) {
                // Billing mismatch
                billing = Math.round(billing * 0.2);
            } else if (Math.random() < 0.04) {
                // Load exceeds sanctioned
                actualLoad = sanctionedLoad * (1.5 + Math.random() * 1.5);
            } else if (Math.random() < 0.03) {
                // Zero consumption
                consumption = 0;
            } else if (Math.random() < 0.03) {
                // Sudden drop from previous
                consumption = Math.round(prevConsumption * 0.15);
            }

            data.push({
                'Consumer ID': `EG-${String(i + 1001).padStart(5, '0')}`,
                'Name': `Consumer ${i + 1}`,
                'Region': regions[Math.floor(Math.random() * regions.length)],
                'Category': category,
                'Consumption (kWh)': consumption,
                'Billing Amount': billing,
                'Sanctioned Load': parseFloat(sanctionedLoad.toFixed(1)),
                'Actual Load': parseFloat(actualLoad.toFixed(1)),
                'Meter Status': meterStatus,
                'Previous Consumption': prevConsumption,
                'Date': months[Math.floor(Math.random() * months.length)]
            });
        }

        return data;
    }
}

// Export for use
window.TheftDetectionEngine = TheftDetectionEngine;
