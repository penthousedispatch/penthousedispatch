/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#07090d',
        's1': '#0d1117',
        's2': '#141b24',
        's3': '#1a2332',
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e8c76a',
          dark: 'rgba(201,168,76,0.15)',
        },
        green: {
          neon: '#00e5a0',
          dark: 'rgba(0,229,160,0.15)',
        },
        red: {
          alert: '#ff4757',
          dark: 'rgba(255,71,87,0.15)',
        },
        blue: {
          accent: '#0ea5e9',
          dark: 'rgba(14,165,233,0.15)',
        },
        yellow: {
          accent: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'blink': 'blink 1.5s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.97)' },
        },
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};
