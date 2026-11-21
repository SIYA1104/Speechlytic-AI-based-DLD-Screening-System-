
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AnalysisResult,
  AudioItem,
  RecordingMetadata,
  StoryAgeGroup,
} from "@/types/audio";

import {
  API_URL,
  convertToWav,
  defaultMetadata,
  inspectWavFile,
  MAX_FILE_SIZE,
  MAX_DURATION_SECONDS,
} from "@/lib/audio/audio-utils";


type AddFilesOptions = {
  recordingType?: string;
  ageGroup?: string;
  storyTitle?: string;
};


type AppContextValue = {
  audioItems: AudioItem[];
  selectedId: string | null;
  comparisonIds: string[];
  storyAgeGroup: StoryAgeGroup;
  metadataMessage: string;
  error: string;

  selectedItem: AudioItem | null;
  comparisonItems: AudioItem[];

  recording: boolean;
  converting: boolean;
  recordingSeconds: number;
  busyId: string | null;

  setSelectedId: (id: string | null) => void;
  setStoryAgeGroup: (age: StoryAgeGroup) => void;
  setError: (message: string) => void;

  addFiles: (
    files: File[],
    options?: AddFilesOptions
  ) => Promise<void>;

  updateMetadata: (
    id: string,
    field: keyof RecordingMetadata,
    value: string
  ) => void;

  removeAudio: (id: string) => void;
  toggleComparison: (id: string) => void;

  startRecording: (
    recordingType?: string,
    ageGroup?: string,
    storyTitle?: string
  ) => Promise<void>;

  stopRecording: () => void;

  analyzeAudio: (id: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | undefined>(
  undefined
);

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [storyAgeGroup, setStoryAgeGroup] =
    useState<StoryAgeGroup>("7–8");

  const [metadataMessage, setMetadataMessage] = useState("");
const [error, setError] = useState("");

const [recording, setRecording] = useState(false);
const [converting, setConverting] = useState(false);
const [recordingSeconds, setRecordingSeconds] = useState(0);
const [busyId, setBusyId] = useState<string | null>(null);

const recorderRef = useRef<MediaRecorder | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const chunksRef = useRef<Blob[]>([]);
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
const busyRef = useRef(false);

const audioItemsRef = useRef<AudioItem[]>([]);
  audioItemsRef.current = audioItems;

  const addFiles = useCallback(
    async (
      files: File[],
      options: AddFilesOptions = {}
    ) => {
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
          setError(
            `${file.name}: File size must not exceed 20 MB.`
          );
          continue;
        }

        if (file.size === 0) {
          setError(`${file.name}: This file is empty.`);
          continue;
        }

        const duplicate = [
          ...audioItemsRef.current,
          ...additions,
        ].find(
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
            ageGroup: options.ageGroup ?? "",
            recordingType:
              options.recordingType ?? "Spontaneous speech",
            storyTitle: options.storyTitle ?? "",
          },
          quality: null,
          duplicateOf: duplicate?.id ?? null,
        };

        additions.push(item);

        try {
          item.quality = await inspectWavFile(file);
        } catch {
          item.quality = {
            status: "Failed",
            messages: ["Audio quality inspection failed."],
            duration: null,
            sampleRate: null,
            channels: null,
            rms: null,
            peak: null,
            clippingPercent: null,
          };
        }
      }

      if (additions.length > 0) {
        setAudioItems((previous) => [
          ...previous,
          ...additions,
        ]);

        setSelectedId(additions[0].id);
      }
    },
    []
  );

  const updateMetadata = useCallback(
    (
      id: string,
      field: keyof RecordingMetadata,
      value: string
    ) => {
      setAudioItems((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  [field]: value,
                },
              }
            : item
        )
      );

      setMetadataMessage(
        "Metadata updated for this session."
      );
    },
    []
  );

  const removeAudio = useCallback((id: string) => {
    const item = audioItemsRef.current.find(
      (entry) => entry.id === id
    );

    if (item) {
      URL.revokeObjectURL(item.url);
    }

    setAudioItems((previous) =>
      previous.filter((entry) => entry.id !== id)
    );

    setComparisonIds((previous) =>
      previous.filter((value) => value !== id)
    );

    setSelectedId((previous) =>
      previous === id
        ? (
            audioItemsRef.current.find(
              (entry) => entry.id !== id
            )?.id ?? null
          )
        : previous
    );
  }, []);

  const toggleComparison = useCallback((id: string) => {
    setComparisonIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id]
    );
  }, []);

  const selectedItem =
    audioItems.find((item) => item.id === selectedId) ?? null;

  const comparisonItems = audioItems.filter(
    (item) =>
      comparisonIds.includes(item.id) &&
      item.status === "completed" &&
      item.result !== null
  );

  useEffect(() => {
    return () => {
      audioItemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  const value = useMemo<AppContextValue>(
  () => ({
    audioItems,
    selectedId,
    comparisonIds,
    storyAgeGroup,
    metadataMessage,
    error,

    selectedItem,
    comparisonItems,

    // Recording states
    recording,
    converting,
    recordingSeconds,
    busyId,

    // State setters
    setSelectedId,
    setStoryAgeGroup,
    setError,

    // Audio operations
    addFiles,
    updateMetadata,
    removeAudio,
    toggleComparison,

    // Recording and analysis operations
    startRecording,
    stopRecording,
    analyzeAudio,
  }),
  [
    audioItems,
    selectedId,
    comparisonIds,
    storyAgeGroup,
    metadataMessage,
    error,
    selectedItem,
    comparisonItems,
    recording,
    converting,
    recordingSeconds,
    busyId,
    addFiles,
    updateMetadata,
    removeAudio,
    toggleComparison,
    startRecording,
    stopRecording,
    analyzeAudio,
  ]
);
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "useApp must be used inside AppProvider."
    );
  }

  return context;
}
