import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#F8F7F4",
        ink: "#1A1A1A",
        muted: "#6B6B6B",
        panel: "#FFFFFF",
        accent: "#E8621A",
        "accent-light": "#FFF0E8",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
