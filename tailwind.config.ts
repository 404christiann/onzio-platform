import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Brand aliases are CSS-variable-driven so a presentation template can
      // repaint them for its own scope only. `styles/globals.css` defines the
      // `--tw-*-rgb` triples at `:root` with the exact same values these
      // aliases previously hardcoded, and overrides them under
      // `[data-font-pack="academy"]` for `academy@1` tenants (DCFC-D132).
      // Every other template resolves to the identical colors as before.
      colors: {
        white: "rgb(var(--tw-white-rgb) / <alpha-value>)",
        black: "rgb(var(--tw-black-rgb) / <alpha-value>)",
        green: {
          DEFAULT: "rgb(var(--tw-green-rgb) / <alpha-value>)",
          dark: "rgb(var(--tw-green-dark-rgb) / <alpha-value>)",
          light: "rgb(var(--tw-green-light-rgb) / <alpha-value>)",
        },
        red: {
          DEFAULT: "rgb(var(--tw-red-rgb) / <alpha-value>)",
          dark: "rgb(var(--tw-red-dark-rgb) / <alpha-value>)",
        },
        gray: {
          light: "rgb(var(--tw-gray-light-rgb) / <alpha-value>)",
          mid: "rgb(var(--tw-gray-mid-rgb) / <alpha-value>)",
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
