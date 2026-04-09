/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#F5F7F5', // Main background 
                    100: '#E6EAE5',
                    200: '#CCD4CB',
                    300: '#A7B5A5',
                    400: '#82957F',
                    500: '#657962', // Primary Brand Color
                    600: '#4E5D4C',
                    700: '#404A3E', // Secondary, headers
                    800: '#343C33',
                    900: '#2E332D',
                },
                surface: {
                    50: '#FFFFFF',
                    100: '#F9FAFB',
                    200: '#F3F4F6',
                    300: '#E5E7EB',
                    400: '#D1D5DB',
                    500: '#9CA3AF',
                    600: '#6B7280',
                    700: '#4B5563',
                    800: '#302E2E', // Primary Text
                    900: '#111827',
                },
            },
            fontFamily: {
                sans: ['Open Sans', 'sans-serif'],
                serif: ['Times New Roman', 'serif'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'slide-in-right': 'slideInRight 0.2s ease-out',
                'pop': 'pop 0.15s ease-out',
            },
            keyframes: {
                slideInRight: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                pop: {
                    '0%': { transform: 'scale(0.95)', opacity: '0.8' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
}
