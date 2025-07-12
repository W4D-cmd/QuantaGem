import { useCallback, useRef, useState } from "react";
import { Blob as GenaiBlob, Content, GoogleGenAI, LiveConnectConfig, Modality, Session } from "@google/genai";

const MODEL_NAME = "gemini-2.5-flash-preview-native-audio-dialog";
const TARGET_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const VIDEO_FRAME_RATE = 1; // 1 frame per second

interface UseLiveSessionProps {
  getAuthHeaders: () => HeadersInit;
  keySelection: "free" | "paid";
  showToast: (message: string, type?: "success" | "error") => void;
  onStateChange: (isActive: boolean) => void;
  onInterimText: (text: string) => void;
  onTurnComplete: (text: string, audioBlob: Blob | null) => void;
  onVideoStream: (stream: MediaStream | null) => void;
}

const createWavBlob = (audioChunks: ArrayBuffer[]): Blob => {
  const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(44 + totalLength);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + totalLength, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, 1, true); // Number of channels
  view.setUint32(24, OUTPUT_SAMPLE_RATE, true); // Sample rate
  view.setUint32(28, OUTPUT_SAMPLE_RATE * 2, true); // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // Block align (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // Bits per sample

  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, totalLength, true);

  const audioData = new Uint8Array(buffer, 44);
  let offset = 0;
  for (const chunk of audioChunks) {
    audioData.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return new Blob([view], { type: "audio/wav" });
};

export const useLiveSession = ({
  getAuthHeaders,
  keySelection,
  showToast,
  onStateChange,
  onInterimText,
  onTurnComplete,
  onVideoStream,
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

  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoFrameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTextRef = useRef("");
  const audioBufferChunksRef = useRef<ArrayBuffer[]>([]);

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

  const stopVideoProcessing = useCallback(() => {
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
    }
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    onVideoStream(null);
  }, [onVideoStream]);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudioProcessing();
    stopVideoProcessing();
    onStateChange(false);
    onInterimText("");
    accumulatedTextRef.current = "";
    audioBufferChunksRef.current = [];
  }, [stopAudioProcessing, stopVideoProcessing, onStateChange, onInterimText]);

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

  const startSession = async (history: Content[], options: { streamVideo: boolean }) => {
    if (sessionRef.current || isConnecting) {
      return;
    }
    setIsConnecting(true);
    accumulatedTextRef.current = "";
    audioBufferChunksRef.current = [];

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
        apiVersion: "v1alpha",
      });

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = audioStream;

      if (options.streamVideo) {
        const videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        videoStreamRef.current = videoStream;
        onVideoStream(videoStream);
      }

      const config: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        enableAffectiveDialog: true,
      };

      const liveSession = await ai.live.connect({
        model: MODEL_NAME,
        config: config,
        callbacks: {
          onopen: () => {
            onStateChange(true);
            setIsConnecting(false);
          },
          onmessage: (message) => {
            if (message.serverContent?.modelTurn?.parts) {
              const part = message.serverContent.modelTurn.parts[0];
              if (part.text) {
                accumulatedTextRef.current += part.text;
                onInterimText(accumulatedTextRef.current);
              }
              if (part.inlineData?.data) {
                if (!playbackAudioContextRef.current) {
                  playbackAudioContextRef.current = new window.AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
                  nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
                }
                const raw = window.atob(part.inlineData.data);
                const rawLength = raw.length;
                const array = new Uint8Array(new ArrayBuffer(rawLength));
                for (let i = 0; i < rawLength; i++) {
                  array[i] = raw.charCodeAt(i);
                }
                const int16Array = new Int16Array(array.buffer);
                audioBufferChunksRef.current.push(int16Array.buffer);
                const float32Array = new Float32Array(int16Array.length);
                for (let i = 0; i < int16Array.length; i++) {
                  float32Array[i] = int16Array[i] / 32767.0;
                }
                playbackQueueRef.current.push(float32Array);
                processAndPlayAudio();
              }
            } else if (message.serverContent?.turnComplete) {
              const audioBlob =
                audioBufferChunksRef.current.length > 0 ? createWavBlob(audioBufferChunksRef.current) : null;
              onTurnComplete(accumulatedTextRef.current, audioBlob);
              accumulatedTextRef.current = "";
              audioBufferChunksRef.current = [];
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

      if (history && history.length > 0) {
        const historyString = history
          .map((c) => {
            const partsText = c.parts?.map((p) => p.text || "").join(" ") || "";
            return `${c.role}: ${partsText.trim()}`;
          })
          .join("\n");

        const contextPrompt = `Here is our conversation history so far. Use this as context for my next live audio input. Do not respond to this message, just wait for my voice.\n\n--- HISTORY ---\n${historyString}\n--- END HISTORY ---`;

        console.log("Sending context to Live Session:", contextPrompt);

        sessionRef.current.sendClientContent({
          turns: contextPrompt,
        });
      }

      audioContextRef.current = new window.AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(audioStream);
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
        const media: GenaiBlob = { data: base64Audio, mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}` };
        sessionRef.current.sendRealtimeInput({ media });
      };

      source.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);

      if (options.streamVideo && videoStreamRef.current) {
        const video = document.createElement("video");
        video.srcObject = videoStreamRef.current;
        video.muted = true;
        video.play();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        videoFrameIntervalRef.current = setInterval(() => {
          if (!sessionRef.current || !ctx) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          const base64Data = dataUrl.split(",")[1];
          const media: GenaiBlob = { data: base64Data, mimeType: "image/jpeg" };
          sessionRef.current.sendRealtimeInput({ media });
        }, 1000 / VIDEO_FRAME_RATE);
      }
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
