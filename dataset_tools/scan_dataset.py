
import csv
import json
import re
from pathlib import Path
from collections import Counter, defaultdict

import soundfile as sf


# --------------------------------------------------
# PATH CONFIGURATION
# --------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATASET_DIR = PROJECT_ROOT / "dataset" / "raw"
REPORT_DIR = PROJECT_ROOT / "dataset" / "reports"

CSV_OUTPUT = REPORT_DIR / "dataset_inventory.csv"
JSON_OUTPUT = REPORT_DIR / "dataset_report.json"


# --------------------------------------------------
# INITIAL SETUP
# --------------------------------------------------

REPORT_DIR.mkdir(parents=True, exist_ok=True)

if not DATASET_DIR.exists():
    raise FileNotFoundError(
        f"Dataset folder not found: {DATASET_DIR}\n"
        "Check that your extracted dataset is inside dataset/raw."
    )

wav_files = sorted(
    path for path in DATASET_DIR.rglob("*")
    if path.is_file() and path.suffix.lower() == ".wav"
)

print("=" * 60)
print("DLD SPEECH DATASET SCANNER")
print("=" * 60)
print(f"Dataset folder: {DATASET_DIR}")
print(f"WAV files found: {len(wav_files)}")
print()


# --------------------------------------------------
# SCAN FILES
# --------------------------------------------------

inventory = []
errors = []

total_size = 0
total_duration = 0.0

sample_rates = Counter()
channel_counts = Counter()
subtypes = Counter()
participant_files = defaultdict(int)

for index, file_path in enumerate(wav_files, start=1):

    relative_path = file_path.relative_to(DATASET_DIR)
    file_size = file_path.stat().st_size
    total_size += file_size

    # Provisional participant ID:
    # For filenames such as F1_01_01, this extracts F1.
    # This is only a filename-based grouping, not a clinical label.
    match = re.match(r"^([A-Za-z]+\d+)", file_path.stem)
    participant_id = match.group(1) if match else "UNKNOWN"

    try:
        info = sf.info(str(file_path))

        duration = float(info.duration)
        sample_rate = int(info.samplerate)
        channels = int(info.channels)
        subtype = str(info.subtype)

        total_duration += duration

        sample_rates[str(sample_rate)] += 1
        channel_counts[str(channels)] += 1
        subtypes[subtype] += 1
        participant_files[participant_id] += 1

        inventory.append({
            "file_name": file_path.name,
            "relative_path": str(relative_path),
            "participant_id_from_filename": participant_id,
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 4),
            "sample_rate_hz": sample_rate,
            "channels": channels,
            "duration_seconds": round(duration, 3),
            "subtype": subtype,
            "status": "OK",
            "error": ""
        })

    except Exception as exc:
        errors.append({
            "file": str(relative_path),
            "error": str(exc)
        })

        inventory.append({
            "file_name": file_path.name,
            "relative_path": str(relative_path),
            "participant_id_from_filename": participant_id,
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 4),
            "sample_rate_hz": "",
            "channels": "",
            "duration_seconds": "",
            "subtype": "",
            "status": "ERROR",
            "error": str(exc)
        })

    if index % 100 == 0 or index == len(wav_files):
        print(f"Scanned {index}/{len(wav_files)} files")


# --------------------------------------------------
# WRITE CSV INVENTORY
# --------------------------------------------------

fieldnames = [
    "file_name",
    "relative_path",
    "participant_id_from_filename",
    "file_size_bytes",
    "file_size_mb",
    "sample_rate_hz",
    "channels",
    "duration_seconds",
    "subtype",
    "status",
    "error"
]

with CSV_OUTPUT.open("w", newline="", encoding="utf-8-sig") as csv_file:
    writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(inventory)


# --------------------------------------------------
# BUILD SUMMARY REPORT
# --------------------------------------------------

successful_files = sum(
    1 for item in inventory if item["status"] == "OK"
)

error_files = len(errors)

participant_summary = {
    participant: count
    for participant, count in sorted(participant_files.items())
}

report = {
    "project": "AI-Based Speech Analytics for DLD Research",
    "dataset_folder": str(DATASET_DIR),
    "total_wav_files": len(wav_files),
    "successfully_inspected_files": successful_files,
    "files_with_errors": error_files,
    "total_size_mb": round(total_size / (1024 * 1024), 2),
    "total_duration_hours": round(total_duration / 3600, 3),
    "total_duration_minutes": round(total_duration / 60, 2),
    "sample_rate_distribution": dict(sample_rates),
    "channel_distribution": dict(channel_counts),
    "audio_subtype_distribution": dict(subtypes),
    "provisional_participant_file_counts": participant_summary,
    "participant_grouping_note": (
        "Participant IDs are inferred from filename prefixes only. "
        "They are not verified participant identities or DLD labels."
    ),
    "errors": errors
}

with JSON_OUTPUT.open("w", encoding="utf-8") as json_file:
    json.dump(report, json_file, indent=4, ensure_ascii=False)


# --------------------------------------------------
# DISPLAY RESULTS
# --------------------------------------------------

print()
print("=" * 60)
print("DATASET SCAN COMPLETED")
print("=" * 60)

print(f"Total WAV files: {len(wav_files)}")
print(f"Successfully inspected: {successful_files}")
print(f"Files with errors: {error_files}")
print(f"Total dataset size: {total_size / (1024 * 1024):.2f} MB")
print(f"Total audio duration: {total_duration / 60:.2f} minutes")
print(f"Provisional participant groups: {len(participant_files)}")

print()
print("Sample rates:")
for rate, count in sorted(sample_rates.items()):
    print(f"  {rate} Hz: {count} files")

print()
print("Channel counts:")
for channels, count in sorted(channel_counts.items()):
    print(f"  {channels} channel(s): {count} files")

print()
print("Participant groups:")
for participant, count in sorted(participant_files.items()):
    print(f"  {participant}: {count} files")

print()
print("Reports saved:")
print(f"  CSV:  {CSV_OUTPUT}")
print(f"  JSON: {JSON_OUTPUT}")

print()
print("Original audio files were not modified.")
print("=" * 60)
