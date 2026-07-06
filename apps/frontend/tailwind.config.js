/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#faf8ff',
        foreground: '#191b23',
        card: {
          DEFAULT: '#ffffff',
          foreground: '#191b23',
        },
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          foreground: '#ffffff',
        },
        secondary: {
          foreground: '#434655',
        },
        muted: {
          DEFAULT: '#f2f1f9',
          foreground: '#737686',
        },
        border: '#e1e2ed',
        input: '#c3c6d7',
        ring: '#2563eb',
        destructive: {
          DEFAULT: '#dc2626',
          foreground: '#ffffff',
          subtle: '#fef2f2',
        },
        success: {
          DEFAULT: '#16a34a',
          foreground: '#ffffff',
          subtle: '#f0fdf4',
        },
      },
      boxShadow: {
        card: '0 4px 12px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
