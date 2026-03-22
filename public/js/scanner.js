// public/js/scanner.js — NexusGuard frontend
// Uses polling (no WebSocket) to avoid Railway connection limits.
// All API calls go through /api/scanner/* on the same Railway backend.

(function () {
  'use strict';

  // ── STATE ───────────────────────────────────────────────────
  let scanState = {
    phase: 'idle',         // idle | spider | ascan | results
    target: '',
    contextName: '',
    spiderScanId: null,
    ascanScanId: null,
    startTime: null,
    pollInterval: null,
    results: null,
    activeEnabled: true
  };

  // ── AUTH TOKEN ──────────────────────────────────────────────
  // The /api/scanner/* protected routes need a JWT.
  // We read it from localStorage (same key the admin panel uses).
  function getToken() {
    return localStorage.getItem('cn_token') || '';
  }

  // ── API HELPERS ─────────────────────────────────────────────
  async function apiGet(path) {
    const res = await fetch('/api/scanner' + path, {
      headers: { Authorization: 'Bearer ' + getToken() }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'API error ' + res.status);
    return data;
  }

  async function apiPost(path, body) {
    const res = await fetch('/api/scanner' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + getToken()
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'API error ' + res.status);
    return data;
  }

  // ── DOM REFS ─────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const zapStatusEl    = $('zapStatus');
  const zapWarningEl   = $('zapWarning');
  const targetInput    = $('targetInput');
  const scanBtn        = $('scanBtn');
  const scanBtnText    = $('scanBtnText');
  const scanBtnSpinner = $('scanBtnSpinner');

  const inputSection   = $('inputSection');
  const scanningPanel  = $('scanningPanel');
  const resultsSection = $('resultsSection');

  const phaseLabel     = $('phaseLabel');
  const targetLabel    = $('scanTargetLabel');
  const progressPct    = $('progressPct');
  const progressBar    = $('progressBar');
  const spiderProg     = $('spiderProg');
  const ascanProg      = $('ascanProg');
  const alertsFound    = $('alertsFound');
  const elapsedTime    = $('elapsedTime');
  const terminal       = $('terminal');

  // ── ZAP CONNECTION CHECK ─────────────────────────────────────
  async function checkZap() {
    try {
      const d = await fetch('/api/scanner/health').then(r => r.json());
      if (d.status === 'connected') {
        setZapStatus('connected', 'ZAP ONLINE · v' + (d.version || '?'));
        zapWarningEl && zapWarningEl.classList.add('hidden');
        scanBtn.disabled = false;
        scanBtn.classList.remove('btn-disabled');
        scanBtnText.textContent = 'INITIATE ZAP SCAN';
      } else {
        throw new Error('disconnected');
      }
    } catch {
      setZapStatus('disconnected', 'ZAP DISCONNECTED');
      zapWarningEl && zapWarningEl.classList.remove('hidden');
      scanBtn.disabled = true;
      scanBtnText.textContent = 'CONNECT ZAP TO SCAN';
    }
  }

  function setZapStatus(state, text) {
    if (!zapStatusEl) return;
    zapStatusEl.className = 'zap-status ' + state;
    zapStatusEl.innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
  }

  // ── START SCAN ───────────────────────────────────────────────
  async function startScan() {
    const raw = targetInput.value.trim();
    if (!raw) return;

    // Normalise — prepend https:// if missing
    const target = raw.startsWith('http') ? raw : 'https://' + raw;

    try { new URL(target); } catch {
      logTerminal('Invalid URL format', 'red');
      return;
    }

    // Check auth
    if (!getToken()) {
      logTerminal('ERROR: You must be logged into the admin panel first', 'red');
      logTerminal('Open /admin, log in, then return here', 'yellow');
      return;
    }

    // UI: switch to scanning view
    inputSection.style.display = 'none';
    scanningPanel.classList.add('active');
    resultsSection.classList.remove('active');

    scanState.target     = target;
    scanState.phase      = 'spider';
    scanState.startTime  = Date.now();
    scanState.results    = null;

    targetLabel.textContent = target;
    setProgress(0);
    terminal.innerHTML = '';
    logTerminal('Initializing scan context...', 'cyan');

    try {
      // Check spiderCheck / activeCheck / ajaxCheck options
      const spiderOpt = ($('spiderCheck') || {}).checked !== false;
      const activeOpt = ($('activeCheck') || {}).checked !== false;

      logTerminal('Sending scan request to backend...', 'cyan');
      const scanData = await apiPost('/scan', {
        target,
        spider: spiderOpt,
        active: activeOpt
      });

      scanState.contextName  = scanData.contextName;
      scanState.spiderScanId = scanData.spiderScanId;
      scanState.activeEnabled = activeOpt && scanData.activeEnabled !== false;

      logTerminal('Scan started — context: ' + scanData.contextName, 'green');

      if (scanState.spiderScanId) {
        logTerminal('Spider crawl initiated (ID: ' + scanState.spiderScanId + ')', 'cyan');
        pollSpider();
      } else {
        // No spider — go straight to active scan or results
        if (scanState.activeEnabled) {
          await startActiveScan();
        } else {
          await fetchResults();
        }
      }

    } catch (e) {
      logTerminal('ERROR: ' + e.message, 'red');
      phaseLabel.textContent = 'Scan failed';
    }
  }

  // ── POLL SPIDER ──────────────────────────────────────────────
  function pollSpider() {
    phaseLabel.textContent = 'Spider Crawl';

    scanState.pollInterval = setInterval(async () => {
      try {
        const d = await apiGet('/spider/' + scanState.spiderScanId);
        const p = d.progress || 0;

        spiderProg && (spiderProg.textContent = p + '%');
        setProgress(10 + p * 0.3); // spider = 10–40%

        updateElapsed();

        if (p >= 100) {
          clearInterval(scanState.pollInterval);
          logTerminal('Spider crawl complete', 'green');

          if (scanState.activeEnabled) {
            await startActiveScan();
          } else {
            await fetchResults();
          }
        }
      } catch (e) {
        logTerminal('Spider poll error: ' + e.message, 'yellow');
      }
    }, 2000);
  }

  // ── START ACTIVE SCAN ────────────────────────────────────────
  async function startActiveScan() {
    phaseLabel.textContent = 'Active Scan';
    logTerminal('Starting active vulnerability scan...', 'cyan');

    try {
      const d = await apiPost('/ascan', {
        target: scanState.target,
        contextName: scanState.contextName
      });
      scanState.ascanScanId = d.scanId;
      logTerminal('Active scan started (ID: ' + d.scanId + ')', 'green');
      pollActiveScan();
    } catch (e) {
      logTerminal('Active scan start error: ' + e.message, 'yellow');
      await fetchResults();
    }
  }

  // ── POLL ACTIVE SCAN ─────────────────────────────────────────
  function pollActiveScan() {
    scanState.pollInterval = setInterval(async () => {
      try {
        const d = await apiGet('/ascan/' + scanState.ascanScanId);
        const p = d.progress || 0;

        ascanProg && (ascanProg.textContent = p + '%');
        setProgress(40 + p * 0.55); // ascan = 40–95%

        updateElapsed();

        if (p % 20 === 0 && p > 0) {
          logTerminal('Active scan ' + p + '% complete...', 'gray');
        }

        if (p >= 100) {
          clearInterval(scanState.pollInterval);
          logTerminal('Active scan complete', 'green');
          await fetchResults();
        }
      } catch (e) {
        logTerminal('Active scan poll error: ' + e.message, 'yellow');
      }
    }, 3000);
  }

  // ── FETCH RESULTS ─────────────────────────────────────────────
  async function fetchResults() {
    phaseLabel.textContent = 'Generating Report';
    logTerminal('Fetching vulnerability results...', 'cyan');
    setProgress(97);

    try {
      const params = new URLSearchParams({
        target: scanState.target,
        contextName: scanState.contextName || ''
      });
      const data = await apiGet('/results?' + params.toString());
      scanState.results = data;
      logTerminal('Report ready — ' + data.summary.total + ' findings', 'green');
      setProgress(100);
      setTimeout(() => showResults(data), 500);
    } catch (e) {
      logTerminal('ERROR fetching results: ' + e.message, 'red');
    }
  }

  // ── SHOW RESULTS ─────────────────────────────────────────────
  function showResults(data) {
    scanningPanel.classList.remove('active');
    resultsSection.classList.add('active');

    // Score
    const score = Math.max(0, 100 - data.summary.high * 15 - data.summary.medium * 8 - data.summary.low * 3);
    animateScore(score);

    // Counts
    setText('countHigh',   data.summary.high);
    setText('countMedium', data.summary.medium);
    setText('countLow',    data.summary.low);
    setText('countInfo',   data.summary.informational);
    setText('countTotal',  data.summary.total);

    renderFindings(data.vulnerabilities, 'all');
  }

  function animateScore(score) {
    const arc        = $('scoreArc');
    const numEl      = $('scoreNumber');
    const gradeEl    = $('scoreGrade');
    const descEl     = $('scoreDesc');
    const circumference = 377; // 2π × 60

    let color = '#00f5a0', grade = 'SECURE',   desc = 'No major issues found';
    if      (score < 40) { color = '#ff4560'; grade = 'CRITICAL'; desc = 'Immediate remediation required'; }
    else if (score < 60) { color = '#ffc107'; grade = 'AT RISK';  desc = 'Multiple vulnerabilities present'; }
    else if (score < 80) { color = '#00c9ff'; grade = 'FAIR';     desc = 'Some issues need attention'; }

    if (arc) {
      const offset = circumference - (score / 100) * circumference;
      arc.style.stroke          = color;
      arc.style.strokeDashoffset = String(offset);
    }
    if (numEl)  { numEl.textContent = score;  numEl.style.color = color; }
    if (gradeEl){ gradeEl.textContent = grade; gradeEl.style.color = color; }
    if (descEl)  descEl.textContent = desc;
  }

  // ── RENDER FINDINGS ───────────────────────────────────────────
  let currentFilter = 'all';

  function renderFindings(vulns, filter) {
    currentFilter = filter;
    const list = $('findingsList');
    if (!list) return;

    const filtered = filter === 'all'
      ? vulns
      : vulns.filter(v => v.risk.toLowerCase() === filter.toLowerCase());

    if (!filtered.length) {
      list.innerHTML = '<div class="scanner-empty">// No findings in this category</div>';
      return;
    }

    list.innerHTML = filtered.map((v, i) => buildFindingCard(v, i)).join('');

    // Toggle expand
    list.querySelectorAll('.vuln-item').forEach(card => {
      card.addEventListener('click', () => {
        const details = card.querySelector('.vuln-item-details');
        const chevron = card.querySelector('.vuln-item-chevron');
        if (!details) return;
        details.classList.toggle('open');
        chevron && chevron.classList.toggle('open');
      });
    });
  }

  function buildFindingCard(v, i) {
    const riskLower = (v.risk || '').toLowerCase();
    const riskLabel = v.risk || 'Unknown';
    const cweText   = v.cweId ? 'CWE-' + v.cweId : '';
    const urlShort  = (v.url || '').length > 70 ? v.url.substring(0, 70) + '...' : (v.url || '');

    const evidenceBlock = v.evidence
      ? `<div class="detail-section">
           <div class="detail-label">Evidence</div>
           <div class="detail-text evidence">${escHtml(v.evidence)}</div>
         </div>`
      : '';

    const paramBlock = v.param
      ? `<div class="detail-section">
           <div class="detail-label">Parameter</div>
           <div class="detail-text"><code style="font-family:var(--font-mono);font-size:.82em;color:var(--accent)">${escHtml(v.param)}</code></div>
         </div>`
      : '';

    const refBlock = v.reference
      ? `<div class="detail-section">
           <div class="detail-label">Reference</div>
           <a href="${escHtml(v.reference)}" target="_blank" rel="noopener" class="detail-ref-link">${escHtml(v.reference.split('\n')[0].substring(0,80))}</a>
         </div>`
      : '';

    return `
      <div class="vuln-item">
        <div class="vuln-item-header">
          <div class="vuln-badges">
            <span class="risk-badge ${riskLower}">${riskLabel}</span>
            ${cweText ? `<span class="cwe-badge">${cweText}</span>` : ''}
          </div>
          <span class="vuln-item-chevron">▼</span>
        </div>
        <div class="vuln-item-title">${escHtml(v.name)}</div>
        <div class="vuln-item-url">${escHtml(urlShort)}</div>
        <div class="vuln-item-details">
          ${v.description ? `
          <div class="detail-section">
            <div class="detail-label">Description</div>
            <div class="detail-text">${escHtml(v.description)}</div>
          </div>` : ''}
          ${paramBlock}
          ${evidenceBlock}
          ${v.solution ? `
          <div class="detail-section">
            <div class="detail-label">Solution</div>
            <div class="detail-text solution">${escHtml(v.solution)}</div>
          </div>` : ''}
          ${refBlock}
        </div>
      </div>`;
  }

  // ── FILTER BUTTONS ────────────────────────────────────────────
  window.filterFindings = function (filter) {
    document.querySelectorAll('.findings-filter-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.findings-filter-btn[data-filter="${filter}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    if (scanState.results) {
      renderFindings(scanState.results.vulnerabilities, filter);
    }
  };

  // ── EXPORT JSON ───────────────────────────────────────────────
  window.exportJSON = function () {
    if (!scanState.results) return;
    const blob = new Blob([JSON.stringify(scanState.results, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `zap-scan-${sanitizeFilename(scanState.target)}-${Date.now()}.json`);
  };

  // ── EXPORT HTML REPORT ────────────────────────────────────────
  window.exportHTML = function () {
    if (!scanState.results) return;
    const d = scanState.results;

    const rows = d.vulnerabilities.map(v => `
      <tr>
        <td><span class="risk-${(v.risk||'').toLowerCase()}">${v.risk}</span></td>
        <td>${escHtml(v.name)}</td>
        <td style="font-family:monospace;font-size:12px">${escHtml((v.url||'').substring(0,80))}</td>
        <td style="font-family:monospace;font-size:12px">${escHtml(v.param||'')}</td>
        <td style="font-size:12px">${escHtml((v.solution||'').substring(0,120))}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ZAP Scan Report — ${escHtml(d.target)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:40px;background:#f5f7fa;color:#1a2332}
  h1{color:#0a0d12;margin-bottom:4px}
  .meta{font-family:monospace;font-size:13px;color:#5a6b7e;margin-bottom:24px}
  .summary{display:flex;gap:16px;margin-bottom:32px}
  .box{background:#fff;border-radius:8px;padding:20px 28px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.07)}
  .box .num{font-size:28px;font-weight:800;line-height:1}
  .box .lbl{font-family:monospace;font-size:11px;color:#718096;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
  .box.high{border-top:4px solid #ff4560}.box.high .num{color:#ff4560}
  .box.medium{border-top:4px solid #ffc107}.box.medium .num{color:#c89000}
  .box.low{border-top:4px solid #00c9ff}.box.low .num{color:#007bbd}
  .box.info{border-top:4px solid #a0aec0}.box.info .num{color:#718096}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07)}
  th{background:#0a0d12;color:#c8d6e8;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:12px 14px;text-align:left}
  td{padding:12px 14px;border-bottom:1px solid #eef1f6;font-size:13px;vertical-align:top}
  .risk-high{color:#ff4560;font-weight:700}
  .risk-medium{color:#c89000;font-weight:700}
  .risk-low{color:#007bbd;font-weight:700}
  .risk-informational{color:#718096}
</style>
</head>
<body>
<h1>NexusGuard / OWASP ZAP Scan Report</h1>
<div class="meta">Target: ${escHtml(d.target)} &nbsp;|&nbsp; Generated: ${new Date(d.timestamp).toLocaleString()}</div>
<div class="summary">
  <div class="box high">  <div class="num">${d.summary.high}</div>          <div class="lbl">High</div></div>
  <div class="box medium"><div class="num">${d.summary.medium}</div>        <div class="lbl">Medium</div></div>
  <div class="box low">   <div class="num">${d.summary.low}</div>           <div class="lbl">Low</div></div>
  <div class="box info">  <div class="num">${d.summary.informational}</div> <div class="lbl">Info</div></div>
</div>
<table>
  <thead><tr><th>Risk</th><th>Vulnerability</th><th>URL</th><th>Param</th><th>Solution</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `zap-report-${sanitizeFilename(d.target)}-${Date.now()}.html`);
  };

  // ── RESET ─────────────────────────────────────────────────────
  window.resetScanner = function () {
    clearInterval(scanState.pollInterval);
    scanState = {
      phase: 'idle', target: '', contextName: '', spiderScanId: null,
      ascanScanId: null, startTime: null, pollInterval: null, results: null,
      activeEnabled: true
    };
    inputSection.style.display = '';
    scanningPanel.classList.remove('active');
    resultsSection.classList.remove('active');
    targetInput.value = '';
    if (terminal) terminal.innerHTML = '';
    setProgress(0);
  };

  window.rescan = function () {
    clearInterval(scanState.pollInterval);
    scanState.phase = 'idle';
    resultsSection.classList.remove('active');
    inputSection.style.display = '';
  };

  // ── HELPERS ───────────────────────────────────────────────────
  function setProgress(pct) {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    if (progressBar) progressBar.style.width = p + '%';
    if (progressPct) progressPct.textContent = p + '%';
  }

  function logTerminal(msg, color) {
    if (!terminal) return;
    const div = document.createElement('div');
    div.className = 't-line ' + (color || 'gray');
    const ts = new Date().toLocaleTimeString('en-GB');
    div.textContent = `[${ts}] ${msg}`;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
  }

  function updateElapsed() {
    if (!elapsedTime || !scanState.startTime) return;
    const sec = Math.floor((Date.now() - scanState.startTime) / 1000);
    elapsedTime.textContent = String(Math.floor(sec / 60)).padStart(2, '0')
      + ':' + String(sec % 60).padStart(2, '0');
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeFilename(str) {
    return str.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 40);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── BOOT ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Disable scan button initially
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.addEventListener('click', startScan);
    }

    // Keyboard shortcut
    targetInput && targetInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !scanBtn.disabled) startScan();
    });

    // Check ZAP health immediately + every 8s
    checkZap();
    setInterval(checkZap, 8000);
  });

})();
