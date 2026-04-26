import { useState, useRef, useCallback } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

// One stable session ID per app launch
export const SESSION_ID = crypto.randomUUID();

// ── VAD Configuration ────────────────────────────────────────────────────────
const SPEECH_THRESHOLD = 50; // RMS amplitude (0-255) to count as speech
const SILENCE_TIMEOUT_MS = 2500; // silence after speech before we ship the segment
const MIN_SPEECH_MS = 800; // ignore segments shorter than this (coughs/clicks)
const SPEECH_CONFIRM_MS = 200; // amplitude must stay above threshold this long to start recording
const MONITOR_INTERVAL_MS = 50; // how often we sample amplitude

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function getExtension(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

/**
 * Calculate RMS amplitude from an AnalyserNode's frequency data.
 * Returns a value between 0 and 255.
 */
function getRMS(analyser, dataArray) {
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i] * dataArray[i];
  }
  return Math.sqrt(sum / dataArray.length);
}

// ── VAD States ───────────────────────────────────────────────────────────────
const VAD_IDLE = "idle"; // Monitoring, no speech
const VAD_CONFIRMING = "confirming"; // Amplitude high, waiting SPEECH_CONFIRM_MS
const VAD_SPEAKING = "speaking"; // Recording speech
const VAD_SILENCE = "silence"; // Speech ended, waiting SILENCE_TIMEOUT_MS

/**
 * useRecording — 24/7 continuous listening with Voice Activity Detection.
 *
 * When started, the mic stays open and continuously monitors audio amplitude.
 * Speech segments are automatically detected, recorded, and sent for
 * transcription when followed by a silence gap.
 *
 * External API is identical to the original: { startRecording, stopRecording, isProcessing, error }
 */
export function useRecording({
  onItemsExtracted,
  onItemsSaved,
  onItemsSaveFailed,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Refs to hold the continuous monitoring state
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const monitorRef = useRef(null); // setInterval ID
  const vadStateRef = useRef(VAD_IDLE);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef("");
  const speechStartRef = useRef(0); // timestamp when speech was first confirmed
  const confirmStartRef = useRef(0); // timestamp when amplitude first went above threshold
  const silenceStartRef = useRef(0); // timestamp when silence was first detected
  const processingCountRef = useRef(0); // how many segments are in-flight
  const activeRef = useRef(false); // is 24/7 listening on?

  /**
   * Process a completed speech segment: send to /transcribe, then /save.
   * Runs in the background — does NOT block the VAD loop.
   */
  const processSegment = useCallback(
    async (blob, duration) => {
      const mime = mimeTypeRef.current || "audio/webm";
      const ext = getExtension(mime);

      // Skip tiny clips
      if (blob.size < 500 || duration < 0.5) {
        console.log(
          "[hark-vad] skipping tiny clip:",
          blob.size,
          "bytes,",
          duration.toFixed(1),
          "s",
        );
        return;
      }

      processingCountRef.current += 1;
      setIsProcessing(true);

      try {
        console.log(
          "[hark-vad] sending segment:",
          (blob.size / 1024).toFixed(1),
          "KB,",
          duration.toFixed(1),
          "s",
        );

        // ── Step 1: Transcribe ──────────────────────────────────────────
        const formData = new FormData();
        formData.append("audio", blob, `recording.${ext}`);
        formData.append("duration", String(duration));

        const response = await fetch(`${SERVER_URL}/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            body.error || `Server error (HTTP ${response.status})`,
          );
        }

        const { transcript, items } = await response.json();
        console.log(
          "[hark-vad] transcript:",
          transcript?.slice(0, 80) || "(empty)",
        );

        const extractedItems = Array.isArray(items)
          ? items.map((item) => ({
              ...item,
              clientKey: crypto.randomUUID(),
            }))
          : [];

        // ── Step 2: Surface items to UI ─────────────────────────────────
        if (extractedItems.length > 0) {
          onItemsExtracted(extractedItems, transcript);
        }

        // ── Step 3: Save to Snowflake in background ─────────────────────
        if (transcript) {
          fetch(`${SERVER_URL}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript,
              items: extractedItems,
              duration,
              sessionId: SESSION_ID,
            }),
          })
            .then(async (saveRes) => {
              if (!saveRes.ok) {
                const body = await saveRes.json().catch(() => ({}));
                throw new Error(
                  body.error || `Save failed (${saveRes.status})`,
                );
              }
              return saveRes.json();
            })
            .then((saved) => {
              if (Array.isArray(saved.items) && saved.items.length > 0) {
                onItemsSaved?.(saved.items);
              }
            })
            .catch((e) => {
              console.warn("[hark-vad] save failed:", e.message);
              onItemsSaveFailed?.(
                extractedItems.map((item) => item.clientKey),
                e.message,
              );
            });
        }
      } catch (err) {
        setError(err.message);
        console.error("[hark-vad] processing error:", err);
      } finally {
        processingCountRef.current -= 1;
        if (processingCountRef.current <= 0) {
          processingCountRef.current = 0;
          setIsProcessing(false);
        }
      }
    },
    [onItemsExtracted, onItemsSaved, onItemsSaveFailed],
  );

  /**
   * Start a new MediaRecorder for capturing a speech segment.
   * The recorder writes to chunksRef until stopAndShip() is called.
   */
  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // Don't attach onstop here — we handle it in stopAndShip
    recorder.start(500); // collect chunks every 500ms
    speechStartRef.current = Date.now();
    console.log("[hark-vad] 🎙 recording started");
  }, []);

  /**
   * Stop the current recorder and ship the audio for processing.
   */
  const stopAndShip = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const speechStart = speechStartRef.current;

    // We need to wait for the final ondataavailable before building the blob
    recorder.onstop = () => {
      const duration = (Date.now() - speechStart) / 1000;
      const mime = mimeTypeRef.current || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      if (duration < MIN_SPEECH_MS / 1000) {
        console.log(
          "[hark-vad] segment too short:",
          duration.toFixed(1),
          "s — skipping",
        );
        return;
      }

      // Process in background — don't block the VAD loop
      processSegment(blob, duration);
    };

    recorder.stop();
    recorderRef.current = null;
    console.log("[hark-vad] 🛑 recording stopped, shipping audio");
  }, [processSegment]);

  /**
   * The main VAD monitor loop. Called every MONITOR_INTERVAL_MS.
   * Transitions between states based on amplitude levels.
   */
  const runVADTick = useCallback(() => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray || !activeRef.current) return;

    const rms = getRMS(analyser, dataArray);
    const isSpeech = rms > SPEECH_THRESHOLD;
    const now = Date.now();
    const state = vadStateRef.current;

    switch (state) {
      case VAD_IDLE:
        if (isSpeech) {
          // Amplitude above threshold — start confirming
          vadStateRef.current = VAD_CONFIRMING;
          confirmStartRef.current = now;
        }
        break;

      case VAD_CONFIRMING:
        if (!isSpeech) {
          // False alarm — go back to idle
          vadStateRef.current = VAD_IDLE;
        } else if (now - confirmStartRef.current >= SPEECH_CONFIRM_MS) {
          // Sustained speech — start recording
          vadStateRef.current = VAD_SPEAKING;
          beginRecording();
        }
        break;

      case VAD_SPEAKING:
        if (!isSpeech) {
          // Speech dropped — start silence timer
          vadStateRef.current = VAD_SILENCE;
          silenceStartRef.current = now;
        }
        // else: still speaking, keep recording
        break;

      case VAD_SILENCE:
        if (isSpeech) {
          // Speech resumed — back to speaking
          vadStateRef.current = VAD_SPEAKING;
        } else if (now - silenceStartRef.current >= SILENCE_TIMEOUT_MS) {
          // Silence confirmed — stop recording and ship
          vadStateRef.current = VAD_IDLE;
          stopAndShip();
        }
        break;
    }
  }, [beginRecording, stopAndShip]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (activeRef.current) return; // Already running
    setError(null);
    activeRef.current = true;

    // Request microphone — macOS will show permission dialog on first use
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    streamRef.current = stream;

    // Detect supported mime type
    mimeTypeRef.current = getSupportedMimeType();

    // Set up Web Audio API for amplitude monitoring
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Start the VAD monitoring loop
    vadStateRef.current = VAD_IDLE;
    monitorRef.current = setInterval(runVADTick, MONITOR_INTERVAL_MS);

    console.log("[hark-vad] ✅ 24/7 listening started — monitoring for speech");
  }, [runVADTick]);

  const stopRecording = useCallback(() => {
    activeRef.current = false;

    // Stop monitor loop
    if (monitorRef.current) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }

    // Stop any active recording
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    // Close audio context
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    analyserRef.current = null;
    dataArrayRef.current = null;
    vadStateRef.current = VAD_IDLE;
    chunksRef.current = [];

    console.log("[hark-vad] ⏹ 24/7 listening stopped");
  }, []);

  return { startRecording, stopRecording, isProcessing, error };
}
