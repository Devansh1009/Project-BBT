import os
import uuid
import streamlit as st
import pandas as pd
import numpy as np

# Try importing firebase-admin (may not be installed locally yet)
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

def init_firebase():
    """Initialize Firebase Admin SDK using Streamlit Secrets.
    Returns True if successfully initialized, False otherwise."""
    if not FIREBASE_AVAILABLE:
        return False
        
    if "firebase" not in st.secrets:
        return False
        
    firebase_secrets = st.secrets["firebase"]
    
    # Check if the secrets contain placeholder values
    if firebase_secrets.get("project_id") in ["your-project-id", ""]:
        return False
        
    # Check if already initialized to prevent duplicate apps error
    if not firebase_admin._apps:
        try:
            # Convert AttrDict / Secrets dict to standard dict for Firebase SDK
            cred_dict = dict(firebase_secrets)
            # Ensure newlines in private key are correctly parsed if formatted as string
            if "private_key" in cred_dict:
                cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")
                
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
        except Exception as e:
            st.sidebar.error(f"Firebase Init Error: {e}")
            return False
            
    return True

def save_run(run_id, filename, df, col_map, ts_cols, summary):
    """Save an analysis run and its consumer records to Firestore.
    Handles data type cleanups for safe serialization."""
    if not init_firebase():
        return False
        
    db = firestore.client()
    
    # Save the main run document
    run_ref = db.collection("runs").document(run_id)
    run_ref.set({
        "run_id": run_id,
        "filename": filename,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "total": int(summary.get("total", 0)),
        "critical": int(summary.get("critical", 0)),
        "high": int(summary.get("high", 0)),
        "medium": int(summary.get("medium", 0)),
        "low": int(summary.get("low", 0)),
        "col_map": col_map,
        "ts_cols": list(ts_cols) if ts_cols is not None else []
    })
    
    # Save the consumer details in a subcollection in batches
    consumers_ref = run_ref.collection("consumers")
    records = df.to_dict(orient="records")
    
    batch = db.batch()
    for i, record in enumerate(records):
        clean_record = {}
        for k, v in record.items():
            # Firestore rejects numpy types and pandas NaNs/NaT
            if pd.isna(v):
                clean_record[k] = None
            elif isinstance(v, (np.integer, np.floating)):
                clean_record[k] = v.item()
            elif isinstance(v, np.bool_):
                clean_record[k] = bool(v)
            else:
                clean_record[k] = v
                
        # Use consumer ID if available, otherwise index
        id_field = col_map.get("consumer_id", "consumer_id")
        cid = str(clean_record.get(id_field, f"cons_{i}"))
        # Firestore document IDs cannot contain slashes or look like paths
        cid_cleaned = cid.replace("/", "_").replace("\\", "_")
        
        doc_ref = consumers_ref.document(cid_cleaned)
        batch.set(doc_ref, clean_record)
        
        # Limit of 500 writes per batch in Firestore
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
            
    batch.commit()
    return True

def get_runs_list():
    """Retrieve a list of past analysis runs from Firestore."""
    if not init_firebase():
        return []
        
    db = firestore.client()
    runs_ref = db.collection("runs")
    
    try:
        # Order by timestamp descending
        query = runs_ref.order_by("timestamp", direction=firestore.Query.DESCENDING)
        docs = query.stream()
        
        runs = []
        for doc in docs:
            data = doc.to_dict()
            # Convert timestamp to human-readable string or datetime
            ts = data.get("timestamp")
            if ts:
                data["date_str"] = ts.strftime("%Y-%m-%d %H:%M:%S")
            else:
                data["date_str"] = "Pending..."
            runs.append(data)
        return runs
    except Exception as e:
        # Fallback if index is missing or query fails
        docs = runs_ref.stream()
        runs = []
        for doc in docs:
            data = doc.to_dict()
            runs.append(data)
        # Sort in memory
        runs.sort(key=lambda x: x.get("timestamp") or 0, reverse=True)
        return runs

def get_run_data(run_id):
    """Retrieve a run summary and rebuild the consumers DataFrame."""
    if not init_firebase():
        return None, None
        
    db = firestore.client()
    run_doc = db.collection("runs").document(run_id).get()
    
    if not run_doc.exists:
        return None, None
        
    run_summary = run_doc.to_dict()
    
    # Retrieve all consumers from the subcollection
    consumers_ref = db.collection("runs").document(run_id).collection("consumers")
    docs = consumers_ref.stream()
    
    records = []
    for doc in docs:
        records.append(doc.to_dict())
        
    df = pd.DataFrame(records)
    return run_summary, df

def delete_run(run_id):
    """Delete a run summary and all its associated consumers in batches."""
    if not init_firebase():
        return False
        
    db = firestore.client()
    run_ref = db.collection("runs").document(run_id)
    
    # Delete consumers first
    consumers_ref = run_ref.collection("consumers")
    docs = consumers_ref.stream()
    
    batch = db.batch()
    for i, doc in enumerate(docs):
        batch.delete(doc.reference)
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    
    # Delete main document
    run_ref.delete()
    return True
