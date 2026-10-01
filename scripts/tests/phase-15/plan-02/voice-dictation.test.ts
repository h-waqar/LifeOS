import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, renderHook } from "@testing-library/react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { VoiceDictationButton } from "@/components/voice/voice-dictation-button";
import {
  QuickCaptureModal,
  parseTokensClient,
} from "@/components/quick-capture-modal";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "usr_mock_voice_123", name: "Voice Tester", email: "voice@lifeos.dev" } },
    isPending: false,
  }),
}));

// Mock SpeechRecognition implementation
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  static activeInstances: MockSpeechRecognition[] = [];

  constructor() {
    MockSpeechRecognition.activeInstances.push(this);
  }

  start() {
    if (this.onstart) this.onstart();
  }

  stop() {
    if (this.onend) this.onend();
  }

  abort() {
    if (this.onend) this.onend();
  }

  simulateResult(results: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    if (this.onresult) {
      const eventResults = results.map((r) => [
        { transcript: r.transcript },
      ]);
      results.forEach((r, idx) => {
        (eventResults[idx] as any).isFinal = r.isFinal;
      });

      this.onresult({
        resultIndex,
        results: eventResults,
      });
    }
  }

  simulateError(error: string) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

describe("Plan 15-02: Web Speech API Voice Dictation & NLP Quick Capture Integration", () => {
  const originalSpeechRecognition = (window as any).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as any).webkitSpeechRecognition;

  beforeEach(() => {
    MockSpeechRecognition.activeInstances = [];
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (window as any).SpeechRecognition = originalSpeechRecognition;
    (window as any).webkitSpeechRecognition = originalWebkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  describe("1. useSpeechRecognition Hook", () => {
    it("reports isSupported=false when SpeechRecognition is absent", () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(false);
      expect(result.current.isListening).toBe(false);
      expect(result.current.transcript).toBe("");
    });

    it("reports isSupported=true when standard SpeechRecognition is defined", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(true);
    });

    it("reports isSupported=true when webkitSpeechRecognition is defined", () => {
      (window as any).webkitSpeechRecognition = MockSpeechRecognition;
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(true);
    });

    it("starts and stops listening with appropriate lifecycle events", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);
      expect(MockSpeechRecognition.activeInstances).toHaveLength(1);

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.isListening).toBe(false);
    });

    it("captures interim and final transcripts accurately", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const onFinalSpy = vi.fn();
      const onChangeSpy = vi.fn();

      const { result } = renderHook(() =>
        useSpeechRecognition({
          onFinalTranscript: onFinalSpy,
          onTranscriptChange: onChangeSpy,
        })
      );

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      // Simulate interim speech
      act(() => {
        instance.simulateResult([{ transcript: "buy groceries", isFinal: false }]);
      });

      expect(result.current.interimTranscript).toBe("buy groceries");
      expect(result.current.finalTranscript).toBe("");
      expect(onChangeSpy).toHaveBeenCalledWith("buy groceries", "");

      // Simulate final speech
      act(() => {
        instance.simulateResult([{ transcript: "buy groceries tomorrow", isFinal: true }]);
      });

      expect(result.current.interimTranscript).toBe("");
      expect(result.current.finalTranscript).toBe("buy groceries tomorrow");
      expect(onFinalSpy).toHaveBeenCalledWith("buy groceries tomorrow");
    });

    it("handles permission denial (not-allowed) gracefully with user-facing guidance", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const errorSpy = vi.fn();

      const { result } = renderHook(() =>
        useSpeechRecognition({ onError: errorSpy })
      );

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      act(() => {
        instance.simulateError("not-allowed");
      });

      expect(result.current.isListening).toBe(false);
      expect(result.current.error).toContain("Microphone access was denied");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Microphone access was denied"));
    });

    it("handles no-speech, audio-capture, and network errors gracefully", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      act(() => {
        instance.simulateError("no-speech");
      });
      expect(result.current.error).toContain("No speech was detected");

      act(() => {
        instance.simulateError("audio-capture");
      });
      expect(result.current.error).toContain("No microphone was found");

      act(() => {
        instance.simulateError("network");
      });
      expect(result.current.error).toContain("Network communication error");
    });

    it("clears transcripts and errors on resetTranscript", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });
      const instance = MockSpeechRecognition.activeInstances[0];

      act(() => {
        instance.simulateResult([{ transcript: "test task", isFinal: true }]);
      });
      expect(result.current.finalTranscript).toBe("test task");

      act(() => {
        result.current.resetTranscript();
      });

      expect(result.current.transcript).toBe("");
      expect(result.current.finalTranscript).toBe("");
      expect(result.current.interimTranscript).toBe("");
      expect(result.current.error).toBeNull();
    });
  });

  describe("2. VoiceDictationButton Component", () => {
    it("renders disabled state with aria-label when speech recognition is unsupported", () => {
      render(React.createElement(VoiceDictationButton, null));

      const button = screen.getByRole("button", { name: "Voice dictation unsupported" }) as HTMLButtonElement;
      expect(button).toBeDefined();
      expect(button.disabled).toBe(true);
    });

    it("renders idle state with accessible labels when supported", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(React.createElement(VoiceDictationButton, null));

      const button = screen.getByRole("button", { name: "Start voice dictation" }) as HTMLButtonElement;
      expect(button).toBeDefined();
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("aria-pressed")).toBe("false");
    });

    it("toggles listening state and visual indicators on click", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(React.createElement(VoiceDictationButton, null));

      const button = screen.getByRole("button", { name: "Start voice dictation" });

      // Click to start
      fireEvent.click(button);

      const activeBtn = screen.getByRole("button", { name: "Stop voice dictation" });
      expect(activeBtn).toBeDefined();
      expect(activeBtn.getAttribute("aria-pressed")).toBe("true");
      expect(activeBtn.className).toContain("animate-pulse");

      // Click to stop
      fireEvent.click(activeBtn);
      expect(screen.getByRole("button", { name: "Start voice dictation" })).toBeDefined();
    });

    it("streams transcripts upward via onTranscriptUpdate callback", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      const updateSpy = vi.fn();

      render(React.createElement(VoiceDictationButton, { onTranscriptUpdate: updateSpy }));

      const button = screen.getByRole("button", { name: "Start voice dictation" });
      fireEvent.click(button);

      const instance = MockSpeechRecognition.activeInstances[0];

      act(() => {
        instance.simulateResult([{ transcript: "call doctor tomorrow", isFinal: true }]);
      });

      expect(updateSpy).toHaveBeenCalledWith("call doctor tomorrow", true);
    });
  });

  describe("3. NLP Conversational Parsing & Voice Input Integration", () => {
    it("extracts task title, critical priority, and scheduled date from 'buy groceries tomorrow at 5pm urgent'", () => {
      const parsed = parseTokensClient("buy groceries tomorrow at 5pm urgent");

      expect(parsed.title).toBe("buy groceries");
      expect(parsed.priority).toBe("critical");
      expect(parsed.scheduledDate).toBe("tomorrow at 5pm");
      expect(parsed.dueDate).toBe("tomorrow");
      expect(parsed.tags).toEqual([]);
    });

    it("extracts high priority and due date from 'prepare quarterly budget high priority ^tomorrow +finance'", () => {
      const parsed = parseTokensClient("prepare quarterly budget high priority ^tomorrow +finance");

      expect(parsed.title).toBe("prepare quarterly budget");
      expect(parsed.priority).toBe("high");
      expect(parsed.dueDate).toBe("tomorrow");
      expect(parsed.tags).toContain("finance");
    });

    it("extracts low priority from 'walk the dog low priority'", () => {
      const parsed = parseTokensClient("walk the dog low priority");

      expect(parsed.title).toBe("walk the dog");
      expect(parsed.priority).toBe("low");
    });

    it("renders microphone button inside QuickCaptureModal and updates input with voice transcript", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;

      render(
        React.createElement(QuickCaptureModal, {
          isOpen: true,
          onClose: () => {},
        })
      );

      // Verify microphone button is present
      const micButton = screen.getByRole("button", { name: "Start voice dictation" });
      expect(micButton).toBeDefined();

      // Click to start recording
      fireEvent.click(micButton);

      const instance = MockSpeechRecognition.activeInstances[0];

      // Simulate voice speech
      act(() => {
        instance.simulateResult([
          { transcript: "buy groceries tomorrow at 5pm urgent", isFinal: true },
        ]);
      });

      // Verify input field reflects transcribed text
      const input = screen.getByPlaceholderText(/Write architecture brief/i) as HTMLInputElement;
      expect(input.value).toBe("buy groceries tomorrow at 5pm urgent");

      // Verify live badge pills rendered
      expect(screen.getByText("buy groceries")).toBeDefined();
      expect(screen.getByText(/critical/i)).toBeDefined();
    });

    it("treats voice transcript as untrusted input with sanitization and validation", async () => {
      const parsed = parseTokensClient("   <script>alert('xss')</script>  !high  ^2026-11-01  ");

      expect(parsed.priority).toBe("high");
      expect(parsed.dueDate).toBe("2026-11-01");
      // Title should be collapsed and trimmed safely
      expect(parsed.title).toBe("<script>alert('xss')</script>");
    });
  });
});
