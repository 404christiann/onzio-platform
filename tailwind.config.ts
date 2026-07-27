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
        white: "#FFFFFF",
        black: "#141414",
        green: {
          DEFAULT: "#1B4D3E",
          dark: "#163d31",
          light: "#246655",
        },
        red: {
          DEFAULT: "#E7001B",
          dark: "#9e1123",
        },
        gray: {
          light: "#F5F5F5",
          mid: "#9A9A9A",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        lemon: ["var(--font-lemon-milk)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
