"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "../scan.module.css";

interface ScannerProps {
  onScan: (code: string) => void;
  active: boolean;
  label?: string;
}

export function Scanner({
  onScan,
  active,
  label = "Scan a location barcode",
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [torchOn, setTorchOn] = useState(false);

  // Keep a stable ref to onScan so the decode loop doesn't restart on every render
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Start camera stream on mount
  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        // Prefer rear camera on mobile
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPermission("granted");
      } catch {
        // Fallback: any camera (works on desktops without rear camera)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
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

  // Decode loop — start when active and camera is ready, stop when inactive
  useEffect(() => {
    if (!active || permission !== "granted" || !videoRef.current || !streamRef.current) {
      // Stop any running decode loop when going inactive
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }

    let stopped = false;

    async function startDecoding() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (stopped || !videoRef.current || !streamRef.current) return;

      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromStream(
          streamRef.current,
          videoRef.current,
          (result) => {
            if (!result) return;
            // Extract the 6-char short code: last 6 chars of the decoded text, uppercased
            const code = result.getText().replace(/-/g, "").slice(-6).toUpperCase();
            const now = Date.now();
            // Debounce: ignore same code within 1.5s to prevent double-fires
            if (code === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
            lastCodeRef.current = code;
            lastTimeRef.current = now;
            onScanRef.current(code);
          }
        );
        controlsRef.current = controls;
      } catch {
        // Stream ended or component unmounted before decode started — ignore
      }
    }

    startDecoding();
    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, permission]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      // Torch constraint is not in the standard TS lib — cast to avoid type error
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Torch not supported on this device — silently ignore
    }
  }, [torchOn]);

  if (permission === "denied") {
    return (
      <div className={styles.permissionDenied}>
        <p>📷 Camera access required</p>
        <p>
          Open your browser settings, allow camera access for this site, then reload the page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scannerWrap}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} className={styles.scanVideo} playsInline muted />
      <div className={styles.scanOverlay} aria-hidden>
        <div className={styles.scanTarget} />
        <span className={styles.scanLabel}>{label}</span>
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
