<script>
  import { toastMsg } from '../lib/toast.js';
</script>

{#if $toastMsg}
  <div class="toast toast-end z-50">
    <div class="alert alert-success">
      <span>{$toastMsg}</span>
    </div>
  </div>
{/if}
