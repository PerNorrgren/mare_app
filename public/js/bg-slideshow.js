(function () {
  // ── bg-slideshow.js ──
  // Ported from per_bot's own real login-page background: absolutely-
  // positioned .slide divs cross-fading via opacity (3s, in the CSS),
  // rotating every 9 seconds. One addition not in per_bot's version:
  // images are preloaded and filtered before anything renders, so a
  // missing file (e.g. the book's back cover, not uploaded yet) never
  // flashes a broken image — it's silently skipped, and the slideshow
  // gracefully becomes a single still image (still gets the slow
  // Ken Burns zoom from the CSS) rather than erroring.
  function preload(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  window.MareBgSlideshow = {
    init(containerId, imageUrls) {
      const container = document.getElementById(containerId);
      if (!container) return;
      Promise.all(imageUrls.map(preload)).then((results) => {
        const valid = results.filter(Boolean);
        if (!valid.length) return; // no images loaded — CSS background-deep colour carries it
        const slideEls = valid.map((url, i) => {
          const d = document.createElement('div');
          d.className = 'bg-slide' + (i === 0 ? ' active' : '');
          d.style.backgroundImage = `url('${url}')`;
          container.appendChild(d);
          return d;
        });
        if (valid.length > 1) {
          let current = 0;
          setInterval(() => {
            slideEls[current].classList.remove('active');
            current = (current + 1) % slideEls.length;
            slideEls[current].classList.add('active');
          }, 9000);
        }
      });
    },
  };
})();
