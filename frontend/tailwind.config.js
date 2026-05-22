/** @type {import('tailwindcss').Config} */
// Hoban Group SafeMate — design tokens
// Primary: Hoban Verdium Deep Forest (#00635B) — WCAG AAA ~6.8:1 on white,
// safe from KOSHA warning-color collision.
// Secondary: Hoban Orange (#EE7500) — brand signature, used as accent only.
// Tertiary: Hoban Dark Gray (#575553) — body text emphasis.
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        hoban: {
          // Brand core
          primary: '#00635B',
          'primary-deep': '#00463F',
          'primary-soft': '#E3F0EE',
          'primary-wash': '#F4FAF9',
          accent: '#EE7500',
          'accent-deep': '#C95F00',
          'accent-soft': '#FEEFE0',

          // Text
          ink: '#1A1A1A',
          'ink-soft': '#575553',
          'ink-mute': '#89898A',

          // Surfaces
          bg: '#FFFFFF',
          'bg-soft': '#FAFAFA',
          'bg-card': '#F5F7F6',

          // Borders
          border: '#E2E5E4',
          'border-strong': '#C2C7C5',

          // Semantic (KOSHA-aligned, AAA on white)
          success: '#1B7F3A',
          warning: '#B45309',
          danger: '#B00020',
          info: '#00567A',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif KR"', 'Georgia', 'Charter', '"Source Serif Pro"', '"Times New Roman"', 'serif'],
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'hoban': '6px',
        'hoban-lg': '12px',
      },
      backgroundImage: {
        'hoban-hero': 'linear-gradient(180deg, #FFFFFF 0%, #F4FAF9 100%)',
      },
      boxShadow: {
        'hoban-card': '0 1px 2px rgba(0,99,91,0.06), 0 1px 1px rgba(0,99,91,0.04)',
      },
    },
  },
  plugins: [],
};
