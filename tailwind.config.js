/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './extensions/vscode/src/**/*.tsx'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace']
      }
    }
  },
  plugins: []
};
