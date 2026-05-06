"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

interface Props {
  entityId: string;
  entityType: string;
  entityName: string;
  path: string;
  onClose: () => void;
}

export function BarcodeModal({ entityId, entityType, entityName, path, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const printSvgRef = useRef<SVGSVGElement>(null);
  const shortCode = entityId.replace(/-/g, "").slice(-6).toUpperCase();

  useEffect(() => {
    import("jsbarcode").then((mod) => {
      const JsBarcode = mod.default;
      if (svgRef.current) JsBarcode(svgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2.5, height: 64 });
      if (printSvgRef.current) JsBarcode(printSvgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 40 });
    });
  }, [shortCode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <div className={styles.modalType}>{entityType}</div>
        <div className={styles.modalName}>{entityName}</div>
        <div className={styles.modalPath}>{path}</div>

        <div className={styles.barcodeBox}>
          <svg ref={svgRef} />
          <div className={styles.shortCode2}>{shortCode}</div>
          <div className={styles.shortCodeLabel}>location code</div>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btnSave} onClick={() => window.print()}>Print Label</button>
        </div>

        {/* Print-only label */}
        <div className={styles.printLabel}>
          <div className={styles.printPath}>{path}</div>
          <div className={styles.printName}>{entityName}</div>
          <svg ref={printSvgRef} />
          <div className={styles.printCode}>{shortCode}</div>
        </div>
      </div>
    </div>
  );
}
