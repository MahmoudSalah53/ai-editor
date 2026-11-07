/* Shared helpers + the silent channel-name intro used by every template. */
(function () {
  const R = {};
  R.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  R.lerp = (a, b, t) => a + (b - a) * t;
  R.ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  R.easeOut = t => 1 - Math.pow(1 - t, 3);
  R.backOut = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  R.seg = (t, a, b) => R.clamp((t - a) / (b - a));
  R.rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  R.$ = id => document.getElementById(id);

  R.loadImages = urls => Promise.all(urls.filter(Boolean).map(u => new Promise(res => {
    const im = new Image(); im.onload = res; im.onerror = res; im.src = u;
  })));

  /** shrink an element's font-size until it fits `max` px wide */
  R.fit = (el, max) => {
    el.style.fontSize = "";
    const w = el.scrollWidth;
    if (w > max) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * max / w + "px";
  };

  /* ---------- intro (silent) ---------- */
  const P = (() => { const r = R.rng(7), a = []; for (let i = 0; i < 140; i++) a.push({ x: r() * 1080, y: r() * 1920, s: 0.6 + r() * 2.4, v: 12 + r() * 40, ph: r() * 6.28, dr: 10 + r() * 30, tw: 0.5 + r() * 2 }); return a; })();

  R.buildIntro = function (host, name) {
    host.innerHTML = `
      <div class="intro-bg"></div>
      <canvas class="intro-p" width="1080" height="1920"></canvas>
      <div class="intro-vig"></div>
      <div class="intro-title-wrap"><div class="intro-title-box">
        <div class="intro-title"></div><div class="intro-shine"></div>
      </div></div>
      <div class="intro-flash"></div>`;
    host.querySelector(".intro-title").textContent = name;
    host.querySelector(".intro-shine").textContent = name;
    const box = host.querySelector(".intro-title-box");
    const title = host.querySelector(".intro-title"), shine = host.querySelector(".intro-shine");
    const fitTitle = () => { R.fit(title, 1000); shine.style.fontSize = title.style.fontSize; };
    const cv = host.querySelector(".intro-p"), bg = host.querySelector(".intro-bg"), flash = host.querySelector(".intro-flash");

    function particles(t, alpha) {
      const c = cv.getContext("2d"); c.clearRect(0, 0, 1080, 1920);
      if (alpha <= 0) return;
      for (const p of P) {
        const y = ((p.y - p.v * t) % 1920 + 1920) % 1920, x = p.x + Math.sin(t * 0.6 + p.ph) * p.dr;
        const tw = 0.45 + 0.55 * Math.sin(t * p.tw + p.ph) ** 2, col = p.s > 2 ? "255,230,170" : "240,200,120";
        const g = c.createRadialGradient(x, y, 0, x, y, p.s * 4);
        g.addColorStop(0, `rgba(${col},${alpha * tw})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(x, y, p.s * 4, 0, 6.283); c.fill();
      }
    }
    return {
      fit: fitTitle,
      render(t, INTRO) {
        if (INTRO <= 0.05) {
          host.style.opacity = 0;
          host.style.display = "none";
          return;
        }
        const fadeOutWindow = Math.min(0.6, INTRO * 0.3);
        const out = R.seg(t, INTRO - fadeOutWindow, INTRO + 0.15);
        host.style.opacity = 1 - out;
        host.style.display = out >= 1 ? "none" : "block";
        if (out >= 1) return;
        const s = INTRO / 3.0; // scale animations proportionally to intro length
        bg.style.transform = `scale(${1.04 + t * 0.02}) translateY(${-t * 6}px)`;
        particles(t, R.easeOut(R.seg(t, 0, Math.min(0.8, INTRO * 0.4))));
        const k = R.easeOut(R.seg(t, 0.25 * s, 1.45 * s));
        box.style.opacity = k;
        box.style.transform = `scale(${R.lerp(1.18, 1, k) + R.seg(t, 1.45 * s, INTRO) * 0.03})`;
        box.style.filter = `blur(${(1 - k) * 14}px)`;
        shine.style.backgroundPosition = `${R.lerp(110, -60, R.ease(R.seg(t, 1.2 * s, 2.5 * s)))}% 0`;
        flash.style.opacity = 0.55 * Math.exp(-Math.pow((t - 0.95 * s) / Math.max(0.12, 0.22 * s), 2));
      },
    };
  };

  /** Build subtitle cards; returns a render(at) function. `colors` decides how words look. */
  R.buildCards = function (host, cards, opts) {
    host.innerHTML = "";
    cards.forEach(cd => {
      const el = document.createElement("div"); el.className = "card";
      if (cd.header) { const h = document.createElement("div"); h.className = "hdr"; h.textContent = cd.header; el.appendChild(h); cd._hdr = h; }
      cd._lines = cd.lines.map((ln, li) => {
        const d = document.createElement("div"); d.className = "ln" + (ln.accent ? " accent" : "");
        const words = ln.text.split(/\s+/).filter(Boolean);
        const ws = words.map((w, wi) => {
          const s = document.createElement("span"); s.className = "w"; s.textContent = w;
          d.appendChild(s); d.appendChild(document.createTextNode(" "));
          const t = ln.ts && ln.ts[wi] != null ? ln.ts[wi] : ln.t + wi * 0.3;
          return { el: s, t };
        });
        ws.forEach((w, wi) => (w.next = ws[wi + 1] ? ws[wi + 1].t : cd.lines[li + 1] ? cd.lines[li + 1].t : w.t + 0.7));
        el.appendChild(d);
        return { el: d, t: ln.t, words: ws, accent: !!ln.accent };
      });
      if (cd.footer) { const f = document.createElement("div"); f.className = "ftr"; f.textContent = cd.footer; el.appendChild(f); cd._ftr = f; }
      host.appendChild(el); cd._el = el;
    });
    return {
      fit(max) {
        cards.forEach(cd => {
          cd._el.style.display = "flex";
          [cd._hdr, ...cd._lines.map(l => l.el), cd._ftr].filter(Boolean).forEach(e => R.fit(e, max));
          cd._el.style.display = "none";
        });
      },
      render(at) {
        cards.forEach(cd => {
          // sequential: outgoing card is gone before the next one fades in
          const vis = Math.min(R.seg(at, cd.start, cd.start + 0.3), 1 - R.seg(at, cd.end - 0.22, cd.end));
          cd._el.style.opacity = vis;
          cd._el.style.display = vis <= 0 ? "none" : "flex";
          if (vis <= 0) return;
          if (cd._hdr) { const k = R.easeOut(R.seg(at, cd.start, cd.start + 0.45)); cd._hdr.style.opacity = k; cd._hdr.style.transform = `translateY(${(1 - k) * 18}px)`; }
          cd._lines.forEach(ln => opts.line(ln, at));
          if (cd._ftr) { const ft = cd.footerT != null ? cd.footerT : cd.end - 1.2; cd._ftr.style.opacity = R.easeOut(R.seg(at, ft, ft + 0.5)); }
        });
      },
    };
  };

  window.R = R;
})();
