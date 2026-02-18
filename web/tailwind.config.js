/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AVI brand colors
        'avi-green': '#10B981',
        'avi-red': '#EF4444',
        'avi-orange': '#F59E0B',
        'avi-blue': '#3B82F6',
        'avi-dark': '#0F172A',
        'avi-card': '#1E293B',
        'avi-border': '#334155',
      },
    },
  },
  plugins: [],
}
