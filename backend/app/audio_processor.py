
import io
import numpy as np
import librosa
import soundfile as sf
from scipy.signal import resample_poly

TARGET_SAMPLE_RATE = 16000
SILENCE_RMS_THRESHOLD = 0.0001
CLIPPING_THRESHOLD = 0.999
FRAME_LENGTH = 1024
HOP_LENGTH = 256


def extract_model_features(audio_bytes: bytes) -> dict:
    """Extract the same 37 acoustic features used during model training."""

    audio, original_sr = sf.read(
        io.BytesIO(audio_bytes),
        dtype="float32",
        always_2d=True
    )

    if audio.size == 0 or audio.shape[0] == 0:
        raise ValueError("Audio contains zero samples.")

    if original_sr <= 0:
        raise ValueError("Invalid sample rate.")

    if not np.all(np.isfinite(audio)):
        raise ValueError("Audio contains invalid numeric values.")

    mono = np.mean(audio, axis=1)

    if original_sr != TARGET_SAMPLE_RATE:
        gcd = np.gcd(original_sr, TARGET_SAMPLE_RATE)
        mono = resample_poly(
            mono,
            TARGET_SAMPLE_RATE // gcd,
            original_sr // gcd
        ).astype(np.float32)

    if not np.all(np.isfinite(mono)):
        raise ValueError("Audio contains invalid numeric values.")

    if len(mono) < 512:
        raise ValueError("Recording is too short for feature extraction.")

    duration = len(mono) / TARGET_SAMPLE_RATE

    features = {
        "duration_seconds": round(float(duration), 4),
        "rms_mean": float(
            np.sqrt(np.mean(np.square(mono, dtype=np.float64)))
        ),
        "rms_max": float(np.max(np.abs(mono))),
        "clipping_sample_fraction": float(
            np.mean(np.abs(mono) >= CLIPPING_THRESHOLD)
        )
    }

    rms_frames = librosa.feature.rms(
        y=mono,
        frame_length=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )[0]

    features["silence_frame_fraction"] = float(
        np.mean(rms_frames < SILENCE_RMS_THRESHOLD)
    )

    zcr = librosa.feature.zero_crossing_rate(
        y=mono,
        frame_length=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )[0]

    features["zero_crossing_rate_mean"] = float(np.mean(zcr))

    centroid = librosa.feature.spectral_centroid(
        y=mono,
        sr=TARGET_SAMPLE_RATE,
        n_fft=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )[0]

    bandwidth = librosa.feature.spectral_bandwidth(
        y=mono,
        sr=TARGET_SAMPLE_RATE,
        n_fft=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )[0]

    rolloff = librosa.feature.spectral_rolloff(
        y=mono,
        sr=TARGET_SAMPLE_RATE,
        n_fft=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )[0]

    features["spectral_centroid_mean_hz"] = float(np.mean(centroid))
    features["spectral_bandwidth_mean_hz"] = float(np.mean(bandwidth))
    features["spectral_rolloff_mean_hz"] = float(np.mean(rolloff))

    mfcc = librosa.feature.mfcc(
        y=mono,
        sr=TARGET_SAMPLE_RATE,
        n_mfcc=13,
        n_fft=FRAME_LENGTH,
        hop_length=HOP_LENGTH
    )

    for index in range(13):
        features[f"mfcc_{index + 1:02d}_mean"] = float(
            np.mean(mfcc[index])
        )
        features[f"mfcc_{index + 1:02d}_std"] = float(
            np.std(mfcc[index])
        )

    features["pitch_median_hz"] = None
    features["pitch_std_hz"] = None

    if duration >= 0.1 and features["rms_mean"] > 0:
        try:
            pitch = librosa.yin(
                mono,
                fmin=60,
                fmax=500,
                sr=TARGET_SAMPLE_RATE,
                frame_length=FRAME_LENGTH,
                hop_length=HOP_LENGTH
            )

            valid_pitch = pitch[
                np.isfinite(pitch) &
                (pitch >= 60) &
                (pitch <= 500)
            ]

            if len(valid_pitch):
                features["pitch_median_hz"] = float(
                    np.median(valid_pitch)
                )
                features["pitch_std_hz"] = float(
                    np.std(valid_pitch)
                )
        except Exception:
            pass

    return features


def analyze_audio(audio_bytes: bytes) -> dict:
    """Extract acoustic features and return a non-diagnostic summary."""

    try:
        features = extract_model_features(audio_bytes)

        audio, original_sr = sf.read(
            io.BytesIO(audio_bytes),
            dtype="float32",
            always_2d=True
        )

        mono = np.mean(audio, axis=1)

        if original_sr != TARGET_SAMPLE_RATE:
            gcd = np.gcd(original_sr, TARGET_SAMPLE_RATE)
            mono = resample_poly(
                mono,
                TARGET_SAMPLE_RATE // gcd,
                original_sr // gcd
            ).astype(np.float32)

        step = max(1, len(mono) // 2000)
        waveform = mono[::step][:2000]

        return {
            "analysis_type": "acoustic_feature_extraction",
            "is_dld_assessment": False,
            "audio": {
                "original_sample_rate": int(original_sr),
                "processed_sample_rate": TARGET_SAMPLE_RATE,
                "original_channels": int(audio.shape[1]),
                "duration_seconds": round(
                    features["duration_seconds"], 3
                )
            },
            "model_features": features,
            "features": {
                "rms_mean": round(features["rms_mean"], 6),
                "rms_max": round(features["rms_max"], 6),
                "silence_fraction": round(
                    features["silence_frame_fraction"], 6
                ),
                "clipping_fraction": round(
                    features["clipping_sample_fraction"], 6
                ),
                "zero_crossing_rate_mean": round(
                    features["zero_crossing_rate_mean"], 6
                ),
                "spectral_centroid_mean_hz": round(
                    features["spectral_centroid_mean_hz"], 2
                ),
                "spectral_bandwidth_mean_hz": round(
                    features["spectral_bandwidth_mean_hz"], 2
                ),
                "spectral_rolloff_mean_hz": round(
                    features["spectral_rolloff_mean_hz"], 2
                ),
                "pitch_median_hz": (
                    round(features["pitch_median_hz"], 2)
                    if features["pitch_median_hz"] is not None
                    else None
                ),
                "pitch_std_hz": (
                    round(features["pitch_std_hz"], 2)
                    if features["pitch_std_hz"] is not None
                    else None
                ),
                "mfcc_mean": [
                    round(features[f"mfcc_{i:02d}_mean"], 5)
                    for i in range(1, 14)
                ],
                "mfcc_std": [
                    round(features[f"mfcc_{i:02d}_std"], 5)
                    for i in range(1, 14)
                ]
            },
            "waveform": [
                round(float(x), 5) for x in waveform
            ],
            "limitations": [
                "Acoustic measurements only.",
                "Pitch estimates may be unreliable for noisy or unvoiced recordings.",
                "Technical acoustic patterns are not DLD indicators.",
                "No clinical diagnosis or developmental classification is performed."
            ]
        }

    except (ValueError, RuntimeError):
        raise
    except Exception as exc:
        raise RuntimeError(
            f"Audio processing failed: {type(exc).__name__}: {exc}"
        ) from exc
