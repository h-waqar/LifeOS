import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, act, render, screen } from "@testing-library/react";
import {
  useSpeechRecognition,
  DEFAULT_AUDIO_CONSTRAINTS,
} from "@/hooks/use-speech-recognition";
import { VoiceDictationButton } from "@/components/voice/voice-dictation-button";

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
      const eventResults = results.map((r) => [{ transcript: r.transcript }]);
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

describe("Plan 19-03: Real Mobile Audio Hardware, Ambient Noise Suppression & Speech Recognition Resilience (PROD-02)", () => {
  let originalMediaDevices: any;
  let deviceChangeListeners: Array<() => void> = [];

  beforeEach(() => {
    MockSpeechRecognition.activeInstances = [];
    (window as any).SpeechRecognition = MockSpeechRecognition;
    deviceChangeListeners = [];

    originalMediaDevices = navigator.mediaDevices;
    const mockDevices: MediaDeviceInfo[] = [
      {
        deviceId: "built-in-mic",
        groupId: "group-1",
        kind: "audioinput",
        label: "iPhone Built-in Microphone",
        toJSON: () => ({}),
      },
      {
        deviceId: "bluetooth-headset",
        groupId: "group-2",
        kind: "audioinput",
        label: "AirPods Pro Bluetooth Microphone",
        toJSON: () => ({}),
      },
      {
        deviceId: "speaker-out",
        groupId: "group-1",
        kind: "audiooutput",
        label: "Built-in Speaker",
        toJSON: () => ({}),
      },
    ];

    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === "devicechange") deviceChangeListeners.push(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: () => void) => {
          deviceChangeListeners = deviceChangeListeners.filter((l) => l !== cb);
        }),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  async function renderSpeechRecognitionHook(options?: any) {
    let hook: any;
    await act(async () => {
      hook = renderHook(() => useSpeechRecognition(options));
    });
    return hook;
  }

  describe("1. Audio Hardware Constraints Configuration (PROD-02)", () => {
    it("exposes default hardware audio constraints with noise suppression and echo cancellation", async () => {
      expect(DEFAULT_AUDIO_CONSTRAINTS).toEqual({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      const { result } = await renderSpeechRecognitionHook();
      expect(result.current.audioConstraints).toEqual(DEFAULT_AUDIO_CONSTRAINTS);
    });

    it("accepts custom hardware audio constraints for noisy environments", async () => {
      const customConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      };

      const { result } = await renderSpeechRecognitionHook({
        audioConstraints: customConstraints,
      });
      expect(result.current.audioConstraints).toEqual(customConstraints);
    });
  });

  describe("2. Audio Hardware Device Discovery & Hot-Swapping (PROD-02)", () => {
    it("enumerates physical audio input hardware devices on mount", async () => {
      const { result } = await renderSpeechRecognitionHook();

      await act(async () => {
        await result.current.refreshAudioDevices();
      });

      expect(result.current.audioDevices.length).toBe(2);
      expect(result.current.audioDevices[0].label).toBe("iPhone Built-in Microphone");
      expect(result.current.audioDevices[1].label).toBe("AirPods Pro Bluetooth Microphone");
    });

    it("allows switching audio input devices dynamically", async () => {
      const { result } = await renderSpeechRecognitionHook();

      await act(async () => {
        await result.current.refreshAudioDevices();
      });

      act(() => {
        result.current.selectAudioDevice("bluetooth-headset");
      });

      expect(result.current.selectedDeviceId).toBe("bluetooth-headset");
    });

    it("listens to devicechange events when audio hardware is plugged or unplugged", async () => {
      const { result } = await renderSpeechRecognitionHook();

      expect(deviceChangeListeners.length).toBeGreaterThan(0);

      // Simulate plugging in external microphone
      const updatedDevices: MediaDeviceInfo[] = [
        {
          deviceId: "usb-mic",
          groupId: "group-3",
          kind: "audioinput",
          label: "External USB Podcast Mic",
          toJSON: () => ({}),
        },
      ];
      (navigator.mediaDevices.enumerateDevices as any).mockResolvedValueOnce(updatedDevices);

      await act(async () => {
        for (const listener of deviceChangeListeners) {
          listener();
        }
      });

      expect(result.current.audioDevices.length).toBe(1);
      expect(result.current.audioDevices[0].deviceId).toBe("usb-mic");
    });
  });

  describe("3. Ambient Background Noise Resilience & Transient Recovery (PROD-02)", () => {
    it("preserves accumulated transcript and increments retry counter across transient ambient noise spikes", async () => {
      vi.useFakeTimers();
      const { result } = await renderSpeechRecognitionHook({
        continuous: true,
        autoRecoverFromNoise: true,
        maxNoiseRetries: 3,
      });

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      // Speech segment 1 before ambient noise burst
      act(() => {
        instance.simulateResult([{ transcript: "Review team pull request", isFinal: true }]);
      });

      expect(result.current.transcript).toBe("Review team pull request");
      expect(result.current.finalTranscript).toBe("Review team pull request");

      // Ambient noise spike triggers transient no-speech error
      act(() => {
        instance.simulateError("no-speech");
      });

      // Transient error should record message but preserve listening intention and increment noise counter
      expect(result.current.error).toContain("No speech was detected");
      expect(result.current.noiseRetryCount).toBe(1);

      // Advance timer for auto-recovery restart
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // User continues speaking after ambient noise burst
      act(() => {
        instance.simulateResult([{ transcript: "urgently by noon", isFinal: true }]);
      });

      // Transcripts should be seamlessly appended without loss
      expect(result.current.transcript).toContain("Review team pull request urgently by noon");
      expect(result.current.noiseRetryCount).toBe(0); // reset upon successful voice capture

      vi.useRealTimers();
    });

    it("terminates continuous capture and alerts user if noise retries are exhausted", async () => {
      vi.useFakeTimers();
      const { result } = await renderSpeechRecognitionHook({
        continuous: true,
        autoRecoverFromNoise: true,
        maxNoiseRetries: 2,
      });

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      // First transient noise burst
      act(() => {
        instance.simulateError("no-speech");
      });
      expect(result.current.noiseRetryCount).toBe(1);

      // Second transient noise burst
      act(() => {
        instance.simulateError("no-speech");
      });
      expect(result.current.noiseRetryCount).toBe(2);

      // Third noise burst (exceeds maxNoiseRetries = 2)
      act(() => {
        instance.simulateError("no-speech");
      });

      // Session should now stop listening
      expect(result.current.isListening).toBe(false);
      expect(result.current.error).toContain("No speech was detected");

      vi.useRealTimers();
    });

    it("halts immediately on fatal hardware errors without retrying", async () => {
      const { result } = await renderSpeechRecognitionHook({
        continuous: true,
        autoRecoverFromNoise: true,
      });

      act(() => {
        result.current.startListening();
      });

      const instance = MockSpeechRecognition.activeInstances[0];

      act(() => {
        instance.simulateError("not-allowed");
      });

      expect(result.current.isListening).toBe(false);
      expect(result.current.error).toContain("Microphone access was denied");
      expect(result.current.noiseRetryCount).toBe(0);
    });

    it("stops cleanly when user explicitly ends dictation, resetting noise counters", async () => {
      const { result } = await renderSpeechRecognitionHook({
        continuous: true,
        autoRecoverFromNoise: true,
      });

      act(() => {
        result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.isListening).toBe(false);
      expect(result.current.noiseRetryCount).toBe(0);
    });
  });
});
