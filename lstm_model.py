"""
LSTM Detection Engine — Deep Learning for Theft Detection

Python port of lstm_engine.js using TensorFlow/Keras.
Architecture: LSTM(128) → Dropout(0.2) → Dense(64,relu) → Dense(1,sigmoid)
Based on: Kocaman & Tümen (2020), Sadhana 45:286
"""

import numpy as np
from sklearn.model_selection import KFold


def _build_model(input_shape):
    """Build the LSTM model architecture."""
    import tensorflow as tf
    model = tf.keras.Sequential([
        tf.keras.layers.LSTM(128, activation="tanh", input_shape=input_shape),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def clean_data(matrix):
    """Clean: NaN → column mean, negatives → 0."""
    result = matrix.copy().astype(float)
    for j in range(result.shape[1]):
        col = result[:, j]
        valid = col[~np.isnan(col)]
        mean_val = valid.mean() if len(valid) > 0 else 0
        col[np.isnan(col)] = mean_val
        col[col < 0] = 0
        result[:, j] = col
    return result


def normalize_data(matrix):
    """Min-Max normalize each row to [0, 1]."""
    result = matrix.copy()
    for i in range(result.shape[0]):
        row = result[i]
        mn, mx = row.min(), row.max()
        if mx - mn > 0:
            result[i] = (row - mn) / (mx - mn)
        else:
            result[i] = np.zeros_like(row)
    return result


def create_sequences(data, labels, window_size=7):
    """Create sliding window sequences for LSTM input."""
    X, y = [], []
    for i in range(data.shape[0]):
        series = data[i]
        label = labels[i]
        for j in range(len(series) - window_size + 1):
            X.append(series[j:j + window_size])
            y.append(label)
    X = np.array(X).reshape(-1, window_size, 1)
    y = np.array(y)
    return X, y


def compute_metrics(y_true, y_pred, threshold=0.5):
    """Compute accuracy, precision, recall, F1."""
    preds = (y_pred >= threshold).astype(int).flatten()
    true = y_true.astype(int).flatten()
    tp = ((preds == 1) & (true == 1)).sum()
    fp = ((preds == 1) & (true == 0)).sum()
    fn = ((preds == 0) & (true == 1)).sum()
    tn = ((preds == 0) & (true == 0)).sum()
    acc = (tp + tn) / max(tp + tn + fp + fn, 1)
    prec = tp / max(tp + fp, 1)
    rec = tp / max(tp + fn, 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-8)
    return {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1}


def find_optimal_threshold(y_true, y_probs):
    """Find optimal classification threshold via Youden's J statistic."""
    best_t, best_j = 0.5, -1
    for t in np.arange(0.1, 0.91, 0.05):
        preds = (y_probs >= t).astype(int).flatten()
        true = y_true.astype(int).flatten()
        tp = ((preds == 1) & (true == 1)).sum()
        fp = ((preds == 1) & (true == 0)).sum()
        fn = ((preds == 0) & (true == 1)).sum()
        tn = ((preds == 0) & (true == 0)).sum()
        sens = tp / max(tp + fn, 1)
        spec = tn / max(tn + fp, 1)
        j = sens + spec - 1
        if j > best_j:
            best_j = j
            best_t = t
    return best_t


def train_and_evaluate(time_series_data, labels, window_size=7, n_folds=5,
                       epochs=30, batch_size=32, progress_callback=None):
    """
    5-fold cross-validated LSTM training.

    Args:
        time_series_data: numpy array (n_consumers, n_days)
        labels: numpy array (n_consumers,) of 0/1
        progress_callback: callable(fold, n_folds, metrics_dict)

    Returns:
        dict with fold_metrics, avg_metrics, consumer_probs, threshold
    """
    import tensorflow as tf

    data = clean_data(time_series_data)
    data = normalize_data(data)

    if data.shape[1] < window_size:
        return None

    # Per-consumer predictions
    n_consumers = data.shape[0]
    consumer_probs = np.full(n_consumers, 0.5)

    X_all, y_all = create_sequences(data, labels, window_size)
    seqs_per_consumer = data.shape[1] - window_size + 1

    if len(X_all) < 10:
        return None

    kf = KFold(n_splits=min(n_folds, len(X_all)), shuffle=True, random_state=42)
    fold_metrics = []

    for fold_idx, (train_idx, val_idx) in enumerate(kf.split(X_all)):
        X_train, X_val = X_all[train_idx], X_all[val_idx]
        y_train, y_val = y_all[train_idx], y_all[val_idx]

        model = _build_model((window_size, 1))
        model.fit(X_train, y_train, epochs=epochs, batch_size=batch_size,
                  validation_data=(X_val, y_val), verbose=0)

        val_probs = model.predict(X_val, verbose=0)
        threshold = find_optimal_threshold(y_val, val_probs)
        metrics = compute_metrics(y_val, val_probs, threshold)
        metrics["threshold"] = threshold
        fold_metrics.append(metrics)

        if progress_callback:
            progress_callback(fold_idx + 1, n_folds, metrics)

    # Final model on all data for consumer-level predictions
    final_model = _build_model((window_size, 1))
    final_model.fit(X_all, y_all, epochs=epochs, batch_size=batch_size, verbose=0)
    all_probs = final_model.predict(X_all, verbose=0).flatten()

    # Average predictions per consumer
    for i in range(n_consumers):
        start = i * seqs_per_consumer
        end = start + seqs_per_consumer
        if end <= len(all_probs):
            consumer_probs[i] = all_probs[start:end].mean()

    # Average metrics
    avg_metrics = {}
    for key in ["accuracy", "precision", "recall", "f1"]:
        avg_metrics[key] = np.mean([m[key] for m in fold_metrics])
    avg_metrics["threshold"] = np.mean([m["threshold"] for m in fold_metrics])

    return {
        "fold_metrics": fold_metrics,
        "avg_metrics": avg_metrics,
        "consumer_probs": consumer_probs,
        "threshold": avg_metrics["threshold"],
    }
