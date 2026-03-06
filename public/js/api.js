// public/js/api.js — Frontend API client
// Replaces static posts-data.js — fetches from the backend

const API_BASE = 'https://cyberblog-v2-production.up.railway.app/api';

async function fetchAPI(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error('API error ' + r.status);
  return r.json();
}

// ── HOMEPAGE: Featured posts ─────────────────────────────────────────────
async function renderFeaturedPosts() {
  const grid = document.getElementById('featuredPosts');
  if (!grid) return;
  try {
    const { posts } = await fetchAPI('/posts?featured=true&limit=3');
    grid.innerHTML = posts.length
      ? posts.map(buildPostCard).join('')
      : '<p style="color:var(--text3);font-family:var(--font-mono)">// No posts published yet.</p>';
  } catch { grid.innerHTML = '<p style="color:var(--text3);font-family:var(--font-mono)">// Failed to load posts.</p>'; }
}

// ── BLOG PAGE: Paginated list ─────────────────────────────────────────────
let blogPage = 1;
let blogCat = '';
let blogSearch = '';
const PER_PAGE = 10;

async function renderBlogPosts() {
  const list = document.getElementById('postsList');
  if (!list) return;
  try {
    let url = `/posts?page=${blogPage}&limit=${PER_PAGE}`;
    if (blogCat) url += `&category=${blogCat}`;
    if (blogSearch) url += `&search=${encodeURIComponent(blogSearch)}`;
    const data = await fetchAPI(url);
    list.innerHTML = data.posts.length
      ? data.posts.map((p, i) => buildListItem(p, (blogPage - 1) * PER_PAGE + i + 1)).join('')
      : '<div class="empty-state" style="padding:40px;text-align:center;font-family:var(--font-mono);color:var(--text3)">// No posts found</div>';
    renderPagination(data.total, data.pages);
  } catch(e) { list.innerHTML = `<p style="color:var(--text3);font-family:var(--font-mono)">// Error loading posts: ${e.message}</p>`; }
}

function renderPagination(total, pages) {
  const el = document.getElementById('pagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="changeBlogPage(${blogPage-1})" ${blogPage===1?'disabled':''}>←</button>`;
  for (let i = 1; i <= pages; i++) html += `<button class="page-btn ${i===blogPage?'active':''}" onclick="changeBlogPage(${i})">${i}</button>`;
  html += `<button class="page-btn" onclick="changeBlogPage(${blogPage+1})" ${blogPage===pages?'disabled':''}>→</button>`;
  el.innerHTML = html;
}

window.changeBlogPage = (p) => { blogPage = p; renderBlogPosts(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

// ── ARTICLE PAGE ─────────────────────────────────────────────────────────
async function loadArticlePage() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) return;
  try {
    const post = await fetchAPI('/posts/' + slug);
    document.title = `${post.title} — CyberNotes`;

    const titleEl = document.getElementById('articleTitle');
    const metaEl = document.getElementById('articleMeta');
    const contentEl = document.getElementById('articleContent');

    if (titleEl) titleEl.textContent = post.title;
    if (metaEl) {
      const catClass = CAT_CLASSES[post.category] || '';
      metaEl.innerHTML = `
        <span class="post-cat ${catClass}">${post.category}</span>
        <span>${formatDate(post.created_at)}</span>
        <span>⏱ ${post.read_time}</span>
        <span>👁 ${post.views} views</span>
        <span>🏷 ${post.tags.map(t => '#'+t).join(' ')}</span>`;
    }
    if (contentEl) {
      contentEl.innerHTML = post.content_html;
      initCopyButtons();
      initTOC();
    }

    // Render stored comments
    renderCommentsList(post.comments, post.id);

    // Comment form submission
    const form = document.getElementById('commentForm');
    if (form) {
      form.dataset.postId = post.id;
      form.addEventListener('submit', submitComment);
    }
  } catch (e) {
    document.getElementById('articleTitle').textContent = 'Post not found';
    document.getElementById('articleContent').innerHTML = `
      <div class="callout warning">
        <span class="callout-icon">⚠</span>
        <div class="callout-content">
          <strong>Not Found</strong>
          <p>This article doesn't exist. <a href="blog.html">Browse all articles →</a></p>
        </div>
      </div>`;
  }
}

// ── COMMENTS ─────────────────────────────────────────────────────────────
async function submitComment(e) {
  e.preventDefault();
  const form = e.target;
  const post_id = form.dataset.postId;
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const body = document.getElementById('cText').value.trim();
  if (!name || !body) return;

  try {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Posting...';
    const data = await (await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id, name, email, body })
    })).json();
    btn.textContent = '✓ ' + (data.message || 'Posted!');
    form.reset();
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Post Comment'; }, 3000);
  } catch { alert('Failed to post comment. Try again.'); }
}

function renderCommentsList(comments, postId) {
  const list = document.getElementById('commentsList');
  if (!list) return;
  if (!comments.length) {
    list.innerHTML = `<p style="color:var(--text3);font-family:var(--font-mono);font-size:.85rem">// No comments yet. Be the first!</p>`;
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <div class="comment-avatar">${c.name[0].toUpperCase()}</div>
        <span class="comment-name">${c.name}</span>
        <span class="comment-date">${formatDate(c.created_at)}</span>
      </div>
      <p class="comment-text">${c.body}</p>
    </div>`).join('');
}

// ── SEARCH (global) ───────────────────────────────────────────────────────
async function handleSearch(query) {
  if (!query) return [];
  const { posts } = await fetchAPI(`/posts?search=${encodeURIComponent(query)}&limit=8`);
  return posts;
}

// ── CATEGORIES PAGE ───────────────────────────────────────────────────────
async function renderCategoryPages() {
  const cats = ['networking','websec','tools','tutorials','tips'];
  for (const cat of cats) {
    const el = document.getElementById('cat-' + cat);
    if (!el) continue;
    try {
      const { posts } = await fetchAPI(`/posts?category=${cat}&limit=20`);
      if (!posts.length) { el.innerHTML = '<p style="color:var(--text3);font-family:var(--font-mono);font-size:.85rem">// No posts yet.</p>'; continue; }
      el.innerHTML = posts.map((p, i) => buildListItem(p, i + 1)).join('');
    } catch {}
  }
}

// ── CARD BUILDERS ─────────────────────────────────────────────────────────
const CAT_CLASSES = {
  networking: 'cat-networking', websec: 'cat-websec',
  tools: 'cat-tools', tutorials: 'cat-tutorials', tips: 'cat-tips'
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildPostCard(p) {
  const href = determineArticleHref(p.slug);
  const catClass = CAT_CLASSES[p.category] || '';
  const tags = (p.tags || []).slice(0, 3).map(t => `<span class="tag">#${t}</span>`).join('');
  return `
    <a href="${href}" class="post-card">
      <div class="post-card-body">
        <div class="post-meta">
          <span class="post-cat ${catClass}">${p.category}</span>
          <span class="post-date">${formatDate(p.created_at)}</span>
        </div>
        <h3>${p.title}</h3>
        <p class="post-excerpt">${p.excerpt}</p>
      </div>
      <div class="post-card-footer">
        <div class="post-tags">${tags}</div>
        <span class="read-time">${p.read_time}</span>
      </div>
    </a>`;
}

function buildListItem(p, num) {
  const href = determineArticleHref(p.slug);
  const catClass = CAT_CLASSES[p.category] || '';
  const tags = (p.tags || []).slice(0, 3).map(t => `<span class="tag">#${t}</span>`).join('');
  return `
    <a href="${href}" class="post-list-item">
      <div class="post-list-num">${String(num).padStart(2,'0')}</div>
      <div class="post-list-content">
        <div class="post-meta" style="margin-bottom:8px">
          <span class="post-cat ${catClass}">${p.category}</span>
          <span class="post-date">${formatDate(p.created_at)}</span>
        </div>
        <h3>${p.title}</h3>
        <p>${p.excerpt}</p>
        <div class="post-tags">${tags}</div>
      </div>
      <span class="read-time" style="margin-left:auto;flex-shrink:0">${p.read_time}</span>
    </a>`;
}

// Resolve correct relative path to article page
function determineArticleHref(slug) {
  const path = window.location.pathname;
  if (path.includes('/pages/')) return `article.html?slug=${slug}`;
  return `pages/article.html?slug=${slug}`;
}

// ── INIT ON LOAD ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) renderFeaturedPosts();
  if (path.includes('blog.html')) {
    renderBlogPosts();
    // Wire filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        blogCat = btn.dataset.cat === 'all' ? '' : btn.dataset.cat;
        blogPage = 1; renderBlogPosts();
      });
    });
  }
  if (path.includes('article.html')) loadArticlePage();
  if (path.includes('categories.html')) renderCategoryPages();
});
