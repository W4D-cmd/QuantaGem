import { useState, useRef, useCallback } from 'react';

const SAMPLE_RATE = 16000;
const CAPTURE_PROCESSOR_NAME = "capture-processor";
const CAPTURE_WORKLET_SOURCE = `
  class CaptureProcessor extends AudioWorkletProcessor {
    process(inputs) {
      const input = inputs[0];
      if (input.length > 0 && input[0].length > 0) {
        this.port.postMessage(input[0]);
      }
      return true;
    }
  }
  registerProcessor("capture-processor", CaptureProcessor);
`;

interface UseStreamingSTTOptions {
  getHeaders?: () => Record<string, string>;
}

export function useStreamingSTT(options: UseStreamingSTTOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanupAudio = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    setIsStreaming(false);
    cleanupAudio();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [cleanupAudio]);

  const startStream = useCallback(async () => {
    if (isStreaming) return;
    
    setTranscript("");
    setError(null);
    setIsStreaming(true);
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: SAMPLE_RATE },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const silentGainNode = audioContext.createGain();
      silentGainNode.gain.value = 0;

      const workletBlob = new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(workletBlob);
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, CAPTURE_PROCESSOR_NAME);
      workletNodeRef.current = workletNode;

      const { readable, writable } = new TransformStream<Float32Array, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(new Uint8Array(chunk.buffer));
        }
      });
      const writer = writable.getWriter();

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (abortController.signal.aborted) {
          writer.close().catch(() => {});
          return;
        }
        writer.write(event.data).catch(() => {});
      };

      sourceNode.connect(workletNode);
      workletNode.connect(silentGainNode);
      silentGainNode.connect(audioContext.destination);

      const headers = options.getHeaders ? options.getHeaders() : {};
      
      const response = await fetch("/api/stt/stream", {
        method: "POST",
        headers,
        body: readable,
        // @ts-ignore
        duplex: "half",
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to connect to streaming API: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "text") {
                setTranscript(prev => prev + data.value);
              } else if (data.type === "done") {
                stopStream();
              } else if (data.type === "error") {
                setError(data.value);
                stopStream();
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", dataStr);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || "An error occurred during streaming");
        console.error(err);
      }
      stopStream();
    }
  }, [isStreaming, stopStream, options]);

  return {
    isStreaming,
    transcript,
    startStream,
    stopStream,
    error,
  };
}
