/**
 * SipN-Ads MCP Server (Manufact-style)
 *
 * Runs TWO servers simultaneously:
 *
 *  1. MCP stdio transport  — Cursor/IDE integration (tool calls, resources)
 *  2. HTTP server :3001    — End-user widget pages served as iframes in Chat.tsx
 *
 * The HTTP server is what makes this "MCP Apps for end-users":
 *   GET /widgets/ad-studio?job_id=...&brand_id=...&api_base=...
 *     → Full self-contained HTML mini-app with:
 *         • OpenAI Sora render progress bar + live status
 *         • HTML5 video player when ready
 *         • Run Critic button → CritiquePanel with score rings
 *         • Apply Fix + Accept & Export buttons
 *
 * Chat.tsx embeds this as an <iframe> per render job — users never leave the chat.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";

const API_BASE = process.env.SIPNADS_API_URL ?? "http://localhost:8000";
const WIDGET_PORT = parseInt(process.env.WIDGET_PORT ?? "3001", 10);

// ============================================================================
// Widget HTML builder — the full end-user MCP App
// ============================================================================

function buildAdStudioWidget(params: {
  jobId: string;
  brandId: string;
  apiBase: string;
}): string {
  const { jobId, brandId, apiBase } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SipN-Ads · Video Studio</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "DM Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    background: #faf9f7; color: #1a1a1a; font-size: 13px; padding: 16px;
    min-height: 100vh;
  }
  .card {
    background: #fff; border: 1px solid #f0ece8; border-radius: 16px;
    overflow: hidden; max-width: 480px; margin: 0 auto;
    box-shadow: 0 2px 16px rgba(0,0,0,0.04);
  }
  .header {
    padding: 12px 16px; display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid #f5f0eb; background: #fefefe;
  }
  .logo {
    width: 28px; height: 28px; border-radius: 8px;
    background: linear-gradient(135deg, #fb923c, #ea580c);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .logo svg { width: 14px; height: 14px; fill: white; }
  .header-title { font-size: 13px; font-weight: 700; color: #1a1a1a; }
  .header-sub { font-size: 10px; color: #aaa; margin-top: 1px; }
  .phase { display: none; }
  .phase.active { display: block; }

  /* === RENDER PHASE === */
  .render-body { padding: 20px 16px; }
  .progress-wrap { margin: 16px 0 8px; }
  .progress-bar {
    height: 6px; background: #f5f0eb; border-radius: 3px; overflow: hidden;
  }
  .progress-fill {
    height: 100%; border-radius: 3px;
    background: linear-gradient(90deg, #fb923c, #ea580c);
    width: 0%; transition: width 0.6s ease;
  }
  .progress-label {
    display: flex; justify-content: space-between;
    margin-top: 6px; font-size: 11px; color: #aaa;
  }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .wan-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 600;
    background: #fff7ed; color: #f97316; border: 1px solid #fed7aa;
    margin-bottom: 12px;
  }
  .prompt-preview {
    background: #fafaf9; border: 1px solid #f0ece8; border-radius: 10px;
    padding: 10px 12px; font-size: 11px; color: #888; line-height: 1.6;
    margin-top: 12px; max-height: 80px; overflow: hidden;
    position: relative;
  }
  .prompt-preview::after {
    content: ''; position: absolute; bottom: 0; inset-x: 0; height: 24px;
    background: linear-gradient(transparent, #fafaf9);
  }

  /* === VIDEO PHASE === */
  .video-body { padding: 0; }
  video { width: 100%; display: block; background: #1a1a1a; }
  .video-controls {
    padding: 12px 16px; display: flex; align-items: center; gap: 8px;
    border-top: 1px solid #f5f0eb; flex-wrap: wrap;
  }
  .res-toggle {
    display: flex; border: 1px solid #f0ece8; border-radius: 8px; overflow: hidden;
  }
  .res-btn {
    padding: 5px 10px; font-size: 10px; font-weight: 600; cursor: pointer;
    background: #fafaf9; color: #aaa; border: none;
    transition: all 0.15s;
  }
  .res-btn.active { background: #f97316; color: #fff; }
  .btn {
    padding: 7px 14px; border-radius: 9px; border: none; cursor: pointer;
    font-size: 11px; font-weight: 600; transition: all 0.15s; display: inline-flex;
    align-items: center; gap: 5px;
  }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: linear-gradient(135deg,#fb923c,#ea580c); color:#fff; }
  .btn-outline { background: #fff; border: 1px solid #e5e5e5; color: #555; }
  .btn-green  { background: #22c55e; color: #fff; }
  .btn-sm { padding: 5px 10px; font-size: 10px; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .dl-link { margin-left: auto; }

  /* === CRITIC PHASE === */
  .critic-body { padding: 14px 16px; }
  .score-card {
    border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
    border: 1px solid transparent;
  }
  .score-card.green  { background: #f0fdf4; border-color: #86efac44; }
  .score-card.amber  { background: #fffbeb; border-color: #fcd34d44; }
  .score-card.red    { background: #fef2f2; border-color: #fca5a544; }
  .score-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
  .score-label { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 5px; }
  .score-num { font-size: 20px; font-weight: 800; }
  .score-num.green { color: #22c55e; }
  .score-num.amber { color: #f59e0b; }
  .score-num.red   { color: #ef4444; }
  .score-sub { font-size: 10px; color: #aaa; margin-bottom: 6px; }
  .suggestion { font-size: 11px; color: #666; line-height: 1.5; margin-bottom: 8px; }
  .fixed-tag { font-size: 10px; color: #22c55e; font-weight: 600; }
  .overall-bar {
    background: #f5f0eb; border-radius: 10px; padding: 10px 14px;
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .overall-label { font-size: 11px; color: #888; }
  .overall-text { font-size: 12px; font-weight: 600; color: #1a1a1a; }
  .export-btn {
    width: 100%; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700;
    border: none; cursor: pointer; transition: all 0.15s;
    background: linear-gradient(135deg,#fb923c,#ea580c); color: #fff;
  }
  .export-btn:disabled { background: #f5f0eb; color: #ccc; cursor: not-allowed; }
  .export-btn:active:not(:disabled) { transform: scale(0.98); }

  /* === TOAST === */
  .toast {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(40px);
    background: #1a1a1a; color: #fff; padding: 8px 16px; border-radius: 20px;
    font-size: 11px; font-weight: 600; transition: transform 0.3s;
    pointer-events: none; white-space: nowrap;
  }
  .toast.show { transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>

<div class="card">
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
    <div>
      <div class="header-title" id="header-title">Video Studio</div>
      <div class="header-sub" id="header-sub">Powered by OpenAI Sora · Manufact MCP Apps</div>
    </div>
  </div>

  <!-- RENDER PHASE -->
  <div class="phase active" id="phase-render">
    <div class="render-body">
      <div class="wan-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        OpenAI Sora · Text-to-Video
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="fill"></div></div>
        <div class="progress-label">
          <span class="pulse" id="status-text">Initialising...</span>
          <span id="pct-text">0%</span>
        </div>
      </div>
      <div class="prompt-preview" id="prompt-box">Loading video prompt...</div>
    </div>
  </div>

  <!-- VIDEO PHASE -->
  <div class="phase" id="phase-video">
    <div class="video-body">
      <video id="vid" controls playsinline></video>
    </div>
    <div class="video-controls">
      <div class="res-toggle">
        <button class="res-btn active" id="btn-916" onclick="setRes('9:16')">9:16</button>
        <button class="res-btn" id="btn-169" onclick="setRes('16:9')">16:9</button>
      </div>
      <button class="btn btn-primary" onclick="goToCritic()">Run AI Critic →</button>
      <button class="btn btn-outline dl-link" onclick="dlVideo()">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Download
      </button>
    </div>
  </div>

  <!-- CRITIC PHASE -->
  <div class="phase" id="phase-critic">
    <div class="critic-body">
      <div class="overall-bar" id="overall-bar">
        <span class="overall-label">Overall</span>
        <span class="overall-text" id="overall-text">Evaluating...</span>
      </div>
      <div id="score-cards"></div>
      <button class="export-btn" id="export-btn" disabled onclick="exportAd()">
        Evaluating...
      </button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const JOB_ID   = ${JSON.stringify(jobId)};
const BRAND_ID = ${JSON.stringify(brandId)};
const API      = ${JSON.stringify(apiBase)};

let videoUrl = '';
let pollTimer = null;
let criticData = null;
const fixed = new Set();

// ── Render polling ──────────────────────────────────────────────────────────
async function pollRender() {
  try {
    const r = await fetch(\`\${API}/render/status/\${JOB_ID}\`);
    const d = await r.json();

    // Show the Sora prompt in the preview box
    if (d.video_prompt && document.getElementById('prompt-box').textContent === 'Loading video prompt...') {
      document.getElementById('prompt-box').textContent = d.video_prompt;
    }

    const pct = d.progress || 0;
    document.getElementById('fill').style.width = pct + '%';
    document.getElementById('pct-text').textContent = pct + '%';
    document.getElementById('status-text').textContent = d.status_text || d.status;

    if (d.status === 'done' && d.video_url) {
      videoUrl = d.video_url;
      showVideo(d.video_url);
      return;
    }
    if (d.status === 'error') {
      document.getElementById('status-text').textContent = '✗ ' + (d.error || 'Generation failed');
      document.getElementById('status-text').style.color = '#ef4444';
      return;
    }
  } catch(e) { /* keep polling */ }
  pollTimer = setTimeout(pollRender, 3000);
}

function showVideo(url) {
  clearTimeout(pollTimer);
  document.getElementById('phase-render').classList.remove('active');
  document.getElementById('phase-video').classList.add('active');
  document.getElementById('vid').src = url;
  document.getElementById('header-sub').textContent = 'Video ready · Run critic to evaluate';
}

function setRes(r) {
  document.getElementById('btn-916').classList.toggle('active', r === '9:16');
  document.getElementById('btn-169').classList.toggle('active', r === '16:9');
}

function dlVideo() {
  const a = document.createElement('a');
  a.href = videoUrl; a.download = 'sipnads-ad-' + JOB_ID + '.mp4';
  a.click();
}

// ── Critic ──────────────────────────────────────────────────────────────────
async function goToCritic() {
  document.getElementById('phase-video').classList.remove('active');
  document.getElementById('phase-critic').classList.add('active');
  document.getElementById('header-sub').textContent = 'Running AI evaluation...';
  try {
    const r = await fetch(\`\${API}/critic/evaluate\`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({brand_id: BRAND_ID, job_id: JOB_ID})
    });
    criticData = await r.json();
    renderCritic(criticData);
  } catch(e) {
    document.getElementById('overall-text').textContent = 'Evaluation failed';
  }
}

function scoreClass(s) { return s >= 8 ? 'green' : s >= 5 ? 'amber' : 'red'; }

function renderCritic(data) {
  const { scores, verdicts, suggestions, overall } = data;
  document.getElementById('overall-text').textContent = overall;
  document.getElementById('header-sub').textContent = 'Critique complete';

  const labels = {
    cta_clarity: 'CTA Clarity',
    hook_strength: 'Hook Strength',
    brand_compliance: 'Brand Compliance'
  };
  const descs = {
    cta_clarity: 'Is the call-to-action clear and prominent?',
    hook_strength: 'Does the opening 3 seconds stop scrolling?',
    brand_compliance: 'Follows brand rules and platform policies?'
  };
  const icons = {
    cta_clarity: '🎯', hook_strength: '⚡', brand_compliance: '✅'
  };

  let html = '';
  for (const key of ['cta_clarity','hook_strength','brand_compliance']) {
    const s = scores[key], cls = scoreClass(s), v = verdicts[key];
    const isFixed = fixed.has(key);
    html += \`
      <div class="score-card \${cls}" id="card-\${key}">
        <div class="score-row">
          <div class="score-label">\${icons[key]} \${labels[key]}</div>
          <div class="score-num \${cls}">\${s}<span style="font-size:11px;color:#aaa;font-weight:400">/10</span></div>
        </div>
        <div class="score-sub">\${descs[key]}</div>
        <div class="suggestion">\${suggestions[key]}</div>
        \${isFixed
          ? '<span class="fixed-tag">✓ Fix applied — re-evaluate to confirm</span>'
          : v === 'fix'
            ? \`<button class="btn btn-sm" style="background:\${cls==='red'?'#ef4444':cls==='amber'?'#f59e0b':'#22c55e'};color:#fff" onclick="applyFix('\${key}')">Apply AI Fix</button>\`
            : '<span style="font-size:10px;color:#22c55e;font-weight:600">✓ Accepted</span>'
        }
      </div>\`;
  }
  document.getElementById('score-cards').innerHTML = html;

  const allPass = Object.values(verdicts).every(v => v === 'accept');
  const btn = document.getElementById('export-btn');
  btn.disabled = !allPass;
  btn.textContent = allPass ? '✓ Accept & Export' : 'Fix all issues to export';
  if (allPass) btn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
}

async function applyFix(key) {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Applying...';
  try {
    await fetch(\`\${API}/critic/fix\`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({brand_id: BRAND_ID, job_id: JOB_ID, fix_type: key})
    });
    fixed.add(key);
    showToast('Fix applied — re-run critic to see updated scores');
    // Re-render critic section with fixed tag
    renderCritic(criticData);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Retry';
    showToast('Fix failed, please try again');
  }
}

async function exportAd() {
  document.getElementById('export-btn').textContent = 'Exporting...';
  try {
    const r = await fetch(\`\${API}/render/download/\${JOB_ID}\`);
    const d = await r.json();
    if (d.url) { window.open(d.url, '_blank'); }
    showToast('🎬 Export ready!');
    // Log to learner
    if (criticData) {
      fetch(\`\${API}/learner/log-export\`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          brand_id: BRAND_ID, job_id: JOB_ID, variant_id: '',
          critique_scores: criticData.scores, fixes_applied: [...fixed],
        })
      }).catch(() => {});
    }
  } catch(e) { showToast('Export failed'); }
  document.getElementById('export-btn').textContent = '✓ Accept & Export';
}

// ── Toast helper ─────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Start ────────────────────────────────────────────────────────────────────
pollRender();
</script>
</body>
</html>`;
}

// ============================================================================
// MCP Server (stdio — for Cursor/IDE)
// ============================================================================

const mcpServer = new McpServer({ name: "sipnads", version: "1.0.0" });

async function apiFetch(path: string, opts: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...((opts.headers as Record<string, string>) ?? {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

mcpServer.tool("list_brands", "List all saved brand profiles", {}, async () => {
  const data = await apiFetch("/brand/list") as { brands: unknown[] };
  return { content: [{ type: "text", text: JSON.stringify(data.brands, null, 2) }] };
});

mcpServer.tool(
  "generate_story_plan",
  "Generate ad story variants for a brand",
  { brand_id: z.string(), message: z.string() },
  async ({ brand_id, message }) => {
    const data = await apiFetch("/chat/message", {
      method: "POST",
      body: JSON.stringify({ brand_id, message }),
    }) as { story_plan?: unknown };
    return { content: [{ type: "text", text: JSON.stringify(data.story_plan ?? data, null, 2) }] };
  }
);

mcpServer.tool(
  "start_pipeline",
  "Start the full pipeline (asset match + OpenAI Sora video gen) for a selected variant. Returns widget URL for embedding.",
  {
    brand_id: z.string(),
    variant_id: z.string(),
    hook: z.string().optional(),
    cta: z.string().optional(),
    scenes: z.array(z.record(z.unknown())).optional(),
    resolution: z.enum(["9:16", "16:9"]).default("9:16"),
  },
  async ({ brand_id, variant_id, hook, cta, scenes, resolution }) => {
    const data = await apiFetch("/pipeline/run", {
      method: "POST",
      body: JSON.stringify({ brand_id, variant_id, hook: hook ?? "", cta: cta ?? "", scenes: scenes ?? [], resolution }),
    }) as { job_id: string };

    const widgetUrl = `http://localhost:${WIDGET_PORT}/widgets/ad-studio?job_id=${data.job_id}&brand_id=${brand_id}&api_base=${API_BASE}`;

    return {
      content: [
        { type: "text", text: `Pipeline started. job_id: ${data.job_id}\nWidget URL: ${widgetUrl}` },
        {
          type: "resource",
          resource: {
            uri: `sipnads://studio/${data.job_id}`,
            mimeType: "text/uri-list",
            text: widgetUrl,
          },
        },
      ],
    };
  }
);

// ============================================================================
// HTTP Widget Server (port 3001 — for end-user Chat.tsx iframes)
// ============================================================================

function parseQuery(url: string): Record<string, string> {
  const u = new URL(url, `http://localhost:${WIDGET_PORT}`);
  const params: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { params[k] = v; });
  return params;
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";

  // CORS — allow Chat.tsx (localhost:8080) to embed widgets
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  if (url.startsWith("/widgets/ad-studio")) {
    const p = parseQuery(url);
    const jobId   = p.job_id   ?? "";
    const brandId = p.brand_id ?? "";
    const apiBase = p.api_base ?? API_BASE;

    if (!jobId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing job_id");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(buildAdStudioWidget({ jobId, brandId, apiBase }));
    return;
  }

  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", widget_port: WIDGET_PORT }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

httpServer.listen(WIDGET_PORT, () => {
  // Using stderr so MCP stdio transport isn't polluted
  process.stderr.write(`[sipnads-mcp] Widget server → http://localhost:${WIDGET_PORT}/widgets/ad-studio\n`);
});

// ============================================================================
// Boot MCP stdio transport
// ============================================================================

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
