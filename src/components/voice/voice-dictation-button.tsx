"use client";

import * as React from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";

export interface VoiceDictationButtonProps {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible Voice Dictation Button for Quick Capture.
 * Integrates Web Speech API with real-time audio capture visualizer indicator.
 */
export function VoiceDictationButton({
  onTranscriptUpdate,
  onError,
  disabled = false,
  className,
}: VoiceDictationButtonProps) {
  const {
    isSupported,
    isListening,
    error,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onTranscriptChange: (interim, final) => {
      if (onTranscriptUpdate) {
        const full = final ? (interim ? `${final} ${interim}` : final) : interim;
        onTranscriptUpdate(full, false);
      }
    },
    onFinalTranscript: (final) => {
      if (onTranscriptUpdate) {
        onTranscriptUpdate(final, true);
      }
    },
    onError: (err) => {
      if (onError) onError(err);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isSupported || disabled) return;

    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        aria-label="Voice dictation unsupported"
        title="Web Speech API is not supported in this browser"
        className={cn(
          "relative inline-flex items-center justify-center p-2 rounded-lg text-muted-foreground/40 cursor-not-allowed border border-transparent transition-colors",
          className
        )}
      >
        <MicOff className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-label={isListening ? "Stop voice dictation" : "Start voice dictation"}
      aria-pressed={isListening}
      title={
        isListening
          ? "Recording speech... Click to finish dictation"
          : "Click to dictate task with your voice"
      }
      className={cn(
        "relative inline-flex items-center justify-center p-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        isListening
          ? "bg-red-500/10 text-red-500 border border-red-500/40 shadow-sm animate-pulse"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {isListening ? (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <Mic className="h-4 w-4 text-red-500 animate-bounce" />
        </span>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
