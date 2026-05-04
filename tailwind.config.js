/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand accent (sparingly used)
        hPurple: "#2A0D4D",
        hPurpleSoft: "#7B5BC7",
        hGold: "#D9AA43",
        hGoldLight: "#F7D877",
        hGoldDeep: "#B8862B",

        // Core neutral system (ChatGPT/Manus style)
        bg: "#FFFFFF",          // page background
        surface: "#F7F7F8",     // subtle gray (input, hover)
        surface2: "#F4F4F5",    // user bubble
        ink: "#0F0F0F",         // primary text
        ink2: "#262626",        // secondary text
        muted: "#6B7280",       // tertiary
        line: "#E5E5EA",        // hairline border

        // Aliases for legacy (gradually retire)
        hLavender: "#F4F4F5",
        hLavenderDeep: "#E5E5EA",
        hPurpleDeep: "#2A0D4D",
        hInk: "#0F0F0F",
        hMuted: "#6B7280",
        hLine: "#E5E5EA",
        hBg: "#FFFFFF"
      },
      boxShadow: {
        glow: "0 18px 40px rgba(217, 170, 67, 0.25)",
        soft: "0 8px 24px rgba(43, 13, 77, 0.08)"
      }
    }
  },
  plugins: []
};

