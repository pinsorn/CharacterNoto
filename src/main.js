import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initData, migrateAvatars } from './lib/init.js';

initData();
migrateAvatars(); // async, fire-and-forget; reflects when done
const app = mount(App, { target: document.getElementById('app') });

export default app;
