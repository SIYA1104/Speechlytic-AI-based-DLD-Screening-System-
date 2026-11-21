
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;

const STORY_PASSAGES: Record<string, { title: string; text: string }> = {
  "5–6": {
    title: "The Red Kite",
    text: "Mia has a red kite. The wind lifts it high. It dips over a tree. Mia runs and laughs. When the wind rests, the kite comes down. Mia folds it and walks home.",
  },
  "7–8": {
    title: "A Home for Pip",
    text: "After the rain, Sam found a small bird beside the garden path. Its wing looked tired, so he called his aunt. They placed the bird in a warm box and brought it to a local animal helper. The next morning, the bird was stronger. Sam watched as it flew from the garden gate and disappeared into the bright sky.",
  },
  "9–10": {
    title: "The Garden Clock",
    text: "Every Saturday, Noor helped her grandfather in the garden. One morning, she noticed that the old clock by the shed had stopped. They opened its wooden case and found a tiny leaf caught between the hands. Noor carefully removed it, and the clock began to tick again. Her grandfather smiled. The garden, he said, had its own way of reminding them to slow down and look closely.",
  },
  "11–12": {
    title: "The Library Window",
    text: "On the way home from school, Eli noticed that the library window was dark. A notice explained that the reading room would close while repairs were made. Instead of waiting for it to reopen, Eli and two friends asked the librarian if they could help. They sorted books, made a list of damaged shelves, and suggested moving the afternoon story group to the community hall. By Friday, the room was ready again. The librarian thanked them, but Eli felt proudest that the younger children never missed story time.",
  },
};

type AnalysisResult = {
  filename: string;
  analysis: {
    analysis_type: string;
    is_dld_assessment: boolean;
    audio: {
      original_sample_rate: number;
      processed_sample_rate: number;
      original_channels: number;
      duration_seconds: number;
    };
    features: {
      rms_mean: number;
      rms_std: number;
      silence_fraction: number;
      zero_crossing_rate_mean: number;
      spectral_centroid_mean_hz: number;
      pitch_median_hz: number | null;
      mfcc_mean: number[];
      mfcc_std: number[];
    };
    waveform: number[];
    limitations: string[];
  };
  model_result?: {
    model_type: string;
    cluster: number;
    unusual_acoustic_pattern: boolean;
    anomaly_score: number;
    interpretation: string;
    diagnostic_use: boolean;
    warning: string;
  } | null;
};

type QualityReport = {
  status: "Passed" | "Review" | "Failed";
  messages: string[];
  duration: number | null;
  sampleRate: number | null;
  channels: number | null;
  rms: number | null;
  peak: number | null;
  clippingPercent: number | null;
};

type RecordingMetadata = {
  participantCode: string;
  ageGroup: string;
  language: string;
  recordingDate: string;
  recordingType: string;
  storyTitle: string;
  consentStatus: string;
  ethicsStatus: string;
  notes: string;
};

type AudioItem = {
  id: string;
  file: File;
  url: string;
  status: "pending" | "processing" | "completed" | "failed";
  result: AnalysisResult | null;
  error: string;
  metadata: RecordingMetadata;
  quality: QualityReport | null;
  duplicateOf: string | null;
};

const defaultMetadata = (): RecordingMetadata => ({
  participantCode: "",
  ageGroup: "",
  language: "English",
  recordingDate: new Date().toISOString().slice(0, 10),
  recordingType: "Spontaneous speech",
  storyTitle: "",
  consentStatus: "Not recorded",
  ethicsStatus: "Not recorded",
  notes: "",
});

const emptyQuality = (): QualityReport => ({
  status: "Review",
  messages: ["Quality check has not completed."],
  duration: null,
  sampleRate: null,
  channels: null,
  rms: null,
  peak: null,
  clippingPercent: null,
});

async function inspectWavFile(file: File): Promise<QualityReport> {
  const messages: string[] = [];
  let audioContext: AudioContext | null = null;

  try {
    if (!file.name.toLowerCase().endsWith(".wav")) {
      return {
        ...emptyQuality(),
        status: "Failed",
        messages: ["File extension is not WAV."],
      };
    }

    if (file.size === 0) {
      return {
        ...emptyQuality(),
        status: "Failed",
        messages: ["The file is empty."],
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        ...emptyQuality(),
        status: "Failed",
        messages: ["File exceeds the 20 MB limit."],
      };
    }

    const buffer = await file.arrayBuffer();

    if (buffer.byteLength < 44) {
      return {
        ...emptyQuality(),
        status: "Failed",
        messages: ["File is too small to contain a standard WAV header."],
      };
    }

    const view = new DataView(buffer);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );

    if (riff !== "RIFF" || wave !== "WAVE") {
      return {
        ...emptyQuality(),
        status: "Failed",
        messages: ["Invalid WAV container header."],
      };
    }

    audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));

    const duration = decoded.duration;
    const sampleRate = decoded.sampleRate;
    const channels = decoded.numberOfChannels;

    if (!Number.isFinite(duration) || duration <= 0) {
      messages.push("Audio duration could not be validated.");
    } else if (duration < 1) {
      messages.push("Recording is shorter than one second.");
    } else if (duration > MAX_DURATION_SECONDS) {
      messages.push("Recording exceeds the 180-second analysis limit.");
    }

    if (sampleRate < 8000) {
      messages.push("Sample rate is below 8 kHz.");
    }

    if (channels < 1) {
      messages.push("No audio channels were detected.");
    }

    let sumSquares = 0;
    let totalSamples = 0;
    let peak = 0;
    let clippedSamples = 0;

    for (let channel = 0; channel < channels; channel++) {
      const samples = decoded.getChannelData(channel);

      for (let i = 0; i < samples.length; i++) {
        const value = samples[i];
        const absolute = Math.abs(value);

        sumSquares += value * value;
        totalSamples++;

        if (absolute > peak) peak = absolute;
        if (absolute >= 0.999) clippedSamples++;
      }
    }

    const rms =
      totalSamples > 0 ? Math.sqrt(sumSquares / totalSamples) : 0;

    const clippingPercent =
      totalSamples > 0 ? (clippedSamples / totalSamples) * 100 : 0;

    if (rms < 0.005) {
      messages.push("Audio level is very low; possible silence or quiet recording.");
    }

    if (clippingPercent > 1) {
      messages.push("More than 1% of samples are near the clipping threshold.");
    }

    if (messages.length === 0) {
      messages.push("Basic audio quality checks passed.");
    }

    const failed =
      duration <= 0 ||
      duration > MAX_DURATION_SECONDS ||
      sampleRate < 8000;

    const needsReview = messages.some(
      (message) => !message.includes("passed")
    );

    return {
      status: failed ? "Failed" : needsReview ? "Review" : "Passed",
      messages,
      duration,
      sampleRate,
      channels,
      rms,
      peak,
      clippingPercent,
    };
  } catch {
    return {
      ...emptyQuality(),
      status: "Failed",
      messages: [
        "The browser could not decode this file. Check whether it is a valid WAV recording.",
      ],
    };
  } finally {
    if (audioContext) {
      await audioContext.close().catch(() => undefined);
    }
  }
}

async function convertToWav(recordedBlob: Blob): Promise<Blob> {
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(
      await recordedBlob.arrayBuffer()
    );

    const channels = decoded.numberOfChannels;
    const sampleRate = decoded.sampleRate;
    const frames = decoded.length;
    const bytesPerSample = 2;
    const dataSize = frames * channels * bytesPerSample;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = Array.from(
      { length: channels },
      (_, channel) => decoded.getChannelData(channel)
    );

    let offset = 44;

    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(
          -1,
          Math.min(1, channelData[channel][frame])
        );

        const pcm = sample < 0 ? sample * 32768 : sample * 32767;

        view.setInt16(offset, pcm, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function Home() {
  const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
  const [activeSection, setActiveSection] = useState("overview");
  const [storyAgeGroup, setStoryAgeGroup] = useState("7–8");

function navigateToSection(sectionId: string) {
  setActiveSection(sectionId);

  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [qualityFilter, setQualityFilter] = useState("All");
  const [participantFilter, setParticipantFilter] = useState("All");

  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [metadataMessage, setMetadataMessage] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioItemsRef = useRef<AudioItem[]>([]);

  audioItemsRef.current = audioItems;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);

      streamRef.current?.getTracks().forEach((track) => track.stop());

      audioItemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function addFiles(
    files: File[],
    recordingType = "Spontaneous speech",
    ageGroup = "",
    storyTitle = ""
  ) {
    setError("");

    const additions: AudioItem[] = [];

    for (const file of files) {
      if (
        file.type !== "audio/wav" &&
        !file.name.toLowerCase().endsWith(".wav")
      ) {
        setError(`${file.name}: Please select a WAV file.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: File size must not exceed 20 MB.`);
        continue;
      }

      if (file.size === 0) {
        setError(`${file.name}: This file is empty.`);
        continue;
      }

      const duplicate = audioItemsRef.current.find(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified
      );

      const item: AudioItem = {
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        status: "pending",
        result: null,
        error: "",
        metadata: {
          ...defaultMetadata(),
          ageGroup,
          recordingType,
          storyTitle,
        },
        quality: null,
        duplicateOf: duplicate?.id ?? null,
      };

      additions.push(item);

      const quality = await inspectWavFile(file);
      item.quality = quality;
    }

    if (additions.length > 0) {
      setAudioItems((previous) => [...previous, ...additions]);
      setSelectedId(additions[0].id);
    }
  }

  async function startRecording(
    recordingType = "Spontaneous speech",
    ageGroup = "",
    storyTitle = ""
  ) {
    try {
      setError("");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is unavailable. Open the app using localhost in Chrome."
        );
      }

      if (!window.MediaRecorder) {
        throw new Error("Your browser does not support audio recording.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError("An error occurred while recording audio.");
        stopTimer();
        releaseMicrophone();
        setRecording(false);
        setConverting(false);
        recorderRef.current = null;
      };

      recorder.onstop = async () => {
        stopTimer();
        setRecording(false);
        setConverting(true);

        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          if (!blob.size) throw new Error("No audio was captured.");

          const wavBlob = await convertToWav(blob);

          const recordedFile = new File(
            [wavBlob],
            `${recordingType === "Story reading" ? "story-reading" : "microphone-recording"}-${Date.now()}.wav`,
            { type: "audio/wav" }
          );

          await addFiles([recordedFile], recordingType, ageGroup, storyTitle);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to convert microphone recording."
          );
        } finally {
          releaseMicrophone();
          recorderRef.current = null;
          setConverting(false);
        }
      };

      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
    } catch (err) {
      releaseMicrophone();

      setError(
        err instanceof Error
          ? err.message
          : "Unable to access the microphone."
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function analyzeAudio(id: string) {
    const item = audioItems.find((entry) => entry.id === id);

    if (!item || busyId) return;

    setError("");
    setBusyId(id);

    setAudioItems((previous) =>
      previous.map((entry) =>
        entry.id === id
          ? { ...entry, status: "processing", error: "" }
          : entry
      )
    );

    const formData = new FormData();
    formData.append("file", item.file);

    try {
      const response = await fetch(`${API_URL}/api/audio/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Audio analysis failed."
        );
      }

      setAudioItems((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "completed",
                result: data as AnalysisResult,
                error: "",
              }
            : entry
        )
      );

      setSelectedId(id);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to connect to the backend.";

      setAudioItems((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? { ...entry, status: "failed", error: message }
            : entry
        )
      );

      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  function updateMetadata(
    id: string,
    field: keyof RecordingMetadata,
    value: string
  ) {
    setAudioItems((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              metadata: { ...item.metadata, [field]: value },
            }
          : item
      )
    );

    setMetadataMessage("Metadata updated for this session.");
  }

  function removeAudio(id: string) {
    const item = audioItems.find((entry) => entry.id === id);

    if (item) URL.revokeObjectURL(item.url);

    const remaining = audioItems.filter((entry) => entry.id !== id);

    setAudioItems(remaining);
    setComparisonIds((previous) => previous.filter((value) => value !== id));

    if (selectedId === id) {
      setSelectedId(remaining[0]?.id ?? null);
    }
  }

  function toggleComparison(id: string) {
    setComparisonIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    );
  }

  const selectedItem =
    audioItems.find((item) => item.id === selectedId) ?? null;

  const result = selectedItem?.result ?? null;
  const features = result?.analysis.features;
  const audio = result?.analysis.audio;
  const waveform = result?.analysis.waveform ?? [];

  const waveformPoints = waveform
    .map((value, index) => {
      const x =
        waveform.length > 1
          ? (index / (waveform.length - 1)) * 1000
          : 0;

      return `${x},${75 - value * 65}`;
    })
    .join(" ");

  const formattedTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  const participantCodes = useMemo(
    () =>
      Array.from(
        new Set(
          audioItems
            .map((item) => item.metadata.participantCode.trim())
            .filter(Boolean)
        )
      ).sort(),
    [audioItems]
  );

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return audioItems.filter((item) => {
      const matchesSearch =
        !query ||
        item.file.name.toLowerCase().includes(query) ||
        item.metadata.storyTitle.toLowerCase().includes(query) ||
        item.metadata.participantCode.toLowerCase().includes(query) ||
        item.metadata.language.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All" || item.status === statusFilter.toLowerCase();

      const matchesQuality =
        qualityFilter === "All" || item.quality?.status === qualityFilter;

      const matchesParticipant =
        participantFilter === "All" ||
        item.metadata.participantCode === participantFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesQuality &&
        matchesParticipant
      );
    });
  }, [
    audioItems,
    searchTerm,
    statusFilter,
    qualityFilter,
    participantFilter,
  ]);

  const comparisonItems = audioItems.filter(
    (item) =>
      comparisonIds.includes(item.id) &&
      item.status === "completed" &&
      item.result
  );
  const storyRecordings = audioItems.filter(
    (item) => item.metadata.recordingType === "Story reading"
  );
  const latestStoryRecording = storyRecordings[storyRecordings.length - 1] ?? null;

  function exportDatasetCsv() {
    const headers = [
      "File name",
      "Participant code",
      "Age group",
      "Language",
      "Recording date",
      "Recording type",
      "Story title",
      "Consent status",
      "Ethics approval status",
      "Research notes",
      "Analysis status",
      "Quality status",
      "Quality messages",
      "File size bytes",
      "Duration seconds",
      "Sample rate Hz",
      "Channels",
      "RMS quality check",
      "Peak amplitude",
      "Clipping percent",
      "Analysis duration seconds",
      "RMS mean",
      "RMS standard deviation",
      "Zero crossing rate mean",
      "Spectral centroid mean Hz",
      "Median pitch Hz",
      ...Array.from({ length: 13 }, (_, index) => `MFCC ${index + 1} mean`),
    ];

    const rows = audioItems.map((item) => {
      const quality = item.quality;
      const analysis = item.result?.analysis;
      const feature = analysis?.features;
      const audioData = analysis?.audio;

      return [
        item.file.name,
        item.metadata.participantCode,
        item.metadata.ageGroup,
        item.metadata.language,
        item.metadata.recordingDate,
        item.metadata.recordingType,
        item.metadata.storyTitle,
        item.metadata.consentStatus,
        item.metadata.ethicsStatus,
        item.metadata.notes,
        item.status,
        quality?.status ?? "Unchecked",
        quality?.messages.join("; ") ?? "",
        item.file.size,
        quality?.duration ?? "",
        quality?.sampleRate ?? "",
        quality?.channels ?? "",
        quality?.rms ?? "",
        quality?.peak ?? "",
        quality?.clippingPercent ?? "",
        audioData?.duration_seconds ?? "",
        feature?.rms_mean ?? "",
        feature?.rms_std ?? "",
        feature?.zero_crossing_rate_mean ?? "",
        feature?.spectral_centroid_mean_hz ?? "",
        feature?.pitch_median_hz ?? "",
        ...Array.from({ length: 13 }, (_, index) =>
          feature?.mfcc_mean?.[index] ?? ""
        ),
      ];
    });

    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `speech-research-dataset-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportComparisonCsv() {
    if (comparisonItems.length === 0) return;

    const headers = [
      "File name",
      "Participant code",
      "Duration seconds",
      "RMS mean",
      "RMS standard deviation",
      "Zero crossing rate mean",
      "Spectral centroid mean Hz",
      "Median pitch Hz",
      ...Array.from({ length: 13 }, (_, index) => `MFCC ${index + 1} mean`),
    ];

    const rows = comparisonItems.map((item) => {
      const feature = item.result!.analysis.features;
      const audioData = item.result!.analysis.audio;

      return [
        item.file.name,
        item.metadata.participantCode,
        audioData.duration_seconds,
        feature.rms_mean,
        feature.rms_std,
        feature.zero_crossing_rate_mean,
        feature.spectral_centroid_mean_hz,
        feature.pitch_median_hz ?? "",
        ...Array.from({ length: 13 }, (_, index) =>
          feature.mfcc_mean[index] ?? ""
        ),
      ];
    });

    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audio-comparison.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const qualityCounts = {
    passed: audioItems.filter((item) => item.quality?.status === "Passed").length,
    review: audioItems.filter((item) => item.quality?.status === "Review").length,
    failed: audioItems.filter((item) => item.quality?.status === "Failed").length,
  };

  const consentCount = audioItems.filter(
    (item) => item.metadata.consentStatus === "Recorded"
  ).length;

  const ethicsCount = audioItems.filter(
    (item) => item.metadata.ethicsStatus === "Approved"
  ).length;

  const controlStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d6deeb",
    borderRadius: 8,
    background: "#fff",
    color: "#17243a",
    font: "inherit",
    marginTop: 6,
  };

  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  };

  const smallLabelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 650,
    color: "#52627a",
  };

  const actionButtonStyle: React.CSSProperties = {
    border: "1px solid #d6deeb",
    background: "#fff",
    color: "#24334a",
    borderRadius: 8,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div>
            <strong>Speech Analytics</strong>
            <small>Research Platform</small>
          </div>
        </div>

        <nav aria-label="Main navigation">
  <button
    type="button"
    className={`nav-item ${activeSection === "overview" ? "active" : ""}`}
    onClick={() => navigateToSection("overview")}
    aria-current={activeSection === "overview" ? "page" : undefined}
  >
    ◈ Overview
  </button>

  <button
    type="button"
    className={`nav-item ${activeSection === "audio-analysis" ? "active" : ""}`}
    onClick={() => navigateToSection("audio-analysis")}
    aria-current={activeSection === "audio-analysis" ? "page" : undefined}
  >
    ♫ Audio Analysis
  </button>

  <button
    type="button"
    className={`nav-item ${activeSection === "story-assessment" ? "active" : ""}`}
    onClick={() => navigateToSection("story-assessment")}
    aria-current={activeSection === "story-assessment" ? "page" : undefined}
  >
    ▷ Story Reading
  </button>

  <button
    type="button"
    className={`nav-item ${activeSection === "research-dataset" ? "active" : ""}`}
    onClick={() => navigateToSection("research-dataset")}
    aria-current={activeSection === "research-dataset" ? "page" : undefined}
  >
    ▤ Research Dataset
  </button>

  <button
    type="button"
    className={`nav-item ${activeSection === "settings" ? "active" : ""}`}
    onClick={() => navigateToSection("settings")}
    aria-current={activeSection === "settings" ? "page" : undefined}
  >
    ⚙ Settings
  </button>
</nav>

        <div className="sidebar-bottom">
          <span className="status-dot" />
          Backend connection checked during analysis
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar" id="overview">
          <div>
            <span className="eyebrow">RESEARCH WORKSPACE</span>
            <h1>Audio Analysis Dashboard</h1>
            <p>
              Manage recordings, research metadata, quality checks, and
              acoustic measurements.
            </p>
          </div>

          <span className="version">VERSION 0.5.0</span>
        </header>

        <section className="notice">
          <strong>Research prototype</strong>
          <span>
            Acoustic feature extraction only. This application does not
            diagnose DLD or classify medical conditions. Quality checks are
            technical checks, not clinical assessments.
          </span>
        </section>

        <section className="story-card" id="story-assessment">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEW / ENGLISH READING TASK</span>
              <h2>Story-Based Speech Assessment</h2>
            </div>
            <span className="format-tag">PRELIMINARY RESEARCH WORKFLOW</span>
          </div>
          <p className="chart-caption">
            Choose an age band, read the short passage aloud, then submit the recording to the existing acoustic analysis pipeline.
          </p>
          <label className="story-age-select">
            <span>Child’s age group</span>
            <select value={storyAgeGroup} onChange={(event) => setStoryAgeGroup(event.target.value)}>
              {Object.keys(STORY_PASSAGES).map((age) => <option key={age} value={age}>{age} years</option>)}
            </select>
          </label>
          <article className="story-passage" aria-live="polite">
            <div className="story-passage-heading">
              <span className="eyebrow">READ THIS STORY</span>
              <span className="story-reading-time">About 1 minute</span>
            </div>
            <h3>{STORY_PASSAGES[storyAgeGroup].title}</h3>
            <p>{STORY_PASSAGES[storyAgeGroup].text}</p>
          </article>
          <div className="story-actions">
            {!recording && !converting ? (
              <button
                type="button"
                className="record-button"
                onClick={() => void startRecording("Story reading", storyAgeGroup, STORY_PASSAGES[storyAgeGroup].title)}
                disabled={!!busyId}
              >
                <span className="record-dot" /> Start story recording
              </button>
            ) : recording ? (
              <button type="button" className="stop-button" onClick={stopRecording}>
                <span className="stop-square" /> Stop recording
              </button>
            ) : (
              <button type="button" className="record-button" disabled>Preparing recording…</button>
            )}
            {latestStoryRecording && (
              <button
                type="button"
                className="analyze-button"
                onClick={() => {
                  setSelectedId(latestStoryRecording.id);
                  if (latestStoryRecording.status !== "completed") void analyzeAudio(latestStoryRecording.id);
                  navigateToSection("research-dataset");
                }}
                disabled={!!busyId || recording || converting || latestStoryRecording.status === "processing" || latestStoryRecording.quality?.status === "Failed"}
              >
                {latestStoryRecording.status === "completed" ? "View latest report" : "Submit latest recording"}
              </button>
            )}
          </div>
          {recording && (
            <div className="recording-indicator" role="status">
              <span className="recording-pulse" /> Recording in progress — {formattedTime(recordingSeconds)}
            </div>
          )}
          {converting && <div className="recording-indicator" role="status">Preparing and checking your recording…</div>}
          {error && <div className="error-message" role="alert">{error}</div>}
          {latestStoryRecording && (
            <div className="story-report" aria-live="polite">
              <strong>Latest story session: {latestStoryRecording.metadata.storyTitle || latestStoryRecording.file.name}</strong>
              <span>Status: {latestStoryRecording.status} · Recording quality: {latestStoryRecording.quality?.status ?? "checking"}</span>
              {latestStoryRecording.error && <span role="alert">Analysis error: {latestStoryRecording.error}</span>}
              {latestStoryRecording.result ? (
                <div className="story-report-metrics">
                  <span>Duration<strong>{latestStoryRecording.result.analysis.audio.duration_seconds.toFixed(1)} sec</strong></span>
                  <span>Silence frames<strong>{(latestStoryRecording.result.analysis.features.silence_fraction * 100).toFixed(1)}%</strong></span>
                  <span>Mean pitch<strong>{latestStoryRecording.result.analysis.features.pitch_median_hz == null ? "Unavailable" : `${latestStoryRecording.result.analysis.features.pitch_median_hz} Hz`}</strong></span>
                </div>
              ) : <p className="chart-caption">Submit the recording to see the acoustic measurements supported by this backend.</p>}
              <div className="story-report-coverage">
                <span>Transcript <strong>Not available</strong></span>
                <span>Reading completion <strong>Not measured</strong></span>
                <span>Speaking rate and pauses <strong>Not measured</strong></span>
                <span>Pronunciation and language patterns <strong>Not measured</strong></span>
                <span>Screening summary <strong>No screening result</strong></span>
              </div>
              <p className="story-report-limit">The current API returns acoustic measurements only. A qualified speech-language professional should interpret any concerns and decide whether further assessment is appropriate.</p>
            </div>
          )}
        </section>

        <section className="metric-grid">
          <Metric
            label="Total recordings"
            value={String(audioItems.length)}
            detail="Current browser session"
          />
          <Metric
            label="Quality passed"
            value={String(qualityCounts.passed)}
            detail="Basic technical checks"
          />
          <Metric
            label="Consent recorded"
            value={String(consentCount)}
            detail="Based on entered metadata"
          />
          <Metric
            label="Ethics approved"
            value={String(ethicsCount)}
            detail="Based on entered metadata"
          />
        </section>

        <section className="upload-card" id="audio-analysis">
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 / AUDIO INPUT</span>
              <h2>Add audio recordings</h2>
            </div>
            <span className="format-tag">WAV · MAX 20 MB EACH</span>
          </div>

          <div
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addFiles(Array.from(event.dataTransfer.files));
            }}
            onClick={() => inputRef.current?.click()}
          >
            <div className="upload-icon">↑</div>
            <strong>Drop one or multiple WAV recordings here</strong>
            <p>or click to browse your computer</p>

            <input
              ref={inputRef}
              type="file"
              accept=".wav,audio/wav"
              multiple
              hidden
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>

          <div className="recording-controls">
            <div>
              <strong>Record using microphone</strong>
              <p>Capture another recording directly from your device.</p>
            </div>

            {!recording && !converting ? (
              <button
                type="button"
                className="record-button"
                onClick={() => {
  void startRecording();
}}
                disabled={!!busyId}
              >
                <span className="record-dot" />
                Start recording
              </button>
            ) : recording ? (
              <button
                type="button"
                className="stop-button"
                onClick={stopRecording}
              >
                <span className="stop-square" />
                Stop recording
              </button>
            ) : (
              <button type="button" className="record-button" disabled>
                Converting to WAV...
              </button>
            )}
          </div>

          {recording && (
            <div className="recording-indicator">
              <span className="recording-pulse" />
              Recording in progress — {formattedTime(recordingSeconds)}
            </div>
          )}

          {converting && (
            <div className="recording-indicator">
              Preparing and checking your WAV recording...
            </div>
          )}

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </section>

        <section className="analysis-card" id="research-dataset">
          <div className="section-heading">
            <div>
              <span className="eyebrow">02 / DATASET MANAGEMENT</span>
              <h2>Research dataset</h2>
            </div>

            <button
              type="button"
              className="analyze-button"
              onClick={exportDatasetCsv}
              disabled={audioItems.length === 0}
            >
              Export dataset CSV ↓
            </button>
          </div>

          <p className="chart-caption">
            Search and filter the current session. Export includes metadata,
            quality checks, and available acoustic features.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
              margin: "18px 0",
            }}
          >
            <label style={fieldStyle}>
              <span style={smallLabelStyle}>Search</span>
              <input
                style={controlStyle}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="File, participant, language..."
              />
            </label>

            <label style={fieldStyle}>
              <span style={smallLabelStyle}>Analysis status</span>
              <select
                style={controlStyle}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All</option>
                <option>Pending</option>
                <option>Processing</option>
                <option>Completed</option>
                <option>Failed</option>
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={smallLabelStyle}>Quality status</span>
              <select
                style={controlStyle}
                value={qualityFilter}
                onChange={(event) => setQualityFilter(event.target.value)}
              >
                <option>All</option>
                <option>Passed</option>
                <option>Review</option>
                <option>Failed</option>
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={smallLabelStyle}>Participant</span>
              <select
                style={controlStyle}
                value={participantFilter}
                onChange={(event) => setParticipantFilter(event.target.value)}
              >
                <option value="All">All participants</option>
                {participantCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="detail-list">
            {filteredItems.length === 0 ? (
              <p className="chart-caption">
                No recordings match these filters.
              </p>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: selectedId === item.id ? 700 : 400,
                      minWidth: 150,
                      flex: 1,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {selectedId === item.id ? "▶ " : ""}
                    {item.file.name}
                    <small
                      style={{
                        display: "block",
                        color: "#718096",
                        marginTop: 3,
                      }}
                    >
                      {item.metadata.participantCode || "No participant code"}
                      {" · "}
                      {item.metadata.language || "Language not set"}
                    </small>
                  </button>

                  <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {item.status === "pending" && "Waiting"}
                    {item.status === "processing" && "Analysing..."}
                    {item.status === "completed" && "✓ Completed"}
                    {item.status === "failed" && "Failed"}
                  </span>

                  <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    Quality: {item.quality?.status ?? "Checking"}
                  </span>

                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => setSelectedId(item.id)}
                  >
                    Details
                  </button>

                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => analyzeAudio(item.id)}
                    disabled={
                      !!busyId ||
                      item.status === "processing" ||
                      recording ||
                      converting ||
                      item.quality?.status === "Failed"
                    }
                  >
                    {item.status === "completed" ? "Reanalyse" : "Analyse"}
                  </button>

                  {item.status === "completed" && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={comparisonIds.includes(item.id)}
                        onChange={() => toggleComparison(item.id)}
                      />
                      Compare
                    </label>
                  )}

                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => removeAudio(item.id)}
                    disabled={busyId === item.id || recording || converting}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="chart-caption">
            Showing {filteredItems.length} of {audioItems.length} recordings.
            Possible duplicate files are flagged in the selected recording
            details.
          </p>
        </section>

        {selectedItem && (
          <>
            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">03 / RECORDING METADATA</span>
                  <h2>Participant and session information</h2>
                </div>
                <span className="format-tag">ANONYMOUS DATA ONLY</span>
              </div>

              <p className="chart-caption">
                Use a research participant code such as P001. Do not enter a
                child's name, address, phone number, school ID, or other
                identifying information.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 16,
                  marginTop: 18,
                }}
              >
                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Participant code</span>
                  <input
                    style={controlStyle}
                    value={selectedItem.metadata.participantCode}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "participantCode",
                        event.target.value
                      )
                    }
                    placeholder="e.g. P001"
                    maxLength={40}
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Age group</span>
                  <select
                    style={controlStyle}
                    value={selectedItem.metadata.ageGroup}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "ageGroup",
                        event.target.value
                      )
                    }
                  >
                    <option value="">Select age group</option>
                    <option value="Under 3 years">Under 3 years</option>
                    <option value="3–4 years">3–4 years</option>
                    <option value="4–5 years">4–5 years</option>
                    <option value="5–6 years">5–6 years</option>
                    <option value="6–7 years">6–7 years</option>
                    <option value="7–8 years">7–8 years</option>
                    <option value="8–10 years">8–10 years</option>
                    <option value="10+ years">10+ years</option>
                    <option value="Not recorded">Not recorded</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Language</span>
                  <select
                    style={controlStyle}
                    value={selectedItem.metadata.language}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "language",
                        event.target.value
                      )
                    }
                  >
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Other</option>
                    <option>Not recorded</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Recording date</span>
                  <input
                    style={controlStyle}
                    type="date"
                    value={selectedItem.metadata.recordingDate}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "recordingDate",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Recording type</span>
                  <select
                    style={controlStyle}
                    value={selectedItem.metadata.recordingType}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "recordingType",
                        event.target.value
                      )
                    }
                  >
                    <option>Spontaneous speech</option>
                    <option>Picture description</option>
                    <option>Story retelling</option>
                    <option>Reading task</option>
                    <option>Conversation</option>
                    <option>Word repetition</option>
                    <option>Other</option>
                    <option>Not recorded</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Consent status</span>
                  <select
                    style={controlStyle}
                    value={selectedItem.metadata.consentStatus}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "consentStatus",
                        event.target.value
                      )
                    }
                  >
                    <option>Not recorded</option>
                    <option>Recorded</option>
                    <option>Pending</option>
                    <option>Not obtained</option>
                    <option>Not applicable</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={smallLabelStyle}>Ethics approval status</span>
                  <select
                    style={controlStyle}
                    value={selectedItem.metadata.ethicsStatus}
                    onChange={(event) =>
                      updateMetadata(
                        selectedItem.id,
                        "ethicsStatus",
                        event.target.value
                      )
                    }
                  >
                    <option>Not recorded</option>
                    <option>Approved</option>
                    <option>Pending</option>
                    <option>Not approved</option>
                    <option>Not applicable</option>
                  </select>
                </label>
              </div>

              <label style={{ ...fieldStyle, marginTop: 16 }}>
                <span style={smallLabelStyle}>
                  Research notes (do not include identifying information)
                </span>
                <textarea
                  style={{
                    ...controlStyle,
                    minHeight: 80,
                    resize: "vertical",
                  }}
                  value={selectedItem.metadata.notes}
                  onChange={(event) =>
                    updateMetadata(
                      selectedItem.id,
                      "notes",
                      event.target.value
                    )
                  }
                  placeholder="Optional non-identifying recording notes..."
                  maxLength={500}
                />
              </label>

              <p className="chart-caption">
                {metadataMessage ||
                  "Metadata is held in the current browser session."}
              </p>
            </section>

            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">04 / AUDIO QUALITY CONTROL</span>
                  <h2>Recording quality report</h2>
                </div>
                <span
                  className={
                    selectedItem.quality?.status === "Passed"
                      ? "success-tag"
                      : "format-tag"
                  }
                >
                  {selectedItem.quality?.status ?? "Checking"}
                </span>
              </div>

              {selectedItem.duplicateOf && (
                <div className="notice" style={{ marginBottom: 14 }}>
                  <strong>Possible duplicate</strong>
                  <span>
                    A recording with the same filename, size, and modified
                    time is already present in this session. This is a
                    duplicate candidate, not a content-level identity check.
                  </span>
                </div>
              )}

              <div className="detail-list">
                <div>
                  <span>File size</span>
                  <strong>
                    {(selectedItem.file.size / (1024 * 1024)).toFixed(2)} MB
                  </strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>
                    {selectedItem.quality?.duration !== null &&
                    selectedItem.quality?.duration !== undefined
                      ? `${selectedItem.quality.duration.toFixed(2)} s`
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Sample rate</span>
                  <strong>
                    {selectedItem.quality?.sampleRate
                      ? `${selectedItem.quality.sampleRate} Hz`
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Channels</span>
                  <strong>
                    {selectedItem.quality?.channels ?? "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>RMS level</span>
                  <strong>
                    {selectedItem.quality?.rms !== null &&
                    selectedItem.quality?.rms !== undefined
                      ? selectedItem.quality.rms.toFixed(5)
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Peak amplitude</span>
                  <strong>
                    {selectedItem.quality?.peak !== null &&
                    selectedItem.quality?.peak !== undefined
                      ? selectedItem.quality.peak.toFixed(5)
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Clipping estimate</span>
                  <strong>
                    {selectedItem.quality?.clippingPercent !== null &&
                    selectedItem.quality?.clippingPercent !== undefined
                      ? `${selectedItem.quality.clippingPercent.toFixed(3)}%`
                      : "Unavailable"}
                  </strong>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <strong style={{ fontSize: 14 }}>Quality check findings</strong>
                {(selectedItem.quality?.messages ?? [
                  "Quality check has not completed.",
                ]).map((message, index) => (
                  <p className="chart-caption" key={index}>
                    • {message}
                  </p>
                ))}
              </div>

              <p className="chart-caption">
                These automated checks identify technical issues only. A
                passed recording is not necessarily suitable for every
                research protocol. Review recordings and protocol-specific
                requirements before including them in a study.
              </p>
            </section>

            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">05 / SELECTED RECORDING</span>
                  <h2>Audio player and analysis</h2>
                </div>
              </div>

              <div className="audio-player">
                <span>{selectedItem.file.name}</span>
                <audio controls src={selectedItem.url} />
                <button
                  className="analyze-button"
                  onClick={() => analyzeAudio(selectedItem.id)}
                  disabled={
                    !!busyId ||
                    recording ||
                    converting ||
                    selectedItem.quality?.status === "Failed"
                  }
                >
                  {busyId === selectedItem.id
                    ? "Processing audio..."
                    : selectedItem.status === "completed"
                      ? "Reanalyse selected recording →"
                      : "Analyze selected recording →"}
                </button>

                {selectedItem.error && (
                  <div className="error-message" role="alert">
                    {selectedItem.error}
                  </div>
                )}

                {selectedItem.quality?.status === "Failed" && (
                  <p className="chart-caption">
                    Analysis is disabled because the file failed a basic
                    technical check. Review the quality report first.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {result && features && audio ? (
          <>
            <div className="results-heading">
              <div>
                <span className="eyebrow">06 / ANALYSIS OUTPUT</span>
                <h2>Acoustic analysis results</h2>
                <p>{result.filename}</p>
              </div>
              <span className="success-tag">✓ Analysis completed</span>
            </div>

            <section className="metric-grid">
              <Metric
                label="Duration"
                value={`${audio.duration_seconds} s`}
                detail="Recording length"
              />
              <Metric
                label="RMS energy"
                value={features.rms_mean.toFixed(4)}
                detail="Mean signal energy"
              />
              <Metric
                label="Estimated pitch"
                value={
                  features.pitch_median_hz !== null
                    ? `${features.pitch_median_hz} Hz`
                    : "Unavailable"
                }
                detail="Median YIN estimate"
              />
              <Metric
                label="Spectral centroid"
                value={`${features.spectral_centroid_mean_hz} Hz`}
                detail="Mean spectral centroid"
              />
            </section>

            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">07 / SIGNAL VISUALIZATION</span>
                  <h2>Audio waveform</h2>
                </div>
                <span className="format-tag">AMPLITUDE</span>
              </div>

              <div className="waveform-container">
                <svg
                  viewBox="0 0 1000 150"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Audio waveform from processed recording"
                >
                  <line
                    x1="0"
                    y1="75"
                    x2="1000"
                    y2="75"
                    stroke="#d6deeb"
                    strokeWidth="1"
                  />
                  <polyline
                    points={waveformPoints}
                    fill="none"
                    stroke="#3979d6"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <p className="chart-caption">
                Waveform generated from actual processed audio samples.
              </p>
            </section>

            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">08 / FEATURE EXTRACTION</span>
                  <h2>MFCC coefficients</h2>
                </div>
                <span className="format-tag">13 COEFFICIENTS</span>
              </div>

              <div className="mfcc-grid">
                {features.mfcc_mean.map((value, index) => (
                  <div className="mfcc-item" key={index}>
                    <span>MFCC {index + 1}</span>
                    <strong>{value.toFixed(3)}</strong>
                  </div>
                ))}
              </div>

              <p className="chart-caption">
                Mean MFCC values across the processed recording.
              </p>
            </section>

            <section className="analysis-card">
              <h2>Additional acoustic measurements</h2>
              <div className="detail-list">
                <div>
                  <span>RMS standard deviation</span>
                  <strong>{features.rms_std}</strong>
                </div>
                <div>
                  <span>Zero-crossing rate</span>
                  <strong>{features.zero_crossing_rate_mean}</strong>
                </div>
                <div>
                  <span>Original sample rate</span>
                  <strong>{audio.original_sample_rate} Hz</strong>
                </div>
                <div>
                  <span>Processed sample rate</span>
                  <strong>{audio.processed_sample_rate} Hz</strong>
                </div>
                <div>
                  <span>Audio channels</span>
                  <strong>{audio.original_channels}</strong>
                </div>
              </div>
            </section>

            {/* Model output is separate from the interpretation notice. */}
            <section className="analysis-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">09 / MODEL EXPLORATION RESULTS</span>
                  <h2>Acoustic model analysis</h2>
                </div>

                {result.model_result && (
                  <span className="success-tag">✓ Model executed</span>
                )}
              </div>

              {result.model_result ? (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="Acoustic cluster"
                      value={String(result.model_result.cluster)}
                      detail="Unsupervised cluster assignment"
                    />
                    <Metric
                      label="Unusual acoustic pattern"
                      value={
                        result.model_result.unusual_acoustic_pattern
                          ? "Detected"
                          : "Not detected"
                      }
                      detail="Relative to the model threshold"
                    />
                    <Metric
                      label="Anomaly score"
                      value={result.model_result.anomaly_score.toFixed(6)}
                      detail="Isolation Forest decision score"
                    />
                    <Metric
                      label="Model type"
                      value={result.model_result.model_type}
                      detail="Exploratory acoustic model"
                    />
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <strong>Model interpretation</strong>
                    <p className="chart-caption">
                      {result.model_result.interpretation}
                    </p>
                  </div>

                  <div className="notice" style={{ marginTop: 16 }}>
                    <strong>Research limitation</strong>
                    <p>{result.model_result.warning}</p>
                    <p>
                      This model is not a validated DLD screening tool.
                      Cluster assignments and anomaly scores do not indicate
                      DLD, clinical risk, or developmental status.
                    </p>
                  </div>
                </>
              ) : (
                <div className="notice">
                  <strong>Model result unavailable</strong>
                  <p>
                    The backend did not return model_result. Check the API
                    response and model loading status.
                  </p>
                </div>
              )}
            </section>

            <section className="notice">
              <strong>Interpretation limitations</strong>
              {result.analysis.limitations.map((item, index) => (
                <p key={index}>• {item}</p>
              ))}
            </section>
          </>
        ) : (
          <section className="empty-state">
            <div className="empty-icon">♫</div>
            <h2>
              {selectedItem
                ? "This recording has not been analysed yet"
                : "Your analysis will appear here"}
            </h2>
            <p>
              {selectedItem
                ? "Review the recording metadata and quality report, then run the acoustic analysis."
                : "Upload one or more WAV recordings or record through your microphone. Select a recording to manage its research metadata."}
            </p>
          </section>
        )}

        <section className="analysis-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">10 / ACOUSTIC COMPARISON</span>
              <h2>Compare completed recordings</h2>
            </div>
            <button
              type="button"
              className="analyze-button"
              onClick={exportComparisonCsv}
              disabled={comparisonItems.length === 0}
            >
              Export comparison CSV ↓
            </button>
          </div>

          <p className="chart-caption">
            Select Compare beside completed recordings in the dataset list.
            These are descriptive acoustic measurements, not diagnostic
            scores.
          </p>

          {comparisonItems.length === 0 ? (
            <p className="chart-caption">
              No recordings selected. Select at least one completed recording
              using its Compare checkbox.
            </p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 650,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Measurement",
                      ...comparisonItems.map((item) => item.file.name),
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          textAlign: "left",
                          padding: 10,
                          borderBottom: "1px solid #d6deeb",
                          color: "#52627a",
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Duration (s)",
                      get: (item: AudioItem) =>
                        item.result!.analysis.audio.duration_seconds,
                    },
                    {
                      label: "RMS mean",
                      get: (item: AudioItem) =>
                        item.result!.analysis.features.rms_mean,
                    },
                    {
                      label: "RMS standard deviation",
                      get: (item: AudioItem) =>
                        item.result!.analysis.features.rms_std,
                    },
                    {
                      label: "Zero-crossing rate mean",
                      get: (item: AudioItem) =>
                        item.result!.analysis.features.zero_crossing_rate_mean,
                    },
                    {
                      label: "Spectral centroid (Hz)",
                      get: (item: AudioItem) =>
                        item.result!.analysis.features.spectral_centroid_mean_hz,
                    },
                    {
                      label: "Median pitch (Hz)",
                      get: (item: AudioItem) =>
                        item.result!.analysis.features.pitch_median_hz ?? "N/A",
                    },
                  ].map((metric) => (
                    <tr key={metric.label}>
                      <td
                        style={{
                          padding: 10,
                          borderBottom: "1px solid #edf1f6",
                          fontWeight: 650,
                        }}
                      >
                        {metric.label}
                      </td>
                      {comparisonItems.map((item) => (
                        <td
                          key={item.id}
                          style={{
                            padding: 10,
                            borderBottom: "1px solid #edf1f6",
                          }}
                        >
                          {metric.get(item)}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {Array.from({ length: 13 }, (_, index) => (
                    <tr key={`mfcc-${index}`}>
                      <td
                        style={{
                          padding: 10,
                          borderBottom: "1px solid #edf1f6",
                          fontWeight: 650,
                        }}
                      >
                        MFCC {index + 1} mean
                      </td>
                      {comparisonItems.map((item) => (
                        <td
                          key={item.id}
                          style={{
                            padding: 10,
                            borderBottom: "1px solid #edf1f6",
                          }}
                        >
                          {item.result!.analysis.features.mfcc_mean[
                            index
                          ]?.toFixed(4) ?? "N/A"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="notice" id="settings">
          <strong>Research data and privacy notice</strong>
          <p>
            This version stores recording files and metadata in browser
            memory only. They are not retained after a page refresh. The CSV
            export contains research metadata and measurements, not the
            original audio files.
          </p>
          <p>
            Do not collect or process children's recordings unless the
            required institutional approvals, informed consent, data
            protection measures, and study protocol are in place.
          </p>
          <p>
            A technical quality pass does not establish that a recording is
            suitable for a particular research task or that a participant
            has any condition.
          </p>
        </section>

        <footer>
          DLD Speech Analytics · Research prototype · No clinical diagnosis
        </footer>
      </section>
    </main>
  );
}
