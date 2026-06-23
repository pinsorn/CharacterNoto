import { writable } from 'svelte/store';

// Cross-tab coordination (decouples character cards from the Items/Crafting tabs).
export const craftingFor = writable(null); // null | character index → Crafting opens its modal
export const useItemFor = writable(null); // null | { item, characterIndex } → UseItemModal opens
