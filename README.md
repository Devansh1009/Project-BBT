# ⚡ ElectraGuard — Electrical Theft Detection System

A premium, AI-powered web application for detecting electrical theft by analyzing electricity consumption data uploaded as XLSX/CSV files.

![Dark Theme Dashboard](https://img.shields.io/badge/Theme-Dark_Mode-0a0e1a?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-4.x-ff6384?style=for-the-badge&logo=chartdotjs&logoColor=white)

---

## 🚀 Features

- **📤 XLSX/CSV Upload** — Drag-and-drop or click to upload electricity consumption spreadsheets
- **🧠 Smart Column Mapping** — Auto-detects columns like Consumer ID, Consumption, Billing, Region, etc.
- **🔍 6 Detection Algorithms:**
  - Z-Score Analysis (±2σ threshold)
  - IQR Outlier Detection (1.5× multiplier)
  - Consumption-to-Billing Ratio Analysis
  - Sanctioned vs Actual Load Comparison
  - Consumption Change Detection (>50% drop)
  - Meter Status Anomaly Detection
- **🎯 Multi-Factor Risk Scoring** — Composite score 0–100 with 5 risk levels (Critical, High, Medium, Low, Normal)
- **📊 7 Interactive Charts** — Consumption distribution, risk pie, anomaly scatter, loss breakdown, histogram, risk scores, top suspicious
- **📋 Data Table** — Searchable, filterable, paginated with color-coded risk badges
- **🚨 Alerts Panel** — Prioritized list of suspicious consumer alerts
- **📈 Analytics Report** — Comprehensive detection summary with actionable recommendations
- **💾 CSV Export** — Export detection results for further analysis
- **🎨 Sample Data** — Built-in demo with 150 synthetic consumers

---

## 📸 Screenshots

### Landing Page
Premium dark-themed upload interface with drag-and-drop support.

### Dashboard
Interactive charts and statistics showing consumption patterns and risk distribution.

### Alerts
Prioritized alerts with risk scores, flags, and consumer details.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| HTML5 | Structure & Semantics |
| CSS3 | Glassmorphism dark theme, animations, responsive layout |
| JavaScript (ES6+) | Core logic, detection engine, DOM manipulation |
| [SheetJS (xlsx)](https://sheetjs.com/) | XLSX/XLS/CSV file parsing |
| [Chart.js 4](https://www.chartjs.org/) | Interactive data visualizations |

---

## 📂 Project Structure

```
Project BBT/
├── index.html        # Main application HTML
├── styles.css        # Premium dark theme styles
├── detection.js      # Anomaly detection engine
├── charts.js         # Chart.js visualization module
├── app.js            # Application controller
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Project-BBT.git
   ```

2. **Open in browser:**
   Simply open `index.html` in any modern browser. No build step or server required.

3. **Upload your data:**
   - Drag and drop your `.xlsx` or `.csv` file onto the upload zone
   - Or click "Load Sample Data" to explore the demo

### Expected Data Format

Your spreadsheet should contain columns like:

| Column | Description |
|--------|-------------|
| Consumer ID | Unique identifier |
| Name | Consumer name |
| Region / Area | Geographic zone |
| Consumption (kWh) | Electricity usage |
| Billing Amount | Bill amount |
| Sanctioned Load | Approved load limit |
| Actual Load | Measured load |
| Meter Status | OK / Faulty / Defective |
| Previous Consumption | Last period's usage |
| Category | Domestic / Commercial / Industrial |

> **Note:** The app auto-detects columns by matching common naming patterns. Not all columns are required — at minimum, a consumption column is needed.

---

## 🔬 Detection Methodology

The engine applies a **multi-factor composite scoring** approach:

| Factor | Weight | Description |
|--------|--------|-------------|
| Z-Score | 25 pts | Consumption deviates >2σ from mean |
| IQR Outlier | 20 pts | Outside Q1 - 1.5×IQR or Q3 + 1.5×IQR |
| Low Consumption | 20 pts | Below 20% of average consumption |
| Billing Mismatch | 15 pts | Consumption-to-billing ratio anomaly |
| Load Violation | 10 pts | Actual load exceeds 120% of sanctioned |
| Sudden Drop | 10 pts | >50% drop from previous period |
| Zero Usage | 15 pts | Zero consumption recorded |
| Meter Issues | 15 pts | Faulty / defective / tampered status |

**Risk Levels:**
- 🔴 **Critical** (75–100) — Immediate investigation required
- 🟠 **High** (55–74) — Schedule for audit
- 🟡 **Medium** (35–54) — Monitor across billing cycles
- 🔵 **Low** (15–34) — Minor flag, low concern
- 🟢 **Normal** (0–14) — No issues detected

---

## 📄 License

MIT License — Free to use, modify, and distribute.

---

<p align="center">Built with ⚡ by ElectraGuard</p>
