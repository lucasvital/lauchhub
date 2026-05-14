import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface2)',
        border: 'var(--border)',
        'border-2': 'var(--border2)',
        dim: 'var(--dim)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        'muted-2': 'var(--muted2)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          glow: 'var(--accent-glow)',
        },
        'accent-2': 'var(--accent2)',
        'accent-3': 'var(--accent3)',
        'accent-4': 'var(--accent4)',
        'accent-5': 'var(--accent5)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
    },
  },
  plugins: [],
};

export default config;
