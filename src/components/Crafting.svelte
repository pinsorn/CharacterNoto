<script>
  // Crafting tab — ported from legacy crafting-manager.js.
  // Recipe CRUD lives here; the crafting MATH (maxCraftable/canCraft/craft) is reused from lib/crafting.js.
  // Cross-tab: when a character card's Craft button sets `craftingFor` to an index, the
  // character-crafting modal opens for that character.
  import { craftingRecipes } from '../lib/stores.js';
  import { viewer } from '../lib/mode.js';
  import { receivedHides } from '../lib/p2p.js';

  const hideDetails = $derived(viewer && !!$receivedHides?.craftDetails);
  import Modal from './Modal.svelte';

  // ---- Recipe list + search ----------------------------------------------
  let search = $state('');
  const filtered = $derived(
    search.trim()
      ? $craftingRecipes.filter((r) => {
          const s = search.toLowerCase();
          return (
            r.name.toLowerCase().includes(s) ||
            (r.description && r.description.toLowerCase().includes(s))
          );
        })
      : $craftingRecipes
  );

  // ---- Add/Edit recipe modal ---------------------------------------------
  let recipeOpen = $state(false);
  let editIndex = $state(null); // null → add, number → edit existing
  let form = $state({ name: '', description: '', materials: [], outputs: [] });

  function openAdd() {
    editIndex = null;
    form = { name: '', description: '', materials: [], outputs: [] };
    recipeOpen = true;
  }

  function openEdit(index) {
    editIndex = index;
    const r = $craftingRecipes[index];
    // deep copy so editing the form does not mutate the store until Save
    form = {
      name: r.name,
      description: r.description || '',
      materials: r.materials.map((m) => ({ name: m.name, quantity: m.quantity })),
      outputs: r.outputs.map((o) => ({ name: o.name, quantity: o.quantity })),
    };
    recipeOpen = true;
  }

  function addMaterial() {
    form.materials.push({ name: '', quantity: 1 });
  }
  function removeMaterial(i) {
    form.materials.splice(i, 1);
  }
  function addOutput() {
    form.outputs.push({ name: '', quantity: 1 });
  }
  function removeOutput(i) {
    form.outputs.splice(i, 1);
  }

  function saveRecipe() {
    const name = form.name.trim();
    const description = form.description.trim();

    if (!name) {
      alert('Recipe name is required!');
      return;
    }

    // Collect only rows with a non-empty name (matches legacy DOM-scrape behavior).
    const materials = form.materials
      .map((m) => ({ name: m.name.trim(), quantity: parseInt(m.quantity) || 1 }))
      .filter((m) => m.name);
    const outputs = form.outputs
      .map((o) => ({ name: o.name.trim(), quantity: parseInt(o.quantity) || 1 }))
      .filter((o) => o.name);

    if (materials.length === 0) {
      alert('At least one material is required!');
      return;
    }
    if (outputs.length === 0) {
      alert('At least one output item is required!');
      return;
    }

    const recipe = { name, description, materials, outputs };

    craftingRecipes.update((list) => {
      if (editIndex !== null) {
        list[editIndex] = recipe;
      } else {
        // case-SENSITIVE find by name → replace or push (legacy addRecipeToDatabase)
        const existing = list.findIndex((r) => r.name === name);
        if (existing >= 0) list[existing] = recipe;
        else list.push(recipe);
      }
      return list;
    });

    recipeOpen = false;
  }

  function removeRecipe(index) {
    const r = $craftingRecipes[index];
    if (confirm(`Are you sure you want to remove the recipe "${r.name}"?`)) {
      craftingRecipes.update((list) => {
        list.splice(index, 1);
        return list;
      });
    }
  }
  // The character-crafting modal lives in CraftingModal.svelte (mounted at app root)
  // so it escapes this tab's hidden container.
</script>

<!-- Crafting Tab Content -->
<div>
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold">Crafting Recipes</h2>
    <button class="btn btn-primary" onclick={openAdd}>Add New Recipe</button>
  </div>

  <!-- Search Bar -->
  <div class="mb-4">
    <input
      type="text"
      class="input input-bordered w-full"
      placeholder="Search recipes by name, materials, or output..."
      bind:value={search}
    />
  </div>

  <div>
    {#if filtered.length === 0}
      <div class="text-center text-gray-500 py-8">
        {search.trim()
          ? `No recipes found matching "${search}"`
          : 'No crafting recipes. Add some recipes to get started.'}
      </div>
    {:else}
      {#each filtered as recipe (recipe)}
        {@const originalIndex = $craftingRecipes.indexOf(recipe)}
        <div class="card bg-base-200 shadow-sm mb-4">
          <div class="card-body p-4">
            <div class="flex justify-between items-start">
              <h3 class="card-title text-lg">{recipe.name}</h3>
              <div class="flex gap-2">
                <button class="btn btn-xs btn-primary" onclick={() => openEdit(originalIndex)}>Edit</button>
                <button class="btn btn-xs btn-error" onclick={() => removeRecipe(originalIndex)}>Delete</button>
              </div>
            </div>

            <div class="grid gap-3 mt-3">
              <div>
                <span class="font-semibold text-sm">Description:</span>
                <p class="text-sm mt-1">
                  {#if recipe.description}{recipe.description}{:else}<em class="text-gray-500">No description</em>{/if}
                </p>
              </div>

              {#if !hideDetails}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span class="font-semibold text-sm">Materials Required:</span>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#if recipe.materials.length}
                        {#each recipe.materials as m}
                          <span class="badge badge-warning badge-sm">{m.name} x{m.quantity}</span>
                        {/each}
                      {:else}
                        <em class="text-gray-500 text-sm">No materials</em>
                      {/if}
                    </div>
                  </div>

                  <div>
                    <span class="font-semibold text-sm">Output:</span>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#if recipe.outputs.length}
                        {#each recipe.outputs as o}
                          <span class="badge badge-success badge-sm">{o.name} x{o.quantity}</span>
                        {/each}
                      {:else}
                        <em class="text-gray-500 text-sm">No output</em>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Add/Edit Crafting Recipe Modal -->
<Modal bind:open={recipeOpen} boxClass="max-w-2xl" title={editIndex !== null ? 'Edit Crafting Recipe' : 'Add Crafting Recipe'}>
  <div class="form-control mb-4">
    <label class="label">Recipe Name</label>
    <input type="text" class="input input-bordered" placeholder="Recipe name" bind:value={form.name} />
  </div>

  <div class="form-control mb-4">
    <label class="label">Description</label>
    <textarea class="textarea textarea-bordered" placeholder="Recipe description..." rows="3" bind:value={form.description}></textarea>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
    <!-- Materials Section -->
    <div class="min-w-0">
      <h4 class="font-bold mb-2">Materials Required</h4>
      <div class="space-y-2 mb-3">
        {#each form.materials as material, i}
          <div class="flex gap-2 items-center">
            <input type="text" class="input input-sm input-bordered flex-1 min-w-0" placeholder="Material name" bind:value={material.name} />
            <input type="number" class="input input-sm input-bordered w-20" min="1" bind:value={material.quantity} />
            <button type="button" class="btn btn-error btn-xs" onclick={() => removeMaterial(i)}>×</button>
          </div>
        {/each}
      </div>
      <button type="button" class="btn btn-sm btn-outline" onclick={addMaterial}>Add Material</button>
    </div>

    <!-- Output Section -->
    <div class="min-w-0">
      <h4 class="font-bold mb-2">Output Items</h4>
      <div class="space-y-2 mb-3">
        {#each form.outputs as output, i}
          <div class="flex gap-2 items-center">
            <input type="text" class="input input-sm input-bordered flex-1 min-w-0" placeholder="Output item name" bind:value={output.name} />
            <input type="number" class="input input-sm input-bordered w-20" min="1" bind:value={output.quantity} />
            <button type="button" class="btn btn-error btn-xs" onclick={() => removeOutput(i)}>×</button>
          </div>
        {/each}
      </div>
      <button type="button" class="btn btn-sm btn-outline" onclick={addOutput}>Add Output</button>
    </div>
  </div>

  <div class="modal-action">
    <button class="btn btn-primary" onclick={saveRecipe}>Save Recipe</button>
    <button class="btn btn-ghost" onclick={() => (recipeOpen = false)}>Cancel</button>
  </div>
</Modal>
