"use client";

import { useRef, useState, useTransition } from "react";
import { uploadComponentImage, removeComponentImage } from "../actions";
import styles from "./component-image.module.css";

interface Props {
  componentId: string;
  /** Component name — used as alt text on the image. */
  componentName: string;
  initialImageUrl: string | null;
}

export default function ComponentImage({
  componentId,
  componentName,
  initialImageUrl,
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
          <img src={imageUrl} alt={componentName} className={styles.image} />
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

        {imageUrl && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleRemove}
            disabled={isPending}
            aria-label="Remove component image"
          >
            <span aria-hidden="true">🗑</span> Remove
          </button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  );
}
