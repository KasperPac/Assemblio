"use client";

import { useTheme, type ThemeId } from "@/app/theme-provider";
import styles from "./appearance.module.css";

type ThemeDef = {
  id: ThemeId;
  name: string;
  description: string;
  colors: {
    bg: string;
    sidebar: string;
    card: string;
    brand: string;
    ink: string;
  };
};

const themes: ThemeDef[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Dark theme with green accents. The default Assemblio look.",
    colors: {
      bg: "#0D1117",
      sidebar: "#10161F",
      card: "#161D2D",
      brand: "#818CF8",
      ink: "#f0f2f5",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Clean light theme for bright working environments.",
    colors: {
      bg: "#F8F7F5",
      sidebar: "#F0EEE9",
      card: "#FFFFFF",
      brand: "#6366F1",
      ink: "#1a1d23",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep blue theme with sky-blue accents.",
    colors: {
      bg: "#0a1628",
      sidebar: "#0d1a2d",
      card: "#112240",
      brand: "#38bdf8",
      ink: "#e2e8f0",
    },
  },
  {
    id: "ember",
    name: "Ember",
    description: "Warm dark theme with orange accents.",
    colors: {
      bg: "#1a0f0b",
      sidebar: "#1f1410",
      card: "#2a1a14",
      brand: "#f97316",
      ink: "#f5f0ed",
    },
  },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={styles.grid}>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles.themeCard} ${theme === t.id ? styles.themeCardActive : ""}`}
          onClick={() => setTheme(t.id)}
        >
          <div className={styles.preview} style={{ background: t.colors.bg }}>
            <div className={styles.previewSidebar} style={{ background: t.colors.sidebar }}>
              <div className={styles.previewNavItem} style={{ background: `${t.colors.brand}20` }}>
                <span style={{ background: t.colors.brand }} className={styles.previewDot} />
                <span style={{ background: t.colors.ink, opacity: 0.5 }} className={styles.previewLine} />
              </div>
              <div className={styles.previewNavItem}>
                <span style={{ background: t.colors.ink, opacity: 0.2 }} className={styles.previewDot} />
                <span style={{ background: t.colors.ink, opacity: 0.2 }} className={styles.previewLine} />
              </div>
              <div className={styles.previewNavItem}>
                <span style={{ background: t.colors.ink, opacity: 0.2 }} className={styles.previewDot} />
                <span style={{ background: t.colors.ink, opacity: 0.2 }} className={styles.previewLine} />
              </div>
            </div>
            <div className={styles.previewMain}>
              <div className={styles.previewCard} style={{ background: t.colors.card, borderColor: `${t.colors.ink}10` }}>
                <span style={{ background: t.colors.ink, opacity: 0.6 }} className={styles.previewLineLong} />
                <span style={{ background: t.colors.ink, opacity: 0.2 }} className={styles.previewLineMed} />
              </div>
              <div className={styles.previewRow}>
                <div className={styles.previewCard} style={{ background: t.colors.card, borderColor: `${t.colors.ink}10` }}>
                  <span style={{ background: t.colors.brand }} className={styles.previewLineMed} />
                </div>
                <div className={styles.previewCard} style={{ background: t.colors.card, borderColor: `${t.colors.ink}10` }}>
                  <span style={{ background: t.colors.ink, opacity: 0.3 }} className={styles.previewLineMed} />
                </div>
              </div>
            </div>
          </div>
          <div className={styles.themeInfo}>
            <div className={styles.themeName}>
              <span className={styles.themeSwatch} style={{ background: t.colors.brand }} />
              {t.name}
              {theme === t.id && <span className={styles.activeBadge}>Active</span>}
            </div>
            <p className={styles.themeDesc}>{t.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
