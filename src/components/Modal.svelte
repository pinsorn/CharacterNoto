<script>
  // Reactive DaisyUI modal — replaces the legacy checkbox-toggle + setTimeout/display:none close hacks.
  let { open = $bindable(false), title = '', boxClass = '', children } = $props();
</script>

{#if open}
  <div class="modal modal-open">
    <div class="modal-box {boxClass}">
      {#if title}<h3 class="font-bold text-lg mb-4">{title}</h3>{/if}
      {@render children?.()}
    </div>
    <button class="modal-backdrop" aria-label="Close" onclick={() => (open = false)}></button>
  </div>
{/if}
