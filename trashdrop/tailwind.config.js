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
      // The design system (src/theme/tokens.css): DM Sans only, 13px the
      // smallest text, and the brand's dark green for actions.
      fontFamily: {
        sans: ["'DM Sans'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      colors: {
        // primary was blue (#0073e6); it is the action colour, now the dark
        // green (white on it 6.3:1). light is the same green for dark mode.
        primary: {
          light: '#8fd6a0',
          DEFAULT: '#1b6e35',
          dark: '#155a2b',
        },
        secondary: {
          light: '#8fd6a0',
          DEFAULT: '#1b6e35',
          dark: '#155a2b',
        },
        // Green buttons, links and text in the dark green family, so white
        // on them and them on white pass contrast (#16a34a was 3.3:1).
        green: {
          '600': '#1b6e35',
          '700': '#155a2b',
          '800': '#114a23',
        },
        td: {
          lime: '#b6ee69',
          orange: '#f98b38',
          'orange-text': '#b4530e',
          forest: '#1b6e35',
          'forest-dk': '#155a2b',
          tonal: '#e6f2e9',
          ink: '#0a0f0a',
          sage: '#525c52',
          'sage-dark': '#a9b2a9',
          cream: '#f6f8f4',
          border: '#dfe4dc',
          'border-strong': '#8a8f9c',
          error: '#b91c1c',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
