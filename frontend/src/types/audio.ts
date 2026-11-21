
export type AnalysisResult = {
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

export type QualityReport = {
  status: "Passed" | "Review" | "Failed";
  messages: string[];
  duration: number | null;
  sampleRate: number | null;
  channels: number | null;
  rms: number | null;
  peak: number | null;
  clippingPercent: number | null;
};

export type RecordingMetadata = {
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

export type AudioItem = {
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

export type StoryAgeGroup = "5–6" | "7–8" | "9–10" | "11–12";

export type StoryPassage = {
  title: string;
  text: string;
};

export type AudioStatusFilter =
  | "All"
  | "Pending"
  | "Processing"
  | "Completed"
  | "Failed";

export type QualityStatusFilter =
  | "All"
  | "Passed"
  | "Review"
  | "Failed";
