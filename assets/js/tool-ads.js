/* The two existing display units are shared across the tool pages. */
;(function () {
  var placements = document.querySelectorAll('.tool-ad');
  if (!placements.length) return;

  var local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local) {
    placements.forEach(function (placement) {
      placement.classList.add('tool-ad--preview');
      placement.querySelector('.adsbygoogle').textContent = 'Ad placement preview';
    });
    return;
  }

  var script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9054076111082534';
  script.onerror = function () {
    placements.forEach(function (placement) { placement.hidden = true; });
  };
  document.head.appendChild(script);

  placements.forEach(function (placement) {
    var unit = placement.querySelector('.adsbygoogle');
    var statusObserver = new MutationObserver(function () {
      if (unit.getAttribute('data-ad-status') === 'unfilled') {
        placement.hidden = true;
        statusObserver.disconnect();
      }
    });
    statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });

    function requestAd() {
      if (unit.dataset.beoRequested) return;
      unit.dataset.beoRequested = 'true';
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (error) { placement.hidden = true; }
    }
    if ('IntersectionObserver' in window) {
      var visibilityObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          visibilityObserver.disconnect();
          requestAd();
        }
      }, { rootMargin: '200px' });
      visibilityObserver.observe(placement);
    } else {
      requestAd();
    }
  });
})();
