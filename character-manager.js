/**
 * Character Manager - Main Application Logic
 * A web-based character management system for RPGs, storytelling, and game development
 * 
 * @author Character Manager Contributors
 * @version 1.0.0
 */

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

let characters = [];
let selectedCustomIndex = null;
let selectedItemCharacterIndex = null;
let selectedDeleteCharacterIndex = null;
let selectedMoveSourceIndex = null;
let selectedMoveItemIndex = null;
let hideParams = false;
let hideButtons = false;
let hideItems = false;
let liveInterval = null;
let selectedAvatarIndex = null;
let editCharacterIndex = null;
let editBadgeIndex = null;
let selectedCustomKey = null;
let tileMode = false;

// Badge definitions: { name, icon, color, desc, cond }
let badges = [];

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the application when DOM is loaded
 */
function initializeApp() {
  // Load badges from localStorage
  const bd = localStorage.getItem('badgeData');
  badges = bd ? JSON.parse(bd) : [];

  // Load characters from localStorage
  const ld = localStorage.getItem('characterData');
  characters = ld ? JSON.parse(ld) : [
    { name: 'Rio', hunger: 70, thirsty: 40, items: [{ name: 'Apple', amount: 2 }], custom: {} }
  ];

  // Set up event listeners
  setupEventListeners();

  // Initialize the UI
  renderCharacters();
  renderBadgeList();
  
  // Initialize item manager at startup to ensure item suggestions are available
  if (typeof initializeItemManager === 'function') {
    initializeItemManager();
  }
  
  // Initialize crafting manager at startup to ensure recipes are available
  if (typeof initializeCraftingManager === 'function') {
    initializeCraftingManager();
  }
  
  // Make functions globally available
  window.switchTab = switchTab;
}

/**
 * Set up all event listeners for the application
 */
function setupEventListeners() {
  // Custom parameter type change
  document.getElementById('customParamType').addEventListener('change', e => {
    document.getElementById('param-range-settings').style.display =
      e.target.value === 'range' ? 'flex' : 'none';
  });

  // Toggle controls
  document.getElementById('toggle-params').addEventListener('change', e => {
    hideParams = e.target.checked;
    renderCharacters();
  });

  document.getElementById('toggle-buttons').addEventListener('change', e => {
    const liveMode = e.target.checked;
    hideButtons = liveMode;
    
    if (liveMode) {
      document.body.classList.add('hide-buttons');
      // Start polling localStorage every second
      liveInterval = setInterval(() => {
        const stored = localStorage.getItem('characterData');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // Compare serialized strings to detect changes
            if (JSON.stringify(parsed) !== JSON.stringify(characters)) {
              characters = parsed;
              renderCharacters();
            }
          } catch {}
        }
      }, 1000);
    } else {
      document.body.classList.remove('hide-buttons');
      if (liveInterval) {
        clearInterval(liveInterval);
        liveInterval = null;
      }
    }
    
    // Disable/enable inputs appropriately in live mode
    const allInputs = document.querySelectorAll('input[type="range"], input[type="checkbox"], input[type="text"], input[type="number"]');
    allInputs.forEach(input => {
      if (input.id !== 'toggle-buttons') {
        if (liveMode) {
          if (input.type === 'text' || input.type === 'number') {
            input.readOnly = true;
          } else {
            input.disabled = true;
          }
        } else {
          input.readOnly = false;
          input.disabled = false;
        }
      }
    });
  });

  document.getElementById('toggle-items').addEventListener('change', e => {
    hideItems = e.target.checked;
    renderCharacters();
  });

  document.getElementById('toggle-tile').addEventListener('change', e => {
    tileMode = e.target.checked;
    if (tileMode) document.body.classList.add('tile-mode');
    else document.body.classList.remove('tile-mode');
  });
}

// =============================================================================
// BADGE MANAGEMENT
// =============================================================================

/**
 * Save badges to localStorage
 */
function saveBadges() {
  localStorage.setItem('badgeData', JSON.stringify(badges));
}

/**
 * Render the badge list in the management modal
 */
function renderBadgeList() {
  const bl = document.getElementById('badge-list');
  bl.innerHTML = '';
  badges.forEach((b, i) => {
    bl.innerHTML += `<div class="flex justify-between items-center py-1">
      <span class="badge badge-${b.color}">${b.icon} ${b.name}</span>
      <div class="flex gap-1">
        <button class="btn btn-xs btn-primary" onclick="editBadge(${i})">Edit</button>
        <button class="btn btn-xs btn-error" onclick="removeBadge(${i})">Delete</button>
      </div>
    </div>`;
  });
}

/**
 * Remove a badge by index
 * @param {number} i - Badge index
 */
function removeBadge(i) {
  badges.splice(i, 1);
  saveBadges();
  renderBadgeList();
  renderCharacters();
}

/**
 * Submit a new badge or update existing one
 */
function submitNewBadge() {
  const name = document.getElementById('badgeName').value.trim();
  const icon = document.getElementById('badgeIcon').value.trim();
  const color = document.getElementById('badgeColor').value;
  const desc = document.getElementById('badgeDesc').value.trim();
  const cond = document.getElementById('badgeCond').value.trim();
  
  if (!name || !cond) return alert('Name and condition required');
  if (editBadgeIndex !== null) return confirmEditBadge();
  
  badges.push({ name, icon, color, desc, cond });
  saveBadges();
  renderBadgeList();
  renderCharacters();
}

/**
 * Edit an existing badge
 * @param {number} i - Badge index
 */
function editBadge(i) {
  editBadgeIndex = i;
  const b = badges[i];
  document.getElementById('badgeName').value = b.name;
  document.getElementById('badgeIcon').value = b.icon;
  document.getElementById('badgeColor').value = b.color;
  document.getElementById('badgeDesc').value = b.desc;
  document.getElementById('badgeCond').value = b.cond;
  const btn = document.getElementById('badge-save-btn');
  btn.textContent = 'Update Badge';
  btn.onclick = confirmEditBadge;
  document.getElementById('badge-modal').checked = true;
}

/**
 * Confirm badge edit
 */
function confirmEditBadge() {
  const name = document.getElementById('badgeName').value.trim();
  const icon = document.getElementById('badgeIcon').value.trim();
  const color = document.getElementById('badgeColor').value;
  const desc = document.getElementById('badgeDesc').value.trim();
  const cond = document.getElementById('badgeCond').value.trim();
  
  if (!name || !cond) return alert('Name and condition required');
  
  badges[editBadgeIndex] = { name, icon, color, desc, cond };
  saveBadges();
  renderBadgeList();
  renderCharacters();
  
  const btn = document.getElementById('badge-save-btn');
  btn.textContent = 'Save Badge';
  btn.onclick = submitNewBadge;
  editBadgeIndex = null;
  document.getElementById('badge-modal').checked = false;
}

// =============================================================================
// CHARACTER MANAGEMENT
// =============================================================================

/**
 * Render all characters in the UI
 */
function renderCharacters() {
  const container = document.getElementById('character-list');
  container.innerHTML = '';

  characters.forEach((char, i) => {
    // Compute badges for this character
    console.log('Rendering character:', char);
    const badgeHtml = badges.filter(b => {
      try {
        return Function('char', 'with(char){ return ' + b.cond + '; }')(char);
      } catch {
        return false;
      }
    }).map(b =>
      `<span class="badge badge-${b.color} tooltip" data-tip="${b.desc}">${b.icon} ${b.name}</span>`
    ).join('');

    const customHtml = Object.entries(char.custom || {}).map(([k, def]) => {
      if (def.type === 'range') {
        return `
          <div class="flex items-center gap-2">
            <button class="btn btn-xs btn-error" onclick="removeCustom(${i}, '${k}')">X</button>
            <button class="btn btn-xs btn-outline btn-primary" onclick="promptEditCustom(${i}, '${k}')">Edit</button>
            <span>${k}:</span>
            <button class="btn btn-xs btn-outline" onclick="adjustCustomRange(${i}, '${k}', -1)">-</button>
            <input type="range" min="${def.min}" max="${def.max}" value="${def.value}"
                   onchange="updateCustomRange(${i}, '${k}', this.value)"
                   class="range range-${def.color} w-full"> ${def.value}
            <button class="btn btn-xs btn-outline" onclick="adjustCustomRange(${i}, '${k}', 1)">+</button>
          </div>`;
      } else {
        return `
          <div class="flex items-center gap-2">
            <button class="btn btn-xs btn-error" onclick="removeCustom(${i}, '${k}')">X</button>
            <button class="btn btn-xs btn-outline btn-primary" onclick="promptEditCustom(${i}, '${k}')">Edit</button>
            <label class="flex items-center gap-2">
              <input type="checkbox" class="toggle toggle-${def.color}" ${def.value ? 'checked' : ''}
                     onchange="toggleCustom(${i}, '${k}', this.checked)">
              ${k}
            </label>
          </div>`;
      }
    }).join('');

    const itemsHtml = char.items.map((it, j) => `
      <li class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button class="btn btn-xs btn-error" onclick="removeItem(${i}, ${j})">X</button>
          <input type="text" class="input input-sm"
                 value="${it.name}"
                 size="${it.name.length || 1}"
                 oninput="this.size = Math.max(this.value.length, 1)"
                 onchange="updateItemName(${i}, ${j}, this.value)" />
          <label for="move-item-modal" class="btn btn-xs btn-outline" onclick="promptMove(${i}, ${j})">Move</label>
          <button class="btn btn-xs btn-success" onclick="useItemFromInventory('${it.name}', ${i})" title="Use item">Use</button>
        </div>
        <input type="number" min="0" class="input input-sm input-secondary w-20"
               value="${it.amount}"
               onchange="updateItemAmount(${i}, ${j}, this.value)" />
      </li>`).join('');

    container.innerHTML += `
      <div id="char-${i}" class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-2">
              <button class="btn btn-xs btn-ghost drag-handle cursor-move" title="Drag to reorder">☰</button>
              <h2 class="card-title">${char.name}</h2>
            </div>
            <div class="flex items-center space-x-2">
              <button class="btn btn-xs btn-outline" onclick="moveCharacterUp(${i})" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-xs btn-outline" onclick="moveCharacterDown(${i})" ${i === characters.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn btn-xs btn-outline btn-info" onclick="openCharacterCrafting(${i})">Craft</button>
              <label for="edit-character-modal" class="btn btn-xs btn-outline btn-primary"
                     onclick="promptEditCharacter(${i})">Edit</label>
              <label for="delete-character-modal" class="btn btn-xs btn-outline btn-error"
                     onclick="promptDelete(${i})">Delete</label>
            </div>
          </div>
          <div class="mb-4 flex items-start gap-4">
            <!-- Avatar and avatar controls -->
            <div class="flex flex-col items-center">
              <div class="w-[140.84px] h-[140.84px] rounded-full overflow-hidden bg-base-300">
                ${char.avatar ? `<img src="${char.avatar}" class="object-cover w-full h-full"/>`
                               : `<span class="text-sm opacity-50">No Image</span>`}
              </div>
              <div class="mt-2 flex space-x-2">
                <button class="btn btn-xs btn-outline" onclick="promptChangeAvatar(${i})">Change</button>
                <button class="btn btn-xs btn-error" onclick="removeAvatar(${i})" ${char.avatar ? '' : 'disabled'}>Remove</button>
              </div>
            </div>
            <!-- Badge container to the right of avatar -->
            <div class="flex flex-wrap gap-2 badge-container p-2">
              ${badgeHtml}
            </div>
          </div>

          ${!hideParams && char.hasOwnProperty('hunger') ? `
            <p class="flex items-center gap-2">Hunger:
              <button class="btn btn-xs btn-outline" onclick="adjustStat(${i}, 'hunger', -1)">-</button>
              <input type="range" min="0" max="100" value="${char.hunger}"
                     onchange="updateStat(${i}, 'hunger', this.value)"
                     class="range range-warning w-full"> ${char.hunger}
              <button class="btn btn-xs btn-outline" onclick="adjustStat(${i}, 'hunger', 1)">+</button>
            </p>` : ''}

          ${!hideParams && char.hasOwnProperty('thirsty') ? `
            <p class="flex items-center gap-2">Thirsty:
              <button class="btn btn-xs btn-outline" onclick="adjustStat(${i}, 'thirsty', -1)">-</button>
              <input type="range" min="0" max="100" value="${char.thirsty}"
                     onchange="updateStat(${i}, 'thirsty', this.value)"
                     class="range range-info w-full"> ${char.thirsty}
              <button class="btn btn-xs btn-outline" onclick="adjustStat(${i}, 'thirsty', 1)">+</button>
            </p>` : ''}

          ${!hideParams ? customHtml : ''}
          ${!hideParams ? `<label for="custom-param-modal" class="btn btn-sm btn-accent my-2" onclick="addParameter(${i})">Add Custom Parameter</label>` : ''}

          ${!hideItems ? `<ul class="mt-2 space-y-1">${itemsHtml}</ul>
          <label for="add-item-modal" class="btn btn-sm btn-success mt-2"
                 onclick="promptAddItem(${i})">Add Item</label>` : ''}
        </div>
      </div>`;
  });

  updateCharacterMenu();
  initDragAndDrop();
  saveToLocalStorage();
  updateSummary();
}

/**
 * Submit a new character
 */
function submitNewCharacter() {
  const nm = document.getElementById('newCharacterName').value.trim();
  if (nm) characters.push({ name: nm, hunger: 50, thirsty: 50, items: [], custom: {} });
  document.getElementById('newCharacterName').value = '';
  renderCharacters();
}

/**
 * Submit a new non-character
 */
function submitNewNonCharacter() {
  const nm = document.getElementById('newNonCharacterName').value.trim();
  if (nm) characters.push({ name: nm, items: [], custom: {} });
  document.getElementById('newNonCharacterName').value = '';
  renderCharacters();
}

/**
 * Prompt character deletion
 * @param {number} i - Character index
 */
function promptDelete(i) {
  selectedDeleteCharacterIndex = i;
  document.getElementById('deleteCharName').textContent = characters[i].name;
}

/**
 * Confirm character deletion
 */
function confirmDeleteCharacter() {
  characters.splice(selectedDeleteCharacterIndex, 1);
  selectedDeleteCharacterIndex = null;
  renderCharacters();
}

/**
 * Prompt character name edit
 * @param {number} i - Character index
 */
function promptEditCharacter(i) {
  editCharacterIndex = i;
  document.getElementById('editCharacterName').value = characters[i].name;
}

/**
 * Confirm character name edit
 */
function confirmEditCharacter() {
  const newName = document.getElementById('editCharacterName').value.trim();
  if (newName && editCharacterIndex !== null) {
    characters[editCharacterIndex].name = newName;
    renderCharacters();
    editCharacterIndex = null;
  }
}

/**
 * Move character up in the list
 * @param {number} index - Character index
 */
function moveCharacterUp(index) {
  if (index > 0) {
    const temp = characters[index];
    characters[index] = characters[index - 1];
    characters[index - 1] = temp;
    renderCharacters();
  }
}

/**
 * Move character down in the list
 * @param {number} index - Character index
 */
function moveCharacterDown(index) {
  if (index < characters.length - 1) {
    const temp = characters[index];
    characters[index] = characters[index + 1];
    characters[index + 1] = temp;
    renderCharacters();
  }
}

/**
 * Update the character navigation menu
 */
function updateCharacterMenu() {
  const menu = document.getElementById('character-menu');
  menu.innerHTML = '';
  characters.forEach((char, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline text-sm w-[100px] h-[100px] overflow-hidden whitespace-normal';
    btn.textContent = char.name;
    btn.onclick = () => {
      const el = document.getElementById(`char-${i}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    menu.appendChild(btn);
  });
}

// =============================================================================
// ITEM MANAGEMENT
// =============================================================================

/**
 * Prompt to add item to character
 * @param {number} i - Character index
 */
function promptAddItem(i) {
  selectedItemCharacterIndex = i;
}

/**
 * Submit new item
 */
function submitNewItem() {
  const nm = document.getElementById('newItemName').value.trim();
  const am = parseInt(document.getElementById('newItemAmount').value, 10);
  if (nm && !isNaN(am)) characters[selectedItemCharacterIndex].items.push({ name: nm, amount: am });
  document.getElementById('newItemName').value = '';
  document.getElementById('newItemAmount').value = '1';
  renderCharacters();
}

/**
 * Prompt to move item between characters
 * @param {number} ci - Character index
 * @param {number} ii - Item index
 */
function promptMove(ci, ii) {
  selectedMoveSourceIndex = ci;
  selectedMoveItemIndex = ii;
  const sel = document.getElementById('moveItemDestSelect');
  sel.innerHTML = characters.map((c, idx) => `<option value="${idx}">${c.name}</option>`).join('');
  // Default move quantity to the full amount of the selected item
  document.getElementById('moveItemQuantity').value = characters[ci].items[ii].amount;
}

/**
 * Confirm item move
 */
function confirmMoveItem() {
  const dest = parseInt(document.getElementById('moveItemDestSelect').value, 10);
  const qty = parseInt(document.getElementById('moveItemQuantity').value, 10) || 1;
  const src = selectedMoveSourceIndex;
  const idx = selectedMoveItemIndex;
  
  if (dest !== src) {
    const sourceItems = characters[src].items;
    const item = sourceItems[idx];
    const moveQty = Math.min(qty, item.amount);
    
    // Subtract or remove from source
    if (moveQty >= item.amount) {
      sourceItems.splice(idx, 1);
    } else {
      item.amount -= moveQty;
    }
    
    // Merge into destination
    const destItems = characters[dest].items;
    const existing = destItems.find(it => it.name === item.name);
    if (existing) {
      existing.amount += moveQty;
    } else {
      destItems.push({ name: item.name, amount: moveQty });
    }
    
    // Reset selection
    selectedMoveSourceIndex = null;
    selectedMoveItemIndex = null;
    renderCharacters();
  }
}

/**
 * Update item name
 * @param {number} ci - Character index
 * @param {number} ii - Item index
 * @param {string} v - New name
 */
function updateItemName(ci, ii, v) {
  characters[ci].items[ii].name = v;
  saveToLocalStorage();
}

/**
 * Update item amount
 * @param {number} ci - Character index
 * @param {number} ii - Item index
 * @param {string} v - New amount
 */
function updateItemAmount(ci, ii, v) {
  characters[ci].items[ii].amount = parseInt(v, 10) || 0;
  saveToLocalStorage();
}

/**
 * Remove item
 * @param {number} ci - Character index
 * @param {number} ii - Item index
 */
function removeItem(ci, ii) {
  characters[ci].items.splice(ii, 1);
  renderCharacters();
}

/**
 * Use item from character inventory
 * @param {string} itemName - Name of the item
 * @param {number} characterIndex - Index of the character using the item
 */
function useItemFromInventory(itemName, characterIndex) {
  // Check if item database exists
  if (!window.itemDatabase) {
    // Initialize empty item database if it doesn't exist
    window.itemDatabase = [];
  }
  
  // Find item in database (case-insensitive search)
  let itemInDatabase = window.itemDatabase.find(dbItem => 
    dbItem.name.toLowerCase() === itemName.toLowerCase()
  );
  
  if (!itemInDatabase) {
    // Only create basic item entry if it truly doesn't exist in the wiki
    console.log(`Item "${itemName}" not found in wiki, creating basic entry`);
    itemInDatabase = {
      name: itemName,
      howToObtain: 'Found in character inventory',
      description: 'Auto-created from character inventory - please edit to add proper details',
      effects: []
    };
    window.itemDatabase.push(itemInDatabase);
    if (typeof window.saveItemDatabase === 'function') {
      window.saveItemDatabase();
    }
  }
  
  // Show use item modal with pre-selected character and item
  const modal = document.getElementById('use-item-modal');
  const characterSelect = document.getElementById('use-item-character-select');
  const itemNameSpan = document.getElementById('use-item-name');
  
  itemNameSpan.textContent = itemInDatabase.name; // Use the name from database for consistency
  characterSelect.innerHTML = characters.map((char, index) => 
    `<option value="${index}" ${index === characterIndex ? 'selected' : ''}>${char.name}</option>`
  ).join('');
  
  // Store item and character for later use
  window.currentUseItem = itemInDatabase;
  window.currentUseCharacterIndex = characterIndex;
  modal.checked = true;
}

// =============================================================================
// CUSTOM PARAMETERS
// =============================================================================

/**
 * Add parameter to character
 * @param {number} i - Character index
 */
function addParameter(i) {
  selectedCustomIndex = i;
}

/**
 * Submit custom parameter
 */
function submitCustomParam() {
  const nm = document.getElementById('customParamName').value.trim();
  const type = document.getElementById('customParamType').value;
  let min = 0, max = 100;
  
  if (type === 'range') {
    min = parseInt(document.getElementById('customParamMin').value, 10) || 0;
    max = parseInt(document.getElementById('customParamMax').value, 10) || min;
  }
  
  const color = document.getElementById('customParamColor').value;
  if (!nm) return;
  
  const c = characters[selectedCustomIndex];
  if (!c.custom) c.custom = {};
  if (c.custom.hasOwnProperty(nm)) {
    alert('Parameter already exists.');
    return;
  }
  
  c.custom[nm] = { type, min, max, color, value: type === 'checkbox' ? false : min };
  renderCharacters();
}

/**
 * Prompt to edit custom parameter
 * @param {number} ci - Character index
 * @param {string} key - Parameter key
 */
function promptEditCustom(ci, key) {
  selectedCustomIndex = ci;
  selectedCustomKey = key;
  const def = characters[ci].custom[key];
  document.getElementById('custom-modal-title').textContent = 'Edit Custom Parameter';
  document.getElementById('customParamName').value = key;
  document.getElementById('customParamType').value = def.type;
  document.getElementById('param-range-settings').style.display = def.type === 'range' ? 'flex' : 'none';
  document.getElementById('customParamMin').value = def.min;
  document.getElementById('customParamMax').value = def.max;
  document.getElementById('customParamColor').value = def.color;
  document.getElementById('custom-add-btn').classList.add('hidden');
  document.getElementById('custom-save-btn').classList.remove('hidden');
  document.getElementById('custom-param-modal').checked = true;
}

/**
 * Confirm custom parameter edit
 */
function confirmEditCustom() {
  const nm = document.getElementById('customParamName').value.trim();
  const type = document.getElementById('customParamType').value;
  let min = 0, max = 100;
  
  if (type === 'range') {
    min = parseInt(document.getElementById('customParamMin').value, 10) || 0;
    max = parseInt(document.getElementById('customParamMax').value, 10) || min;
  }
  
  const color = document.getElementById('customParamColor').value;
  if (!nm) return;
  
  const c = characters[selectedCustomIndex];
  const oldKey = selectedCustomKey;
  const def = c.custom[oldKey];
  
  // Determine value: preserve existing or default
  let value = def.value;
  if (type === 'range') value = Math.min(Math.max(value, min), max);
  else if (type === 'checkbox') value = !!value;
  
  // Remove old key if name changed
  if (nm !== oldKey) {
    delete c.custom[oldKey];
  }
  
  c.custom[nm] = { type, min, max, color, value };
  
  // Reset modal
  selectedCustomIndex = null;
  selectedCustomKey = null;
  document.getElementById('custom-modal-title').textContent = 'Add Custom Parameter';
  document.getElementById('custom-add-btn').classList.remove('hidden');
  document.getElementById('custom-save-btn').classList.add('hidden');
  document.getElementById('custom-param-modal').checked = false;
  renderCharacters();
}

/**
 * Remove custom parameter
 * @param {number} ci - Character index
 * @param {string} key - Parameter key
 */
function removeCustom(ci, key) {
  delete characters[ci].custom[key];
  renderCharacters();
}

/**
 * Update custom range parameter
 * @param {number} ci - Character index
 * @param {string} key - Parameter key
 * @param {string} v - New value
 */
function updateCustomRange(ci, key, v) {
  characters[ci].custom[key].value = parseInt(v, 10);
  renderCharacters();
}

/**
 * Toggle custom checkbox parameter
 * @param {number} ci - Character index
 * @param {string} key - Parameter key
 * @param {boolean} chk - Checked state
 */
function toggleCustom(ci, key, chk) {
  characters[ci].custom[key].value = chk;
  saveToLocalStorage();
  renderCharacters();
}

/**
 * Adjust custom range parameter by delta
 * @param {number} ci - Character index
 * @param {string} key - Parameter key
 * @param {number} delta - Amount to adjust
 */
function adjustCustomRange(ci, key, delta) {
  const def = characters[ci].custom[key];
  const newValue = Math.min(def.max, Math.max(def.min, def.value + delta));
  updateCustomRange(ci, key, newValue);
}

// =============================================================================
// STAT MANAGEMENT
// =============================================================================

/**
 * Update character stat
 * @param {number} ci - Character index
 * @param {string} stat - Stat name
 * @param {string} v - New value
 */
function updateStat(ci, stat, v) {
  characters[ci][stat] = parseInt(v, 10);
  renderCharacters();
}

/**
 * Adjust character stat by delta
 * @param {number} ci - Character index
 * @param {string} stat - Stat name
 * @param {number} delta - Amount to adjust
 */
function adjustStat(ci, stat, delta) {
  const newValue = Math.min(100, Math.max(0, characters[ci][stat] + delta));
  updateStat(ci, stat, newValue);
}

// =============================================================================
// AVATAR MANAGEMENT
// =============================================================================

/**
 * Prompt to change avatar
 * @param {number} ci - Character index
 */
function promptChangeAvatar(ci) {
  selectedAvatarIndex = ci;
  document.getElementById('avatar-input').click();
}

/**
 * Handle avatar file selection
 * @param {Event} e - File input event
 */
function handleAvatarSelected(e) {
  const file = e.target.files[0];
  if (!file || selectedAvatarIndex === null) return;
  
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 100, 100);
      const jpgData = canvas.toDataURL('image/jpeg', 0.8);
      characters[selectedAvatarIndex].avatar = jpgData;
      selectedAvatarIndex = null;
      e.target.value = null;
      saveToLocalStorage();
      renderCharacters();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Remove avatar from character
 * @param {number} ci - Character index
 */
function removeAvatar(ci) {
  delete characters[ci].avatar;
  saveToLocalStorage();
  renderCharacters();
}

// =============================================================================
// DATA MANAGEMENT
// =============================================================================

/**
 * Save characters to localStorage
 */
function saveToLocalStorage() {
  localStorage.setItem('characterData', JSON.stringify(characters));
  showToast();
  updateSummary();
}

/**
 * Show save confirmation toast
 */
function showToast() {
  const t = document.getElementById('save-toast');
  t.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => t.classList.replace('opacity-100', 'opacity-0'), 1000);
}

/**
 * Export all data as JSON
 */
function exportData() {
  const data = { 
    characters: characters, 
    badges: badges,
    itemDatabase: window.itemDatabase || []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'characters.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import data from JSON file
 * @param {Event} e - File input event
 */
function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      // Load characters
      characters = data.characters || data;
      // Load badges if present
      if (data.badges) {
        badges = data.badges;
        saveBadges();
        renderBadgeList();
      }
      // Load item database if present
      if (data.itemDatabase && window.itemDatabase !== undefined) {
        window.itemDatabase = data.itemDatabase;
        // Validate imported item database
        if (typeof window.validateItemDatabase === 'function') {
          window.validateItemDatabase();
        }
        localStorage.setItem('itemDatabase', JSON.stringify(window.itemDatabase));
        // Update item suggestions with new database
        if (typeof window.updateItemSuggestions === 'function') {
          window.updateItemSuggestions();
        }
        if (typeof renderItemDatabase === 'function') {
          renderItemDatabase();
        }
      }
      renderCharacters();
      updateSummary();
    } catch {
      alert('Invalid JSON');
    }
  };
  r.readAsText(f);
}

// =============================================================================
// UI UPDATES
// =============================================================================

/**
 * Update summary statistics
 */
function updateSummary() {
  console.log('Updating summary...');
  const sl = document.getElementById('summary-list');
  const tc = characters.length;
  const ti = characters.reduce((sum, c) => sum + c.items.length, 0);
  const ps = new Set();
  characters.forEach(c => c.custom && Object.keys(c.custom).forEach(p => ps.add(p)));
  
  sl.innerHTML = `
    <li>Total Characters: <strong>${tc}</strong></li>
    <li>Total Items: <strong>${ti}</strong></li>
    <li>Parameters: <strong>${[...ps].join(',') || 'None'}</strong></li>`;
  
  // Build and display item summary table
  const itemTotals = {};
  characters.forEach(c => c.items.forEach(it => itemTotals[it.name] = (itemTotals[it.name] || 0) + it.amount));
  const itemNames = Object.keys(itemTotals).sort();
  
  document.getElementById('item-summary').innerHTML = `
    <table class="table w-full">
      <thead><tr><th>Item</th><th>Total</th></tr></thead>
      <tbody>
        ${itemNames.map(n => `<tr><td>${n}</td><td>${itemTotals[n]}</td></tr>`).join('')}
      </tbody>
    </table>`;
  
  // Update item suggestions using the centralized function from item-manager
  if (typeof window.updateItemSuggestions === 'function') {
    window.updateItemSuggestions();
  }
  
  // Update custom parameter suggestions
  const cs = document.getElementById('custom-suggestions');
  const paramSet = new Set();
  characters.forEach(c => c.custom && Object.keys(c.custom).forEach(p => paramSet.add(p)));
  const paramNames = [...paramSet].sort();
  cs.innerHTML = paramNames.map(p => `<option value="${p}">`).join('');
}

// =============================================================================
// DRAG AND DROP
// =============================================================================

/**
 * Initialize drag-and-drop reordering
 */
function initDragAndDrop() {
  const el = document.getElementById('character-list');
  // Destroy previous instance if exists
  if (window.dragSort) window.dragSort.destroy();

  // Check if Sortable exists before using it
  if (typeof Sortable === 'undefined') return;

  window.dragSort = Sortable.create(el, {
    handle: '.drag-handle',
    animation: 150,
    onEnd: evt => {
      const { oldIndex, newIndex } = evt;
      if (oldIndex !== newIndex) {
        const moved = characters.splice(oldIndex, 1)[0];
        characters.splice(newIndex, 0, moved);
        renderCharacters();
      }
    }
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Log badge assignments for debugging
 */
function logBadgeAssignments() {
  badges.forEach((b) => {
    const matchedNames = characters
      .filter(char => {
        try {
          return Function('char', 'with(char){ return ' + b.cond + '; }')(char);
        } catch {
          return false;
        }
      })
      .map(char => char.name);
    console.log(`Badge "${b.name}" applies to: [${matchedNames.join(', ')}]`);
  });
}

// =============================================================================
// TAB MANAGEMENT
// =============================================================================

/**
 * Switch between tabs
 * @param {string} tabName - Tab name ('characters' or 'items')
 */
function switchTab(tabName) {
  // Update tab appearance
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('tab-active'));
  document.getElementById(`${tabName}-tab`).classList.add('tab-active');
  
  // Show/hide content
  document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
  document.getElementById(`${tabName}-content`).classList.remove('hidden');
  
  // Initialize items tab if needed
  if (tabName === 'items' && typeof initializeItemManager === 'function') {
    initializeItemManager();
  }
  
  // Initialize crafting tab if needed
  if (tabName === 'crafting' && typeof initializeCraftingManager === 'function') {
    initializeCraftingManager();
  }
  
  // Update suggestions when switching to characters tab
  if (tabName === 'characters') {
    updateSummary(); // This will refresh item suggestions
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
