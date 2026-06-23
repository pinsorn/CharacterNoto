import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{html,svelte,js}'],
  theme: { extend: {} },
  plugins: [daisyui],
  // Match the legacy app: data-theme="dark".
  daisyui: {
    themes: ['light', 'dark'],
    darkTheme: 'dark',
    logs: false,
  },
};
