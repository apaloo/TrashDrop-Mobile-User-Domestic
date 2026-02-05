/** @type {import('tailwindcss').Config} */
module.exports = {
  // CRITICAL: Use class-based dark mode instead of media query
  // This prevents Tailwind dark: classes from applying based on system preference
  // Dark mode only applies when html has both 'app-loaded' AND 'dark' classes
  darkMode: ['class', '.app-loaded.dark'],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#4da6ff',
          DEFAULT: '#0073e6',
          dark: '#0059b3',
        },
        secondary: {
          light: '#84e184',
          DEFAULT: '#4caf50',
          dark: '#388e3c',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
