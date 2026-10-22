import { useEffect, useMemo, useRef, useState } from "react";
import {
  enqueueIntercomTalkback,
  getIntercomSessionStatus,
  pushDeviceSettings,
  startIntercomSession
} from "../utils/api";

export type IntercomTarget = {
  assetId: string;
  cameraId?: string;
  description: string;
  registration: string;
};

type SessionStatus = "selecting" | "requesting" | "live" | "failed";

type Props = {
  targets: IntercomTarget[];
  onClose: () => void;
};

const TALKBACK_SAMPLE_RATE = 16_000;
const FLUSH_INTERVAL_MS = 420;
const LEVEL_BAR_COUNT = 22;

const formatElapsed = (startedAtMs: number) => {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const floatToPcm16 = (input: Float32Array) => {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

const downsample = (input: Float32Array, inputRate: number, outputRate: number) => {
  if (!input.length || !Number.isFinite(inputRate) || inputRate <= 0 || inputRate === outputRate) {
    return input;
  }
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = input[Math.floor(index * ratio)] ?? 0;
  }
  return output;
};

const pcm16ToBase64 = (samples: Int16Array) => {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunk = 0x2000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const slice = bytes.subarray(offset, offset + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

export default function IntercomSessionPopup({ targets, onClose }: Props) {
  const uniqueTargets = useMemo(() => {
    const seen = new Set<string>();
    return targets.filter((target) => {
      const key = `${target.assetId}::${target.cameraId || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(target.assetId || target.cameraId);
    });
  }, [targets]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<SessionStatus>(uniqueTargets.length === 1 ? "requesting" : "selecting");
  const [message, setMessage] = useState(
    uniqueTargets.length === 1
      ? "Opening a secure talkback channel to the selected asset."
      : "Choose the asset you want to speak with."
  );
  const [sessionId, setSessionId] = useState("");
  const [queued, setQueued] = useState(false);
  const [talking, setTalking] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [inboundLive, setInboundLive] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [pendingTalkback, setPendingTalkback] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: LEVEL_BAR_COUNT }, () => 8));
  const [elapsed, setElapsed] = useState("00:00");
  const [framesSent, setFramesSent] = useState(0);

  const startedAtRef = useRef(Date.now());
  const talkingRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);
  const pendingSamplesRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const activeTarget = uniqueTargets[activeIndex] ?? uniqueTargets[0] ?? null;
  const cameraId = String(activeTarget?.cameraId ?? "").trim();
  const assetLabel = String(activeTarget?.description || activeTarget?.registration || activeTarget?.assetId || "Asset").trim();
  const registration = String(activeTarget?.registration || "").trim();

  const stopAudio = () => {
    talkingRef.current = false;
    setTalking(false);
    if (flushTimerRef.current) {
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;
    analyserRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    pendingSamplesRef.current = [];
    setMicReady(false);
  };

  const flushTalkback = async () => {
    if (!cameraId || !pendingSamplesRef.current.length) return;
    const samples = floatToPcm16(new Float32Array(pendingSamplesRef.current));
    pendingSamplesRef.current = [];
    if (!samples.length) return;
    const result = await enqueueIntercomTalkback({
      cameraId,
      pcm16leBase64: pcm16ToBase64(samples),
      sampleRate: TALKBACK_SAMPLE_RATE,
      channels: 1
    });
    if (result.queued) {
      setFramesSent((current) => current + 1);
      setPendingTalkback(true);
    } else if (result.error) {
      setMessage(result.error);
    }
  };

  const startMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser cannot open a microphone for talkback. The device channel is still activated.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      processor.onaudioprocess = (event) => {
        if (!talkingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const resampled = downsample(input, context.sampleRate, TALKBACK_SAMPLE_RATE);
        pendingSamplesRef.current.push(...Array.from(resampled));
      };
      mediaStreamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      processorRef.current = processor;
      setMicReady(true);

      const tick = () => {
        const node = analyserRef.current;
        if (!node) return;
        const data = new Uint8Array(node.frequencyBinCount);
        node.getByteFrequencyData(data);
        const next = Array.from({ length: LEVEL_BAR_COUNT }, (_, index) => {
          const bucket = data[Math.floor((index / LEVEL_BAR_COUNT) * data.length)] ?? 0;
          return talkingRef.current ? Math.max(8, Math.round((bucket / 255) * 100)) : Math.max(8, Math.round((bucket / 255) * 36));
        });
        setLevels(next);
        animationRef.current = window.requestAnimationFrame(tick);
      };
      animationRef.current = window.requestAnimationFrame(tick);
    } catch {
      setMessage("Microphone access was blocked. You can still keep the vehicle channel open, then allow the mic to speak.");
    }
  };

  const activateTarget = async (index: number) => {
    const target = uniqueTargets[index];
    if (!target) return;
    const nextCameraId = String(target.cameraId ?? "").trim();
    setActiveIndex(index);
    setStatus("requesting");
    setQueued(false);
    setFramesSent(0);
    setInboundLive(false);
    setDeviceOnline(false);
    setPendingTalkback(false);
    startedAtRef.current = Date.now();
    setElapsed("00:00");
    setMessage(`Requesting intercom on ${target.description || target.registration || "the selected asset"}.`);

    if (!nextCameraId) {
      setStatus("failed");
      setMessage("This asset has no camera identity, so talkback cannot be opened.");
      return;
    }

    const session = await startIntercomSession({ cameraId: nextCameraId, assetId: target.assetId });
    if (session.started) {
      setSessionId(String(session.sessionId ?? ""));
      setQueued(Boolean(session.queued));
      setStatus("live");
      setMessage(session.message || "Intercom channel is open. Hold the talk button to speak to the vehicle.");
      await startMicrophone();
      return;
    }

    const fallback = await pushDeviceSettings(nextCameraId, {
      camera: { autoStartIntercom: true, autoStartTalkback: true },
      intercom: { enabled: true, uploadIntervalMs: 1000 }
    });
    setSessionId("");
    setQueued(Boolean(fallback.queued));
    setStatus("live");
    setMessage(
      fallback.queued
        ? "Intercom start was queued on the device. Hold the talk button to speak once the camera joins."
        : session.error || fallback.error || "Intercom console is open. Device settings could not be queued, but talkback is ready."
    );
    await startMicrophone();
  };

  useEffect(() => {
    if (uniqueTargets.length === 1) {
      void activateTarget(0);
    }
    return () => {
      stopAudio();
    };
    // Activate once for a single target when the popup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "live" && status !== "requesting") return;
    const timer = window.setInterval(() => {
      setElapsed(formatElapsed(startedAtRef.current));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== "live" || !cameraId) return;
    let cancelled = false;
    const poll = async () => {
      const snapshot = await getIntercomSessionStatus(cameraId);
      if (cancelled || !snapshot) return;
      setInboundLive(Boolean(snapshot.inboundLive));
      setDeviceOnline(Boolean(snapshot.online));
      setPendingTalkback(Boolean(snapshot.pendingTalkback));
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, cameraId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopAudio();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const beginTalk = () => {
    if (status !== "live" || !micReady) return;
    talkingRef.current = true;
    setTalking(true);
    setMessage("Transmitting operator audio to the vehicle.");
    if (flushTimerRef.current) window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = window.setInterval(() => {
      void flushTalkback();
    }, FLUSH_INTERVAL_MS);
  };

  const endTalk = () => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    setTalking(false);
    if (flushTimerRef.current) {
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    void flushTalkback();
    setMessage("Listening for the vehicle. Hold the talk button to speak again.");
  };

  const closePopup = () => {
    stopAudio();
    onClose();
  };

  const deviceStep = status === "failed" ? "failed" : status === "live" ? (queued || deviceOnline ? "done" : "active") : "active";
  const channelStep = status === "live" ? "done" : status === "failed" ? "failed" : "waiting";
  const audioStep = talking ? "active" : inboundLive || micReady ? "done" : status === "live" ? "waiting" : "waiting";

  return (
    <div className="intercom-popup-backdrop" role="dialog" aria-modal="true" aria-label="Intercom session">
      <div className="intercom-popup-card">
        <div className="intercom-popup-top">
          <div>
            <div className="intercom-popup-kicker">
              <span className={`intercom-popup-pulse ${status === "live" ? "is-live" : status === "failed" ? "is-failed" : ""}`} />
              Intercom session
            </div>
            <h2 className="intercom-popup-title">{assetLabel}</h2>
            <div className="intercom-popup-sub">
              {registration && registration !== assetLabel ? <span>{registration}</span> : null}
              {cameraId ? <span>Camera {cameraId}</span> : <span>No camera ID</span>}
              {sessionId ? <span>Session {sessionId.slice(0, 8)}</span> : null}
            </div>
          </div>
          <button type="button" className="intercom-popup-close" onClick={closePopup}>
            End
          </button>
        </div>

        {status === "selecting" ? (
          <div className="intercom-popup-select">
            <div className="intercom-popup-select-list">
              {uniqueTargets.length === 0 ? (
                <div className="intercom-popup-empty">No assets are selected.</div>
              ) : (
                uniqueTargets.map((target, index) => (
                  <button
                    key={`${target.assetId}-${target.cameraId || index}`}
                    type="button"
                    className="intercom-popup-select-item"
                    onClick={() => void activateTarget(index)}
                  >
                    <strong>{target.description || target.registration || target.assetId}</strong>
                    <span>{target.cameraId ? `Camera ${target.cameraId}` : "No camera identity"}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="intercom-popup-steps">
              <div className={`intercom-popup-step is-${deviceStep}`}>
                <em>01</em>
                <strong>Device</strong>
                <span>{status === "failed" ? "Unavailable" : queued ? "Activation queued" : status === "live" ? "Linked" : "Requesting"}</span>
              </div>
              <div className={`intercom-popup-step is-${channelStep}`}>
                <em>02</em>
                <strong>Channel</strong>
                <span>{status === "live" ? "Talkback open" : status === "failed" ? "Closed" : "Negotiating"}</span>
              </div>
              <div className={`intercom-popup-step is-${audioStep}`}>
                <em>03</em>
                <strong>Audio</strong>
                <span>{talking ? "Transmitting" : inboundLive ? "Vehicle live" : micReady ? "Mic ready" : "Standby"}</span>
              </div>
            </div>

            <div className="intercom-popup-stage">
              {status === "requesting" ? <div className="intercom-popup-loader" aria-hidden="true" /> : null}
              <div className="intercom-popup-wave" aria-hidden="true">
                {levels.map((value, index) => (
                  <span key={`bar-${index}`} style={{ height: `${value}%` }} />
                ))}
              </div>
              <button
                type="button"
                className={`intercom-popup-ptt ${talking ? "is-talking" : ""}`}
                disabled={status !== "live"}
                onMouseDown={beginTalk}
                onMouseUp={endTalk}
                onMouseLeave={endTalk}
                onTouchStart={(event) => {
                  event.preventDefault();
                  beginTalk();
                }}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  endTalk();
                }}
              >
                <strong>{talking ? "Release to listen" : status === "live" ? "Hold to talk" : "Connecting"}</strong>
                <span>{micReady ? "Operator microphone armed" : "Preparing microphone"}</span>
              </button>
            </div>

            <p className="intercom-popup-copy">{message}</p>

            <div className="intercom-popup-metrics">
              <div>
                <span>Session</span>
                <strong>{elapsed}</strong>
              </div>
              <div>
                <span>Inbound</span>
                <strong className={inboundLive ? "is-on" : ""}>{inboundLive ? "Live" : "Quiet"}</strong>
              </div>
              <div>
                <span>Device</span>
                <strong className={deviceOnline ? "is-on" : ""}>{deviceOnline ? "Online" : queued ? "Queued" : "Standby"}</strong>
              </div>
              <div>
                <span>Talkback</span>
                <strong>{framesSent > 0 || pendingTalkback ? `${framesSent} frames` : "Ready"}</strong>
              </div>
            </div>
          </>
        )}

        <div className="intercom-popup-actions">
          {status === "failed" && uniqueTargets.length > 1 ? (
            <button type="button" className="intercom-popup-btn" onClick={() => setStatus("selecting")}>
              Choose another asset
            </button>
          ) : null}
          {status === "failed" && cameraId ? (
            <button type="button" className="intercom-popup-btn" onClick={() => void activateTarget(activeIndex)}>
              Try again
            </button>
          ) : null}
          <button type="button" className="intercom-popup-btn ghost" onClick={closePopup}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
