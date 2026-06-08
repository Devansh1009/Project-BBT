"""
Theft Detection Engine — Statistical Detection Methods

Python port of detection.js for the Streamlit app.
Implements column auto-mapping, Z-Score, IQR, billing ratio,
load overload, consumption drop, and meter status detection.
"""

import re
import numpy as np
import pandas as pd

# Column alias mappings
COLUMN_ALIASES = {
    "consumer_id": ["consumer_id", "id", "cust_id", "meter_id", "account", "sr_no", "sno"],
    "name": ["name", "consumer_name", "customer_name", "cust_name"],
    "consumption": ["consumption", "kwh", "units", "units_consumed", "energy", "usage", "reading", "meter_reading", "load"],
    "billing": ["billing", "billing_amount", "bill", "amount", "charges", "total_bill", "revenue"],
    "region": ["region", "area", "zone", "district", "location", "city", "sector", "feeder", "subdivision"],
    "category": ["category", "type", "consumer_type", "tariff", "connection_type"],
    "sanctioned_load": ["sanctioned_load", "sanc_load", "contract_demand", "connected_load", "max_demand"],
    "actual_load": ["actual_load", "measured_load", "current_load", "peak_load", "demand"],
    "previous_consumption": ["previous_consumption", "prev_consumption", "last_consumption", "prev_reading", "prev_units"],
    "meter_status": ["meter_status", "status", "meter_condition", "defective", "faulty"],
    "date": ["date", "reading_date", "month", "period", "billing_date"],
    "flag": ["flag", "label", "theft", "is_theft", "fraud", "anomaly", "class", "target"],
}

FAULTY_KEYWORDS = ["faulty", "defective", "dead", "stuck", "tampered", "bypassed", "error", "abnormal"]
TS_PATTERN = re.compile(r"^(day|d|reading|week|month|period|t|time)[\s_\-]?\d+$", re.IGNORECASE)
DATE_PATTERN = re.compile(r"^\d{4}[\-/]\d{2}([\-/]\d{2})?$")


class TheftDetectionEngine:
    def __init__(self):
        self.df = None
        self.col_map = {}
        self.ts_cols = []
        self.stats = {}
        self.results = None

    def _clean_col(self, name):
        return re.sub(r"[^a-z0-9]", "", str(name).lower().strip())

    def map_columns(self, columns):
        """Auto-map DataFrame columns to internal field names."""
        mapping = {}
        for col in columns:
            cleaned = self._clean_col(col)
            for field, aliases in COLUMN_ALIASES.items():
                if any(self._clean_col(a) == cleaned for a in aliases):
                    mapping[field] = col
                    break
        return mapping

    def detect_time_series_columns(self, columns):
        """Detect columns that look like time-series (day_1, day_2, ...)."""
        ts = []
        for col in columns:
            if TS_PATTERN.match(str(col).strip()):
                ts.append(col)
            elif DATE_PATTERN.match(str(col).strip()):
                ts.append(col)
        # Sort by numeric suffix
        def sort_key(c):
            m = re.search(r"\d+", str(c))
            return int(m.group()) if m else 0
        return sorted(ts, key=sort_key)

    def process_data(self, df):
        """Process a DataFrame: map columns, detect time-series."""
        self.df = df.copy()
        cols = list(df.columns)
        self.col_map = self.map_columns(cols)
        self.ts_cols = self.detect_time_series_columns(cols)

        # Assign Consumer ID if missing
        if "consumer_id" not in self.col_map:
            self.df["_consumer_id"] = [f"C-{i+1:05d}" for i in range(len(df))]
            self.col_map["consumer_id"] = "_consumer_id"

        # Ensure consumption is numeric
        if "consumption" in self.col_map:
            self.df[self.col_map["consumption"]] = pd.to_numeric(
                self.df[self.col_map["consumption"]], errors="coerce"
            ).fillna(0)

        return self

    def calculate_stats(self):
        """Compute consumption statistics."""
        if "consumption" not in self.col_map:
            self.stats = {}
            return self
        c = self.df[self.col_map["consumption"]].dropna()
        q1, q3 = c.quantile(0.25), c.quantile(0.75)
        self.stats = {
            "mean": c.mean(),
            "std": c.std(),
            "median": c.median(),
            "q1": q1,
            "q3": q3,
            "iqr": q3 - q1,
            "min": c.min(),
            "max": c.max(),
            "count": len(c),
        }
        return self

    def calculate_risk_scores(self):
        """Run all statistical detectors and compute risk scores."""
        df = self.df
        n = len(df)
        scores = np.zeros(n)
        flags_detail = [[] for _ in range(n)]

        cons_col = self.col_map.get("consumption")
        bill_col = self.col_map.get("billing")
        sanc_col = self.col_map.get("sanctioned_load")
        load_col = self.col_map.get("actual_load")
        prev_col = self.col_map.get("previous_consumption")
        status_col = self.col_map.get("meter_status")

        mean = self.stats.get("mean", 0)
        std = self.stats.get("std", 1)
        q1 = self.stats.get("q1", 0)
        iqr = self.stats.get("iqr", 0)

        for i in range(n):
            score = 0
            flags = []

            # Z-Score
            if cons_col and std > 0:
                z = (df.iloc[i][cons_col] - mean) / std
                if abs(z) > 2:
                    score += 15
                    flags.append("Z-Score Anomaly")

            # IQR outlier
            if cons_col and iqr > 0:
                val = df.iloc[i][cons_col]
                if val < q1 - 1.5 * iqr:
                    score += 15
                    flags.append("IQR Outlier")

            # Billing ratio
            if cons_col and bill_col:
                c_val = df.iloc[i][cons_col]
                b_val = pd.to_numeric(df.iloc[i][bill_col], errors="coerce") or 0
                if c_val > 0 and mean > 0:
                    ratio = b_val / c_val if c_val else 0
                    mean_bill = df[bill_col].astype(float, errors="ignore").mean()
                    mean_ratio = mean_bill / mean if mean else 0
                    if mean_ratio > 0 and ratio < mean_ratio * 0.5:
                        score += 10
                        flags.append("Low Billing Ratio")

            # Load overload
            if sanc_col and load_col:
                sl = pd.to_numeric(df.iloc[i][sanc_col], errors="coerce") or 0
                al = pd.to_numeric(df.iloc[i][load_col], errors="coerce") or 0
                if sl > 0 and al > sl * 1.2:
                    score += 10
                    flags.append("Load Overload")

            # Consumption drop
            if cons_col and prev_col:
                cur = df.iloc[i][cons_col]
                prev = pd.to_numeric(df.iloc[i][prev_col], errors="coerce") or 0
                if prev > 0 and (prev - cur) / prev > 0.5:
                    score += 10
                    flags.append("Sudden Drop")

            # Meter status
            if status_col:
                status = str(df.iloc[i][status_col]).lower()
                if any(kw in status for kw in FAULTY_KEYWORDS):
                    score += 10
                    flags.append("Meter Issue")

            scores[i] = min(score, 60)  # Statistical max is 60
            flags_detail[i] = flags

        self.df["_risk_score"] = scores
        self.df["_risk_level"] = [self.classify_risk(s) for s in scores]
        self.df["_flags"] = [", ".join(f) if f else "None" for f in flags_detail]
        self.results = self.df
        return self

    @staticmethod
    def classify_risk(score):
        if score >= 60:
            return "Critical"
        elif score >= 40:
            return "High"
        elif score >= 20:
            return "Medium"
        return "Low"

    def add_lstm_scores(self, lstm_probs):
        """Merge LSTM probabilities into the risk scores (40 pts max)."""
        if lstm_probs is not None and len(lstm_probs) == len(self.df):
            lstm_scores = np.clip(lstm_probs * 40, 0, 40)
            self.df["_lstm_prob"] = lstm_probs
            self.df["_risk_score"] = np.minimum(
                self.df["_risk_score"] + lstm_scores, 100
            )
            self.df["_risk_level"] = [
                self.classify_risk(s) for s in self.df["_risk_score"]
            ]
        return self

    def auto_label_for_lstm(self):
        """Generate pseudo-labels if no flag column exists."""
        if "flag" in self.col_map:
            return self.df[self.col_map["flag"]].astype(int).values

        # Heuristic pseudo-labeling
        labels = np.zeros(len(self.df))
        cons_col = self.col_map.get("consumption")
        if cons_col and self.stats:
            vals = self.df[cons_col].values
            q1 = self.stats["q1"]
            iqr = self.stats["iqr"]
            mean = self.stats["mean"]
            std = self.stats["std"]
            for i in range(len(vals)):
                suspicious = 0
                if vals[i] < q1 - 1.5 * iqr:
                    suspicious += 1
                if std > 0 and abs((vals[i] - mean) / std) > 2.5:
                    suspicious += 1
                if vals[i] < mean * 0.1:
                    suspicious += 1
                if suspicious >= 2:
                    labels[i] = 1
        return labels

    def get_summary(self):
        """Return summary statistics."""
        df = self.df
        total = len(df)
        risk_counts = df["_risk_level"].value_counts().to_dict()
        summary = {
            "total": total,
            "critical": risk_counts.get("Critical", 0),
            "high": risk_counts.get("High", 0),
            "medium": risk_counts.get("Medium", 0),
            "low": risk_counts.get("Low", 0),
            "avg_score": df["_risk_score"].mean(),
        }

        if "region" in self.col_map:
            summary["by_region"] = (
                df.groupby(self.col_map["region"])["_risk_score"]
                .mean()
                .sort_values(ascending=False)
                .to_dict()
            )

        if "category" in self.col_map:
            summary["by_category"] = (
                df.groupby(self.col_map["category"])["_risk_score"]
                .mean()
                .sort_values(ascending=False)
                .to_dict()
            )
        return summary

    def get_time_series_matrix(self):
        """Extract time-series columns as a numpy matrix."""
        if not self.ts_cols:
            return None
        return self.df[self.ts_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values
