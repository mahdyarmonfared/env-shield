/**
 * EnvShield Web Studio Client Application
 */

let state = {
  data: null,
  maskSecrets: true,
  currentTab: 'matrix',
  filter: 'all',
  searchQuery: ''
};

// DOM Elements
const healthScoreEl = document.getElementById('healthScore');
const statTotalEl = document.getElementById('statTotal');
const statSyncedEl = document.getElementById('statSynced');
const statMissingEl = document.getElementById('statMissing');
const statWarningsEl = document.getElementById('statWarnings');
const statSecurityEl = document.getElementById('statSecurity');
const gitStatusTextEl = document.getElementById('gitStatusText');

const matrixTableBody = document.getElementById('matrixTableBody');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const btnToggleMask = document.getElementById('btnToggleMask');
const maskIcon = document.getElementById('maskIcon');
const maskText = document.getElementById('maskText');
const btnRefresh = document.getElementById('btnRefresh');
const btnSyncAll = document.getElementById('btnSyncAll');

const rawEnvEditor = document.getElementById('rawEnvEditor');
const rawExampleEditor = document.getElementById('rawExampleEditor');
const btnSaveEnv = document.getElementById('btnSaveEnv');
const btnSaveExample = document.getElementById('btnSaveExample');
const btnGenExample = document.getElementById('btnGenExample');

const gitProtectionBadge = document.getElementById('gitProtectionBadge');
const gitProtectionMessage = document.getElementById('gitProtectionMessage');
const permBadge = document.getElementById('permBadge');
const permMessage = document.getElementById('permMessage');
const vulnCount = document.getElementById('vulnCount');
const vulnerabilitiesList = document.getElementById('vulnerabilitiesList');

const toastEl = document.getElementById('toast');

// --- TOAST NOTIFICATION ---
function showToast(message, type = 'info') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

// --- DATA FETCHING ---
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    updateUI();
  } catch (err) {
    showToast(`Failed to load env status: ${err.message}`, 'error');
  }
}

async function loadEditors() {
  try {
    const [envRes, exRes] = await Promise.all([
      fetch('/api/file-content?file=.env'),
      fetch('/api/file-content?file=.env.example')
    ]);

    const envData = await envRes.json();
    const exData = await exRes.json();

    rawEnvEditor.value = envData.content || '';
    rawExampleEditor.value = exData.content || '';
  } catch (err) {
    showToast('Failed to load raw editor contents', 'error');
  }
}

// --- UI RENDERING ---
function updateUI() {
  if (!state.data) return;
  const { summary, security, matrix } = state.data;

  // Header & Stats
  healthScoreEl.textContent = `${security.healthScore}%`;
  healthScoreEl.style.color = security.healthScore >= 80 ? 'var(--color-success)' : security.healthScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';

  statTotalEl.textContent = summary.totalKeys;
  statSyncedEl.textContent = summary.syncedCount;
  statMissingEl.textContent = summary.missingCount;
  statWarningsEl.textContent = summary.emptyCount + summary.placeholderCount;
  statSecurityEl.textContent = security.issues.length;

  // Git protection indicator
  if (security.gitProtection) {
    if (security.gitProtection.protected) {
      gitStatusTextEl.textContent = 'Protected by .gitignore';
      gitProtectionBadge.textContent = 'SECURE';
      gitProtectionBadge.className = 'badge badge-synced';
      gitProtectionMessage.textContent = 'Great! Your active .env file is excluded in .gitignore.';
    } else {
      gitStatusTextEl.textContent = 'EXPOSURE RISK!';
      gitProtectionBadge.textContent = 'UNPROTECTED';
      gitProtectionBadge.className = 'badge badge-missing';
      gitProtectionMessage.textContent = 'WARNING: .env is not in .gitignore. Any commit risks leaking your secrets!';
    }
  }

  // Permissions indicator
  if (security.permissions) {
    if (security.permissions.secure) {
      permBadge.textContent = 'SAFE';
      permBadge.className = 'badge badge-synced';
      permMessage.textContent = security.permissions.reason;
    } else {
      permBadge.textContent = 'PERMISSIVE';
      permBadge.className = 'badge badge-placeholder';
      permMessage.textContent = security.permissions.reason;
    }
  }

  // Vulnerabilities list
  vulnerabilitiesList.innerHTML = '';
  const totalFindings = [...security.issues, ...security.warnings];
  vulnCount.textContent = `${totalFindings.length} detected`;

  if (totalFindings.length === 0) {
    vulnerabilitiesList.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--color-success);">
        ✔ Clean scan! No exposed live secrets, weak placeholders, or git leakage detected.
      </div>
    `;
  } else {
    for (const item of totalFindings) {
      const div = document.createElement('div');
      const sev = item.severity || 'medium';
      div.className = `vuln-item ${sev}`;
      div.innerHTML = `
        <div>
          <div class="vuln-item-title">${escapeHtml(item.message)}</div>
          <div class="vuln-item-desc">Severity: <strong>${sev.toUpperCase()}</strong> ${item.key ? `&bull; Key: <code>${item.key}</code>` : ''}</div>
        </div>
      `;
      vulnerabilitiesList.appendChild(div);
    }
  }

  // Render Matrix Table
  renderMatrixTable();
}

function renderMatrixTable() {
  if (!state.data) return;
  const items = state.data.matrix;

  const filtered = items.filter(item => {
    // Search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchKey = item.key.toLowerCase().includes(q);
      const matchComment = item.comment && item.comment.toLowerCase().includes(q);
      if (!matchKey && !matchComment) return false;
    }

    // Dropdown filter
    if (state.filter === 'missing') return item.status === 'missing';
    if (state.filter === 'synced') return item.status === 'synced';
    if (state.filter === 'extra') return item.status === 'extra';
    if (state.filter === 'issues') return item.status !== 'synced';

    return true;
  });

  if (filtered.length === 0) {
    matrixTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading-cell">No variables found matching criteria.</td>
      </tr>
    `;
    return;
  }

  matrixTableBody.innerHTML = filtered.map(item => {
    const badgeClass = getBadgeClass(item.status);
    const badgeText = item.badge || item.status.toUpperCase();

    const envValDisplay = formatValueDisplay(item.envValue, item.status);
    const exValDisplay = formatValueDisplay(item.exampleValue, 'example');

    return `
      <tr>
        <td>
          <div class="var-key">
            <span>${escapeHtml(item.key)}</span>
            ${item.comment ? `<span class="var-comment"># ${escapeHtml(item.comment)}</span>` : ''}
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
        </td>
        <td>
          <span class="type-pill">${escapeHtml(item.inferredType)}</span>
        </td>
        <td>
          ${envValDisplay}
        </td>
        <td>
          ${exValDisplay}
        </td>
      </tr>
    `;
  }).join('');
}

function getBadgeClass(status) {
  switch (status) {
    case 'synced': return 'badge-synced';
    case 'missing': return 'badge-missing';
    case 'empty': return 'badge-empty';
    case 'placeholder': return 'badge-placeholder';
    case 'invalid_type': return 'badge-type-error';
    case 'extra': return 'badge-extra';
    default: return 'badge-dim';
  }
}

function formatValueDisplay(val, status) {
  if (val === null || val === undefined) {
    return `<div class="val-box empty"><em>Not Defined</em></div>`;
  }
  if (val === '') {
    return `<div class="val-box empty"><em>(empty)</em></div>`;
  }

  if (state.maskSecrets) {
    return `<div class="val-box masked">••••••••••••</div>`;
  }

  return `<div class="val-box">${escapeHtml(val)}</div>`;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- EVENT HANDLERS ---

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    state.currentTab = tabId;

    const targetEl = document.getElementById(`tab-${tabId}`);
    if (targetEl) targetEl.classList.add('active');

    // Show/hide matrix actions in tabs bar
    const matrixActions = document.getElementById('matrixActions');
    if (matrixActions) {
      matrixActions.style.display = tabId === 'matrix' ? 'flex' : 'none';
    }

    if (tabId === 'editor') {
      loadEditors();
    }
  });
});

// Search & Filter
searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.trim();
  renderMatrixTable();
});

filterSelect.addEventListener('change', (e) => {
  state.filter = e.target.value;
  renderMatrixTable();
});

// Show/Hide Secrets Toggle
btnToggleMask.addEventListener('click', () => {
  state.maskSecrets = !state.maskSecrets;
  maskIcon.textContent = state.maskSecrets ? '👁️' : '🔒';
  maskText.textContent = state.maskSecrets ? 'Show Values' : 'Hide Values';
  renderMatrixTable();
});

// Refresh
btnRefresh.addEventListener('click', () => {
  fetchStatus();
  showToast('Refreshed environment status');
});

// Sync All Missing Keys
btnSyncAll.addEventListener('click', async () => {
  try {
    btnSyncAll.disabled = true;
    btnSyncAll.textContent = 'Syncing...';

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usePlaceholders: true })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Sync failed');

    if (result.addedKeys.length === 0) {
      showToast('All keys are already synchronized!', 'info');
    } else {
      showToast(`Successfully synced ${result.addedKeys.length} missing variable(s)!`, 'success');
    }

    await fetchStatus();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnSyncAll.disabled = false;
    btnSyncAll.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Sync Missing Keys
    `;
  }
});

// Save .env Editor
btnSaveEnv.addEventListener('click', async () => {
  try {
    btnSaveEnv.disabled = true;
    const content = rawEnvEditor.value;

    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '.env', content })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    showToast(`Saved .env (Backup: ${result.backup || 'created'})`, 'success');
    fetchStatus();
  } catch (err) {
    showToast(`Save error: ${err.message}`, 'error');
  } finally {
    btnSaveEnv.disabled = false;
  }
});

// Save .env.example Editor
btnSaveExample.addEventListener('click', async () => {
  try {
    btnSaveExample.disabled = true;
    const content = rawExampleEditor.value;

    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '.env.example', content })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    showToast('Saved .env.example', 'success');
    fetchStatus();
  } catch (err) {
    showToast(`Save error: ${err.message}`, 'error');
  } finally {
    btnSaveExample.disabled = false;
  }
});

// Generate Example from .env
btnGenExample.addEventListener('click', async () => {
  try {
    btnGenExample.disabled = true;
    const res = await fetch('/api/gen-example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    rawExampleEditor.value = result.content;
    showToast('Generated sanitized .env.example from .env!', 'success');
    fetchStatus();
  } catch (err) {
    showToast(`Generation error: ${err.message}`, 'error');
  } finally {
    btnGenExample.disabled = false;
  }
});

// Initial Load
fetchStatus();
