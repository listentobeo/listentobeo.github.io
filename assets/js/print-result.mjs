import { savePrintDraft } from './print-store.mjs';
const button = document.getElementById('print-artwork-link');
const thumbnail = document.getElementById('print-artwork-thumbnail');
let revision = 0;
window.BeoPrintResult = {
  async capture(original) {
    const current = ++revision;
    button.hidden = true;
    thumbnail?.removeAttribute('src');
    try {
      // Preserve the full result before the guest preview is downsampled/branded.
      await savePrintDraft(original);
      if (current !== revision) return;
      if (thumbnail) thumbnail.src = original;
      button.hidden = false;
    } catch (error) { console.warn('Print preview unavailable:', error.message); }
  },
  reset() { revision++; button.hidden = true; thumbnail?.removeAttribute('src'); },
};
