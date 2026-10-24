import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          dark: 'var(--bg-dark)',
          card: 'var(--bg-card)',
          overlay: 'rgba(10, 15, 30, 0.6)',
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
        text: { 
          primary: 'var(--text)', 
          secondary: 'var(--text-secondary)', 
          muted: 'var(--text-muted)', 
          disabled: 'var(--text-disabled)' 
        },
        border: { 
          DEFAULT: 'var(--border)', 
          light: 'var(--border-light)', 
          focus: 'var(--border-focus)' 
        },
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
        'gradient-sidebar': 'var(--gradient-sidebar)',
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
