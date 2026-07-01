import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        mist: "#eef2f7",
        pine: "#0f5132",
        ember: "#9a3412",
        rose: "#b42318",
        tide: "#0f766e",
        sky: "#155eef",
        sand: "#f8fafc"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.10)",
        glow: "0 0 0 1px rgba(255,255,255,0.18), 0 14px 38px rgba(15, 23, 42, 0.10)"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"]
      },
      backgroundImage: {
        "soft-grid":
          "linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px)"
      },
      backgroundSize: {
        grid: "32px 32px"
      }
    }
  },
  plugins: []
};

export default config;
