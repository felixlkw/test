/** @type {import('tailwindcss').Config} */
// Hoban Group SafeMate — design tokens (hybrid)
// Primary brand surface: Hoban Orange (#EE7500) — official group CI accent
// (headers, badges, hovers, focus, branded highlights).
// Action buttons use ink (`hoban-ink` #1A1A1A) for AAA readability; brand
// orange would clash with KOSHA warning color when used on large action
// surfaces.
// Verdium Deep Forest is retained as `hoban-success` semantic only.
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        hoban: {
          // Brand surface (group CI orange)
          primary: '#EE7500',
          'primary-deep': '#C95F00',
          'primary-soft': '#FEEFE0',
          'primary-wash': '#FFF8F0',

          // Verdium green retained as success/eco accent
          accent: '#00635B',
          'accent-deep': '#00463F',
          'accent-soft': '#E3F0EE',

          // Text — primary action buttons use these (AAA on white)
          ink: '#1A1A1A',
          'ink-soft': '#575553',
          'ink-mute': '#89898A',

          // Surfaces
          bg: '#FFFFFF',
          'bg-soft': '#FAFAFA',
          'bg-card': '#F5F5F5',

          // Borders
          border: '#E5E5E5',
          'border-strong': '#C8C8C8',

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
        'hoban-hero': 'linear-gradient(180deg, #FFFFFF 0%, #FFF8F0 100%)',
      },
      boxShadow: {
        'hoban-card': '0 1px 2px rgba(26,26,26,0.06), 0 1px 1px rgba(26,26,26,0.04)',
      },
    },
  },
  plugins: [],
};
