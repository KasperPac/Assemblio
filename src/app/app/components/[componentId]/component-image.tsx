"use client";

import { useRef, useState, useTransition } from "react";
import {
  uploadComponentImage,
  fetchComponentImageFromNexar,
  removeComponentImage,
} from "../actions";
import styles from "./component-image.module.css";

interface Props {
  componentId: string;
  initialImageUrl: string | null;
  /** True when the component has a preferred supplier_components row with a non-empty supplier_part_number */
  hasSupplierPartNumber: boolean;
}

export default function ComponentImage({
  componentId,
  initialImageUrl,
  hasSupplierPartNumber,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Use PNG, JPEG, or WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.append("image", file);

    startTransition(async () => {
      const result = await uploadComponentImage(componentId, formData);
      if (result.error) {
        setError(result.error);
      } else if (result.imageUrl) {
        setImageUrl(result.imageUrl);
      }
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleFind() {
    setError(null);
    startTransition(async () => {
      const result = await fetchComponentImageFromNexar(componentId);
      if (result.found) {
        setImageUrl(result.imageUrl);
      } else if (result.reason === "no_results") {
        setError("No image found — try uploading one manually");
      } else {
        setError("Image lookup failed — try again or upload your own");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeComponentImage(componentId);
      if (result.error) {
        setError(result.error);
      } else {
        setImageUrl(null);
      }
    });
  }

  return (
    <div className={styles.imageSection}>
      <div className={styles.imageSlot}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Component" className={styles.image} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            {/* Camera icon */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        )}
      </div>

      {/* Hidden file input triggered by Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-hidden="true"
      />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          aria-label={imageUrl ? "Replace component image" : "Upload component image"}
        >
          ↑ Upload
        </button>

        {!imageUrl && hasSupplierPartNumber && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleFind}
            disabled={isPending}
            aria-label="Find image from supplier catalog"
          >
            {isPending ? "Searching…" : "🔍 Find image"}
          </button>
        )}

        {imageUrl && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleRemove}
            disabled={isPending}
            aria-label="Remove component image"
          >
            🗑 Remove
          </button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  );
}
