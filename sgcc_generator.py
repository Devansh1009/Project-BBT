"""
SGCC-Style Electricity Theft Dataset Generator

Generates a scientifically accurate electricity consumption dataset modeled
after the SGCC (State Grid Corporation of China) benchmark dataset used in:
    Kocaman, B. & Tümen, V. (2020). Sadhana, 45, 286.

SGCC Original: 42,372 consumers, 1,035 days (Jan 2014 – Oct 2016), ~15% theft
"""

import numpy as np
import pandas as pd
from io import BytesIO


PROFILES = [
    {"category": "Residential-Low",    "base": 3,   "variance": 1.5,  "weight": 0.30},
    {"category": "Residential-Medium", "base": 8,   "variance": 3,    "weight": 0.25},
    {"category": "Residential-High",   "base": 18,  "variance": 5,    "weight": 0.10},
    {"category": "Commercial-Small",   "base": 25,  "variance": 8,    "weight": 0.12},
    {"category": "Commercial-Large",   "base": 60,  "variance": 15,   "weight": 0.08},
    {"category": "Industrial",         "base": 120, "variance": 30,   "weight": 0.08},
    {"category": "Agricultural",       "base": 15,  "variance": 7,    "weight": 0.07},
]

REGIONS = [
    "District-A", "District-B", "District-C", "District-D",
    "District-E", "District-F", "Zone-North", "Zone-South",
    "Zone-East", "Zone-West", "Industrial-Park", "Rural-Sector",
]


def generate_dataset(num_consumers=500, num_days=60, theft_rate=0.15):
    """
    Generate a complete SGCC-style electricity theft detection dataset.

    Returns:
        df (pd.DataFrame): The generated dataset
        stats (dict): Summary statistics
    """
    rng = np.random.default_rng()
    num_thieves = int(round(num_consumers * theft_rate))
    thief_indices = set(rng.choice(num_consumers, size=num_thieves, replace=False))

    # Profile weights
    categories = [p["category"] for p in PROFILES]
    weights = np.array([p["weight"] for p in PROFILES])
    weights = weights / weights.sum()

    rows = []
    for i in range(num_consumers):
        is_thief = i in thief_indices
        profile = PROFILES[rng.choice(len(PROFILES), p=weights)]

        # 1. Generate base Gaussian series
        series = rng.normal(profile["base"], profile["variance"], size=num_days)

        # 2. Seasonal pattern (summer peak)
        days = np.arange(num_days)
        seasonal = 1 + 0.2 * np.sin(2 * np.pi * (days / 365 - 0.25))
        series = series * seasonal

        # 3. Weekly pattern
        is_commercial = "Commercial" in profile["category"] or "Industrial" in profile["category"]
        for d in range(num_days):
            dow = d % 7
            if dow in (5, 6):  # weekend
                series[d] *= 0.4 if is_commercial else 1.15

        # 4. Apply theft attack
        attack_type = "none"
        if is_thief:
            series, attack_type = _apply_theft_attack(rng, series, num_days)

        # Clamp to non-negative, round
        series = np.maximum(series, 0).round(2)

        total = series.sum()
        billing_rate = (
            7.5 if "Industrial" in profile["category"] else
            8.5 if "Commercial" in profile["category"] else
            3.5 if "Agricultural" in profile["category"] else 6.0
        )
        sanctioned_load = round(profile["base"] * 0.15, 1)
        if is_thief and rng.random() < 0.25:
            actual_load = round(sanctioned_load * (1.3 + rng.random() * 0.7), 1)
        else:
            actual_load = round(sanctioned_load * (0.5 + rng.random() * 0.4), 1)

        meter = "OK"
        if is_thief and rng.random() < 0.2:
            meter = rng.choice(["Tampered", "Faulty", "Bypassed"])

        row = {
            "Consumer ID": f"SGCC-{i+1:05d}",
            "Name": f"Consumer {i+1}",
            "Region": rng.choice(REGIONS),
            "Category": profile["category"],
        }
        for d in range(num_days):
            row[f"day_{d+1}"] = series[d]

        row["Consumption"] = round(total)
        row["Billing"] = round(total * billing_rate)
        row["Sanctioned Load"] = sanctioned_load
        row["Actual Load"] = actual_load
        row["Meter Status"] = meter
        row["Previous Consumption"] = round(total * (0.85 + rng.random() * 0.3))
        row["Flag"] = 1 if is_thief else 0
        row["_attack_type"] = attack_type
        rows.append(row)

    df = pd.DataFrame(rows)

    # Stats
    attack_dist = df[df["Flag"] == 1]["_attack_type"].value_counts().to_dict()
    cat_dist = df["Category"].value_counts().to_dict()
    stats = {
        "total_consumers": num_consumers,
        "total_thieves": num_thieves,
        "theft_rate": f"{theft_rate*100:.1f}%",
        "num_days": num_days,
        "attack_types": attack_dist,
        "category_distribution": cat_dist,
    }
    return df, stats


def _apply_theft_attack(rng, series, num_days):
    """Apply one of 6 SGCC theft attack types."""
    attack_idx = rng.integers(0, 6)
    attacked = series.copy()

    if attack_idx == 0:
        # Type 1: Constant reduction
        alpha = 0.1 + rng.random() * 0.4
        attacked = series * alpha
        return attacked, "Type-1: Constant Reduction"

    elif attack_idx == 1:
        # Type 2: Random factor each day
        alphas = 0.1 + rng.random(num_days) * 0.7
        attacked = series * alphas
        return attacked, "Type-2: Random Factor"

    elif attack_idx == 2:
        # Type 3: Time-based zero
        start = rng.integers(0, int(num_days * 0.5))
        length = int(num_days * (0.3 + rng.random() * 0.4))
        attacked[start:start+length] = series[start:start+length] * rng.random(min(length, num_days - start)) * 0.05
        return attacked, "Type-3: Time-Based Zero"

    elif attack_idx == 3:
        # Type 4: Mean flattening
        mean_val = series.mean() * (0.2 + rng.random() * 0.3)
        attacked = np.full(num_days, mean_val) + (rng.random(num_days) - 0.5) * 0.5
        return attacked, "Type-4: Mean Flattening"

    elif attack_idx == 4:
        # Type 5: Reverse pattern
        order = np.argsort(series)
        rev_vals = np.sort(series)[::-1] * (0.3 + rng.random() * 0.3)
        attacked[order] = rev_vals
        return attacked, "Type-5: Reverse Pattern"

    else:
        # Type 6: Gradual decline
        decay = np.maximum(0.02, 1 - (np.arange(num_days) / num_days) * (0.7 + rng.random() * 0.3))
        attacked = series * decay
        return attacked, "Type-6: Gradual Decline"


def to_xlsx_bytes(df):
    """Convert DataFrame to XLSX bytes for download."""
    clean = df.drop(columns=["_attack_type"], errors="ignore")
    buf = BytesIO()
    clean.to_excel(buf, index=False, sheet_name="Electricity Data", engine="openpyxl")
    return buf.getvalue()
