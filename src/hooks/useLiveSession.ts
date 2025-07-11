import { useState, useRef, useCallback } from "react";
import { GoogleGenAI, Session, Modality } from "@google/genai";

const MODEL_NAME = "gemini-live-2.5-flash-preview";
const TARGET_SAMPLE_RATE = 16000;

interface UseLiveSessionProps {
  getAuthHeaders: () => HeadersInit;
  keySelection: "free" | "paid";
  showToast: (message: string, type?: "success" | "error") => void;
  onStateChange: (isActive: boolean) => void;
  onInterimText: (text: string) => void;
}

export const useLiveSession = ({
  getAuthHeaders,
  keySelection,
  showToast,
  onStateChange,
  onInterimText,
}: UseLiveSessionProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const stopAudioProcessing = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;

    isPlayingRef.current = false;
    playbackQueueRef.current = [];
    if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== "closed") {
      playbackAudioContextRef.current.close();
    }
    playbackAudioContextRef.current = null;
  }, []);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudioProcessing();
    onStateChange(false);
    onInterimText("");
  }, [stopAudioProcessing, onStateChange, onInterimText]);

  const processAndPlayAudio = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0 || !playbackAudioContextRef.current) {
      return;
    }
    isPlayingRef.current = true;

    const audioData = playbackQueueRef.current.shift()!;
    const audioContext = playbackAudioContextRef.current;

    const audioBuffer = audioContext.createBuffer(1, audioData.length, audioContext.sampleRate);
    audioBuffer.getChannelData(0).set(audioData);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const scheduledTime = Math.max(audioContext.currentTime, nextPlayTimeRef.current);
    source.start(scheduledTime);

    nextPlayTimeRef.current = scheduledTime + audioBuffer.duration;

    source.onended = () => {
      isPlayingRef.current = false;
      processAndPlayAudio();
    };
  }, []);

  const startSession = async () => {
    if (sessionRef.current || isConnecting) {
      return;
    }
    setIsConnecting(true);

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ keySelection }),
      });
      if (!tokenRes.ok) throw new Error("Could not fetch authentication token.");
      const { token } = await tokenRes.json();

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;

      const liveSession = await ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          sessionResumption: {},
          speechConfig: {
            languageCode: "de-DE",
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Leda",
              },
            },
          },
        },
        callbacks: {
          onopen: () => {
            onStateChange(true);
            setIsConnecting(false);
          },
          onmessage: (message) => {
            if (message.serverContent?.modelTurn?.parts) {
              const part = message.serverContent.modelTurn.parts[0];
              if (part.text) {
                onInterimText(part.text);
              }
              if (part.inlineData?.data) {
                if (!playbackAudioContextRef.current) {
                  playbackAudioContextRef.current = new window.AudioContext({ sampleRate: 24000 });
                  nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
                }
                const raw = window.atob(part.inlineData.data);
                const rawLength = raw.length;
                const array = new Uint8Array(new ArrayBuffer(rawLength));
                for (let i = 0; i < rawLength; i++) {
                  array[i] = raw.charCodeAt(i);
                }
                const int16Array = new Int16Array(array.buffer);
                const float32Array = new Float32Array(int16Array.length);
                for (let i = 0; i < int16Array.length; i++) {
                  float32Array[i] = int16Array[i] / 32767.0;
                }
                playbackQueueRef.current.push(float32Array);
                processAndPlayAudio();
              }
            } else if (message.serverContent?.turnComplete) {
              onInterimText("");
            }
          },
          onerror: (e) => {
            console.error("Live session error:", e);
            showToast(e.message, "error");
            stopSession();
          },
          onclose: () => {
            stopSession();
          },
        },
      });

      sessionRef.current = liveSession;

      audioContextRef.current = new window.AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (e) => {
        if (!sessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const sourceSampleRate = audioContextRef.current?.sampleRate ?? 44100;
        const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
        const newLength = Math.round(inputData.length / ratio);
        const result = new Int16Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
          const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
          let accum = 0,
            count = 0;
          for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputData.length; i++) {
            accum += inputData[i];
            count++;
          }
          result[offsetResult] = Math.max(-1, Math.min(1, accum / count)) * 32767;
          offsetResult++;
          offsetBuffer = nextOffsetBuffer;
        }

        const pcmBuffer = Buffer.from(result.buffer);
        const base64Audio = pcmBuffer.toString("base64");
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64Audio, mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}` },
        });
      };

      source.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, "error");
      console.error("Failed to start live session:", err);
      stopSession();
      setIsConnecting(false);
    }
  };

  return { isConnecting, isSessionActive: !!sessionRef.current, startSession, stopSession };
};
