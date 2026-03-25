import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#020617',
          primary: '#0a0f1e',
          secondary: '#0d1526',
          tertiary: '#111827',
          elevated: '#1a2744',
          hover: '#1e2f52',
          overlay: '#0a0f1e99',
        },
        blue: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
        kot: '#f97316',
        billed: '#14b8a6',
        paid: '#10b981',
        pending: '#f59e0b',
        text: { primary: '#f1f5f9', secondary: '#94a3b8', muted: '#64748b', disabled: '#334155' },
        border: { DEFAULT: '#1e3a5f', light: '#243b5e', focus: '#3b82f6' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
      boxShadow: {
        card: '0 0 0 1px #1e3a5f, 0 4px 24px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(59,130,246,0.3)',
        'glow-sm': '0 0 10px rgba(59,130,246,0.2)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)',
        'gradient-card': 'linear-gradient(135deg, #0d1526 0%, #111827 100%)',
        'gradient-sidebar': 'linear-gradient(180deg, #0a0f1e 0%, #020617 100%)',
      },
      animation: {
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-dot': 'pulseDot 2s infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        slideInRight: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(-4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [],
};

export default config;
