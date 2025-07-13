import { useCallback, useRef, useState } from "react";
import { Blob as GenaiBlob, Content, GoogleGenAI, Session } from "@google/genai";
import { getLiveConnectConfig, LiveModel } from "@/lib/live-models";

const TARGET_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const VIDEO_FRAME_RATE = 1;

const resamplingProcessor = `
class ResamplingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = options.processorOptions.targetSampleRate;
    this.sourceSampleRate = sampleRate;
    this.ratio = this.sourceSampleRate / this.targetSampleRate;
  }

  static get parameterDescriptors() {
    return [];
  }

  process(inputs, outputs, parameters) {
    const inputData = inputs[0][0];

    if (!inputData) {
      return true;
    }

    const newLength = Math.round(inputData.length / this.ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * this.ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputData.length; i++) {
        accum += inputData[i];
        count++;
      }
      result[offsetResult] = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 32767;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    this.port.postMessage(result.buffer, [result.buffer]);
    return true;
  }
}

registerProcessor('resampling-processor', ResamplingProcessor);
`;

interface UseLiveSessionProps {
  getAuthHeaders: () => HeadersInit;
  keySelection: "free" | "paid";
  showToast: (message: string, type?: "success" | "error") => void;
  onStateChange: (isActive: boolean) => void;
  onInterimText: (text: string) => void;
  onTurnComplete: (text: string, audioBlob: Blob | null) => void;
  onVideoStream: (stream: MediaStream | null) => void;
}

const createWavBlob = (audioChunks: ArrayBuffer[], sampleRate: number): Blob => {
  const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(44 + totalLength);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + totalLength, true);
  view.setUint32(8, 0x57415645, false);

  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  view.setUint32(36, 0x64617461, false);
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
  const [isSessionActive, setIsSessionActive] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);

  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activePlaybackSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const videoFrameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTextRef = useRef("");
  const audioBufferChunksRef = useRef<ArrayBuffer[]>([]);
  const lastPlaybackSampleRateRef = useRef(OUTPUT_SAMPLE_RATE);
  const isModelSpeakingRef = useRef(false);

  const sessionHandleRef = useRef<string | null>(null);
  const lastHistoryRef = useRef<Content[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualStopRef = useRef(false);

  const stopCurrentPlayback = useCallback(() => {
    activePlaybackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        console.log(e);
      }
      source.disconnect();
    });
    activePlaybackSourcesRef.current = [];
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    isModelSpeakingRef.current = false;
    if (playbackAudioContextRef.current) {
      nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
    }
  }, []);

  const cleanupResources = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    onVideoStream(null);
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
    }

    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null;
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;

    stopCurrentPlayback();
    if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== "closed") {
      playbackAudioContextRef.current.close();
    }
    playbackAudioContextRef.current = null;
  }, [onVideoStream, stopCurrentPlayback]);

  const stopSession = useCallback(() => {
    manualStopRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    cleanupResources();
    setIsSessionActive(false);
    onStateChange(false);
    onInterimText("");
    accumulatedTextRef.current = "";
    audioBufferChunksRef.current = [];
    sessionHandleRef.current = null;
  }, [cleanupResources, onStateChange, onInterimText]);

  const processAndPlayAudio = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0 || !playbackAudioContextRef.current) {
      return;
    }
    isPlayingRef.current = true;
    isModelSpeakingRef.current = true;
    const totalLength = playbackQueueRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
    const mergedAudio = new Float32Array(totalLength);
    let offset = 0;
    while (playbackQueueRef.current.length > 0) {
      const chunk = playbackQueueRef.current.shift()!;
      mergedAudio.set(chunk, offset);
      offset += chunk.length;
    }
    const audioContext = playbackAudioContextRef.current;
    const audioBuffer = audioContext.createBuffer(1, mergedAudio.length, audioContext.sampleRate);
    audioBuffer.getChannelData(0).set(mergedAudio);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    activePlaybackSourcesRef.current.push(source);
    const startTime = Math.max(audioContext.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
    source.onended = () => {
      activePlaybackSourcesRef.current = activePlaybackSourcesRef.current.filter((s) => s !== source);
      if (activePlaybackSourcesRef.current.length === 0) {
        isPlayingRef.current = false;
        if (playbackQueueRef.current.length === 0) {
          isModelSpeakingRef.current = false;
        }
        processAndPlayAudio();
      }
    };
  }, []);

  const startSession = useCallback(
    async (history: Content[], liveModel: LiveModel, languageCode: string, options: { streamVideo: boolean }) => {
      if (isConnecting || isSessionActive) return;
      manualStopRef.current = false;
      lastHistoryRef.current = history;

      const connect = async () => {
        if (sessionRef.current) {
          sessionRef.current.close();
          sessionRef.current = null;
        }
        if (manualStopRef.current) return;
        setIsConnecting(true);

        try {
          const tokenRes = await fetch("/api/live/token", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ keySelection }),
          });
          if (!tokenRes.ok) throw new Error("Could not fetch authentication token.");
          const { token } = await tokenRes.json();

          const ai = new GoogleGenAI({ apiKey: token, apiVersion: "v1alpha" });

          const currentConfig = getLiveConnectConfig(liveModel, languageCode, sessionHandleRef.current);

          const liveSession = await ai.live.connect({
            model: liveModel.name,
            config: currentConfig,
            callbacks: {
              onopen: () => {
                setIsConnecting(false);
                setIsSessionActive(true);
                onStateChange(true);
              },
              onmessage: (message) => {
                if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
                  sessionHandleRef.current = message.sessionResumptionUpdate.newHandle;
                }
                if (message.goAway?.timeLeft) {
                  console.log(`Connection will close in ${message.goAway.timeLeft}. Reconnecting...`);
                  sessionRef.current = null;
                  if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                  reconnectTimeoutRef.current = setTimeout(connect, 1000);
                }
                if (message.serverContent?.interrupted) {
                  stopCurrentPlayback();
                }
                if (message.serverContent?.modelTurn?.parts) {
                  const part = message.serverContent.modelTurn.parts[0];
                  if (part.text) {
                    accumulatedTextRef.current += part.text;
                    onInterimText(accumulatedTextRef.current);
                  }
                  if (part.inlineData?.data) {
                    const mimeType = part.inlineData.mimeType;
                    const rateMatch = mimeType?.match(/rate=(\d+)/);
                    const incomingSampleRate = rateMatch ? parseInt(rateMatch[1], 10) : OUTPUT_SAMPLE_RATE;
                    lastPlaybackSampleRateRef.current = incomingSampleRate;
                    if (
                      !playbackAudioContextRef.current ||
                      playbackAudioContextRef.current.sampleRate !== incomingSampleRate
                    ) {
                      if (playbackAudioContextRef.current) playbackAudioContextRef.current.close();
                      playbackAudioContextRef.current = new window.AudioContext({ sampleRate: incomingSampleRate });
                      nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
                    }
                    const raw = window.atob(part.inlineData.data);
                    const rawLength = raw.length;
                    const array = new Uint8Array(new ArrayBuffer(rawLength));
                    for (let i = 0; i < rawLength; i++) array[i] = raw.charCodeAt(i);
                    const int16Array = new Int16Array(array.buffer);
                    audioBufferChunksRef.current.push(int16Array.buffer);
                    const float32Array = new Float32Array(int16Array.length);
                    for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32767.0;
                    if (playbackQueueRef.current.length === 0 && !isPlayingRef.current) {
                      nextPlayTimeRef.current = playbackAudioContextRef.current.currentTime;
                    }
                    playbackQueueRef.current.push(float32Array);
                    processAndPlayAudio();
                  }
                } else if (message.serverContent?.turnComplete) {
                  const audioBlob =
                    audioBufferChunksRef.current.length > 0
                      ? createWavBlob(audioBufferChunksRef.current, lastPlaybackSampleRateRef.current)
                      : null;
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
              onclose: (e) => {
                console.log("Live session closed:", e.code, e.reason);
                sessionRef.current = null;
                if (!manualStopRef.current && sessionHandleRef.current) {
                  if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                  reconnectTimeoutRef.current = setTimeout(connect, 1000);
                }
              },
            },
          });

          sessionRef.current = liveSession;

          if (history && history.length > 0 && !sessionHandleRef.current) {
            const historyString = history
              .map((c) => {
                const partsText = c.parts?.map((p) => p.text || "").join(" ") || "";
                return `${c.role}: ${partsText.trim()}`;
              })
              .join("\n");
            const contextPrompt = `Here is our conversation history so far. Use this as context for my next live audio input. Do not respond to this message, just wait for my voice.\n\n--- HISTORY ---\n${historyString}\n--- END HISTORY ---`;
            sessionRef.current.sendClientContent({ turns: contextPrompt });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          showToast(message, "error");
          stopSession();
        }
      };

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneStreamRef.current = audioStream;

        if (options.streamVideo) {
          const videoStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          videoStreamRef.current = videoStream;
          onVideoStream(videoStream);
        }

        audioContextRef.current = new window.AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(audioStream);
        const processorBlob = new Blob([resamplingProcessor], { type: "application/javascript" });
        const processorUrl = URL.createObjectURL(processorBlob);
        await audioContextRef.current.audioWorklet.addModule(processorUrl);
        const workletNode = new AudioWorkletNode(audioContextRef.current, "resampling-processor", {
          processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE },
        });
        audioWorkletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event) => {
          if (!sessionRef.current) return;
          const pcm16Buffer = event.data;
          let binary = "";
          const bytes = new Uint8Array(pcm16Buffer);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Audio = btoa(binary);
          const media: GenaiBlob = { data: base64Audio, mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}` };
          sessionRef.current.sendRealtimeInput({ media });
        };

        source.connect(workletNode);
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
        workletNode.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);

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

        await connect();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(message, "error");
        stopSession();
      }
    },
    [
      isConnecting,
      isSessionActive,
      onVideoStream,
      showToast,
      stopSession,
      getAuthHeaders,
      keySelection,
      onStateChange,
      onInterimText,
      stopCurrentPlayback,
      onTurnComplete,
      processAndPlayAudio,
    ],
  );

  return { isConnecting, isSessionActive, startSession, stopSession };
};
