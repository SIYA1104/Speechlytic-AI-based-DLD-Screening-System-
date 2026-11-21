
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


# ============================================================
# DLD SPEECH ANALYTICS — VERSION 0.6.0
# Acoustic Feature Extraction Pipeline
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "dataset" / "raw"
FEATURE_DIR = PROJECT_ROOT / "dataset" / "features"
REPORT_DIR = PROJECT_ROOT / "dataset" / "reports"

FEATURE_CSV = FEATURE_DIR / "acoustic_features.csv"
REPORT_JSON = REPORT_DIR / "feature_extraction_report.json"

TARGET_SAMPLE_RATE = 16000
MAX_FILE_SIZE_MB = 100

# Technical thresholds for review flags.
# These are quality-control heuristics, NOT clinical thresholds.
SILENCE_RMS_THRESHOLD = 0.0001
LOW_RMS_THRESHOLD = 0.001
CLIPPING_THRESHOLD = 0.999


def sha256_file(path: Path) -> str:
    """Calculate a file's SHA-256 hash without loading it all into memory."""
    digest = hashlib.sha256()

    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def get_participant_id(filename: str) -> str:
    """Extract provisional IDs such as F10 or M5 from filenames."""
    match = re.match(r"^([FM]\d+)", filename, re.IGNORECASE)
    return match.group(1).upper() if match else "UNKNOWN"


def calculate_rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))


def extract_features(path: Path) -> dict:
    result = {
        "file_name": path.name,
        "relative_path": str(path.relative_to(RAW_DIR)),
        "participant_id": get_participant_id(path.name),
        "file_size_bytes": path.stat().st_size,
        "sha256": "",
        "sample_rate_original": None,
        "channels_original": None,
        "duration_seconds": None,
        "sample_count": None,
        "rms_mean": None,
        "rms_max": None,
        "silence_frame_fraction": None,
        "clipping_sample_fraction": None,
        "zero_crossing_rate_mean": None,
        "spectral_centroid_mean_hz": None,
        "spectral_bandwidth_mean_hz": None,
        "spectral_rolloff_mean_hz": None,
        "pitch_median_hz": None,
        "pitch_std_hz": None,
        "pitch_frame_count": None,
        "status": "PENDING",
        "review_flags": "",
        "error": "",
    }

    try:
        if result["file_size_bytes"] == 0:
            raise ValueError("File is completely empty.")

        if result["file_size_bytes"] > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise ValueError(
                f"File exceeds configured limit of {MAX_FILE_SIZE_MB} MB."
            )

        result["sha256"] = sha256_file(path)

        audio, sample_rate = sf.read(
            str(path),
            dtype="float32",
            always_2d=True
        )

        if audio.size == 0 or audio.shape[0] == 0:
            raise ValueError("Audio contains zero samples.")

        channels = audio.shape[1]
        result["sample_rate_original"] = int(sample_rate)
        result["channels_original"] = int(channels)
        result["sample_count"] = int(audio.shape[0])
        result["duration_seconds"] = round(
            audio.shape[0] / sample_rate, 4
        )

        # Convert multichannel audio to mono for analysis.
        mono = np.mean(audio, axis=1)

        # Resample only if necessary.
        if sample_rate != TARGET_SAMPLE_RATE:
            gcd = np.gcd(sample_rate, TARGET_SAMPLE_RATE)
            mono = resample_poly(
                mono,
                TARGET_SAMPLE_RATE // gcd,
                sample_rate // gcd
            ).astype(np.float32)

        if not np.all(np.isfinite(mono)):
            raise ValueError("Audio contains NaN or infinite values.")

        if len(mono) < 512:
            raise ValueError("Recording is too short for reliable feature extraction.")

        duration = len(mono) / TARGET_SAMPLE_RATE
        result["duration_seconds"] = round(duration, 4)

        # Basic amplitude features.
        result["rms_mean"] = round(calculate_rms(mono), 8)
        result["rms_max"] = round(float(np.max(np.abs(mono))), 8)

        clipping_fraction = float(
            np.mean(np.abs(mono) >= CLIPPING_THRESHOLD)
        )
        result["clipping_sample_fraction"] = round(
            clipping_fraction, 8
        )

        # Frame-based features.
        frame_length = 1024
        hop_length = 256

        rms_frames = librosa.feature.rms(
            y=mono,
            frame_length=frame_length,
            hop_length=hop_length
        )[0]

        silence_fraction = float(
            np.mean(rms_frames < SILENCE_RMS_THRESHOLD)
        )
        result["silence_frame_fraction"] = round(
            silence_fraction, 6
        )

        zcr = librosa.feature.zero_crossing_rate(
            y=mono,
            frame_length=frame_length,
            hop_length=hop_length
        )[0]

        result["zero_crossing_rate_mean"] = round(
            float(np.mean(zcr)), 8
        )

        # Spectral features.
        centroid = librosa.feature.spectral_centroid(
            y=mono,
            sr=TARGET_SAMPLE_RATE,
            n_fft=1024,
            hop_length=hop_length
        )[0]

        bandwidth = librosa.feature.spectral_bandwidth(
            y=mono,
            sr=TARGET_SAMPLE_RATE,
            n_fft=1024,
            hop_length=hop_length
        )[0]

        rolloff = librosa.feature.spectral_rolloff(
            y=mono,
            sr=TARGET_SAMPLE_RATE,
            n_fft=1024,
            hop_length=hop_length
        )[0]

        result["spectral_centroid_mean_hz"] = round(
            float(np.mean(centroid)), 4
        )
        result["spectral_bandwidth_mean_hz"] = round(
            float(np.mean(bandwidth)), 4
        )
        result["spectral_rolloff_mean_hz"] = round(
            float(np.mean(rolloff)), 4
        )

        # MFCCs: mean and standard deviation for coefficients 1–13.
        mfcc = librosa.feature.mfcc(
            y=mono,
            sr=TARGET_SAMPLE_RATE,
            n_mfcc=13,
            n_fft=1024,
            hop_length=hop_length
        )

        for index in range(13):
            result[f"mfcc_{index + 1:02d}_mean"] = round(
                float(np.mean(mfcc[index])), 6
            )
            result[f"mfcc_{index + 1:02d}_std"] = round(
                float(np.std(mfcc[index])), 6
            )

        # Pitch estimate. This is an acoustic estimate, not a
        # diagnosis or a validated measure of language development.
        if duration >= 0.1 and result["rms_mean"] > 0:
            try:
                pitch = librosa.yin(
                    mono,
                    fmin=60,
                    fmax=500,
                    sr=TARGET_SAMPLE_RATE,
                    frame_length=1024,
                    hop_length=hop_length
                )

                valid_pitch = pitch[
                    np.isfinite(pitch) &
                    (pitch >= 60) &
                    (pitch <= 500)
                ]

                if len(valid_pitch):
                    result["pitch_median_hz"] = round(
                        float(np.median(valid_pitch)), 4
                    )
                    result["pitch_std_hz"] = round(
                        float(np.std(valid_pitch)), 4
                    )
                    result["pitch_frame_count"] = int(
                        len(valid_pitch)
                    )
            except Exception:
                result["review_flags"] = "PITCH_ESTIMATION_FAILED"

        flags = []

        if duration < 1:
            flags.append("VERY_SHORT_RECORDING")

        if duration > 30:
            flags.append("LONG_RECORDING")

        if result["rms_mean"] < LOW_RMS_THRESHOLD:
            flags.append("LOW_AMPLITUDE")

        if silence_fraction > 0.80:
            flags.append("HIGH_SILENCE_FRACTION")

        if clipping_fraction > 0.001:
            flags.append("POSSIBLE_CLIPPING")

        if channels > 1:
            flags.append("MULTICHANNEL_ORIGINAL")

        if result["sample_rate_original"] != TARGET_SAMPLE_RATE:
            flags.append("RESAMPLED_FOR_ANALYSIS")

        result["review_flags"] = ";".join(flags)

        if flags:
            result["status"] = "REVIEW_REQUIRED"
        else:
            result["status"] = "VALID"

    except Exception as exc:
        result["status"] = "INVALID"
        result["error"] = f"{type(exc).__name__}: {exc}"

    return result


def main():
    if not RAW_DIR.exists():
        print(f"ERROR: Dataset folder not found: {RAW_DIR}")
        sys.exit(1)

    FEATURE_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        path for path in RAW_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() == ".wav"
    )

    if not files:
        print("ERROR: No WAV files found.")
        sys.exit(1)

    print("=" * 65)
    print("DLD SPEECH ANALYTICS — VERSION 0.6.0")
    print("ACOUSTIC FEATURE EXTRACTION")
    print("=" * 65)
    print(f"Dataset: {RAW_DIR}")
    print(f"WAV files found: {len(files)}")
    print("Processing started. Original audio files will not be modified.")
    print()

    rows = []
    status_counts = Counter()
    participant_counts = Counter()
    hash_to_files = defaultdict(list)
    errors = []

    for index, path in enumerate(files, start=1):
        row = extract_features(path)
        rows.append(row)

        status_counts[row["status"]] += 1
        participant_counts[row["participant_id"]] += 1

        if row["sha256"]:
            hash_to_files[row["sha256"]].append(row["relative_path"])

        if row["error"]:
            errors.append({
                "file": row["relative_path"],
                "error": row["error"]
            })

        if index % 25 == 0 or index == len(files):
            print(
                f"Progress: {index}/{len(files)} "
                f"({index / len(files) * 100:.1f}%)"
            )

    # Build CSV columns, including all 26 MFCC summary fields.
    fieldnames = list(rows[0].keys())

    for index in range(1, 14):
        fieldnames.extend([
            f"mfcc_{index:02d}_mean",
            f"mfcc_{index:02d}_std"
        ])

    # Remove duplicate column names while preserving order.
    fieldnames = list(dict.fromkeys(fieldnames))

    with FEATURE_CSV.open(
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    duplicate_groups = [
        paths for paths in hash_to_files.values()
        if len(paths) > 1
    ]

    participant_summary = {}

    for participant in sorted(participant_counts):
        participant_rows = [
            row for row in rows
            if row["participant_id"] == participant
        ]

        durations = [
            row["duration_seconds"]
            for row in participant_rows
            if row["duration_seconds"] is not None
        ]

        participant_summary[participant] = {
            "recording_count": len(participant_rows),
            "valid_count": sum(
                row["status"] == "VALID"
                for row in participant_rows
            ),
            "review_required_count": sum(
                row["status"] == "REVIEW_REQUIRED"
                for row in participant_rows
            ),
            "invalid_count": sum(
                row["status"] == "INVALID"
                for row in participant_rows
            ),
            "total_duration_seconds": round(
                sum(durations), 3
            ),
            "mean_duration_seconds": (
                round(float(np.mean(durations)), 3)
                if durations else None
            )
        }

    report = {
        "project": "AI-Based Speech Analytics for DLD Research",
        "version": "0.6.0",
        "generated_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "dataset_folder": str(RAW_DIR),
        "feature_csv": str(FEATURE_CSV),
        "total_wav_files": len(files),
        "status_counts": dict(status_counts),
        "participant_counts": dict(participant_counts),
        "participant_summary": participant_summary,
        "exact_duplicate_groups": duplicate_groups,
        "exact_duplicate_group_count": len(duplicate_groups),
        "errors": errors,
        "features_extracted": [
            "duration_seconds",
            "rms_mean",
            "rms_max",
            "silence_frame_fraction",
            "clipping_sample_fraction",
            "zero_crossing_rate_mean",
            "spectral_centroid_mean_hz",
            "spectral_bandwidth_mean_hz",
            "spectral_rolloff_mean_hz",
            "pitch_median_hz",
            "pitch_std_hz",
            "mfcc_01_to_13_mean_and_std"
        ],
        "limitations": [
            "These are acoustic features, not DLD diagnostic indicators.",
            "Pitch estimates may be unreliable for noisy, unvoiced or unusual recordings.",
            "Review flags are technical heuristics and require human review.",
            "Participant IDs are inferred from filenames.",
            "No DLD or typically developing labels are assumed.",
            "No original audio files are modified."
        ]
    }

    with REPORT_JSON.open("w", encoding="utf-8") as file:
        json.dump(report, file, indent=2, ensure_ascii=False)

    print()
    print("=" * 65)
    print("FEATURE EXTRACTION COMPLETED")
    print("=" * 65)
    print(f"Total files: {len(files)}")
    print(f"Valid: {status_counts['VALID']}")
    print(f"Review required: {status_counts['REVIEW_REQUIRED']}")
    print(f"Invalid: {status_counts['INVALID']}")
    print(f"Exact duplicate groups: {len(duplicate_groups)}")
    print()
    print(f"Feature CSV: {FEATURE_CSV}")
    print(f"JSON report: {REPORT_JSON}")
    print()
    print("Original audio files were not modified.")
    print("=" * 65)


if __name__ == "__main__":
    main()
