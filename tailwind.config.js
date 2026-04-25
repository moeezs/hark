/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        hark: {
          teal: "#1A6B7A",
          "teal-dark": "#124F5C",
          "teal-soft": "#EAF4F6",
          "teal-border": "#BAD8DF",
          bg: "#F5F2ED",
          surface: "#FFFFFF",
          border: "#E2DDD7",
          "border-light": "#EAE6E1",
          text: "#18100E",
          "text-2": "#47403C",
          muted: "#968E88",
          "muted-light": "#C4BEB8",
        },
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      animation: {
        "pulse-status": "pulse-status 2.6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-status": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
    },
  },
  plugins: [],
};
