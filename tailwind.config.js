/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#110D0F', bg2: '#17121A', panel: '#1B1619', panel2: '#241E21', panel3: '#2E272B', line: '#352C30',
        fg: '#F6F0F2', muted: '#B5A8AD', faint: '#76696F',
        red: { DEFAULT: '#E51636', 2: '#B80F2B', soft: '#35141C', text: '#FF5C77' },
        ok: { DEFAULT: '#3DC48D', soft: '#112B22' },
        warn: { DEFAULT: '#F2AA3C', soft: '#33260F' },
        foh: { DEFAULT: '#6FA9FF', soft: '#152340' },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'Arial', 'sans-serif'],
        body: ['"Atkinson Hyperlegible"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: { glow: '0 6px 18px rgba(229,22,54,.35)', card: 'inset 0 1px 0 rgba(255,255,255,.05), 0 10px 30px rgba(0,0,0,.25)' },
    },
  },
  plugins: [],
};
