import { existsSync, readFileSync } from "fs";
import path from "path";
import Image from "next/image";
import { pngSize } from "@/lib/help/png-size";
import styles from "./screenshot.module.css";

type Props = { src: string; alt: string; caption?: string };

/**
 * A captured screen from public/help/. Until the capture script has produced
 * the file, it renders nothing in production and a labelled placeholder in
 * development, so a manual can name its screenshots before they exist.
 */
export function Screenshot({ src, alt, caption }: Props) {
  if (!/^\/help\/[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(src)) {
    throw new Error(`Screenshot src must be /help/<manual>/<name>.png, got "${src}"`);
  }
  const file = path.join(process.cwd(), "public", src);
  if (!existsSync(file)) {
    if (process.env.NODE_ENV !== "development") return null;
    return (
      <div className={styles.placeholder} role="note">
        Screenshot to come: {alt}
      </div>
    );
  }
  const { width, height } = pngSize(readFileSync(file));
  return (
    <figure className={styles.figure}>
      <Image src={src} alt={alt} width={width} height={height} className={styles.image} />
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
