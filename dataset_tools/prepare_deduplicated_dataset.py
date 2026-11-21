#!/usr/bin/env python3
"""
Prepare a non-destructive, deduplicated input set for the DLD speech analytics project.

Raw recordings under dataset/raw are NEVER modified or deleted.

Outputs:
  dataset/preprocessing_input/unique_audio/
      One copy of each usable audio hash that occurs under a single provisional
      participant ID. These files are eligible for later preprocessing review.
  dataset/preprocessing_input/cross_participant_review/
      One representative copy for each usable hash found under more than one
      provisional participant ID. Held out pending identity verification.
  dataset/reports/
      Duplicate manifests, clean-input manifest, review/exclusion manifests,
      and a JSON summary.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import soundfile as sf


AUDIO_EXTENSIONS = {".wav"}
LONG_RECORDING_SECONDS = 30.0


def project_root() -> Path:
    # This script is expected at <project_root>/dataset_tools/<script>.py
    return Path(__file__).resolve().parent.parent


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        while True:
            chunk = file_handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def participant_id_from_filename(path: Path) -> str:
    # Treat only the first underscore-delimited token as a provisional ID.
    # This is a filename-derived grouping key, not verified participant identity.
    return path.stem.split("_", 1)[0]


def relative_to_root(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def inspect_file(path: Path, raw_root: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "file_name": path.name,
        "relative_path": relative_to_root(path, raw_root),
        "provisional_participant_id": participant_id_from_filename(path),
        "file_size_bytes": path.stat().st_size,
        "sha256": "",
        "sample_rate_hz": "",
        "channels": "",
        "frames": "",
        "duration_seconds": "",
        "status": "",
        "reason": "",
    }

    try:
        info = sf.info(str(path))
        result["sample_rate_hz"] = int(info.samplerate)
        result["channels"] = int(info.channels)
        result["frames"] = int(info.frames)
        duration = float(info.duration)
        result["duration_seconds"] = round(duration, 6)

        if info.frames <= 0 or duration <= 0:
            result["status"] = "EXCLUDED"
            result["reason"] = "ZERO_SAMPLES"
            return result

        result["sha256"] = sha256_file(path)
        result["status"] = "USABLE"
        if duration > LONG_RECORDING_SECONDS:
            result["reason"] = "LONG_RECORDING_RETAINED"
        return result

    except Exception as exc:
        result["status"] = "EXCLUDED"
        result["reason"] = f"UNREADABLE: {type(exc).__name__}: {exc}"
        return result


def copy_representative(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create deduplicated preprocessing inputs without changing raw audio."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace the generated preprocessing_input folder only. dataset/raw is never changed.",
    )
    args = parser.parse_args()

    root = project_root()
    raw_root = root / "dataset" / "raw"
    output_root = root / "dataset" / "preprocessing_input"
    report_root = root / "dataset" / "reports"

    if not raw_root.exists():
        print(f"ERROR: Raw dataset folder not found: {raw_root}")
        return 1

    if output_root.exists():
        existing_items = list(output_root.iterdir())
        if existing_items and not args.force:
            print(
                "ERROR: preprocessing_input already exists and is not empty.\n"
                "No files were changed. Inspect it first, or rerun with --force "
                "to replace only this generated output folder."
            )
            return 2
        if args.force:
            print("Removing existing generated preprocessing_input folder (--force).")
            shutil.rmtree(output_root)

    audio_paths = sorted(
        path for path in raw_root.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    )

    if not audio_paths:
        print(f"ERROR: No WAV files found under {raw_root}")
        return 1

    print(f"Project root: {root}")
    print(f"Raw folder:   {raw_root}")
    print(f"Found {len(audio_paths):,} WAV files. Inspecting files and calculating hashes...")

    inspected: list[dict[str, Any]] = []
    for index, path in enumerate(audio_paths, start=1):
        inspected.append(inspect_file(path, raw_root))
        if index % 250 == 0 or index == len(audio_paths):
            print(f"Inspected {index:,}/{len(audio_paths):,}")

    excluded_rows = [row for row in inspected if row["status"] == "EXCLUDED"]
    usable_rows = [row for row in inspected if row["status"] == "USABLE"]

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in usable_rows:
        groups[row["sha256"]].append(row)

    unique_dir = output_root / "unique_audio"
    cross_dir = output_root / "cross_participant_review"
    unique_dir.mkdir(parents=True, exist_ok=True)
    cross_dir.mkdir(parents=True, exist_ok=True)

    duplicate_manifest: list[dict[str, Any]] = []
    clean_manifest: list[dict[str, Any]] = []
    cross_review_manifest: list[dict[str, Any]] = []

    within_participant_duplicate_groups = 0
    cross_participant_duplicate_groups = 0
    duplicate_groups = 0
    copied_unique = 0
    copied_cross = 0
    long_recordings_retained = 0

    for file_hash, members in sorted(groups.items(), key=lambda item: item[0]):
        members = sorted(members, key=lambda row: row["relative_path"])
        participant_ids = sorted({row["provisional_participant_id"] for row in members})
        representative = members[0]
        source_path = raw_root / Path(representative["relative_path"])

        is_cross_participant = len(participant_ids) > 1
        if len(members) > 1:
            duplicate_groups += 1
            if is_cross_participant:
                cross_participant_duplicate_groups += 1
            else:
                within_participant_duplicate_groups += 1

        destination_dir = cross_dir if is_cross_participant else unique_dir
        destination_path = destination_dir / source_path.name
        copy_representative(source_path, destination_path)

        if is_cross_participant:
            copied_cross += 1
            cross_review_manifest.append({
                "sha256": file_hash,
                "representative_file": representative["file_name"],
                "representative_raw_path": representative["relative_path"],
                "copied_path": relative_to_root(destination_path, root),
                "provisional_participant_ids": ";".join(participant_ids),
                "source_file_count": len(members),
                "source_files": ";".join(row["relative_path"] for row in members),
                "review_status": "HOLD_PENDING_PARTICIPANT_IDENTITY_VERIFICATION",
            })
        else:
            copied_unique += 1
            clean_manifest.append({
                "sha256": file_hash,
                "representative_file": representative["file_name"],
                "representative_raw_path": representative["relative_path"],
                "copied_path": relative_to_root(destination_path, root),
                "provisional_participant_id": representative["provisional_participant_id"],
                "source_file_count": len(members),
                "source_files": ";".join(row["relative_path"] for row in members),
                "duration_seconds": representative["duration_seconds"],
                "technical_note": representative["reason"],
            })

        if representative["reason"] == "LONG_RECORDING_RETAINED":
            long_recordings_retained += 1

        if len(members) > 1:
            for member in members:
                duplicate_manifest.append({
                    "sha256": file_hash,
                    "provisional_participant_id": member["provisional_participant_id"],
                    "file_name": member["file_name"],
                    "raw_relative_path": member["relative_path"],
                    "representative_file": representative["file_name"],
                    "representative_raw_path": representative["relative_path"],
                    "group_file_count": len(members),
                    "group_participant_ids": ";".join(participant_ids),
                    "classification": (
                        "CROSS_PARTICIPANT_REVIEW"
                        if is_cross_participant
                        else "WITHIN_PARTICIPANT_DUPLICATE"
                    ),
                })

    duplicate_fields = [
        "sha256", "provisional_participant_id", "file_name", "raw_relative_path",
        "representative_file", "representative_raw_path", "group_file_count",
        "group_participant_ids", "classification",
    ]
    clean_fields = [
        "sha256", "representative_file", "representative_raw_path", "copied_path",
        "provisional_participant_id", "source_file_count", "source_files",
        "duration_seconds", "technical_note",
    ]
    cross_fields = [
        "sha256", "representative_file", "representative_raw_path", "copied_path",
        "provisional_participant_ids", "source_file_count", "source_files", "review_status",
    ]
    excluded_fields = [
        "file_name", "relative_path", "provisional_participant_id", "file_size_bytes",
        "sample_rate_hz", "channels", "frames", "duration_seconds", "status", "reason",
    ]

    report_root.mkdir(parents=True, exist_ok=True)
    write_csv(report_root / "deduplication_duplicate_manifest.csv", duplicate_manifest, duplicate_fields)
    write_csv(report_root / "deduplication_clean_input_manifest.csv", clean_manifest, clean_fields)
    write_csv(report_root / "deduplication_cross_participant_review.csv", cross_review_manifest, cross_fields)
    write_csv(report_root / "deduplication_excluded_files.csv", excluded_rows, excluded_fields)

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "raw_folder": relative_to_root(raw_root, root),
        "output_folder": relative_to_root(output_root, root),
        "raw_audio_modified": False,
        "total_wav_files_found": len(audio_paths),
        "usable_files": len(usable_rows),
        "excluded_files": len(excluded_rows),
        "unique_audio_hashes": len(groups),
        "clean_unique_audio_copies": copied_unique,
        "cross_participant_review_copies": copied_cross,
        "duplicate_hash_groups": duplicate_groups,
        "within_participant_duplicate_groups": within_participant_duplicate_groups,
        "cross_participant_duplicate_groups": cross_participant_duplicate_groups,
        "duplicate_manifest_rows": len(duplicate_manifest),
        "long_recordings_retained": long_recordings_retained,
        "important_limitations": [
            "Raw audio under dataset/raw was not modified or deleted.",
            "Participant IDs are provisional filename-derived grouping keys, not verified identities.",
            "Cross-participant duplicate hashes are held out from clean inputs pending identity verification.",
            "No DLD or typically developing labels were inferred or assigned.",
            "Long recordings are retained; they are not automatically treated as faulty.",
            "This process performs exact-file deduplication only; it does not assess clinical or linguistic content.",
        ],
    }

    summary_path = report_root / "deduplication_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\nDEDUPLICATION PREPARATION COMPLETE")
    print(f"Total WAV files:                     {len(audio_paths):,}")
    print(f"Usable files:                        {len(usable_rows):,}")
    print(f"Excluded files:                      {len(excluded_rows):,}")
    print(f"Unique SHA-256 hashes:               {len(groups):,}")
    print(f"Clean unique copies:                 {copied_unique:,}")
    print(f"Cross-participant review copies:     {copied_cross:,}")
    print(f"Duplicate hash groups:               {duplicate_groups:,}")
    print(f"  Within-participant groups:         {within_participant_duplicate_groups:,}")
    print(f"  Cross-participant groups:           {cross_participant_duplicate_groups:,}")
    print(f"Long recordings retained:            {long_recordings_retained:,}")
    print("\nReports written to dataset/reports/")
    print("Raw dataset remains untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())