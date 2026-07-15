export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
      colors: { accent: '#1456A2', positive: '#22C55E', negative: '#EF4444', warning: '#F59E0B' }
    }
  },
  plugins: []
};
