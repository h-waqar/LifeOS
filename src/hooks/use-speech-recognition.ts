"use client";

import * as React from "react";

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onTranscriptChange?: (interim: string, finalTranscript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
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
    onTranscriptChange,
    onFinalTranscript,
    onError,
  } = options;

  const [isSupported, setIsSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [finalTranscript, setFinalTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const finalTranscriptRef = React.useRef("");
  const recognitionRef = React.useRef<any>(null);

  React.useEffect(() => {
    finalTranscriptRef.current = finalTranscript;
  }, [finalTranscript]);

  // Check support on mount (SSR safe)
  React.useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognitionClass()));
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
        // "no-speech" can be transient in continuous mode, but still record friendly error
        setError(errorMsg);
        if (onError) onError(errorMsg);
        setIsListening(false);
      };

      recognition.onend = () => {
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
  }, [continuous, interimResults, lang, mapErrorCode, onError, onFinalTranscript, onTranscriptChange]);

  const resetTranscript = React.useCallback(() => {
    setInterimTranscript("");
    setFinalTranscript("");
    setError(null);
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
    startListening,
    stopListening,
    resetTranscript,
  };
}
