import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initData, migrateAvatars } from './lib/init.js';
import { viewer } from './lib/mode.js';

if (!viewer) {
  // Host only: seed/normalise/migrate local data. Viewers start empty and fill over P2P.
  initData();
  migrateAvatars();
}
const app = mount(App, { target: document.getElementById('app') });

export default app;
