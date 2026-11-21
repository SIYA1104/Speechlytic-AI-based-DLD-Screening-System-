
import type {
  QualityReport,
  RecordingMetadata,
} from "@/types/audio";

export const API_URL = "http://127.0.0.1:8000";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 180;

export const defaultMetadata = (): RecordingMetadata => ({
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

export const emptyQuality = (): QualityReport => ({
  status: "Review",
  messages: ["Quality check has not completed."],
  duration: null,
  sampleRate: null,
  channels: null,
  rms: null,
  peak: null,
  clippingPercent: null,
});

export async function inspectWavFile(
  file: File
): Promise<QualityReport> {
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
        messages: [
          "File is too small to contain a standard WAV header.",
        ],
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

    const decoded = await audioContext.decodeAudioData(
      buffer.slice(0)
    );

    const duration = decoded.duration;
    const sampleRate = decoded.sampleRate;
    const channels = decoded.numberOfChannels;

    if (!Number.isFinite(duration) || duration <= 0) {
      messages.push("Audio duration could not be validated.");
    } else if (duration < 1) {
      messages.push("Recording is shorter than one second.");
    } else if (duration > MAX_DURATION_SECONDS) {
      messages.push(
        "Recording exceeds the 180-second analysis limit."
      );
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
      totalSamples > 0
        ? Math.sqrt(sumSquares / totalSamples)
        : 0;

    const clippingPercent =
      totalSamples > 0
        ? (clippedSamples / totalSamples) * 100
        : 0;

    if (rms < 0.005) {
      messages.push(
        "Audio level is very low; possible silence or quiet recording."
      );
    }

    if (clippingPercent > 1) {
      messages.push(
        "More than 1% of samples are near the clipping threshold."
      );
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
      status: failed
        ? "Failed"
        : needsReview
          ? "Review"
          : "Passed",
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

export async function convertToWav(
  recordedBlob: Blob
): Promise<Blob> {
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

    const writeString = (
      offset: number,
      value: string
    ) => {
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
    view.setUint32(
      28,
      sampleRate * channels * bytesPerSample,
      true
    );
    view.setUint16(
      32,
      channels * bytesPerSample,
      true
    );
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

        const pcm =
          sample < 0
            ? sample * 32768
            : sample * 32767;

        view.setInt16(offset, pcm, true);
        offset += 2;
      }
    }

    return new Blob([buffer], {
      type: "audio/wav",
    });
  } finally {
    await audioContext.close();
  }
}

export function csvEscape(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}
