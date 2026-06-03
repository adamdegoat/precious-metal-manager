'use strict';

const BASE        = './data/';
const REFRESH_MS  = 5 * 60 * 1000; // re-fetch every 5 minutes
let   activeTab   = 'GOLD';

// ── Helpers ──────────────────────────────────────────────────

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPrice(n, d = 2) {
  if (n == null) return '—';
  return '$' + fmt(n, d);
}

function timeAgo(isoStr) {
  if (!isoStr) return 'Unknown';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function verdictClass(v) { return `verdict-${v}`; }

function tagClass(val) {
  if (!val) return 'tag-neutral';
  const v = val.toLowerCase();
  if (v === 'bullish')    return 'tag-bullish';
  if (v === 'bearish')    return 'tag-bearish';
  if (v === 'mixed')      return 'tag-mixed';
  if (v === 'overbought') return 'tag-overbought';
  if (v === 'oversold')   return 'tag-oversold';
  if (v === 'elevated')   return 'tag-elevated';
  if (v === 'weak')       return 'tag-weak';
  return 'tag-neutral';
}

function trendArrow(trend) {
  if (!trend) return '—';
  if (trend === 'rising')  return '↑';
  if (trend === 'falling') return '↓';
  return '→';
}

function trendClass(trend, inverse = false) {
  // For DXY: rising = bad for metals (use red), falling = good (use green)
  const map = inverse
    ? { rising: 'trend-rising', falling: 'trend-falling', flat: 'trend-flat' }
    : { rising: 'trend-falling', falling: 'trend-rising', flat: 'trend-flat' }; // note: swapped for non-inverse
  return map[trend] || 'trend-flat';
}

function bbPctBar(pct) {
  if (pct == null) return '—';
  const p = Math.round(pct * 100);
  const color = p > 75 ? '#ff4f6a' : p < 25 ? '#00d4aa' : '#f5c842';
  return `<div style="display:flex;align-items:center;gap:8px;">
    <div style="flex:1;height:4px;background:#1e2e30;border-radius:2px;">
      <div style="width:${p}%;height:4px;background:${color};border-radius:2px;"></div>
    </div>
    <span style="font-size:11px;color:#7a9098;">${p}%</span>
  </div>`;
}

async function fetchJSON(path) {
  const r = await fetch(path + '?t=' + Date.now());
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// ── Regime color mapping ──────────────────────────────────────

function regimeStyle(label) {
  if (!label) return { bg: '#1e2e30', color: '#7a9098' };
  const l = label.toUpperCase();
  if (l.includes('CRISIS'))       return { bg: 'rgba(255,79,106,0.15)', color: '#ff4f6a' };
  if (l.includes('STAGFLATION'))  return { bg: 'rgba(255,140,66,0.15)', color: '#ff8c42' };
  if (l.includes('REFLATION'))    return { bg: 'rgba(0,212,170,0.12)',  color: '#00d4aa' };
  if (l.includes('DOLLAR DECLINE')) return { bg: 'rgba(0,212,170,0.10)', color: '#00d4aa' };
  if (l.includes('STRONG DOLLAR')) return { bg: 'rgba(255,79,106,0.12)', color: '#ff4f6a' };
  if (l.includes('RISK-ON'))      return { bg: 'rgba(74,158,255,0.10)', color: '#4a9eff' };
  return { bg: 'rgba(245,200,66,0.10)', color: '#f5c842' };
}

function biasBadge(bias) {
  if (!bias) return '';
  const b = bias.toLowerCase();
  let cls = 'tag-neutral';
  if (b.includes('strongly bullish')) cls = 'tag-bullish';
  else if (b.includes('bullish'))     cls = 'tag-bullish';
  else if (b.includes('bearish'))     cls = 'tag-bearish';
  else if (b.includes('mixed'))       cls = 'tag-mixed';
  return `<span class="tag ${cls}">${bias}</span>`;
}

// ── Render macro panel ────────────────────────────────────────

function renderMacro(macro) {
  if (!macro) return;

  const regime = macro.regime || {};
  const rs     = regimeStyle(regime.label);
  const el     = document.getElementById('regime-banner');
  if (el) {
    el.style.background = rs.bg;
    el.innerHTML = `
      <div>
        <div class="regime-label" style="color:${rs.color}">${regime.label || 'NEUTRAL'}</div>
        <div class="regime-desc">${regime.desc || ''}</div>
      </div>
      <div class="regime-bias">
        <span style="font-size:11px;color:#7a9098;margin-right:4px;">Gold:</span>
        ${biasBadge(regime.gold_bias)}
        <span style="font-size:11px;color:#7a9098;margin-right:4px;margin-left:8px;">Silver:</span>
        ${biasBadge(regime.silver_bias)}
      </div>
    `;
  }

  // DXY (inverse for metals: falling = good = green)
  const dxyEl = document.getElementById('macro-dxy');
  if (dxyEl && macro.dxy != null) {
    const cls = macro.dxy_trend === 'falling' ? 'trend-falling'
              : macro.dxy_trend === 'rising'  ? 'trend-rising' : 'trend-flat';
    const arrow = trendArrow(macro.dxy_trend);
    dxyEl.innerHTML = `
      <div class="macro-label">US Dollar (DXY)</div>
      <div class="macro-value ${cls}">${fmt(macro.dxy, 2)} <small style="font-size:14px">${arrow}</small></div>
      <div class="macro-sub">${macro.dxy_10d_chg >= 0 ? '+' : ''}${fmt(macro.dxy_10d_chg, 2)}% 10-day · <em>inverse driver</em></div>
    `;
  }

  // TNX
  const tnxEl = document.getElementById('macro-tnx');
  if (tnxEl && macro.tnx != null) {
    const yieldColor = macro.tnx > 4.0 ? '#ff4f6a' : macro.tnx < 2.5 ? '#00d4aa' : '#f5c842';
    const yieldLabel = macro.tnx > 4.5 ? 'High — headwind' : macro.tnx < 2.5 ? 'Low — tailwind' : 'Moderate';
    tnxEl.innerHTML = `
      <div class="macro-label">10Y Yield (TNX)</div>
      <div class="macro-value" style="color:${yieldColor}">${fmt(macro.tnx, 2)}%</div>
      <div class="macro-sub">${yieldLabel}</div>
    `;
  }

  // TLT
  const tltEl = document.getElementById('macro-tlt');
  if (tltEl && macro.tlt != null) {
    const tltCls = macro.tlt_trend === 'rising' ? 'trend-falling'
                 : macro.tlt_trend === 'falling' ? 'trend-rising' : 'trend-flat';
    tltEl.innerHTML = `
      <div class="macro-label">Long Bond (TLT)</div>
      <div class="macro-value ${tltCls}">${fmtPrice(macro.tlt)} <small style="font-size:14px">${trendArrow(macro.tlt_trend)}</small></div>
      <div class="macro-sub">${macro.tlt_10d_chg >= 0 ? '+' : ''}${fmt(macro.tlt_10d_chg, 2)}% 10-day</div>
    `;
  }

  // VIX
  const vixEl = document.getElementById('macro-vix');
  if (vixEl && macro.vix != null) {
    const vixColor = macro.vix > 30 ? '#ff4f6a' : macro.vix > 20 ? '#ff8c42' : '#7a9098';
    const vixLabel = macro.vix > 30 ? 'Extreme fear' : macro.vix > 20 ? 'Elevated fear' : macro.vix < 14 ? 'Complacent' : 'Normal';
    vixEl.innerHTML = `
      <div class="macro-label">VIX (Fear Gauge)</div>
      <div class="macro-value" style="color:${vixColor}">${fmt(macro.vix, 1)}</div>
      <div class="macro-sub">${vixLabel} · ${macro.vix > 20 ? 'safe-haven bid' : 'low safe-haven demand'}</div>
    `;
  }

  // Gold/Silver Ratio
  const gsEl = document.getElementById('macro-gs');
  if (gsEl && macro.gs_ratio != null) {
    const gsColor = macro.gs_ratio > 85 ? '#f5c842' : macro.gs_ratio < 70 ? '#c0cdd4' : '#7a9098';
    const gsLabel = macro.gs_ratio > 85 ? 'Gold favored' : macro.gs_ratio < 70 ? 'Silver outperforming' : 'Balanced';
    gsEl.innerHTML = `
      <div class="macro-label">Gold / Silver Ratio</div>
      <div class="macro-value" style="color:${gsColor}">${fmt(macro.gs_ratio, 1)}</div>
      <div class="macro-sub">${gsLabel} · spot: $${fmt(macro.gold_spot, 0)} / $${fmt(macro.silver_spot, 2)}</div>
    `;
  }
}

// ── Render metal card ─────────────────────────────────────────

function renderMetalCard(d) {
  if (!d) return;
  const key        = d.metal;
  const cardId     = `card-${key}`;
  const el         = document.getElementById(cardId);
  if (!el) return;

  const iconClass  = key === 'GOLD' ? 'gold-icon' : key === 'SILVER' ? 'silver-icon' : 'miners-icon';
  const cardClass  = key === 'GOLD' ? 'gold-card' : key === 'SILVER' ? 'silver-card' : 'miners-card';
  const changeDir  = d.change_24h >= 0 ? 'up' : 'down';
  const changeTxt  = (d.change_24h >= 0 ? '+' : '') + fmt(d.change_24h) + '%';

  el.className = `metal-card ${cardClass}`;

  const m = d.moomoo || {};
  const actionItems = [];
  if (m.action) actionItems.push({ ok: m.verdict !== 'AVOID', text: m.action });
  if (m.note)   actionItems.push({ ok: true,  text: m.note });
  if (m.avoid)  actionItems.push({ ok: false, text: m.avoid });

  const sup = (d.levels?.support    || []).map(p => `<span class="level-item level-support">${fmtPrice(p)}</span>`).join('');
  const res = (d.levels?.resistance || []).map(p => `<span class="level-item level-resistance">${fmtPrice(p)}</span>`).join('');

  el.innerHTML = `
    <div class="card-header">
      <div class="asset-title">
        <div class="asset-icon ${iconClass}">${d.icon || '◈'}</div>
        <div>
          <div class="asset-name">${d.label}</div>
          <div class="asset-etf">Moomoo: ${d.etf} &nbsp;·&nbsp; score: ${fmt(d.score, 1)}</div>
        </div>
      </div>
      <span class="verdict-badge ${verdictClass(d.verdict)}">${d.verdict}</span>
    </div>

    <div class="price-row">
      <span class="price-value">${fmtPrice(d.price)}</span>
      <span class="price-change ${changeDir}">${changeTxt}</span>
    </div>
    <div class="price-sub">24-hour change (${d.etf})</div>

    <hr class="card-divider" />
    <p class="summary-text">${d.summary || ''}</p>

    <div class="moomoo-block">
      <div class="moomoo-title">Action for Moomoo (${d.etf})</div>
      ${actionItems.map(a => `
        <div class="moomoo-item">
          <span class="moomoo-icon ${a.ok ? 'ok' : 'warn'}">${a.ok ? '✓' : '✕'}</span>
          <span>${a.text}</span>
        </div>
      `).join('')}
    </div>

    ${(sup || res) ? `
    <div class="levels-row">
      ${sup ? `<span style="font-size:10px;color:#4a6068;text-transform:uppercase;letter-spacing:.5px;align-self:center">Support</span>${sup}` : ''}
      ${res ? `<span style="font-size:10px;color:#4a6068;text-transform:uppercase;letter-spacing:.5px;align-self:center;margin-left:8px;">Resist</span>${res}` : ''}
    </div>` : ''}
  `;
}

// ── Render signal breakdown ───────────────────────────────────

function renderSignals(payloads) {
  const tabs    = document.getElementById('signal-tabs');
  const content = document.getElementById('signal-content');
  if (!tabs || !content || !payloads) return;

  const keys   = Object.keys(payloads);
  const labels = { GOLD: 'Gold (GLD)', SILVER: 'Silver (SLV)', MINERS: 'Miners (GDX)' };

  tabs.innerHTML = keys.map(k => `
    <button class="signal-tab ${k === activeTab ? 'active' : ''}" onclick="switchTab('${k}')">${labels[k] || k}</button>
  `).join('');

  content.innerHTML = keys.map(k => {
    const d  = payloads[k];
    const tfs = d.tf_table || [];
    return `
      <div id="tab-${k}" class="signal-content ${k === activeTab ? 'active' : ''}">
        <table class="tf-table">
          <thead>
            <tr>
              <th>Timeframe</th>
              <th>EMA Stack</th>
              <th>RSI</th>
              <th>MACD</th>
              <th>Volume</th>
              <th>BB %B</th>
            </tr>
          </thead>
          <tbody>
            ${tfs.map(row => `
              <tr>
                <td><span class="tf-badge">${{ daily: 'Daily', '4h': '4 Hour', '1h': '1 Hour' }[row.tf] || row.tf}</span></td>
                <td><span class="tag ${tagClass(row.ema_stack)}">${row.ema_stack}</span></td>
                <td>
                  <span class="tag ${tagClass(row.rsi_label)}">${fmt(row.rsi, 0)}</span>
                  <span style="font-size:10px;color:#7a9098;margin-left:4px;">${row.rsi_label}</span>
                </td>
                <td><span class="tag ${tagClass(row.macd)}">${row.macd}</span></td>
                <td><span class="tag ${tagClass(row.volume)}">${row.volume}</span></td>
                <td>${bbPctBar(row.bb_pct)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

function switchTab(key) {
  activeTab = key;
  document.querySelectorAll('.signal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.signal-content').forEach(c => c.classList.remove('active'));
  const tab = document.querySelector(`.signal-tab[onclick="switchTab('${key}')"]`);
  if (tab) tab.classList.add('active');
  const panel = document.getElementById(`tab-${key}`);
  if (panel) panel.classList.add('active');
}

// ── Render L9 panel ───────────────────────────────────────────

function renderL9(l9) {
  const el = document.getElementById('l9-grid');
  if (!el || !l9) return;

  const p = l9.portfolio || {};
  const roiColor = (p.roi_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const roiSign  = (p.roi_pct || 0) >= 0 ? '+' : '';

  const familyBadge = s => {
    const colors = {
      macro_regime_shift:   '#f5c842',
      dxy_reversal:         '#4a9eff',
      rsi_oversold_bounce:  '#00d4aa',
      vix_spike_recovery:   '#ff8c42',
      gs_ratio_trade:       '#c0cdd4',
      momentum_continuation:'#a78bfa',
      yield_compression:    '#34d399',
    };
    const color = colors[s.family] || '#7a9098';
    return `<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:${color}22;color:${color};font-weight:600;">${s.family.replace(/_/g,' ')}</span>`;
  };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:var(--gold)">${l9.active_count}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Active</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:var(--green)">${l9.promoted_count}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Promoted</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:var(--text-dim)">${l9.retired_count}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Retired</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:var(--text-dim)">${l9.rejected_count}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Rejected</div>
      </div>
    </div>

    ${(l9.active_strategies || []).length > 0 ? `
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:10px;">Active Strategies</div>
      ${l9.active_strategies.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${s.name}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${s.asset} · promoted ${s.promoted_at || s.created_at || '—'}</div>
          </div>
          ${familyBadge(s)}
          <span class="verdict-badge verdict-${s.status === 'promoted' ? 'ACCUMULATE' : 'HOLD'}" style="font-size:10px;padding:3px 9px;">${s.status.toUpperCase()}</span>
        </div>
      `).join('')}
    </div>` : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No active strategies yet — L9 invention cycle runs weekly.</div>'}
  `;
}

// ── Render paper portfolio ────────────────────────────────────

function renderPortfolio(l9) {
  const el = document.getElementById('portfolio-grid');
  if (!el || !l9) return;

  const p = l9.portfolio || {};
  const roiColor = (p.roi_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const roiSign  = (p.roi_pct || 0) >= 0 ? '+' : '';
  const wrColor  = (p.win_rate || 0) >= 0.5 ? 'var(--green)' : 'var(--red)';

  const openPos = p.open_positions || [];
  const recentT = p.recent_trades || [];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:var(--gold)">$${fmt(p.equity, 0)}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Equity</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${roiColor}">${roiSign}${fmt(p.roi_pct, 2)}%</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">ROI vs $10k</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${wrColor}">${p.win_rate != null ? (p.win_rate*100).toFixed(0)+'%' : '—'}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Win Rate</div>
      </div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:var(--text)">${p.total_trades || 0}</div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px">Closed Trades</div>
      </div>
    </div>

    ${openPos.length > 0 ? `
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:10px;">Open Positions</div>
      ${openPos.map(t => {
        const pnlColor = (t.unrealised_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)';
        const pnlSign  = (t.unrealised_pct || 0) >= 0 ? '+' : '';
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-card-2);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${t.strategy_name}</div>
            <div style="font-size:11px;color:var(--text-dim);">${t.etf} · entered ${t.entry_date} @ $${fmt(t.entry_price, 2)} · ${t.days_held}d</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;color:${pnlColor}">${pnlSign}${fmt(t.unrealised_pct, 2)}%</div>
            <div style="font-size:11px;color:var(--text-muted)">unrealised</div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${recentT.length > 0 ? `
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:10px;">Recent Trades</div>
      <table class="tf-table">
        <thead><tr><th>Strategy</th><th>ETF</th><th>Entry</th><th>Exit</th><th>Days</th><th>P&L</th></tr></thead>
        <tbody>
          ${[...recentT].reverse().map(t => {
            const pnlColor = (t.pnl_dollar || 0) >= 0 ? 'var(--green)' : 'var(--red)';
            const pnlSign  = (t.pnl_dollar || 0) >= 0 ? '+' : '';
            return `<tr>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.strategy_name}</td>
              <td>${t.etf || '—'}</td>
              <td>$${fmt(t.entry_price, 2)}</td>
              <td>$${fmt(t.exit_price, 2)}</td>
              <td>${t.days_held}</td>
              <td style="color:${pnlColor};font-weight:600">${pnlSign}$${fmt(Math.abs(t.pnl_dollar), 2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No closed trades yet — paper trades open when strategies trigger entry conditions.</div>'}
  `;
}

// ── Main load ─────────────────────────────────────────────────

async function loadAll() {
  try {
    const [meta, macro, gold, silver, miners, l9] = await Promise.all([
      fetchJSON(BASE + 'meta.json'),
      fetchJSON(BASE + 'macro.json'),
      fetchJSON(BASE + 'gold.json').catch(() => null),
      fetchJSON(BASE + 'silver.json').catch(() => null),
      fetchJSON(BASE + 'miners.json').catch(() => null),
      fetchJSON(BASE + 'l9.json').catch(() => null),
    ]);

    // Status bar
    if (meta) {
      const ts = new Date(meta.last_updated);
      document.getElementById('status-ts-main').textContent =
        ts.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour12: false,
          year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) + ' SGT';
      document.getElementById('status-ts-sub').textContent  = timeAgo(meta.last_updated);
      document.getElementById('status-cycles').textContent  = meta.cycles_today || '—';
      document.getElementById('update-text').textContent    = timeAgo(meta.last_updated);
    }

    // Macro
    renderMacro(macro);

    // Metal cards
    const payloads = {};
    if (gold)   { renderMetalCard(gold);   payloads['GOLD']   = gold; }
    if (silver) { renderMetalCard(silver); payloads['SILVER'] = silver; }
    if (miners) { renderMetalCard(miners); payloads['MINERS'] = miners; }

    // Signal breakdown
    renderSignals(payloads);

    // L9 + portfolio
    if (l9) {
      renderL9(l9);
      renderPortfolio(l9);
    }

    // L9 schedule row
    if (meta && meta.last_l9_run) {
      const el = document.getElementById('sched-l9-last');
      if (el) el.textContent = timeAgo(meta.last_l9_run);
    }

  } catch (e) {
    console.error('Load failed:', e);
    document.getElementById('update-text').textContent = 'Error loading data';
  }
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setInterval(loadAll, REFRESH_MS);
});
