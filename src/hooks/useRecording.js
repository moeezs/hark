import { useState, useRef, useCallback } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

// One stable session ID per app launch (module-level = created once)
export const SESSION_ID = crypto.randomUUID();

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
 * useRecording — manages the full record → transcribe → extract → save lifecycle.
 *
 * @param {object}   options
 * @param {Function} options.onItemsExtracted  Called with (items[], rawTranscript) after each pause.
 * @returns {{ startRecording, stopRecording, isProcessing, error }}
 */
export function useRecording({ onItemsExtracted }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef("");
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    setError(null);

    // Request microphone — macOS will show a system permission dialog on first use
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    streamRef.current = stream;

    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];
    startTimeRef.current = Date.now();

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const duration = (Date.now() - startTimeRef.current) / 1000;
      const mime = mimeTypeRef.current || "audio/webm";
      const ext = getExtension(mime);
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      // Skip clips that are too short to be meaningful
      if (blob.size < 500 || duration < 0.5) return;

      setIsProcessing(true);

      try {
        // ── Send audio to sidecar for transcription ───────────────────────────
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

        // ── Save to Snowflake (fire-and-forget — never block the UI) ──────────
        if (transcript) {
          fetch(`${SERVER_URL}/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript,
              items,
              duration,
              sessionId: SESSION_ID,
            }),
          }).catch((e) =>
            console.warn("[hark] Snowflake save failed:", e.message),
          );
        }

        // ── Surface extracted items to the UI ─────────────────────────────────
        if (Array.isArray(items) && items.length > 0) {
          onItemsExtracted(items, transcript);
        }
      } catch (err) {
        setError(err.message);
        console.error("[hark recording]", err);
      } finally {
        setIsProcessing(false);
      }
    };

    // Collect chunks every second so we don't lose data if the tab crashes
    recorder.start(1000);
  }, [onItemsExtracted]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  return { startRecording, stopRecording, isProcessing, error };
}
