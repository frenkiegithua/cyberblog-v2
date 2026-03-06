# CyberNotes — Full-Stack Blog + Admin Panel

Node.js + Express + SQLite backend. Uses **sql.js** (pure JavaScript SQLite) — works on Windows, Mac, Linux, and **all Node.js versions including v24**. No native compilation required.

---

## ✅ Compatibility

| Node.js | Windows | macOS | Linux |
|---------|---------|-------|-------|
| v18+    | ✓       | ✓     | ✓     |
| v20+    | ✓       | ✓     | ✓     |
| v22+    | ✓       | ✓     | ✓     |
| **v24** | **✓**   | **✓** | **✓** |

---

## 🚀 Setup (3 steps)

### Step 1 — Install dependencies
```
npm install
```

### Step 2 — Initialize database
```
node server/setup-db.js
```
Creates the database and prints your admin credentials.

### Step 3 — Start server
```
npm start
```

Open http://localhost:3000

---

## 🔐 Admin Panel

**URL:** http://localhost:3000/admin

**Default credentials:**
- Username: `admin`
- Password: `cybernotes2025`

**⚠ Change the password** via Settings → Change Password after first login.

### Admin features:
- **Dashboard** — post count, total views, pending comments
- **Posts** — create, edit, delete, search, filter by category
- **Editor** — full Markdown editor with live preview
- **Comments** — approve or delete with moderation queue
- **Settings** — site title, author profile, toggle comment moderation

---

## ✍️ Writing a new post

1. Go to Admin → New Post
2. Write in **Markdown** (GitHub-flavored)
3. Set category, tags, status (Draft / Published)
4. Toggle "Featured on Home" to show it on the homepage
5. Click **Save Post**

### Markdown supported:
```markdown
## Section heading
### Sub-heading

**bold**  *italic*  `inline code`

```bash
nmap -sV 192.168.1.1
```

> **Warning:** blockquote / callout

- bullet list
1. numbered list
[link](https://example.com)
```

---

## 📁 Project Structure

```
cyberblog-backend/
├── server/
│   ├── index.js          ← Express app
│   ├── db.js             ← sql.js wrapper (pure JS SQLite)
│   ├── setup-db.js       ← DB init + seed (run once)
│   ├── middleware/auth.js ← JWT middleware
│   └── routes/
│       ├── auth.js       ← Login, me, change password
│       ├── posts.js      ← CRUD for posts
│       ├── comments.js   ← Submit + moderate comments
│       ├── admin.js      ← Dashboard stats
│       ├── settings.js   ← Site settings
│       ├── feed.js       ← RSS feed
│       └── sitemap.js    ← XML sitemap
│
├── admin/index.html      ← Admin SPA (login, editor, dashboard)
├── public/               ← Frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/api.js         ← Fetches from backend API
│   ├── js/main.js
│   └── pages/            ← blog, article, categories, about, contact
│
├── data/blog.db          ← SQLite database (auto-created)
├── package.json
└── .env.example
```

---

## 🌐 API Endpoints

### Public
```
GET  /api/posts               List published posts
GET  /api/posts/:slug         Single post + comments
GET  /api/posts/categories    Count per category
POST /api/comments            Submit comment
GET  /feed.xml                RSS
GET  /sitemap.xml             Sitemap
```

### Query params for GET /api/posts
```
?page=1
?limit=10
?category=tools
?search=nmap
?featured=true
```

### Protected (JWT Bearer token required)
```
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/password

GET  /api/posts/admin/all
POST /api/posts
PUT  /api/posts/:id
DELETE /api/posts/:id

GET  /api/comments/admin
PUT  /api/comments/:id/approve
DELETE /api/comments/:id

GET  /api/admin/stats
GET  /api/settings
PUT  /api/settings
```

---

## 🚢 Deploy to Render (Free)

1. Push to GitHub
2. Go to render.com → New Web Service → Connect repo
3. Build command: `npm install && node server/setup-db.js`
4. Start command: `npm start`
5. Add env var: `JWT_SECRET=your-long-random-secret`
6. Deploy!

## Deploy to Railway (Free)

1. Push to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Add `JWT_SECRET` environment variable
4. Auto-deploys on every push

---

Built with ❤️ by Francis Githua — [francisgithua.netlify.app](https://francisgithua.netlify.app)
