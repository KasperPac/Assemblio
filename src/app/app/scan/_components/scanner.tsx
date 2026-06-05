"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "../scan.module.css";

interface ScannerProps {
  onScan: (code: string) => void;
  active: boolean;
  label?: string;
}

// Native BarcodeDetector (Chrome 83+, Edge, Android WebView) — QR only.
// Declared here so TypeScript doesn't complain about the non-standard API.
interface NativeBarcode { rawValue: string }
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<NativeBarcode[]>;
}
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): NativeDetector;
};
const HAS_NATIVE_DETECTOR =
  typeof window !== "undefined" && "BarcodeDetector" in window;

function extractCode(raw: string): string {
  // The QR encodes the 6-char short code directly; strip any accidental
  // hyphens and take the last 6 chars for forward-compatibility.
  return raw.replace(/-/g, "").slice(-6).toUpperCase();
}

export function Scanner({ onScan, active, label = "Scan a location barcode" }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [torchOn, setTorchOn] = useState(false);

  // Stable ref so the decode loop never restarts just because the parent re-renders
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Brief visual acknowledgement state after a successful decode
  const [hitCode, setHitCode] = useState<string | null>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-load zxing in parallel with camera permission (only needed on iOS)
  type ReaderCtor = typeof import("@zxing/browser").BrowserMultiFormatReader;
  const readerCtorRef = useRef<ReaderCtor | null>(null);

  // ── Camera stream ─────────────────────────────────────────────────────────
  useEffect(() => {
    let stopped = false;

    // Kick off zxing load immediately — free while waiting for camera permission
    if (!HAS_NATIVE_DETECTOR) {
      import("@zxing/browser")
        .then((m) => { readerCtorRef.current = m.BrowserMultiFormatReader; })
        .catch(() => {/* non-fatal */});
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPermission("granted");
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setPermission("granted");
        } catch {
          setPermission("denied");
        }
      }
    }

    start();
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Decode loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || permission !== "granted" || !videoRef.current || !streamRef.current) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }

    let stopped = false;

    function fire(raw: string) {
      const code = extractCode(raw);
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;
      // Flash the target green and show the code while the parent fetches data
      setHitCode(code);
      if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
      hitTimerRef.current = setTimeout(() => setHitCode(null), 2000);
      onScanRef.current(code);
    }

    if (HAS_NATIVE_DETECTOR) {
      // ── Fast path: native BarcodeDetector (Chrome / Pixel 10 Pro) ─────────
      // Detects directly from the live <video> element — no canvas needed.
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const id = setInterval(async () => {
        if (stopped || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          for (const b of results) fire(b.rawValue);
        } catch { /* ignore per-frame errors */ }
      }, 150);
      controlsRef.current = { stop: () => clearInterval(id) };
      return () => {
        stopped = true;
        clearInterval(id);
        controlsRef.current = null;
      };
    } else {
      // ── Fallback: zxing QR-only reader (iOS Safari) ───────────────────────
      async function startDecoding() {
        // Ensure module is loaded
        if (!readerCtorRef.current) {
          const m = await import("@zxing/browser");
          readerCtorRef.current = m.BrowserMultiFormatReader;
        }
        if (stopped || !videoRef.current || !streamRef.current) return;

        // Restrict to QR only — dramatically faster than trying all formats
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const hints = new Map<number, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
        const ReaderCtor = readerCtorRef.current;
        const reader = new ReaderCtor(hints as Map<never, never>);

        try {
          const controls = await reader.decodeFromStream(
            streamRef.current,
            videoRef.current,
            (result) => { if (result) fire(result.getText()); }
          );
          controlsRef.current = controls;
        } catch { /* stream ended or unmounted */ }
      }

      startDecoding();
      return () => {
        stopped = true;
        controlsRef.current?.stop();
        controlsRef.current = null;
      };
    }
  }, [active, permission]);

  // ── Torch ─────────────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { /* torch not supported */ }
  }, [torchOn]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (permission === "denied") {
    return (
      <div className={styles.permissionDenied}>
        <p>📷 Camera access required</p>
        <p>Open your browser settings, allow camera access for this site, then reload.</p>
      </div>
    );
  }

  return (
    <div className={styles.scannerWrap}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} className={styles.scanVideo} playsInline muted />
      <div className={styles.scanOverlay} aria-hidden>
        <div className={`${styles.scanTarget}${hitCode ? ` ${styles.scanTargetHit}` : ""}`} />
        {hitCode
          ? <span className={styles.scanHitCode}>{hitCode}</span>
          : <span className={styles.scanLabel}>{label}</span>
        }
      </div>
      <button
        type="button"
        className={styles.torchBtn}
        onClick={toggleTorch}
        aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
      >
        {torchOn ? "🔦" : "💡"}
      </button>
    </div>
  );
}
