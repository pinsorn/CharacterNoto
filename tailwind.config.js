import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{html,svelte,js}'],
  theme: { extend: {} },
  plugins: [daisyui],
  // Match the legacy app: data-theme="dark".
  daisyui: {
    themes: ['dark', 'light', 'dracula', 'synthwave', 'forest', 'business', 'night', 'cyberpunk', 'luxury', 'coffee'],
    darkTheme: 'dark',
    logs: false,
  },
};
