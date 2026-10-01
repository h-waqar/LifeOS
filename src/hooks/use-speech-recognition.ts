"use client";

import * as React from "react";

export const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  autoRecoverFromNoise?: boolean;
  maxNoiseRetries?: number;
  audioConstraints?: MediaTrackConstraints;
  onTranscriptChange?: (interim: string, finalTranscript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  onAudioDevicesChange?: (devices: MediaDeviceInfo[]) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  audioDevices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  audioConstraints: MediaTrackConstraints;
  noiseRetryCount: number;
  selectAudioDevice: (deviceId: string) => void;
  refreshAudioDevices: () => Promise<MediaDeviceInfo[]>;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

function getSpeechRecognitionClass(): any {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    continuous = true,
    interimResults = true,
    lang = "en-US",
    autoRecoverFromNoise = true,
    maxNoiseRetries = 3,
    audioConstraints = DEFAULT_AUDIO_CONSTRAINTS,
    onTranscriptChange,
    onFinalTranscript,
    onError,
    onAudioDevicesChange,
  } = options;

  const [isSupported, setIsSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [finalTranscript, setFinalTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const [noiseRetryCount, setNoiseRetryCount] = React.useState(0);

  const finalTranscriptRef = React.useRef("");
  const recognitionRef = React.useRef<any>(null);
  const noiseRetryCountRef = React.useRef(0);
  const intentionalStopRef = React.useRef(false);

  React.useEffect(() => {
    finalTranscriptRef.current = finalTranscript;
  }, [finalTranscript]);

  // Check support on mount (SSR safe)
  React.useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognitionClass()));
  }, []);

  // Enumerate audio input hardware devices (SSR safe)
  const refreshAudioDevices = React.useCallback(async (): Promise<MediaDeviceInfo[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputDevices = devices.filter((d) => d.kind === "audioinput");
      setAudioDevices(inputDevices);
      if (onAudioDevicesChange) onAudioDevicesChange(inputDevices);
      return inputDevices;
    } catch {
      return [];
    }
  }, [onAudioDevicesChange]);

  React.useEffect(() => {
    refreshAudioDevices();

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        refreshAudioDevices();
      };
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      return () => {
        navigator.mediaDevices?.removeEventListener?.(
          "devicechange",
          handleDeviceChange
        );
      };
    }
  }, [refreshAudioDevices]);

  const selectAudioDevice = React.useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  // Map Web Speech API error codes to helpful user messages
  const mapErrorCode = React.useCallback((code: string): string => {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        return "Microphone access was denied. Please allow microphone permissions in your browser settings.";
      case "no-speech":
        return "No speech was detected. Please try speaking again.";
      case "audio-capture":
        return "No microphone was found or microphone is not working.";
      case "network":
        return "Network communication error occurred during speech recognition.";
      case "aborted":
        return "Voice dictation was cancelled.";
      default:
        return `Speech recognition error: ${code}`;
    }
  }, []);

  const stopListening = React.useCallback(() => {
    intentionalStopRef.current = true;
    noiseRetryCountRef.current = 0;
    setNoiseRetryCount(0);
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors if recognition already stopped
      }
      setIsListening(false);
    }
  }, [isListening]);

  const startListening = React.useCallback(() => {
    intentionalStopRef.current = false;
    noiseRetryCountRef.current = 0;
    setNoiseRetryCount(0);

    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) {
      const unsupportedErr = "Speech recognition is not supported in this browser.";
      setError(unsupportedErr);
      if (onError) onError(unsupportedErr);
      return;
    }

    // Stop existing instance if running
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = lang;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = "";
        let currentFinal = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || "";
          if (result.isFinal) {
            currentFinal += text;
          } else {
            currentInterim += text;
          }
        }

        if (currentFinal) {
          const next = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${currentFinal.trim()}`
            : currentFinal.trim();
          finalTranscriptRef.current = next;
          setFinalTranscript(next);
          setInterimTranscript("");
          // Successful transcription resets transient noise counter
          noiseRetryCountRef.current = 0;
          setNoiseRetryCount(0);
          if (onFinalTranscript) onFinalTranscript(next);
        } else {
          setInterimTranscript(currentInterim);
        }

        if (onTranscriptChange) {
          onTranscriptChange(currentInterim, currentFinal);
        }
      };

      recognition.onerror = (event: any) => {
        const errorMsg = mapErrorCode(event.error);
        setError(errorMsg);
        if (onError) onError(errorMsg);

        // Check if transient noise error eligible for auto-recovery in continuous mode
        if (
          continuous &&
          autoRecoverFromNoise &&
          event.error === "no-speech" &&
          noiseRetryCountRef.current < maxNoiseRetries &&
          !intentionalStopRef.current
        ) {
          noiseRetryCountRef.current += 1;
          setNoiseRetryCount(noiseRetryCountRef.current);
          try {
            recognition.abort();
          } catch {}
          setTimeout(() => {
            if (!intentionalStopRef.current) {
              try {
                recognition.start();
                return;
              } catch {}
            }
          }, 150);
          return;
        }

        setIsListening(false);
      };

      recognition.onend = () => {
        if (
          !intentionalStopRef.current &&
          continuous &&
          autoRecoverFromNoise &&
          isListening &&
          noiseRetryCountRef.current < maxNoiseRetries
        ) {
          try {
            recognition.start();
            return;
          } catch {}
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      const startErr = `Failed to start speech recognition: ${err.message || String(err)}`;
      setError(startErr);
      setIsListening(false);
      if (onError) onError(startErr);
    }
  }, [
    continuous,
    interimResults,
    lang,
    autoRecoverFromNoise,
    maxNoiseRetries,
    isListening,
    mapErrorCode,
    onError,
    onFinalTranscript,
    onTranscriptChange,
  ]);

  const resetTranscript = React.useCallback(() => {
    setInterimTranscript("");
    setFinalTranscript("");
    setError(null);
    noiseRetryCountRef.current = 0;
    setNoiseRetryCount(0);
  }, []);

  // Clean up recognition instance on unmount
  React.useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const combinedTranscript = finalTranscript
    ? interimTranscript
      ? `${finalTranscript} ${interimTranscript}`
      : finalTranscript
    : interimTranscript;

  return {
    isSupported,
    isListening,
    transcript: combinedTranscript,
    interimTranscript,
    finalTranscript,
    error,
    audioDevices,
    selectedDeviceId,
    audioConstraints,
    noiseRetryCount,
    selectAudioDevice,
    refreshAudioDevices,
    startListening,
    stopListening,
    resetTranscript,
  };
}
