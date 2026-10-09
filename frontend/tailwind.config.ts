import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-jakarta)", "sans-serif"],
        heading: ["var(--font-geist)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
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
      transitionTimingFunction: { 
        workspace: "var(--ease-workspace)",
        tactile: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      maxWidth: { workspace: "72rem", wide: "100rem" },
      boxShadow: {
        ambient: "0 24px 72px rgba(0, 0, 0, 0.4)",
        "ambient-glow": "0 24px 72px var(--accent-ambient)",
      }
    },
  },
  plugins: [],
};

export default config;
