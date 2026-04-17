/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg:       '#080c14',
          panel:    '#0d1421',
          border:   '#1a2840',
          glow:     '#00d4ff',
          accent:   '#7c3aed',
          red:      '#ef4444',
          yellow:   '#f59e0b',
          green:    '#10b981',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':       'glow 2s ease-in-out infinite alternate',
        'scan':       'scan 4s linear infinite',
      },
      keyframes: {
        glow: {
          from: { 'box-shadow': '0 0 5px #00d4ff33, 0 0 10px #00d4ff22' },
          to:   { 'box-shadow': '0 0 15px #00d4ff66, 0 0 30px #00d4ff44' },
        },
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
