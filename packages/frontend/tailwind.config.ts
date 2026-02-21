import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0D47A1",
        accent: "#00BCD4",
        success: "#4CAF50",
        warning: "#FF9800",
        danger: "#F44336",
        surface: "#1A1A2E",
        card: "#16213E",
      },
    },
  },
  plugins: [],
};
export default config;
