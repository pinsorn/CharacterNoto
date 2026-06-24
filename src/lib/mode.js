// Viewer (read-only player) mode is requested via the `?view=1` URL param.
// Known at module load — before the stores initialise — so persisted() can stay in-memory.
export const viewer =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('view');
