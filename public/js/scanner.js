// server/routes/scanner.js — NexusGuard ZAP integration
// Mounts at /api/scanner on the main Express app

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

// ── CONFIG ────────────────────────────────────────────────────────────────
const ZAP_HOST = process.env.ZAP_HOST || 'http://localhost:8080';
const ZAP_API_KEY = process.env.ZAP_API_KEY || '';

// ZAP request helper — wraps every call with key + timeout
async function zap(endpoint, params = {}) {
  // Dynamic import of node-fetch compatible with CJS
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

  const url = new URL(`${ZAP_HOST}/JSON/${endpoint}`);
  url.searchParams.set('apikey', ZAP_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`ZAP HTTP ${res.status} on ${endpoint}`);
  return res.json();
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
// GET /api/scanner/health
// Used by the frontend to check ZAP connectivity on load
router.get('/health', async (req, res) => {
  try {
    const data = await zap('core/view/version');
    res.json({ status: 'connected', version: data.version });
  } catch (e) {
    res.status(503).json({ status: 'disconnected', error: e.message });
  }
});

// ── START SCAN ─────────────────────────────────────────────────────────────
// POST /api/scanner/scan
// Body: { target: "https://example.com", spider: true, active: true, ajax: false }
// Protected — requires admin JWT so only you can trigger scans
router.post('/scan', requireAuth, async (req, res) => {
  const { target, spider = true, active = true } = req.body;

  if (!target) return res.status(400).json({ error: 'target is required' });

  // Basic URL validation
  try { new URL(target); } catch {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  // Block scanning of obviously external/dangerous targets
  const hostname = new URL(target).hostname;
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (!process.env.ALLOW_INTERNAL_SCAN && blocked.includes(hostname)) {
    return res.status(403).json({ error: 'Cannot scan localhost from this endpoint' });
  }

  try {
    // Create isolated context
    const ctxName = `scan_${Date.now()}`;
    await zap('context/action/newContext', { contextName: ctxName });
    await zap('context/action/includeInContext', {
      contextName: ctxName,
      regex: `.*${hostname.replace(/\./g, '\\.')}.*`
    });

    let spiderScanId = null;

    if (spider) {
      const spiderRes = await zap('spider/action/scan', {
        url: target,
        maxChildren: 10,
        recurse: true,
        contextName: ctxName
      });
      spiderScanId = spiderRes.scan;
    }

    res.json({
      message: 'Scan started',
      target,
      contextName: ctxName,
      spiderScanId,
      activeEnabled: active
    });

  } catch (e) {
    console.error('[Scanner] Start scan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POLL SPIDER STATUS ─────────────────────────────────────────────────────
// GET /api/scanner/spider/:scanId
router.get('/spider/:scanId', requireAuth, async (req, res) => {
  try {
    const data = await zap('spider/view/status', { scanId: req.params.scanId });
    res.json({ progress: parseInt(data.status, 10) || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── START ACTIVE SCAN ─────────────────────────────────────────────────────
// POST /api/scanner/ascan
// Body: { target, contextName }
router.post('/ascan', requireAuth, async (req, res) => {
  const { target, contextName } = req.body;
  if (!target) return res.status(400).json({ error: 'target required' });
  try {
    const data = await zap('ascan/action/scan', {
      url: target,
      recurse: true,
      inScopeOnly: true,
      contextName: contextName || ''
    });
    res.json({ scanId: data.scan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POLL ACTIVE SCAN STATUS ────────────────────────────────────────────────
// GET /api/scanner/ascan/:scanId
router.get('/ascan/:scanId', requireAuth, async (req, res) => {
  try {
    const data = await zap('ascan/view/status', { scanId: req.params.scanId });
    res.json({ progress: parseInt(data.status, 10) || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET RESULTS ────────────────────────────────────────────────────────────
// GET /api/scanner/results?target=https://example.com&contextName=scan_xxx
router.get('/results', requireAuth, async (req, res) => {
  const { target, contextName } = req.query;
  if (!target) return res.status(400).json({ error: 'target required' });

  try {
    const alertsData = await zap('core/view/alerts', { baseurl: target });
    const alerts = alertsData.alerts || [];

    // Clean up context
    if (contextName) {
      await zap('context/action/deleteContext', { contextName }).catch(() => {});
    }

    const vulnerabilities = alerts.map(a => ({
      id: a.pluginId,
      name: a.name,
      risk: a.risk,
      riskCode: parseInt(a.riskcode, 10),
      confidence: a.confidence,
      url: a.uri,
      param: a.param || '',
      attack: a.attack || '',
      evidence: a.evidence || '',
      description: a.description || '',
      solution: a.solution || '',
      reference: a.reference || '',
      cweId: a.cweid || '',
      wascId: a.wascid || ''
    }));

    const summary = {
      high:          vulnerabilities.filter(v => v.riskCode === 3).length,
      medium:        vulnerabilities.filter(v => v.riskCode === 2).length,
      low:           vulnerabilities.filter(v => v.riskCode === 1).length,
      informational: vulnerabilities.filter(v => v.riskCode === 0).length,
      total:         vulnerabilities.length
    };

    res.json({ target, summary, vulnerabilities, timestamp: new Date().toISOString() });

  } catch (e) {
    console.error('[Scanner] Results error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
