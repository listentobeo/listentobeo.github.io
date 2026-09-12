import { savePrintDraft } from './print-store.mjs';
const button = document.getElementById('print-artwork-link');
window.BeoPrintResult = {
  async capture(original) {
    button.hidden = true;
    try {
      // Preserve the full result before the guest preview is downsampled/branded.
      await savePrintDraft(original);
      button.hidden = false;
    } catch (error) { console.warn('Print preview unavailable:', error.message); }
  },
  reset() { button.hidden = true; },
};
