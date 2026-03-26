console.log('[VitaBloom] v6 loaded', location.href);

const API = 'http://localhost:8765';

// Route GET through background worker to avoid https->http mixed content block
function apiFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'API_FETCH', url }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'API error'));
      }
    });
  });
}

// Route POST through background worker (same mixed-content reason)
function apiPost(url, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'API_POST', url, body }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'API error'));
      }
    });
  });
}

// Extract email from open Gmail thread
function getThreadEmail() {
  const froms = document.querySelectorAll('[email]');
  for (const el of froms) {
    const email = el.getAttribute('email');
    if (email && !email.includes('nous.co') && !email.includes('vitabloom')) {
      return email;
    }
  }
  return null;
}

// Build the body-preview + keyword badges section
function buildBodySection(data) {
  const preview  = data.gmail?.body_preview;
  const keywords = data.gmail?.body_keywords || [];

  if (!preview) {
    return '<div style="color:#bbb;font-size:11px;font-style:italic">No message body available</div>';
  }

  // Truncate to ~3 lines
  const truncated = preview.length > 200 ? preview.slice(0, 200) + '…' : preview;

  const badgeConfigs = {
    onboarding_keywords: { icon: '📋', label: 'brief',   color: '#1a73e8', bg: '#e8f0fe' },
    stats_keywords:      { icon: '📊', label: 'stats',   color: '#7b1fa2', bg: '#f3e5f5' },
    live_keywords:       { icon: '✅', label: 'posted',  color: '#1e8e3e', bg: '#e6f4ea' },
    payment_keywords:    { icon: '💰', label: 'payment', color: '#e65100', bg: '#fff3e0' },
  };

  let badgesHtml = keywords.length === 0
    ? '<span style="color:#999;font-size:11px">No keywords detected</span>'
    : keywords.map(kw => {
        const cfg = badgeConfigs[kw];
        if (!cfg) return '';
        return `<span style="background:${cfg.bg};color:${cfg.color};padding:2px 8px;border-radius:12px;font-size:11px;margin-right:4px">${cfg.icon} ${cfg.label}</span>`;
      }).join('');

  return `
    <div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:4px;padding:8px 10px;
                font-size:12px;font-style:italic;color:#5f6368;margin-bottom:6px;line-height:1.5">
      "${truncated}"
    </div>
    <div style="margin-top:2px">${badgesHtml}</div>`;
}

// Build the verdict section HTML (incl. action buttons where applicable)
function buildVerdictSection(data) {
  const verdict  = data.verdict?.status || 'unknown';
  const reason   = data.verdict?.reason || '';
  const verdictColor = verdict === 'gap' ? '#d93025' : verdict === 'at_risk' ? '#f9ab00' : '#1e8e3e';
  const verdictEmoji = verdict === 'gap' ? '🚨' : verdict === 'at_risk' ? '⚠️' : '✅';

  let displayText = reason;
  let sequence    = null;
  let btnLabel    = '';

  if (verdict === 'gap') {
    const status = data.status || '';
    if (reason.includes('onboarding') || reason.includes('brief') || status === 'Contracted') {
      displayText = 'Missing onboarding thread';
      sequence  = 'onboarding';
      btnLabel  = '📋 Enroll in Onboarding Sequence';
    } else if (reason.includes('stats') || status === 'Live') {
      displayText = 'Stats not requested yet';
      sequence  = 'stats_request';
      btnLabel  = '📊 Request Stats';
    } else if (reason.includes('no outreach') || reason.includes('no sequence') ||
               status === 'New' || status === 'Contacted') {
      displayText = 'No outreach started';
      sequence  = 'outreach';
      btnLabel  = '📤 Start Outreach Sequence';
    }
  } else if (verdict === 'at_risk') {
    if (reason.includes('Negotiating')) {
      displayText = 'Negotiating — needs follow-up';
    } else {
      const daysAgo = data.gmail?.days_ago;
      displayText = `Last contact was ${daysAgo ?? '?'} days ago`;
    }
  } else if (verdict === 'covered') {
    displayText = 'Coverage looks good';
  }

  const btnHtml = sequence ? `
    <button id="vb-enroll-btn" data-sequence="${sequence}"
      style="margin-top:8px;width:100%;padding:6px 10px;background:${verdictColor};color:white;
             border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">
      ${btnLabel}
    </button>` : '';

  const statusSuggestion = data.verdict?.status_suggestion;
  const paymentFlag      = data.verdict?.payment_flag;

  const suggestionBar = statusSuggestion ? `
    <div style="background:#fff8e1;border-left:3px solid #f9ab00;padding:6px 10px;
                border-radius:0 4px 4px 0;margin-top:6px;font-size:11px;color:#5f4400">
      ⚡ Thread suggests status may be: <strong>${statusSuggestion}</strong>
    </div>` : '';

  const paymentBar = paymentFlag ? `
    <div style="background:#fff3e0;border-left:3px solid #e65100;padding:6px 10px;
                border-radius:0 4px 4px 0;margin-top:6px;font-size:11px;color:#bf360c">
      💰 Payment keywords detected in thread
    </div>` : '';

  return `
    <div style="background:${verdictColor}18;border-left:3px solid ${verdictColor};padding:8px 12px;border-radius:0 4px 4px 0">
      <strong style="color:${verdictColor}">${verdictEmoji} ${verdict.toUpperCase()}</strong>
      <div style="color:#333;font-size:11px;margin-top:2px">${displayText}</div>
      ${btnHtml}
    </div>
    ${suggestionBar}
    ${paymentBar}`;
}

// Create or update sidebar
function showSidebar(data) {
  let sidebar = document.getElementById('vb-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'vb-sidebar';
    sidebar.style.cssText = `
      position: fixed; top: 60px; right: 0; width: 300px;
      height: calc(100vh - 60px); background: white;
      border-left: 1px solid #e0e0e0; z-index: 9999;
      font-family: -apple-system, sans-serif; font-size: 13px;
      overflow-y: auto; box-shadow: -2px 0 8px rgba(0,0,0,0.1);
      padding: 16px;
    `;
    document.body.appendChild(sidebar);
  }

  const gmailClass = data.gmail?.classification || 'unknown';
  const gmailDot   = gmailClass === 'active' ? '🟢' : gmailClass === 'stale' ? '🟡' : '⚫';
  const igHandle   = data.handle;
  const igUrl      = igHandle ? `https://instagram.com/${igHandle.replace('@', '')}` : '';

  sidebar.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:14px">${data.handle || data.name}</strong>
      <button onclick="document.getElementById('vb-sidebar').remove()"
        style="border:none;background:none;cursor:pointer;font-size:16px;color:#666">✕</button>
    </div>
    <div style="color:#666;margin-bottom:4px">${data.name}</div>
    ${igHandle ? `<a href="${igUrl}" target="_blank"
      style="display:inline-block;color:#999;font-size:11px;text-decoration:none;margin-bottom:8px"
      onmouseover="this.style.textDecoration='underline'"
      onmouseout="this.style.textDecoration='none'">📸 ${igHandle}</a>` : ''}
    <div style="margin-bottom:12px">
      <span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:12px;font-size:11px">${data.status}</span>
      <span style="background:#f1f3f4;color:#555;padding:2px 8px;border-radius:12px;font-size:11px;margin-left:4px">${data.campaign || '—'}</span>
    </div>
    <hr style="border:none;border-top:1px solid #f1f3f4;margin:12px 0">
    <div style="color:#999;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:8px">📧 GMAIL</div>
    <div>${gmailDot} ${gmailClass}</div>
    <div style="color:#666;margin-top:4px">${data.gmail?.thread_subject || 'No subject'}</div>
    <div style="color:#999;font-size:11px;margin-top:2px">${data.gmail?.thread_count || 0} messages · ${data.gmail?.days_ago ?? '?'}d ago</div>
    <hr style="border:none;border-top:1px solid #f1f3f4;margin:12px 0">
    <div style="color:#999;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:8px">📄 LATEST MESSAGE</div>
    ${buildBodySection(data)}
    <hr style="border:none;border-top:1px solid #f1f3f4;margin:12px 0">
    <div style="color:#999;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:8px">💰 DEAL</div>
    <div>Fee: £${data.fee || '—'}</div>
    <div style="color:#666;margin-top:4px">Post date: ${data.post_date || '—'}</div>
    <hr style="border:none;border-top:1px solid #f1f3f4;margin:12px 0">
    ${buildVerdictSection(data)}
  `;

  // Attach enroll button handler after innerHTML is set
  const enrollBtn = document.getElementById('vb-enroll-btn');
  if (enrollBtn) {
    enrollBtn.addEventListener('click', () => enrollInSequence(data, enrollBtn));
  }
}

// Handle enroll button click — POST to /enroll, update button state
async function enrollInSequence(data, btn) {
  const sequence = btn.dataset.sequence;
  btn.textContent = 'Enrolling…';
  btn.disabled = true;

  try {
    await apiPost(`${API}/enroll`, {
      email: data.email,
      sequence,
      notion_page_id: data.notion_page_id || ''
    });
    btn.style.display = 'none';
    const statusEl = document.createElement('div');
    statusEl.textContent = '✅ Enrolled!';
    statusEl.style.cssText = 'color:#1e8e3e;font-size:12px;margin-top:6px;font-weight:600;text-align:center';
    btn.parentNode.appendChild(statusEl);
  } catch (err) {
    btn.textContent = '❌ Failed — check API';
    btn.style.background = '#fff';
    btn.style.color = '#d93025';
    btn.style.border = '1px solid #d93025';
    btn.disabled = false;
  }
}

function showError(msg) {
  let sidebar = document.getElementById('vb-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'vb-sidebar';
    sidebar.style.cssText = `position:fixed;top:60px;right:0;width:300px;height:80px;
      background:white;border-left:1px solid #e0e0e0;z-index:9999;
      font-family:sans-serif;font-size:13px;padding:16px;
      box-shadow:-2px 0 8px rgba(0,0,0,0.1);color:#666`;
    document.body.appendChild(sidebar);
  }
  sidebar.innerHTML = `<div>⚠️ ${msg}</div>`;
}

// Watch for Gmail navigation (SPA)
let lastUrl = location.href;
let debounceTimer;

async function onNavigate() {
  const url = location.href;
  // Remove sidebar when going back to inbox
  if (!url.includes('#inbox/') && !url.includes('#search/')) {
    const s = document.getElementById('vb-sidebar');
    if (s) s.remove();
    return;
  }

  // Only trigger on thread open
  if (!url.match(/#(inbox|search|all)\/.+/)) return;

  // Wait for Gmail to render the thread
  await new Promise(r => setTimeout(r, 800));

  const email = getThreadEmail();
  if (!email) return;

  try {
    const data = await apiFetch(`${API}/influencer?email=${encodeURIComponent(email)}`);
    showSidebar(data);
  } catch (err) {
    if (err.message.includes('404') || err.message.includes('No Notion')) {
      // Not in Notion, silently skip
    } else {
      showError(err.message.includes('Could not establish') ?
        'Start API server: uvicorn extension.api.server:app --port 8765' :
        err.message);
    }
  }
}

// MutationObserver to detect Gmail SPA navigation
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onNavigate, 300);
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Also run on initial load
setTimeout(onNavigate, 1000);
