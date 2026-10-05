import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-soft": "var(--surface-soft)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-ink": "var(--accent-ink)",
        danger: "var(--danger)",
        "danger-surface": "var(--danger-surface)",
        "danger-line": "var(--danger-line)",
        "surface-sunken": "var(--surface-sunken)",
      },
      borderRadius: {
        control: "var(--radius-control)",
        panel: "var(--radius-panel)",
        media: "var(--radius-media)",
      },
      transitionTimingFunction: { workspace: "var(--ease-workspace)" },
      maxWidth: { workspace: "72rem", wide: "100rem" },
    },
  },
  plugins: [],
};

export default config;
