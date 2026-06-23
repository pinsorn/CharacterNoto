import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// ponytail: SPA, no SvelteKit/router needed — plain Vite + Svelte.
export default defineConfig({
  plugins: [svelte()],
  // base: './' so the built app works when opened from a subpath (e.g. GitHub Pages project page).
  base: './',
});
