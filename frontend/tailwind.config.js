/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Allow explicit dark mode toggling
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0B0F19', // Deep fintech navy
          card: '#111827', // Slate 900
          accent: '#3B82F6', // Trust-building blue
          success: '#10B981', // Positive financial trends
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}