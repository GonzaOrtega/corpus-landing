(() => {
  var root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('motion-fallback');
    return;
  }
  root.classList.add('motion-enabled');
  window.setTimeout(() => {
    var ready =
      root.dataset.heroMotionReady === 'true' &&
      root.dataset.pageMotionReady === 'true' &&
      root.dataset.scrollytellingMotionReady === 'true';
    if (!ready) {
      root.classList.remove('motion-enabled');
      root.classList.add('motion-fallback');
    }
  }, 2500);
})();
