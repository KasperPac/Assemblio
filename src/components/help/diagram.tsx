import { DIAGRAMS } from "./diagrams";
import styles from "./diagram.module.css";

type Props = { name: string; caption: string };

export function Diagram({ name, caption }: Props) {
  const Drawing = DIAGRAMS[name];
  if (!Drawing) throw new Error(`Unknown help diagram "${name}"`);
  return (
    <figure className={styles.figure}>
      <div className={styles.drawing}>
        <Drawing />
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}
