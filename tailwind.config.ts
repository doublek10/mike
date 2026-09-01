import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Control room" theme: deep night-slate base, amber radar-sweep accent,
        // signal colors reused consistently for risk/opportunity across the app.
        base: {
          950: "#0B0F14",
          900: "#10161D",
          800: "#161E27",
          700: "#1E2833",
          600: "#2A3641",
          500: "#3D4B58",
        },
        signal: {
          amber: "#E8A33D",   // watch / attention
          gold: "#F2C14E",    // highlight
          risk: "#D65F5F",    // risk red-clay
          opportunity: "#4FA98C", // opportunity teal-green
          info: "#5B8CC8",    // neutral informational blue
        },
        ink: {
          100: "#F3F5F7",
          300: "#C4CDD6",
          500: "#8B98A6",
        },
      },
      fontFamily: {
        // System stacks by default so the build has zero external font
        // dependency. To restore the original Fraunces/Inter/IBM Plex Mono
        // pairing, use next/font/google in app/layout.tsx (recommended over
        // a <link> tag — it self-hosts at build time) and swap these
        // fallbacks for the generated CSS variables.
        display: ["Georgia", "'Iowan Old Style'", "serif"],
        sans: [
          "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Inter", "sans-serif",
        ],
        mono: ["'SFMono-Regular'", "'IBM Plex Mono'", "Menlo", "monospace"],
      },
      backgroundImage: {
        "radar-sweep": "conic-gradient(from 0deg, rgba(232,163,61,0.18), transparent 40%)",
      },
    },
  },
  plugins: [],
};
export default config;
