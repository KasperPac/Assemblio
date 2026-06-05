"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

interface Props {
  entityId: string;
  entityType: string;
  entityName: string;
  path: string;
  onClose: () => void;
}

export function BarcodeModal({ entityId, entityType, entityName, path, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const shortCode = entityId.replace(/-/g, "").slice(-6).toUpperCase();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  // Generate QR code as data URL
  useEffect(() => {
    setQrError(false);
    setQrDataUrl(null);
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(shortCode, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        })
      )
      .then(setQrDataUrl)
      .catch(() => setQrError(true));
  }, [shortCode]);

  function handleCopyCode() {
    navigator.clipboard.writeText(shortCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${shortCode}.png`;
    a.click();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      aria-labelledby="barcode-modal-title"
    >
      <button
        className={styles.modalClose}
        aria-label="Close barcode modal"
        onClick={onClose}
      >
        <span aria-hidden="true">✕</span>
      </button>
      <div className={styles.modalType}>{entityType}</div>
      <div id="barcode-modal-title" className={styles.modalName}>{entityName}</div>
      <div className={styles.modalPath}>{path}</div>

      <div className={styles.barcodeBox}>
        {qrError ? (
          <p className={styles.barcodeFallback}>Could not generate QR code.</p>
        ) : qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR code for ${shortCode}`} width={160} height={160} />
        ) : (
          <div style={{ width: 160, height: 160, background: "var(--surface-1)", borderRadius: 4 }} />
        )}
        <div className={styles.shortCode2}>{shortCode}</div>
        <div className={styles.shortCodeLabel}>location code</div>
        <button
          type="button"
          className={styles.btnCopyCode}
          aria-label="Copy location code to clipboard"
          onClick={handleCopyCode}
        >
          {copied ? "Copied!" : "Copy code"}
        </button>
      </div>

      <div className={styles.modalActions}>
        <button className={styles.btnSave} onClick={() => window.print()}>
          🖨 Print Label
        </button>
        {qrDataUrl && (
          <button className={styles.btnSave} onClick={handleDownload}>
            ⬇ Download PNG
          </button>
        )}
      </div>

      {/* Print-only label */}
      <div className={styles.printLabel}>
        <div className={styles.printPath}>{path}</div>
        <div className={styles.printName}>{entityName}</div>
        {qrDataUrl && (
          <img src={qrDataUrl} alt="" width={120} height={120} style={{ display: "block", margin: "6px 0" }} />
        )}
        <div className={styles.printCode}>{shortCode}</div>
      </div>
    </dialog>
  );
}
