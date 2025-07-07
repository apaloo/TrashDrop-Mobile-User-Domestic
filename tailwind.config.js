/** @type {import('tailwindcss').Config} */
module.exports = {
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
    },
  },
  plugins: [],
}
