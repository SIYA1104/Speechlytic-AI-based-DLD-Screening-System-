
from pathlib import Path
import io

import joblib
import numpy as np
import pandas as pd
import soundfile as sf

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.audio_processor import analyze_audio


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = (
    PROJECT_ROOT
    / "dataset"
    / "model_exploration"
    / "acoustic_exploration_pipeline.joblib"
)

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_DURATION_SECONDS = 180

app = FastAPI(
    title="DLD Speech Analytics API",
    description="Research prototype for non-diagnostic acoustic speech analysis.",
    version="0.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_model():
    if not MODEL_PATH.exists():
        return None

    artifact = joblib.load(MODEL_PATH)

    required = [
        "feature_columns",
        "imputer",
        "scaler",
        "kmeans",
        "isolation_forest"
    ]

    if not all(key in artifact for key in required):
        raise RuntimeError("Model artifact is missing required components.")

    return artifact


MODEL = load_model()


def run_acoustic_model(features: dict) -> dict:
    if MODEL is None:
        raise RuntimeError("Acoustic exploration model is not available.")

    columns = MODEL["feature_columns"]

    row = {
        column: features.get(column)
        for column in columns
    }

    frame = pd.DataFrame([row], columns=columns)
    frame = frame.apply(pd.to_numeric, errors="coerce")

    imputed = MODEL["imputer"].transform(frame)
    scaled = MODEL["scaler"].transform(imputed)

    cluster = int(MODEL["kmeans"].predict(scaled)[0])
    anomaly_prediction = int(
        MODEL["isolation_forest"].predict(scaled)[0]
    )
    anomaly_score = float(
        MODEL["isolation_forest"].decision_function(scaled)[0]
    )

    return {
        "model_type": "unsupervised_acoustic_exploration",
        "cluster": cluster,
        "unusual_acoustic_pattern": anomaly_prediction == -1,
        "anomaly_score": round(anomaly_score, 6),
        "interpretation": (
            "The recording contains acoustic patterns that differ "
            "from the model's learned reference distribution."
            if anomaly_prediction == -1
            else
            "The recording does not meet the model's unusual-pattern "
            "threshold."
        ),
        "diagnostic_use": False,
        "warning": (
            "Clusters and unusual-pattern flags are exploratory acoustic "
            "outputs. They do not identify DLD or establish a diagnosis."
        )
    }


@app.get("/")
async def root():
    return {
        "application": "DLD Speech Analytics",
        "version": "0.3.0",
        "status": "running",
        "model_loaded": MODEL is not None
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "backend",
        "audio_processing": "ready",
        "model_loaded": MODEL is not None
    }


@app.post("/api/audio/analyze")
async def upload_and_analyze_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required."
        )

    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(
            status_code=415,
            detail="Only WAV files are currently supported."
        )

    if file.content_type not in (
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "application/octet-stream"
    ):
        raise HTTPException(
            status_code=415,
            detail="Unsupported content type."
        )

    try:
        audio_bytes = await file.read(MAX_FILE_SIZE + 1)

        if len(audio_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 20 MB limit."
            )

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty."
            )

        try:
            info = sf.info(io.BytesIO(audio_bytes))
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid or unsupported WAV file."
            )

        if info.frames <= 0 or info.samplerate <= 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid audio properties."
            )

        if info.channels < 1 or info.channels > 8:
            raise HTTPException(
                status_code=400,
                detail="Unsupported number of audio channels."
            )

        if info.duration > MAX_DURATION_SECONDS:
            raise HTTPException(
                status_code=413,
                detail="Audio duration exceeds 3 minutes."
            )

        analysis = analyze_audio(audio_bytes)

        model_result = run_acoustic_model(
            analysis["model_features"]
        )

        return {
            "success": True,
            "filename": file.filename,
            "analysis": analysis,
            "model_result": model_result
        }

    except HTTPException:
        raise

    except (ValueError, RuntimeError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected processing error: {type(exc).__name__}: {exc}"
        )

    finally:
        await file.close()
