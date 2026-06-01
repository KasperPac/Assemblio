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
  const svgRef = useRef<SVGSVGElement>(null);
  const printSvgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);
  const [barcodeError, setBarcodeError] = useState(false);
  const shortCode = entityId.replace(/-/g, "").slice(-6).toUpperCase();

  // Open dialog on mount
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Wire native cancel event (Escape key) to onClose
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  // Generate barcode
  useEffect(() => {
    setBarcodeError(false);
    import("jsbarcode")
      .then((mod) => {
        const JsBarcode = mod.default;
        try {
          if (svgRef.current) JsBarcode(svgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2.5, height: 64 });
          if (printSvgRef.current) JsBarcode(printSvgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 40 });
        } catch {
          setBarcodeError(true);
        }
      })
      .catch(() => setBarcodeError(true));
  }, [shortCode]);

  function handleCopyCode() {
    navigator.clipboard.writeText(shortCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
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
        {barcodeError ? (
          <p className={styles.barcodeFallback}>Could not generate barcode.</p>
        ) : (
          <svg ref={svgRef} />
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
        <button className={styles.btnSave} onClick={() => window.print()}>Print Label</button>
      </div>

      {/* Print-only label */}
      <div className={styles.printLabel}>
        <div className={styles.printPath}>{path}</div>
        <div className={styles.printName}>{entityName}</div>
        {!barcodeError && <svg ref={printSvgRef} />}
        <div className={styles.printCode}>{shortCode}</div>
      </div>
    </dialog>
  );
}
