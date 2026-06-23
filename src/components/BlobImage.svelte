<script>
  // Renders an image stored in IndexedDB (blobstore) by id. Loads an object URL on change
  // and revokes it on cleanup. Renders the `fallback` snippet (or nothing) when there's no image.
  import { getBlob } from '../lib/blobstore.js';

  let { id = null, alt = '', class: cls = '', fallback } = $props();
  let url = $state(null);

  $effect(() => {
    const currentId = id;
    let objectUrl = null;
    let cancelled = false;
    if (currentId) {
      getBlob(currentId).then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          url = objectUrl;
        } else {
          url = null;
        }
      });
    } else {
      url = null;
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

{#if url}
  <img src={url} {alt} class={cls} />
{:else if fallback}
  {@render fallback()}
{/if}
