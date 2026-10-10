// Temporary maintenance notice. The CSP in each page blocks external API traffic.
(function () {
  function showMaintenance() {
    var notice = document.createElement('div');
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0d0d12;color:#fff;display:grid;place-items:center;padding:24px;text-align:center;font:18px/1.6 system-ui,sans-serif';
    notice.innerHTML = '<div><h1 style="font-size:28px">Temporarily under maintenance</h1><p>We are restarting our database. Please check back shortly.</p></div>';
    document.body.appendChild(notice);
    document.body.style.overflow = 'hidden';
    document.body.querySelectorAll(':scope > :not(:last-child)').forEach(function (element) {
      element.setAttribute('inert', '');
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showMaintenance, { once: true });
  } else {
    showMaintenance();
  }
})();
