// public/js/main.js — Backend version
// Search, theme, nav, copy buttons, TOC, comments form

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initSearch();
  initCopyButtons();
  initTOC();
  initSidebarScroll();
});

// ── THEME ──────────────────────────────────────────────────────────────
function initTheme() {
  const toggle = document.getElementById('themeToggle');
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  toggle?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// ── NAV ────────────────────────────────────────────────────────────────
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  toggle?.addEventListener('click', () => links?.classList.toggle('open'));
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href').split('/').pop() === path);
  });
}

// ── SEARCH ─────────────────────────────────────────────────────────────
function initSearch() {
  const btn = document.getElementById('searchBtn');
  const overlay = document.getElementById('searchOverlay');
  const close = document.getElementById('searchClose');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if (!overlay) return;

  btn?.addEventListener('click', () => { overlay.classList.add('active'); input?.focus(); });
  close?.addEventListener('click', () => overlay.classList.remove('active'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.classList.remove('active');
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); overlay.classList.add('active'); input?.focus(); }
  });

  let debounce;
  input?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = ''; return; }
      results.innerHTML = '<div class="search-empty">// Searching...</div>';
      try {
        const found = await handleSearch(q);
        if (!found.length) { results.innerHTML = `<div class="search-empty">// No results for "${q}"</div>`; return; }
        const path = window.location.pathname.includes('/pages/') ? '' : 'pages/';
        results.innerHTML = found.map(p => `
          <div class="search-result-item" onclick="window.location.href='${path}article.html?slug=${p.slug}'">
            <h4>${p.title}</h4>
            <p>${p.category} · ${new Date(p.created_at).toLocaleDateString()} · ${p.read_time}</p>
          </div>`).join('');
      } catch { results.innerHTML = '<div class="search-empty">// Search unavailable</div>'; }
    }, 300);
  });
}

// ── COPY BUTTONS ───────────────────────────────────────────────────────
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.closest('.code-block')?.querySelector('code')?.innerText || '';
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '✓ Copied'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });
}

// ── SIDEBAR SCROLL BEHAVIOR ────────────────────────────────────────────
function initSidebarScroll() {
  // Simple sticky behavior: the CSS position:sticky handles it all
}

// ── TABLE OF CONTENTS ──────────────────────────────────────────────────
function initTOC() {
  const tocList = document.getElementById('tocList') || document.querySelector('.toc ul');
  if (!tocList) return;
  const headings = document.querySelectorAll('.article-content h2, .article-content h3');
  headings.forEach((h, i) => {
    if (!h.id) h.id = `sec-${i}`;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id; a.textContent = h.textContent;
    if (h.tagName === 'H3') a.style.paddingLeft = '20px';
    li.appendChild(a); tocList.appendChild(li);
  });
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.toc a').forEach(a => a.classList.remove('active'));
        tocList.querySelector(`a[href="#${e.target.id}"]`)?.classList.add('active');
      }
    });
  }, { rootMargin: '-80px 0px -60% 0px' });
  headings.forEach(h => obs.observe(h));
}
