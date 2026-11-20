import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--p-bg)",
        surface: "var(--p-surface)",
        "surface-elevated": "var(--p-surface-elevated)",
        "surface-border": "var(--p-border)",
        ink: "var(--p-ink)",
        muted: "var(--p-muted)",
        accent: {
          DEFAULT: "var(--p-accent)",
          ink: "var(--p-accent-ink)",
          hover: "var(--p-accent-hover)",
        },
        danger: {
          DEFAULT: "#e06c75",
          surface: "rgba(224, 108, 117, 0.12)",
          border: "rgba(224, 108, 117, 0.3)",
        },
        warning: {
          DEFAULT: "#e5c07b",
          surface: "rgba(229, 192, 123, 0.12)",
          border: "rgba(229, 192, 123, 0.3)",
        },
        info: {
          DEFAULT: "#61afef",
          surface: "rgba(97, 175, 239, 0.12)",
          border: "rgba(97, 175, 239, 0.3)",
        },
        success: {
          DEFAULT: "#98c379",
          surface: "rgba(152, 195, 121, 0.12)",
          border: "rgba(152, 195, 121, 0.3)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "12px",
        md: "10px",
        lg: "14px",
        xl: "16px",
        "2xl": "20px",
      },
      transitionTimingFunction: {
        "snappy-out": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      scale: {
        "97": "0.97",
      },
    },
  },
  plugins: [],
};

export default config;
