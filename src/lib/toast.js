import { writable } from 'svelte/store';

// Single shared toast — replaces the duplicated showCustomToast() in item/crafting managers.
export const toastMsg = writable('');
let timer;

export function toast(message) {
  toastMsg.set(message);
  clearTimeout(timer);
  timer = setTimeout(() => toastMsg.set(''), 2000);
}
