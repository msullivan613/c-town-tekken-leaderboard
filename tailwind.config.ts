import type { Config } from 'tailwindcss';

// Palette/vibe lives in CSS custom properties (src/styles/tokens.css) so the
// design pass can swap the whole theme without touching components (§5.8).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
        p1: 'rgb(var(--p1) / <alpha-value>)',
        p2: 'rgb(var(--p2) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        numeral: 'var(--font-numeral)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
} satisfies Config;
