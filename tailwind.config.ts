import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Tailwind's default theme.aria omits "invalid" — without this, every
      // `aria-invalid:*` utility in components/ui/* (button, checkbox,
      // textarea) compiles to no CSS rule at all, so the invalid state
      // silently never renders no matter what the component passes.
      aria: {
        invalid: 'invalid="true"',
      },
      // Brand aliases are CSS-variable-driven so a presentation template can
      // repaint them for its own scope only. `styles/globals.css` defines the
      // `--tw-*-rgb` triples at `:root` with the exact same values these
      // aliases previously hardcoded, and overrides them under
      // `[data-font-pack="academy"]` for `academy@1` tenants (DCFC-D132).
      // Every other template resolves to the identical colors as before.
      //
      // `background` through `sidebar-ring` below are a separate admin UI
      // design-token layer (basecn/shadcn-style primitive components in
      // components/ui/*). Additive only — none of these names collide with
      // the brand aliases above, and public club-site templates never
      // reference them.
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
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Onzio brand accent (#0eb547). Wired exactly like `destructive` so
        // `bg-brand`/`text-brand`/`border-brand` and opacity modifiers all
        // work. Admin portal only -- public club-site templates keep their
        // own per-club palettes (DCFC-D132) and never reference this.
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        lemon: ["var(--font-lemon-milk)", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
