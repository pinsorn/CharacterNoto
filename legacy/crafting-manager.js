/**
 * Crafting Manager - Crafting System
 * Manages crafting recipes and allows characters to craft items
 * 
 * @author Character Manager Contributors
 * @version 1.0.0
 */

// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

let craftingRecipes = [];
let selectedEditRecipeIndex = null;
let selectedCraftingCharacterIndex = null;
let craftingManagerInitialized = false;

// =============================================================================
// CRAFTING DATABASE MANAGEMENT
// =============================================================================

/**
 * Initialize crafting database from localStorage
 */
function initializeCraftingDatabase() {
  const stored = localStorage.getItem('craftingRecipes');
  craftingRecipes = stored ? JSON.parse(stored) : [];
  
  renderCraftingRecipes();
}

/**
 * Save crafting recipes to localStorage
 */
function saveCraftingDatabase() {
  localStorage.setItem('craftingRecipes', JSON.stringify(craftingRecipes));
}

/**
 * Add new recipe to database
 * @param {string} name - Recipe name
 * @param {string} description - Recipe description
 * @param {Array} materials - Array of material objects
 * @param {Array} outputs - Array of output objects
 */
function addRecipeToDatabase(name, description, materials, outputs) {
  const existingIndex = craftingRecipes.findIndex(recipe => recipe.name === name);
  
  if (existingIndex >= 0) {
    // Update existing recipe
    craftingRecipes[existingIndex] = { name, description, materials, outputs };
  } else {
    // Add new recipe
    craftingRecipes.push({ name, description, materials, outputs });
  }
  
  saveCraftingDatabase();
  // Maintain search filter when refreshing
  const searchTerm = document.getElementById('crafting-search')?.value.toLowerCase() || '';
  renderCraftingRecipes(searchTerm);
}

/**
 * Remove recipe from database
 * @param {number} index - Recipe index
 */
function removeRecipeFromDatabase(index) {
  craftingRecipes.splice(index, 1);
  saveCraftingDatabase();
  // Maintain search filter when refreshing
  const searchTerm = document.getElementById('crafting-search')?.value.toLowerCase() || '';
  renderCraftingRecipes(searchTerm);
}

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

/**
 * Filter recipes based on search input
 */
function filterCraftingRecipes() {
  const searchTerm = document.getElementById('crafting-search')?.value.toLowerCase() || '';
  renderCraftingRecipes(searchTerm);
}

// =============================================================================
// UI RENDERING
// =============================================================================

/**
 * Render the crafting recipes in the UI
 * @param {string} searchFilter - Optional search filter
 */
function renderCraftingRecipes(searchFilter = '') {
  const container = document.getElementById('crafting-recipes-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Filter recipes based on search term
  let filteredRecipes = craftingRecipes;
  if (searchFilter) {
    filteredRecipes = craftingRecipes.filter(recipe => 
      recipe.name.toLowerCase().includes(searchFilter) ||
      (recipe.description && recipe.description.toLowerCase().includes(searchFilter)) ||
      (recipe.materials && recipe.materials.some(material => 
        material.name.toLowerCase().includes(searchFilter)
      )) ||
      (recipe.outputs && recipe.outputs.some(output => 
        output.name.toLowerCase().includes(searchFilter)
      ))
    );
  }
  
  if (filteredRecipes.length === 0) {
    const message = searchFilter 
      ? `No recipes found matching "${searchFilter}"`
      : 'No crafting recipes. Add some recipes to get started.';
    container.innerHTML = `<div class="text-center text-gray-500 py-8">${message}</div>`;
    return;
  }
  
  filteredRecipes.forEach((recipe, filteredIndex) => {
    // Get the original index in the full database for edit/delete actions
    const originalIndex = craftingRecipes.indexOf(recipe);
    
    const materialsHtml = recipe.materials.map(material => 
      `<span class="badge badge-warning badge-sm">${material.name} x${material.quantity}</span>`
    ).join(' ');
    
    const outputsHtml = recipe.outputs.map(output => 
      `<span class="badge badge-success badge-sm">${output.name} x${output.quantity}</span>`
    ).join(' ');
    
    container.innerHTML += `
      <div class="card bg-base-200 shadow-sm mb-4">
        <div class="card-body p-4">
          <div class="flex justify-between items-start">
            <h3 class="card-title text-lg">${recipe.name}</h3>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-primary" onclick="editRecipeInDatabase(${originalIndex})">Edit</button>
              <button class="btn btn-xs btn-error" onclick="confirmRemoveRecipe(${originalIndex})">Delete</button>
            </div>
          </div>
          
          <div class="grid gap-3 mt-3">
            <div>
              <span class="font-semibold text-sm">Description:</span>
              <p class="text-sm mt-1">${recipe.description || '<em class="text-gray-500">No description</em>'}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span class="font-semibold text-sm">Materials Required:</span>
                <div class="mt-1 flex flex-wrap gap-1">
                  ${materialsHtml || '<em class="text-gray-500 text-sm">No materials</em>'}
                </div>
              </div>
              
              <div>
                <span class="font-semibold text-sm">Output:</span>
                <div class="mt-1 flex flex-wrap gap-1">
                  ${outputsHtml || '<em class="text-gray-500 text-sm">No output</em>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  });
}

// =============================================================================
// RECIPE EDITING
// =============================================================================

/**
 * Edit recipe in database
 * @param {number} index - Recipe index
 */
function editRecipeInDatabase(index) {
  selectedEditRecipeIndex = index;
  const recipe = craftingRecipes[index];
  
  // Populate form
  document.getElementById('crafting-name').value = recipe.name;
  document.getElementById('crafting-description').value = recipe.description;
  
  // Clear and populate materials
  const materialsList = document.getElementById('crafting-materials-list');
  materialsList.innerHTML = '';
  
  recipe.materials.forEach((material, materialIndex) => {
    addMaterialToForm(material, materialIndex);
  });
  
  // Clear and populate outputs
  const outputsList = document.getElementById('crafting-outputs-list');
  outputsList.innerHTML = '';
  
  recipe.outputs.forEach((output, outputIndex) => {
    addOutputToForm(output, outputIndex);
  });
  
  // Update modal title
  document.getElementById('crafting-modal-title').textContent = 'Edit Crafting Recipe';
  
  // Show modal
  document.getElementById('edit-crafting-modal').checked = true;
}

/**
 * Add new recipe to database (from form)
 */
function addNewCraftingRecipe() {
  selectedEditRecipeIndex = null;
  
  // Clear form
  document.getElementById('crafting-name').value = '';
  document.getElementById('crafting-description').value = '';
  document.getElementById('crafting-materials-list').innerHTML = '';
  document.getElementById('crafting-outputs-list').innerHTML = '';
  
  // Update modal title
  document.getElementById('crafting-modal-title').textContent = 'Add Crafting Recipe';
  
  // Show modal
  document.getElementById('edit-crafting-modal').checked = true;
}

/**
 * Save recipe from form
 */
function saveCraftingRecipeFromForm() {
  const name = document.getElementById('crafting-name').value.trim();
  const description = document.getElementById('crafting-description').value.trim();
  
  if (!name) {
    alert('Recipe name is required!');
    return;
  }
  
  // Collect materials
  const materials = [];
  const materialsContainer = document.getElementById('crafting-materials-list');
  materialsContainer.querySelectorAll('.material-item').forEach(materialElement => {
    const materialName = materialElement.querySelector('.material-name').value.trim();
    const materialQuantity = parseInt(materialElement.querySelector('.material-quantity').value) || 1;
    
    if (materialName) {
      materials.push({ name: materialName, quantity: materialQuantity });
    }
  });
  
  // Collect outputs
  const outputs = [];
  const outputsContainer = document.getElementById('crafting-outputs-list');
  outputsContainer.querySelectorAll('.output-item').forEach(outputElement => {
    const outputName = outputElement.querySelector('.output-name').value.trim();
    const outputQuantity = parseInt(outputElement.querySelector('.output-quantity').value) || 1;
    
    if (outputName) {
      outputs.push({ name: outputName, quantity: outputQuantity });
    }
  });
  
  if (materials.length === 0) {
    alert('At least one material is required!');
    return;
  }
  
  if (outputs.length === 0) {
    alert('At least one output item is required!');
    return;
  }
  
  // Save recipe
  if (selectedEditRecipeIndex !== null) {
    craftingRecipes[selectedEditRecipeIndex] = { name, description, materials, outputs };
  } else {
    craftingRecipes.push({ name, description, materials, outputs });
  }
  
  saveCraftingDatabase();
  renderCraftingRecipes();
  
  // Close modal
  closeCraftingEditModal();
}

/**
 * Close the crafting edit modal
 */
function closeCraftingEditModal() {
  setTimeout(() => {
    try {
      console.log('Attempting to close edit-crafting-modal...');
      const modal = document.getElementById('edit-crafting-modal');
      if (modal) {
        modal.checked = false;
        console.log('Crafting edit modal closed successfully');
        
        // Fallback method
        if (modal.checked) {
          modal.style.display = 'none';
          console.log('Applied fallback display:none to crafting edit modal');
        }
      } else {
        console.error('Crafting edit modal element not found');
      }
    } catch (error) {
      console.error('Error closing crafting edit modal:', error);
    }
  }, 100);
}

/**
 * Add material to the form
 * @param {Object} material - Material object (optional, for editing)
 * @param {number} materialIndex - Material index (optional, for editing)
 */
function addMaterialToForm(material = null, materialIndex = null) {
  const materialsList = document.getElementById('crafting-materials-list');
  const materialId = materialIndex !== null ? materialIndex : Date.now();
  
  const materialDiv = document.createElement('div');
  materialDiv.className = 'material-item flex gap-2 items-center';
  materialDiv.innerHTML = `
    <input type="text" class="input input-sm input-bordered flex-1 material-name" 
           placeholder="Material name" value="${material?.name || ''}" list="item-suggestions">
    <input type="number" class="input input-sm input-bordered w-20 material-quantity" 
           min="1" value="${material?.quantity || 1}">
    <button type="button" class="btn btn-error btn-xs" onclick="removeMaterial(this)">×</button>
  `;
  
  materialsList.appendChild(materialDiv);
}

/**
 * Add output to the form
 * @param {Object} output - Output object (optional, for editing)
 * @param {number} outputIndex - Output index (optional, for editing)
 */
function addOutputToForm(output = null, outputIndex = null) {
  const outputsList = document.getElementById('crafting-outputs-list');
  const outputId = outputIndex !== null ? outputIndex : Date.now();
  
  const outputDiv = document.createElement('div');
  outputDiv.className = 'output-item flex gap-2 items-center';
  outputDiv.innerHTML = `
    <input type="text" class="input input-sm input-bordered flex-1 output-name" 
           placeholder="Output item name" value="${output?.name || ''}" list="item-suggestions">
    <input type="number" class="input input-sm input-bordered w-20 output-quantity" 
           min="1" value="${output?.quantity || 1}">
    <button type="button" class="btn btn-error btn-xs" onclick="removeOutput(this)">×</button>
  `;
  
  outputsList.appendChild(outputDiv);
}

/**
 * Remove material from form
 * @param {HTMLElement} button - Remove button
 */
function removeMaterial(button) {
  button.closest('.material-item').remove();
}

/**
 * Remove output from form
 * @param {HTMLElement} button - Remove button
 */
function removeOutput(button) {
  button.closest('.output-item').remove();
}

/**
 * Confirm recipe removal
 * @param {number} index - Recipe index
 */
function confirmRemoveRecipe(index) {
  const recipe = craftingRecipes[index];
  if (confirm(`Are you sure you want to remove the recipe "${recipe.name}"?`)) {
    removeRecipeFromDatabase(index);
  }
}

// =============================================================================
// CHARACTER CRAFTING SYSTEM
// =============================================================================

/**
 * Open crafting modal for a character
 * @param {number} characterIndex - Character index
 */
function openCharacterCrafting(characterIndex) {
  // Ensure crafting manager is initialized
  if (!craftingManagerInitialized) {
    initializeCraftingManager();
  }
  
  selectedCraftingCharacterIndex = characterIndex;
  const character = characters[characterIndex];
  
  // Update modal title
  document.getElementById('crafting-character-name').textContent = character.name;
  
  // Populate recipe select
  const recipeSelect = document.getElementById('character-crafting-recipe-select');
  recipeSelect.innerHTML = '<option value="">Choose a recipe...</option>';
  
  craftingRecipes.forEach((recipe, index) => {
    recipeSelect.innerHTML += `<option value="${index}">${recipe.name}</option>`;
  });
  
  // Reset quantity to 1
  document.getElementById('crafting-quantity').value = 1;
  
  // Hide preview initially
  document.getElementById('crafting-preview').classList.add('hidden');
  document.getElementById('craft-button').disabled = true;
  document.getElementById('craft-button').textContent = 'Craft';
  document.getElementById('max-quantity-btn').disabled = true;
  
  // Show modal
  document.getElementById('character-crafting-modal').checked = true;
}

/**
 * Update crafting preview when recipe is selected
 */
function updateCraftingPreview() {
  const recipeIndex = parseInt(document.getElementById('character-crafting-recipe-select').value);
  const quantity = parseInt(document.getElementById('crafting-quantity').value) || 1;
  const preview = document.getElementById('crafting-preview');
  
  if (isNaN(recipeIndex)) {
    preview.classList.add('hidden');
    document.getElementById('craft-button').disabled = true;
    return;
  }
  
  const recipe = craftingRecipes[recipeIndex];
  const character = characters[selectedCraftingCharacterIndex];
  
  // Show preview
  preview.classList.remove('hidden');
  
  // Update materials preview with quantity calculations
  const materialsPreview = document.getElementById('crafting-materials-preview');
  let canCraft = true;
  let maxCraftable = Infinity;
  
  materialsPreview.innerHTML = recipe.materials.map(material => {
    const characterItem = character.items.find(item => item.name === material.name);
    const currentAmount = characterItem ? characterItem.amount : 0;
    const requiredTotal = material.quantity * quantity;
    const hasEnough = currentAmount >= requiredTotal;
    
    // Calculate how many times this material allows us to craft
    const craftableWithThisMaterial = Math.floor(currentAmount / material.quantity);
    maxCraftable = Math.min(maxCraftable, craftableWithThisMaterial);
    
    if (!hasEnough) canCraft = false;
    
    const statusClass = hasEnough ? 'text-success' : 'text-error';
    
    return `
      <div class="text-sm ${statusClass}">
        ${material.name} x${requiredTotal} (have: ${currentAmount})
        ${hasEnough ? '✓' : '✗'}
      </div>
    `;
  }).join('');
  
  // Update outputs preview with quantity calculations
  const outputsPreview = document.getElementById('crafting-outputs-preview');
  outputsPreview.innerHTML = recipe.outputs.map(output => `
    <div class="text-sm text-success">
      ${output.name} x${output.quantity * quantity}
    </div>
  `).join('');
  
  // Update status and craft button
  const statusDiv = document.getElementById('crafting-status');
  const craftButton = document.getElementById('craft-button');
  const maxButton = document.getElementById('max-quantity-btn');
  
  if (canCraft) {
    statusDiv.innerHTML = `<div class="alert alert-success"><span>✓ You have all required materials to craft ${quantity} time(s)!</span></div>`;
    craftButton.disabled = false;
    craftButton.textContent = quantity === 1 ? 'Craft' : `Craft ${quantity}x`;
    maxButton.disabled = false;
  } else {
    const maxText = maxCraftable > 0 ? ` (Max possible: ${maxCraftable}x)` : '';
    statusDiv.innerHTML = `<div class="alert alert-error"><span>✗ Missing required materials for ${quantity}x crafting${maxText}</span></div>`;
    craftButton.disabled = true;
    craftButton.textContent = 'Craft';
    maxButton.disabled = maxCraftable <= 0;
  }
}

/**
 * Set crafting quantity to maximum possible amount
 */
function setMaxCraftingQuantity() {
  const recipeIndex = parseInt(document.getElementById('character-crafting-recipe-select').value);
  if (isNaN(recipeIndex)) return;
  
  const recipe = craftingRecipes[recipeIndex];
  const character = characters[selectedCraftingCharacterIndex];
  
  let maxCraftable = Infinity;
  
  // Calculate maximum craftable based on available materials
  recipe.materials.forEach(material => {
    const characterItem = character.items.find(item => item.name === material.name);
    const currentAmount = characterItem ? characterItem.amount : 0;
    const craftableWithThisMaterial = Math.floor(currentAmount / material.quantity);
    maxCraftable = Math.min(maxCraftable, craftableWithThisMaterial);
  });
  
  if (maxCraftable === Infinity || maxCraftable <= 0) {
    maxCraftable = 1;
  }
  
  document.getElementById('crafting-quantity').value = maxCraftable;
  updateCraftingPreview();
}

/**
 * Confirm crafting and execute the recipe
 */
function confirmCrafting() {
  const recipeIndex = parseInt(document.getElementById('character-crafting-recipe-select').value);
  const quantity = parseInt(document.getElementById('crafting-quantity').value) || 1;
  if (isNaN(recipeIndex)) return;
  
  const recipe = craftingRecipes[recipeIndex];
  const character = characters[selectedCraftingCharacterIndex];
  
  // Check materials one more time with quantity multiplier
  let canCraft = true;
  for (const material of recipe.materials) {
    const characterItem = character.items.find(item => item.name === material.name);
    const requiredAmount = material.quantity * quantity;
    if (!characterItem || characterItem.amount < requiredAmount) {
      canCraft = false;
      break;
    }
  }
  
  if (!canCraft) {
    alert(`You don't have enough materials to craft this recipe ${quantity} time(s)!`);
    return;
  }
  
  // Remove materials from inventory (multiplied by quantity)
  recipe.materials.forEach(material => {
    const characterItem = character.items.find(item => item.name === material.name);
    const totalRequired = material.quantity * quantity;
    characterItem.amount -= totalRequired;
    
    // Remove item if quantity reaches 0
    if (characterItem.amount <= 0) {
      const itemIndex = character.items.indexOf(characterItem);
      character.items.splice(itemIndex, 1);
    }
  });
  
  // Add output items to inventory (multiplied by quantity)
  recipe.outputs.forEach(output => {
    const totalOutput = output.quantity * quantity;
    const existingItem = character.items.find(item => item.name === output.name);
    if (existingItem) {
      existingItem.amount += totalOutput;
    } else {
      character.items.push({ name: output.name, amount: totalOutput });
    }
  });
  
  // Save and refresh
  saveToLocalStorage();
  renderCharacters();
  
  // Close modal
  closeCharacterCraftingModal();
  
  // Show success message with quantity
  const craftText = quantity === 1 ? '' : ` (${quantity}x)`;
  showCustomToast(`Successfully crafted ${recipe.name}${craftText}!`);
}

/**
 * Close the character crafting modal
 */
function closeCharacterCraftingModal() {
  setTimeout(() => {
    try {
      console.log('Attempting to close character-crafting-modal...');
      const modal = document.getElementById('character-crafting-modal');
      if (modal) {
        modal.checked = false;
        console.log('Character crafting modal closed successfully');
        
        // Fallback method
        if (modal.checked) {
          modal.style.display = 'none';
          console.log('Applied fallback display:none to character crafting modal');
        }
      } else {
        console.error('Character crafting modal element not found');
      }
    } catch (error) {
      console.error('Error closing character crafting modal:', error);
    }
  }, 100);
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
 * Initialize crafting manager when called
 */
function initializeCraftingManager() {
  if (craftingManagerInitialized) {
    return; // Already initialized
  }
  
  initializeCraftingDatabase();
  craftingManagerInitialized = true;
  console.log('Crafting manager initialized');
}

// Export functions for global use
window.initializeCraftingManager = initializeCraftingManager;
window.renderCraftingRecipes = renderCraftingRecipes;
window.filterCraftingRecipes = filterCraftingRecipes;
window.addNewCraftingRecipe = addNewCraftingRecipe;
window.saveCraftingRecipeFromForm = saveCraftingRecipeFromForm;
window.closeCraftingEditModal = closeCraftingEditModal;
window.addMaterialToForm = addMaterialToForm;
window.addOutputToForm = addOutputToForm;
window.removeMaterial = removeMaterial;
window.removeOutput = removeOutput;
window.editRecipeInDatabase = editRecipeInDatabase;
window.confirmRemoveRecipe = confirmRemoveRecipe;
window.openCharacterCrafting = openCharacterCrafting;
window.updateCraftingPreview = updateCraftingPreview;
window.confirmCrafting = confirmCrafting;
window.closeCharacterCraftingModal = closeCharacterCraftingModal;
