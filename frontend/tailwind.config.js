module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        pwc: {
          orange: '#E0301E',
          'orange-deep': '#AD1F14',
          'orange-soft': '#FFE5D5',
          'orange-wash': '#FFF3EC',
          rose: '#D04A02',
          ink: '#1E1E1E',
          'ink-soft': '#555555',
          'ink-mute': '#8A8A8A',
          bg: '#FFFFFF',
          'bg-soft': '#FAF7F4',
          'bg-card': '#F3F0ED',
          border: '#E5E0DC',
          'border-strong': '#C8BEB6',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Charter', '"Source Serif Pro"', '"Times New Roman"', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'pwc': '4px',
        'pwc-lg': '8px',
      },
      backgroundImage: {
        'pwc-hero': 'linear-gradient(120deg, #FFFFFF 0%, #FFF3EC 45%, #FFCFB4 100%)',
      },
      boxShadow: {
        'pwc-card': '0 1px 2px rgba(30,30,30,0.04), 0 1px 1px rgba(30,30,30,0.03)',
      },
    },
  },
  plugins: [],
};
