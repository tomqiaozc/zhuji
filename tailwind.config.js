/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#fafafa',
        panel: '#ffffff',
        border: '#ececec',
        'border-strong': '#d4d4d4',
        text: '#1a1a1a',
        'text-soft': '#6b7280',
        'text-mute': '#9ca3af',
        primary: '#2563eb',
        'primary-soft': '#eff6ff',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro SC',
          'PingFang SC',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.04)',
        lg: '0 10px 30px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
