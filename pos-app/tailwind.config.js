/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50:  '#F5F7F5',
                    100: '#E6EAE5',
                    200: '#CDD5CB',
                    300: '#A7B5A5',
                    400: '#82957F',
                    500: '#657962', // Primary sage green
                    600: '#4E5D4C',
                    700: '#404A3E',
                    800: '#343C33',
                    900: '#2E332D',
                    950: '#1A211A', // Deep dark login bg
                },
                surface: {
                    50:  '#FFFFFF',
                    100: '#F9FAFB',
                    200: '#F3F4F6',
                    300: '#E5E7EB',
                    400: '#D1D5DB',
                    500: '#9CA3AF',
                    600: '#6B7280',
                    700: '#4B5563',
                    800: '#302E2E',
                    900: '#111827',
                },
                gold: {
                    100: '#FEF6DC',
                    200: '#FDEDB9',
                    300: '#F9D66B',
                    400: '#F5C330',
                    500: '#C9A227', // Primary gold
                    600: '#A07B18',
                    700: '#7A5C10',
                },
            },
            fontFamily: {
                sans:  ['Open Sans', 'sans-serif'],
                serif: ['Times New Roman', 'serif'],
            },
            animation: {
                'pulse-slow':      'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'slide-in-right':  'slideInRight 0.2s ease-out',
                'pop':             'pop 0.15s ease-out',
                'float':           'float 6s ease-in-out infinite',
                'glow':            'glow 3s ease-in-out infinite',
                'fade-up':         'fadeUp 0.4s ease-out',
                'shimmer':         'shimmer 2s linear infinite',
            },
            keyframes: {
                slideInRight: {
                    '0%':   { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                pop: {
                    '0%':   { transform: 'scale(0.95)', opacity: '0.8' },
                    '100%': { transform: 'scale(1)',    opacity: '1' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%':      { transform: 'translateY(-10px)' },
                },
                glow: {
                    '0%, 100%': { opacity: '0.4' },
                    '50%':      { opacity: '0.8' },
                },
                fadeUp: {
                    '0%':   { transform: 'translateY(12px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)',    opacity: '1' },
                },
                shimmer: {
                    '0%':   { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition:  '200% 0' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
}
