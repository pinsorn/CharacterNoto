/**
 * Item Manager - Item Encyclopedia System
 * Manages a comprehensive database of items with their properties and effects
 * 
 * @author Character Manager Contributors
 * @version 1.0.0
 */

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

let itemDatabase = [];
let selectedEditItemIndex = null;
let itemManagerInitialized = false;

// =============================================================================
// ITEM DATABASE MANAGEMENT
// =============================================================================

/**
 * Initialize item database from localStorage
 */
function initializeItemDatabase() {
  const stored = localStorage.getItem('itemDatabase');
  itemDatabase = stored ? JSON.parse(stored) : [];
  
  // Validate and clean up the database
  validateItemDatabase();
  
  // Auto-add missing items from existing character items (but don't override existing items)
  addMissingItemsFromInventories();
  
  // Update item suggestions
  updateItemSuggestions();
  
  renderItemDatabase();
}

/**
 * Save item database to localStorage
 */
function saveItemDatabase() {
  localStorage.setItem('itemDatabase', JSON.stringify(itemDatabase));
}

/**
 * Add missing items from character inventories to the item database
 * This should only add items that don't exist in the wiki at all
 */
function addMissingItemsFromInventories() {
  const existingItems = new Set(itemDatabase.map(item => item.name.toLowerCase()));
  let addedItems = false;
  
  characters.forEach(char => {
    char.items.forEach(item => {
      // Only add if the item doesn't exist in the database (case-insensitive check)
      if (!existingItems.has(item.name.toLowerCase())) {
        itemDatabase.push({
          name: item.name,
          howToObtain: 'Found in character inventory',
          description: 'Auto-added from character inventory',
          effects: []
        });
        existingItems.add(item.name.toLowerCase());
        addedItems = true;
        console.log(`Added missing item to wiki: ${item.name}`);
      }
    });
  });
  
  // Only save if we actually added items
  if (addedItems) {
    saveItemDatabase();
    updateItemSuggestions();
  }
}

/**
 * Add new item to database
 * @param {string} name - Item name
 * @param {string} howToObtain - How to obtain description
 * @param {string} description - Item description
 * @param {Array} effects - Array of effect objects
 */
function addItemToDatabase(name, howToObtain, description, effects) {
  const existingIndex = itemDatabase.findIndex(item => item.name === name);
  
  if (existingIndex >= 0) {
    // Update existing item
    itemDatabase[existingIndex] = { name, howToObtain, description, effects };
  } else {
    // Add new item
    itemDatabase.push({ name, howToObtain, description, effects });
  }
  
  saveItemDatabase();
  // Maintain search filter when refreshing
  const searchTerm = document.getElementById('item-search')?.value.toLowerCase() || '';
  renderItemDatabase(searchTerm);
  
  // Update item suggestions with wiki database
  updateItemSuggestions();
  
  // Update character item suggestions if the function exists
  if (typeof window.updateSummary === 'function') {
    window.updateSummary();
  }
}

/**
 * Remove item from database
 * @param {number} index - Item index
 */
function removeItemFromDatabase(index) {
  itemDatabase.splice(index, 1);
  saveItemDatabase();
  // Maintain search filter when refreshing
  const searchTerm = document.getElementById('item-search')?.value.toLowerCase() || '';
  renderItemDatabase(searchTerm);
  
  // Update item suggestions with wiki database
  updateItemSuggestions();
  
  // Update character item suggestions if the function exists
  if (typeof window.updateSummary === 'function') {
    window.updateSummary();
  }
}

/**
 * Validate and clean up the item database
 * Removes duplicates and ensures data integrity
 */
function validateItemDatabase() {
  const seen = new Set();
  const validItems = [];
  
  itemDatabase.forEach(item => {
    if (item.name && typeof item.name === 'string' && item.name.trim()) {
      const normalizedName = item.name.trim();
      const lowerName = normalizedName.toLowerCase();
      
      // Only add if we haven't seen this item name before (case-insensitive)
      if (!seen.has(lowerName)) {
        seen.add(lowerName);
        validItems.push({
          name: normalizedName,
          howToObtain: item.howToObtain || '',
          description: item.description || '',
          effects: Array.isArray(item.effects) ? item.effects : []
        });
      } else {
        console.warn(`Duplicate item found and removed: ${normalizedName}`);
      }
    }
  });
  
  // Update the database with cleaned data
  const originalLength = itemDatabase.length;
  itemDatabase = validItems;
  
  if (originalLength !== itemDatabase.length) {
    console.log(`Cleaned item database: ${originalLength} -> ${itemDatabase.length} items`);
    saveItemDatabase();
  }
}

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

/**
 * Filter items based on search input
 */
function filterItems() {
  const searchTerm = document.getElementById('item-search')?.value.toLowerCase() || '';
  renderItemDatabase(searchTerm);
}

// =============================================================================
// UI RENDERING
// =============================================================================

/**
 * Render the item database in the UI
 * @param {string} searchFilter - Optional search filter
 */
function renderItemDatabase(searchFilter = '') {
  const container = document.getElementById('item-database-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Filter items based on search term
  let filteredItems = itemDatabase;
  if (searchFilter) {
    filteredItems = itemDatabase.filter(item => 
      item.name.toLowerCase().includes(searchFilter) ||
      (item.howToObtain && item.howToObtain.toLowerCase().includes(searchFilter)) ||
      (item.description && item.description.toLowerCase().includes(searchFilter)) ||
      (item.effects && item.effects.some(effect => 
        (effect.target && effect.target.toLowerCase().includes(searchFilter)) ||
        (effect.action && effect.action.toLowerCase().includes(searchFilter))
      ))
    );
  }
  
  if (filteredItems.length === 0) {
    const message = searchFilter 
      ? `No items found matching "${searchFilter}"`
      : 'No items in database. Add items or they will be auto-populated from character inventories.';
    container.innerHTML = `<div class="text-center text-gray-500 py-8">${message}</div>`;
    return;
  }
  
  filteredItems.forEach((item, filteredIndex) => {
    // Get the original index in the full database for edit/delete actions
    const originalIndex = itemDatabase.indexOf(item);
    const effectsHtml = item.effects.map(effect => {
      let effectText = '';
      if (effect.type === 'stat') {
        effectText = `${effect.action === 'add' ? '+' : effect.action === 'subtract' ? '-' : '='}${effect.value} ${effect.target}`;
      } else if (effect.type === 'custom') {
        if (effect.paramType === 'range') {
          effectText = `${effect.action === 'add' ? '+' : effect.action === 'subtract' ? '-' : '='}${effect.value} ${effect.target}`;
        } else {
          effectText = `Set ${effect.target} to ${effect.value ? 'True' : 'False'}`;
        }
      }
      return `<span class="badge badge-outline badge-sm">${effectText}</span>`;
    }).join(' ');
    
    container.innerHTML += `
      <div class="card bg-base-200 shadow-sm mb-4">
        <div class="card-body p-4">
          <div class="flex justify-between items-start">
            <h3 class="card-title text-lg">${item.name}</h3>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-primary" onclick="editItemInDatabase(${originalIndex})">Edit</button>
              <button class="btn btn-xs btn-error" onclick="confirmRemoveItem(${originalIndex})">Delete</button>
            </div>
          </div>
          
          <div class="grid gap-3 mt-3">
            <div>
              <span class="font-semibold text-sm">How to Obtain:</span>
              <p class="text-sm mt-1">${item.howToObtain || '<em class="text-gray-500">Not specified</em>'}</p>
            </div>
            
            <div>
              <span class="font-semibold text-sm">Description:</span>
              <p class="text-sm mt-1">${item.description || '<em class="text-gray-500">No description</em>'}</p>
            </div>
            
            <div>
              <span class="font-semibold text-sm">Effects when used:</span>
              <div class="mt-1 flex flex-wrap gap-1">
                ${effectsHtml || '<em class="text-gray-500 text-sm">No effects</em>'}
              </div>
            </div>
          </div>
          
          <div class="mt-3">
            <button class="btn btn-sm btn-success" onclick="useItemOnCharacter('${item.name}')">Use Item</button>
          </div>
        </div>
      </div>`;
  });
}

// =============================================================================
// ITEM EFFECTS SYSTEM
// =============================================================================

/**
 * Apply item effects to a character
 * @param {string} itemName - Name of the item
 */
function useItemOnCharacter(itemName) {
  const item = itemDatabase.find(i => i.name === itemName);
  if (!item) return;
  
  // Show character selection modal
  showCharacterSelectionModal(item);
}

/**
 * Show modal to select which character to use item on
 * @param {Object} item - Item object
 */
function showCharacterSelectionModal(item) {
  const modal = document.getElementById('use-item-modal');
  const characterSelect = document.getElementById('use-item-character-select');
  const itemNameSpan = document.getElementById('use-item-name');
  
  itemNameSpan.textContent = item.name;
  characterSelect.innerHTML = characters.map((char, index) => 
    `<option value="${index}">${char.name}</option>`
  ).join('');
  
  // Store item for later use
  window.currentUseItem = item;
  modal.checked = true;
}

/**
 * Confirm using item on selected character
 */
function confirmUseItem() {
  const characterIndex = parseInt(document.getElementById('use-item-character-select').value);
  const item = window.currentUseItem;
  
  if (!item || isNaN(characterIndex)) return;
  
  const character = characters[characterIndex];
  
  // Apply effects
  item.effects.forEach(effect => {
    if (effect.type === 'stat') {
      // Ensure the stat exists, if not create it with default value
      if (!character.hasOwnProperty(effect.target)) {
        character[effect.target] = 50; // Default value for new stats
      }
      
      let newValue = character[effect.target];
      if (effect.action === 'add') {
        newValue += parseInt(effect.value);
      } else if (effect.action === 'subtract') {
        newValue -= parseInt(effect.value);
      } else if (effect.action === 'set') {
        newValue = parseInt(effect.value);
      }
      character[effect.target] = Math.max(0, Math.min(100, newValue));
    } else if (effect.type === 'custom') {
      if (!character.custom) character.custom = {};
      
      // Auto-create the custom parameter if it doesn't exist
      if (!character.custom[effect.target]) {
        character.custom[effect.target] = {
          type: effect.paramType || 'range',
          min: 0,
          max: 100,
          color: 'primary',
          value: effect.paramType === 'checkbox' ? false : 0
        };
      }
      
      const customParam = character.custom[effect.target];
      
      if (customParam.type === 'range') {
        let newValue = customParam.value;
        if (effect.action === 'add') {
          newValue += parseInt(effect.value);
        } else if (effect.action === 'subtract') {
          newValue -= parseInt(effect.value);
        } else if (effect.action === 'set') {
          newValue = parseInt(effect.value);
        }
        customParam.value = Math.max(customParam.min, Math.min(customParam.max, newValue));
      } else if (customParam.type === 'checkbox') {
        customParam.value = effect.value === 'true' || effect.value === true;
      }
    }
  });
  
  // Save and refresh
  saveToLocalStorage();
  renderCharacters();
  
  // Show feedback
  const characterName = character.name;
  const itemName = item.name;
  
  // Close modal with enhanced reliability
  closeUseItemModal();
  
  // Use a toast instead of alert for better UX
  showCustomToast(`Used ${itemName} on ${characterName}!`);
}

/**
 * Close the use item modal with enhanced reliability
 */
function closeUseItemModal() {
  setTimeout(() => {
    try {
      console.log('Attempting to close use-item-modal...');
      const modal = document.getElementById('use-item-modal');
      if (modal) {
        modal.checked = false;
        console.log('Use item modal closed successfully');
        
        // Fallback method
        if (modal.checked) {
          modal.style.display = 'none';
          console.log('Applied fallback display:none to use item modal');
        }
      } else {
        console.error('Use item modal element not found');
      }
    } catch (error) {
      console.error('Error closing use item modal:', error);
    }
  }, 100);
}

// =============================================================================
// ITEM EDITING
// =============================================================================

/**
 * Edit item in database
 * @param {number} index - Item index
 */
function editItemInDatabase(index) {
  selectedEditItemIndex = index;
  const item = itemDatabase[index];
  
  // Populate form
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-obtain').value = item.howToObtain;
  document.getElementById('item-description').value = item.description;
  
  // Clear and populate effects
  const effectsList = document.getElementById('item-effects-list');
  effectsList.innerHTML = '';
  
  item.effects.forEach((effect, effectIndex) => {
    addEffectToForm(effect, effectIndex);
  });
  
  // Show modal
  document.getElementById('edit-item-modal').checked = true;
}

/**
 * Add new item to database (from form)
 */
function addNewItemToDatabase() {
  selectedEditItemIndex = null;
  
  // Clear form
  document.getElementById('item-name').value = '';
  document.getElementById('item-obtain').value = '';
  document.getElementById('item-description').value = '';
  document.getElementById('item-effects-list').innerHTML = '';
  
  // Show modal
  document.getElementById('edit-item-modal').checked = true;
}

/**
 * Save item from form
 */
function saveItemFromForm() {
  const name = document.getElementById('item-name').value.trim();
  const howToObtain = document.getElementById('item-obtain').value.trim();
  const description = document.getElementById('item-description').value.trim();
  
  if (!name) {
    alert('Item name is required!');
    return;
  }
  
  // Collect effects
  const effects = [];
  const effectsContainer = document.getElementById('item-effects-list');
  effectsContainer.querySelectorAll('.effect-item').forEach(effectElement => {
    const type = effectElement.querySelector('.effect-type').value;
    const target = effectElement.querySelector('.effect-target').value;
    const action = effectElement.querySelector('.effect-action').value;
    const value = effectElement.querySelector('.effect-value').value;
    
    if (target && action !== undefined && value !== '') {
      const effect = {
        type,
        target,
        action,
        value: type === 'custom' && effectElement.querySelector('.effect-param-type')?.value === 'checkbox' 
          ? value === 'true' 
          : parseInt(value) || 0
      };
      
      if (type === 'custom') {
        effect.paramType = effectElement.querySelector('.effect-param-type')?.value || 'range';
      }
      
      effects.push(effect);
    }
  });
  
  // Save item
  if (selectedEditItemIndex !== null) {
    itemDatabase[selectedEditItemIndex] = { name, howToObtain, description, effects };
  } else {
    itemDatabase.push({ name, howToObtain, description, effects });
  }
  
  saveItemDatabase();
  renderItemDatabase();
  
  // Update item suggestions with wiki database
  updateItemSuggestions();
  
  // Update character item suggestions if the function exists
  if (typeof window.updateSummary === 'function') {
    window.updateSummary();
    console.log('Item database updated and character suggestions refreshed.');
  }

  // Close modal with a slight delay to ensure all operations complete
  setTimeout(() => {
    closeEditItemModal();
  }, 10);
}

function closeEditItemModal() {
  const modal = document.getElementById('edit-item-modal');
  if (modal) {
    modal.checked = false;
    console.log('Edit item modal closed');
    
    // Double-check and try alternative method if needed
    setTimeout(() => {
      if (modal.checked) {
        console.log('Modal still open, trying alternative method');
        modal.style.display = 'none';
        // Force remove modal backdrop if it exists
        const modalBackdrop = document.querySelector('.modal-backdrop');
        if (modalBackdrop) {
          modalBackdrop.remove();
        }
      }
    }, 50);
  } else {
    console.error('Could not find edit-item-modal element');
  }
}

/**
 * Add effect to the form
 * @param {Object} effect - Effect object (optional, for editing)
 * @param {number} effectIndex - Effect index (optional, for editing)
 */
function addEffectToForm(effect = null, effectIndex = null) {
  const effectsList = document.getElementById('item-effects-list');
  const effectId = effectIndex !== null ? effectIndex : Date.now();
  
  const effectDiv = document.createElement('div');
  effectDiv.className = 'effect-item border border-base-300 rounded p-3 mb-2';
  effectDiv.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
      <div>
        <label class="label label-text text-xs">Type</label>
        <select class="select select-bordered select-sm w-full effect-type" onchange="updateEffectTargets(this, ${effectId})">
          <option value="stat" ${effect?.type === 'stat' ? 'selected' : ''}>Basic Stat</option>
          <option value="custom" ${effect?.type === 'custom' ? 'selected' : ''}>Custom Parameter</option>
        </select>
      </div>
      <div>
        <label class="label label-text text-xs">Target</label>
        <select class="select select-bordered select-sm w-full effect-target">
          <!-- Will be populated by updateEffectTargets -->
        </select>
      </div>
      <div>
        <label class="label label-text text-xs">Action</label>
        <select class="select select-bordered select-sm w-full effect-action">
          <option value="add" ${effect?.action === 'add' ? 'selected' : ''}>Add (+)</option>
          <option value="subtract" ${effect?.action === 'subtract' ? 'selected' : ''}>Subtract (-)</option>
          <option value="set" ${effect?.action === 'set' ? 'selected' : ''}>Set (=)</option>
        </select>
      </div>
      <div>
        <label class="label label-text text-xs">Value</label>
        <input type="number" class="input input-bordered input-sm w-full effect-value" value="${effect?.value || 0}">
      </div>
      <div>
        <button type="button" class="btn btn-error btn-sm" onclick="removeEffect(this)">Remove</button>
      </div>
    </div>
    <div class="hidden effect-param-type-container mt-2">
      <label class="label label-text text-xs">Parameter Type</label>
      <select class="select select-bordered select-sm effect-param-type">
        <option value="range" ${effect?.paramType === 'range' ? 'selected' : ''}>Range</option>
        <option value="checkbox" ${effect?.paramType === 'checkbox' ? 'selected' : ''}>Checkbox</option>
      </select>
    </div>
  `;
  
  effectsList.appendChild(effectDiv);
  
  // Initialize the targets dropdown
  updateEffectTargets(effectDiv.querySelector('.effect-type'), effectId);
  
  // Set the target value if editing
  if (effect?.target) {
    setTimeout(() => {
      effectDiv.querySelector('.effect-target').value = effect.target;
    }, 100);
  }
}

/**
 * Update effect targets based on type
 * @param {HTMLElement} typeSelect - Type select element
 * @param {number} effectId - Effect ID
 */
function updateEffectTargets(typeSelect, effectId) {
  const effectDiv = typeSelect.closest('.effect-item');
  const targetSelect = effectDiv.querySelector('.effect-target');
  const paramTypeContainer = effectDiv.querySelector('.effect-param-type-container');
  const valueInput = effectDiv.querySelector('.effect-value');
  
  targetSelect.innerHTML = '';
  
  if (typeSelect.value === 'stat') {
    paramTypeContainer.classList.add('hidden');
    valueInput.type = 'number';
    targetSelect.innerHTML = `
      <option value="hunger">Hunger</option>
      <option value="thirsty">Thirsty</option>
    `;
  } else if (typeSelect.value === 'custom') {
    paramTypeContainer.classList.remove('hidden');
    
    // Get all custom parameters from all characters
    const customParams = new Set();
    characters.forEach(char => {
      if (char.custom) {
        Object.keys(char.custom).forEach(param => customParams.add(param));
      }
    });
    
    targetSelect.innerHTML = Array.from(customParams).map(param => 
      `<option value="${param}">${param}</option>`
    ).join('');
    
    // Update value input based on parameter type
    const paramTypeSelect = effectDiv.querySelector('.effect-param-type');
    paramTypeSelect.addEventListener('change', () => {
      if (paramTypeSelect.value === 'checkbox') {
        valueInput.type = 'text';
        valueInput.value = 'true';
        valueInput.setAttribute('list', 'boolean-options');
      } else {
        valueInput.type = 'number';
        valueInput.removeAttribute('list');
      }
    });
  }
}

/**
 * Remove effect from form
 * @param {HTMLElement} button - Remove button
 */
function removeEffect(button) {
  button.closest('.effect-item').remove();
}

/**
 * Confirm item removal
 * @param {number} index - Item index
 */
function confirmRemoveItem(index) {
  const item = itemDatabase[index];
  if (confirm(`Are you sure you want to remove "${item.name}" from the item database?`)) {
    removeItemFromDatabase(index);
  }
}

/**
 * Show a custom toast message
 * @param {string} message - Message to display
 */
function showCustomToast(message) {
  // Try to use the existing toast if available
  const toast = document.getElementById('save-toast');
  if (toast) {
    const alertSpan = toast.querySelector('span');
    if (alertSpan) {
      alertSpan.textContent = message;
      toast.classList.replace('opacity-0', 'opacity-100');
      setTimeout(() => toast.classList.replace('opacity-100', 'opacity-0'), 2000);
      return;
    }
  }
  
  // Fallback to alert
  alert(message);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize item manager when called
 */
function initializeItemManager() {
  if (itemManagerInitialized) {
    return; // Already initialized
  }
  
  initializeItemDatabase();
  
  // Auto-update when characters change
  const originalSaveToLocalStorage = window.saveToLocalStorage;
  window.saveToLocalStorage = function() {
    originalSaveToLocalStorage.call(this);
    // Only add truly missing items, don't override existing ones
    addMissingItemsFromInventories();
    // Maintain search filter when refreshing
    const searchTerm = document.getElementById('item-search')?.value.toLowerCase() || '';
    renderItemDatabase(searchTerm);
    
    // Update item suggestions with wiki database
    updateItemSuggestions();
    
    // Update character item suggestions
    if (typeof window.updateSummary === 'function') {
      window.updateSummary();
    }
  };
  
  itemManagerInitialized = true;
  console.log('Item manager initialized');
}

// Export functions for global use
window.initializeItemManager = initializeItemManager;
window.renderItemDatabase = renderItemDatabase;
window.filterItems = filterItems;
window.addNewItemToDatabase = addNewItemToDatabase;
window.saveItemFromForm = saveItemFromForm;
window.closeEditItemModal = closeEditItemModal;
window.addEffectToForm = addEffectToForm;
window.updateEffectTargets = updateEffectTargets;
window.removeEffect = removeEffect;
window.editItemInDatabase = editItemInDatabase;
window.confirmRemoveItem = confirmRemoveItem;
window.useItemOnCharacter = useItemOnCharacter;
window.confirmUseItem = confirmUseItem;
window.closeUseItemModal = closeUseItemModal;
window.validateItemDatabase = validateItemDatabase;
window.updateItemSuggestions = updateItemSuggestions;

/**
 * Update the global item suggestions datalist with items from the wiki database
 * This should be the single source of truth for all item suggestions
 */
function updateItemSuggestions() {
  const datalist = document.getElementById('item-suggestions');
  if (!datalist) return;
  
  // Get all items from the wiki database first (primary source)
  const allItemNames = new Set();
  
  if (itemDatabase && Array.isArray(itemDatabase)) {
    itemDatabase.forEach(item => {
      if (item.name && item.name.trim()) {
        allItemNames.add(item.name.trim());
      }
    });
  }
  
  // Only add character inventory items that don't exist in the wiki
  if (typeof window.characters !== 'undefined' && Array.isArray(window.characters)) {
    window.characters.forEach(char => {
      if (char.items && Array.isArray(char.items)) {
        char.items.forEach(item => {
          if (item.name && item.name.trim()) {
            const itemName = item.name.trim();
            // Case-insensitive check to avoid duplicates
            const lowerName = itemName.toLowerCase();
            const exists = Array.from(allItemNames).some(existingName => 
              existingName.toLowerCase() === lowerName
            );
            if (!exists) {
              allItemNames.add(itemName);
            }
          }
        });
      }
    });
  }
  
  // Sort and update the datalist
  const sortedItems = Array.from(allItemNames).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  
  datalist.innerHTML = sortedItems.map(name => 
    `<option value="${name.replace(/"/g, '&quot;')}">`
  ).join('');
  
  console.log(`Updated item suggestions: ${sortedItems.length} items from wiki database`);
}
