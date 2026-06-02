/**
 * ComponentThumbnail — 36×36 read-only image for a manufacturing component.
 * Shows the component's image if available, otherwise a grey placeholder with a camera icon.
 * Used in Goods Inwards receive and detail screens.
 */
import styles from "./component-thumbnail.module.css";

interface Props {
  imageUrl: string | null;
  /** Component name — used as alt text when an image is shown. */
  name: string;
}

export default function ComponentThumbnail({ imageUrl, name }: Props) {
  return (
    <div className={styles.slot}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className={styles.image} />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          <svg
            width="16"
            height="16"
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
  );
}
