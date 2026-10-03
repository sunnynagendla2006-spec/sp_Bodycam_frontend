/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Page and card surfaces
        canvas: '#F5F7FA',
        surface: '#FFFFFF',
        line: {
          DEFAULT: '#E3E8EF',
          strong: '#CBD3DF',
        },
        // Text
        ink: {
          900: '#101828',
          700: '#344054',
          500: '#667085',
          400: '#98A2B3',
        },
        // Police-department navy as the single brand colour
        brand: {
          50: '#EEF3FB',
          100: '#DCE6F6',
          200: '#B9CCEC',
          500: '#2F5FB3',
          600: '#1F4A99',
          700: '#193C7D',
          800: '#142F63',
        },
        // Status colours (used for badges, icons and alerts)
        signal: {
          green: '#16A34A',
          amber: '#D97706',
          red: '#DC2626',
          blue: '#2563EB',
          violet: '#7C3AED',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.06)',
        lift: '0 4px 12px -2px rgba(16,24,40,0.08), 0 2px 6px -2px rgba(16,24,40,0.06)',
        pop: '0 20px 40px -12px rgba(16,24,40,0.25)',
      },
      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        ping2: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
      },
      animation: {
        'rise-in': 'riseIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.2s ease-out both',
        'pop-in': 'popIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slideInRight 0.25s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.4s linear infinite',
        'ping-soft': 'ping2 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
