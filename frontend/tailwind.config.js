module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        pwc: {
          orange: '#A50034',
          'orange-deep': '#7A0026',
          'orange-soft': '#FBE5EC',
          'orange-wash': '#FAFAFA',
          rose: '#7A0026',
          ink: '#1E1E1E',
          'ink-soft': '#6B6B6B',
          'ink-mute': '#8A8A8A',
          bg: '#FFFFFF',
          'bg-soft': '#FAFAFA',
          'bg-card': '#F5F5F5',
          border: '#E5E5E5',
          'border-strong': '#C8C8C8',
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
        'pwc-hero': 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)',
      },
      boxShadow: {
        'pwc-card': '0 1px 2px rgba(30,30,30,0.04), 0 1px 1px rgba(30,30,30,0.03)',
      },
    },
  },
  plugins: [],
};
