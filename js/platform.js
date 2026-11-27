/* =========================================================================
 * platform.js — Full-stack UI integration: Theme, Sidebar, Save/PDF,
 * User Dashboard, Admin Dashboard, Chart.js Analytics, Practice & Viva Q&A.
 * ========================================================================= */
'use strict';

window.Platform = (() => {
  const THEME_KEY = 'cpu_sched_theme';
  let compareCharts = [];
  let adminAlgoChart = null;
  let cachedHistory = [];

  function showToast(message, type = 'info') {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = h('div', { class: `toast ${type}` }, message);
    stack.appendChild(el);
    setTimeout(() => { el.remove(); }, 4000);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Theme & Mobile Sidebar ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    const btn = $('#btn-theme-toggle');
    if (btn) btn.textContent = theme === 'light' ? '🌙 Dark' : '☀ Light';
  }

  function initThemeAndSidebar() {
    let saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) {}
    applyTheme(saved);

    const toggle = $('#btn-theme-toggle');
    if (toggle) {
      toggle.onclick = () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      };
    }

    const mobileBtn = $('#btn-mobile-menu');
    const sidebar = $('#app-sidebar');
    if (mobileBtn && sidebar) {
      mobileBtn.onclick = () => sidebar.classList.toggle('open');
    }
  }

  /* ---------- Save Simulation & PDF Download ---------- */
  async function saveCurrentSimulation() {
    if (!Auth.isAuthenticated()) {
      showToast('Please sign in first to save simulations.', 'error');
      return null;
    }
    const procs = getProcesses();
    if (!procs.length) {
      showToast('Add processes before saving a simulation.', 'error');
      return null;
    }
    const opts = getOpts();
    const name = ($('#sim-save-name')?.value || '').trim();
    const payload = {
      name,
      algorithm: currentAlgo(),
      quantum: opts.quantum,
      aging: opts.aging,
      aging_interval: opts.agingInterval,
      starvation_threshold: opts.starvationThreshold,
      processes: procs.map(p => ({
        pid: p.pid,
        color: p.color,
        arrival: p.arrival,
        burst: p.burst,
        priority: p.priority,
        ioAt: p.ioAt || 0,
        ioTime: p.ioTime || 0,
      })),
    };
    const data = await Auth.apiFetch('/simulations/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast(data.message || 'Simulation saved!', 'success');
    if ($('#sim-save-name')) $('#sim-save-name').value = '';
    return data.simulation;
  }

  async function downloadPdfForId(simId, filename = `simulation_${simId}.pdf`) {
    try {
      const res = await Auth.apiFetch(`/simulations/${simId}/pdf/`, { rawResponse: true });
      if (!res.ok) throw new Error(`Failed to generate PDF (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('PDF report downloaded!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function initSimulatorPersistence() {
    const btnSave = $('#btn-save-sim');
    const btnPdf = $('#btn-download-pdf');

    if (btnSave) {
      btnSave.onclick = async () => {
        try {
          await saveCurrentSimulation();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    if (btnPdf) {
      btnPdf.onclick = async () => {
        try {
          const sim = await saveCurrentSimulation();
          if (sim) await downloadPdfForId(sim.id, `simulation_${sim.id}_${sim.algorithm.toLowerCase()}.pdf`);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }
  }

  /* ---------- Compare Tab Chart.js Analytics ---------- */
  function renderCompareCharts() {
    if (typeof Chart === 'undefined') return;
    const procs = getProcesses();
    if (!procs.length) return;
    const opts = getOpts();
    const runs = Object.keys(ALGORITHMS).map(id => simulate(procs, id, opts));

    compareCharts.forEach(c => c.destroy());
    compareCharts = [];

    const labels = runs.map(r => r.algo.short);
    const c1 = $('#chart-compare-times');
    const c2 = $('#chart-compare-util');

    if (c1) {
      compareCharts.push(new Chart(c1, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Avg Waiting Time', data: runs.map(r => Number(r.metrics.avgWT.toFixed(2))), backgroundColor: 'rgba(108,140,255,0.75)' },
            { label: 'Avg Turnaround Time', data: runs.map(r => Number(r.metrics.avgTAT.toFixed(2))), backgroundColor: 'rgba(67,217,173,0.75)' },
            { label: 'Avg Response Time', data: runs.map(r => Number(r.metrics.avgRT.toFixed(2))), backgroundColor: 'rgba(255,181,71,0.75)' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#93a0c8' } } },
          scales: {
            x: { ticks: { color: '#93a0c8' }, grid: { color: 'rgba(147,160,200,0.1)' } },
            y: { beginAtZero: true, ticks: { color: '#93a0c8' }, grid: { color: 'rgba(147,160,200,0.1)' } },
          },
        },
      }));
    }

    if (c2) {
      compareCharts.push(new Chart(c2, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'CPU Utilization %', data: runs.map(r => Number(r.metrics.cpuUtil.toFixed(1))), backgroundColor: 'rgba(67,217,173,0.75)' },
            { label: 'Context Switches', data: runs.map(r => r.metrics.contextSwitches), backgroundColor: 'rgba(255,107,129,0.75)' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#93a0c8' } } },
          scales: {
            x: { ticks: { color: '#93a0c8' }, grid: { color: 'rgba(147,160,200,0.1)' } },
            y: { beginAtZero: true, ticks: { color: '#93a0c8' }, grid: { color: 'rgba(147,160,200,0.1)' } },
          },
        },
      }));
    }
  }

  /* ---------- User Dashboard & Simulation History ---------- */
  async function loadDashboard() {
    const guestBox = $('#dash-guest-notice');
    const authBox = $('#dash-auth-content');
    if (!Auth.isAuthenticated()) {
      guestBox?.classList.remove('hidden');
      authBox?.classList.add('hidden');
      return;
    }
    guestBox?.classList.add('hidden');
    authBox?.classList.remove('hidden');

    try {
      const [dash, hist] = await Promise.all([
        Auth.apiFetch('/dashboard/'),
        Auth.apiFetch('/simulations/'),
      ]);
      cachedHistory = hist.simulations || [];

      $('#dash-stats-grid').innerHTML = `
        <div class="stat-card"><span class="stat-label">Total Simulations</span><span class="stat-val">${dash.total_simulations}</span></div>
        <div class="stat-card"><span class="stat-label">Avg Waiting Time</span><span class="stat-val">${dash.avg_waiting_time.toFixed(2)}</span></div>
        <div class="stat-card"><span class="stat-label">Avg Turnaround Time</span><span class="stat-val">${dash.avg_turnaround_time.toFixed(2)}</span></div>
        <div class="stat-card"><span class="stat-label">Avg CPU Utilization</span><span class="stat-val">${dash.avg_cpu_utilization.toFixed(1)}%</span></div>
      `;

      const algBox = $('#dash-recent-algos');
      if (!dash.recent_algorithms.length) {
        algBox.innerHTML = '<p class="muted">No saved simulations yet. Run and save a simulation in the Simulator tab!</p>';
      } else {
        algBox.innerHTML = dash.recent_algorithms
          .map(a => `<div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid var(--line);">
            <b>${escapeHtml(a.algorithm)}</b><span class="tag">${a.count} runs</span>
          </div>`).join('');
      }

      renderProfileBox();
      renderHistoryTable(cachedHistory);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderProfileBox() {
    const user = Auth.getCurrentUser();
    const box = $('#dash-profile-box');
    if (!user || !box) return;
    const badge = user.is_verified
      ? '<span class="badge-role badge-verified">Verified</span>'
      : '<span class="badge-role badge-unverified">Unverified</span>';

    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.7rem;">
        <div><b>${escapeHtml(user.name)}</b> <small class="muted">@${escapeHtml(user.username)}</small></div>
        <div>${badge} <span class="badge-role">${escapeHtml(user.role)}</span></div>
      </div>
      <form id="profile-update-form" class="form-grid" style="margin-bottom:0.7rem;">
        <label>First Name<input id="prof-first" type="text" value="${escapeHtml(user.first_name)}" /></label>
        <label>Last Name<input id="prof-last" type="text" value="${escapeHtml(user.last_name)}" /></label>
        <label style="grid-column:1/-1;">Email<input id="prof-email" type="email" value="${escapeHtml(user.email)}" /></label>
        <button type="submit" class="btn primary small">Update Profile</button>
      </form>
      <div class="btn-row">
        ${!user.is_verified ? '<button id="btn-resend-verify" class="btn small" type="button">Resend Verification Email</button>' : ''}
        <button id="btn-toggle-pwd-change" class="btn small" type="button">Change Password</button>
      </div>
      <form id="pwd-change-form" class="form-grid hidden" style="margin-top:0.6rem;">
        <label>Current Password<input id="cp-old" type="password" required /></label>
        <label>New Password<input id="cp-new" type="password" minlength="8" required /></label>
        <button type="submit" class="btn primary small">Save New Password</button>
      </form>
    `;

    $('#profile-update-form').onsubmit = async (e) => {
      e.preventDefault();
      const res = await Auth.updateProfile({
        first_name: $('#prof-first').value,
        last_name: $('#prof-last').value,
        email: $('#prof-email').value,
      });
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) renderProfileBox();
    };

    const resendBtn = $('#btn-resend-verify');
    if (resendBtn) {
      resendBtn.onclick = async () => {
        const res = await Auth.resendVerification();
        showToast(res.message, res.success ? 'success' : 'error');
      };
    }

    $('#btn-toggle-pwd-change').onclick = () => {
      $('#pwd-change-form').classList.toggle('hidden');
    };

    $('#pwd-change-form').onsubmit = async (e) => {
      e.preventDefault();
      const res = await Auth.changePassword($('#cp-old').value, $('#cp-new').value);
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        $('#cp-old').value = '';
        $('#cp-new').value = '';
        $('#pwd-change-form').classList.add('hidden');
      }
    };
  }

  function renderHistoryTable(items) {
    const tbl = $('#dash-history-table');
    if (!tbl) return;
    if (!items.length) {
      tbl.innerHTML = '<tbody><tr><td class="muted">No saved simulations found.</td></tr></tbody>';
      return;
    }
    tbl.innerHTML = `
      <thead>
        <tr><th>Sel</th><th class="left">Name</th><th>Algorithm</th><th>Procs</th><th>Avg WT</th><th>Avg TAT</th><th>CPU %</th><th>Date</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${items.map(s => `
          <tr>
            <td><input type="checkbox" class="sim-cmp-chk" value="${s.id}" /></td>
            <td class="left"><b>${escapeHtml(s.name)}</b></td>
            <td><span class="tag">${escapeHtml(s.algorithm)}</span></td>
            <td>${s.process_count}</td>
            <td>${Number(s.avg_wt).toFixed(2)}</td>
            <td>${Number(s.avg_tat).toFixed(2)}</td>
            <td>${Number(s.cpu_util).toFixed(1)}%</td>
            <td>${new Date(s.created_at).toLocaleDateString()}</td>
            <td>
              <div class="btn-row" style="margin:0; justify-content:center;">
                <button class="btn small" data-open-sim="${s.id}">Open</button>
                <button class="btn small" data-pdf-sim="${s.id}">PDF</button>
                <button class="btn small danger" data-del-sim="${s.id}">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;

    tbl.querySelectorAll('[data-open-sim]').forEach(btn => {
      btn.onclick = async () => {
        try {
          const data = await Auth.apiFetch(`/simulations/${btn.dataset.openSim}/`);
          const sim = data.simulation;
          const procs = sim.processes.map(p => ({
            arrival: p.arrival_time,
            burst: p.burst_time,
            priority: p.priority,
            ioAt: p.io_at,
            ioTime: p.io_time,
          }));
          openInSimulator(sim.algorithm, procs, {
            quantum: sim.quantum,
            aging: sim.aging,
            agingInterval: sim.aging_interval,
            starvationThreshold: sim.starvation_threshold,
          });
          showToast(`Loaded "${sim.name}" into Simulator`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });

    tbl.querySelectorAll('[data-pdf-sim]').forEach(btn => {
      btn.onclick = () => downloadPdfForId(btn.dataset.pdfSim);
    });

    tbl.querySelectorAll('[data-del-sim]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this saved simulation?')) return;
        try {
          await Auth.apiFetch(`/simulations/${btn.dataset.delSim}/`, { method: 'DELETE' });
          showToast('Simulation deleted.', 'success');
          loadDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  }

  function initDashboardActions() {
    const refreshBtn = $('#btn-refresh-dash');
    if (refreshBtn) refreshBtn.onclick = loadDashboard;

    const cmpBtn = $('#btn-compare-saved');
    if (cmpBtn) {
      cmpBtn.onclick = () => {
        const checked = $$('.sim-cmp-chk:checked').map(c => Number(c.value));
        const box = $('#saved-compare-result');
        if (checked.length !== 2) {
          showToast('Select exactly 2 saved simulations to compare.', 'error');
          return;
        }
        const [a, b] = checked.map(id => cachedHistory.find(x => x.id === id)).filter(Boolean);
        if (!a || !b) return;
        box.classList.remove('hidden');
        box.innerHTML = `
          <div class="callout info">
            <b>Comparison: ${escapeHtml(a.name)} (${a.algorithm}) vs ${escapeHtml(b.name)} (${b.algorithm})</b><br/>
            Avg WT: <b>${a.avg_wt.toFixed(2)}</b> vs <b>${b.avg_wt.toFixed(2)}</b> ·
            Avg TAT: <b>${a.avg_tat.toFixed(2)}</b> vs <b>${b.avg_tat.toFixed(2)}</b> ·
            CPU Util: <b>${a.cpu_util.toFixed(1)}%</b> vs <b>${b.cpu_util.toFixed(1)}%</b> ·
            Context Switches: <b>${a.context_switches}</b> vs <b>${b.context_switches}</b>
          </div>
        `;
      };
    }
  }

  /* ---------- Admin Dashboard ---------- */
  async function loadAdmin() {
    if (!Auth.isAdmin()) {
      showToast('Administrator privileges required.', 'error');
      return;
    }
    try {
      const [stats, usersRes] = await Promise.all([
        Auth.apiFetch('/auth/admin/stats/'),
        Auth.apiFetch('/auth/admin/users/'),
      ]);

      $('#admin-stats-grid').innerHTML = `
        <div class="stat-card"><span class="stat-label">Registered Users</span><span class="stat-val">${stats.total_users}</span></div>
        <div class="stat-card"><span class="stat-label">Active Users</span><span class="stat-val">${stats.active_users}</span></div>
        <div class="stat-card"><span class="stat-label">Verified Emails</span><span class="stat-val">${stats.verified_users}</span></div>
        <div class="stat-card"><span class="stat-label">Total Simulations</span><span class="stat-val">${stats.total_simulations}</span></div>
      `;

      if (typeof Chart !== 'undefined' && $('#chart-admin-algos')) {
        if (adminAlgoChart) adminAlgoChart.destroy();
        adminAlgoChart = new Chart($('#chart-admin-algos'), {
          type: 'doughnut',
          data: {
            labels: stats.algorithm_usage.map(x => x.algorithm),
            datasets: [{
              data: stats.algorithm_usage.map(x => x.count),
              backgroundColor: ['#6c8cff', '#43d9ad', '#ffb547', '#ff6b81', '#b18cff', '#4fc3f7', '#9be15d', '#f78fb3', '#ffd166', '#06d6a0'],
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#93a0c8' } } },
          },
        });
      }

      const actTbl = $('#admin-activity-table');
      actTbl.innerHTML = `
        <thead><tr><th class="left">User</th><th>Algorithm</th><th>Avg WT</th><th>CPU %</th></tr></thead>
        <tbody>
          ${stats.recent_activity.map(a => `
            <tr>
              <td class="left">@${escapeHtml(a.username)}<br><small class="muted">${escapeHtml(a.name)}</small></td>
              <td><span class="tag">${escapeHtml(a.algorithm)}</span></td>
              <td>${a.avg_wt}</td>
              <td>${a.cpu_util}%</td>
            </tr>
          `).join('') || '<tr><td colspan="4" class="muted">No simulation activity yet.</td></tr>'}
        </tbody>
      `;

      const usersTbl = $('#admin-users-table');
      const me = Auth.getCurrentUser();
      usersTbl.innerHTML = `
        <thead><tr><th class="left">User</th><th>Email</th><th>Role</th><th>Verified</th><th>Status</th><th>Sims</th><th>Actions</th></tr></thead>
        <tbody>
          ${(usersRes.users || []).map(u => `
            <tr>
              <td class="left"><b>${escapeHtml(u.name)}</b><br><small class="muted">@${escapeHtml(u.username)}</small></td>
              <td>${escapeHtml(u.email)}</td>
              <td><span class="badge-role">${escapeHtml(u.role)}</span></td>
              <td>${u.is_verified ? '✔' : '—'}</td>
              <td>${u.is_active ? '<span style="color:var(--accent2)">Active</span>' : '<span style="color:var(--danger)">Disabled</span>'}</td>
              <td>${u.simulation_count}</td>
              <td>
                <div class="btn-row" style="margin:0; justify-content:center;">
                  ${u.id !== me?.id ? `<button class="btn small" data-toggle-active="${u.id}" data-cur="${u.is_active}">${u.is_active ? 'Deactivate' : 'Activate'}</button>` : '<small class="muted">(You)</small>'}
                  ${u.id !== me?.id ? `<button class="btn small" data-toggle-role="${u.id}" data-role="${u.role}">${u.role === 'ADMIN' ? 'Make Student' : 'Make Admin'}</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      `;

      usersTbl.querySelectorAll('[data-toggle-active]').forEach(btn => {
        btn.onclick = async () => {
          const next = btn.dataset.cur !== 'true';
          try {
            await Auth.apiFetch(`/auth/admin/users/${btn.dataset.toggleActive}/`, {
              method: 'PATCH',
              body: JSON.stringify({ is_active: next }),
            });
            showToast('User status updated.', 'success');
            loadAdmin();
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });

      usersTbl.querySelectorAll('[data-toggle-role]').forEach(btn => {
        btn.onclick = async () => {
          const nextRole = btn.dataset.role === 'ADMIN' ? 'STUDENT' : 'ADMIN';
          try {
            await Auth.apiFetch(`/auth/admin/users/${btn.dataset.toggleRole}/`, {
              method: 'PATCH',
              body: JSON.stringify({ role: nextRole }),
            });
            showToast(`User role changed to ${nextRole}.`, 'success');
            loadAdmin();
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  /* ---------- Practice Questions & Viva Q&A ---------- */
  function renderEducationalExtras() {
    const quizBox = $('#practice-quiz-box');
    if (quizBox && typeof PRACTICE_QUESTIONS !== 'undefined') {
      quizBox.innerHTML = PRACTICE_QUESTIONS.map((item, idx) => `
        <div class="quiz-card" data-quiz="${idx}">
          <b>Q${idx + 1}. ${escapeHtml(item.q)}</b>
          <div class="quiz-options">
            ${item.options.map((opt, oIdx) => `<button type="button" class="quiz-opt" data-opt="${oIdx}">${escapeHtml(opt)}</button>`).join('')}
          </div>
          <div class="muted" style="font-size:0.82rem; margin-top:0.5rem;" data-explain="${idx}"></div>
        </div>
      `).join('');

      quizBox.querySelectorAll('.quiz-opt').forEach(btn => {
        btn.onclick = () => {
          const card = btn.closest('.quiz-card');
          const qIdx = Number(card.dataset.quiz);
          const chosen = Number(btn.dataset.opt);
          const item = PRACTICE_QUESTIONS[qIdx];
          card.querySelectorAll('.quiz-opt').forEach(b => b.classList.remove('correct', 'wrong'));
          btn.classList.add(chosen === item.answer ? 'correct' : 'wrong');
          card.querySelector(`[data-explain="${qIdx}"]`).textContent =
            (chosen === item.answer ? '✔ Correct! ' : '✕ Try again. ') + item.explain;
        };
      });
    }

    const vivaBox = $('#viva-qa-box');
    if (vivaBox && typeof VIVA_QA !== 'undefined') {
      vivaBox.innerHTML = VIVA_QA.map(v => `
        <details class="viva-item">
          <summary>${escapeHtml(v.q)}</summary>
          <p>${escapeHtml(v.a)}</p>
        </details>
      `).join('');
    }
  }

  function onAuthChanged() {
    const adminNav = $('#nav-admin-btn');
    if (adminNav) adminNav.classList.toggle('hidden', !Auth.isAdmin());
  }

  function init() {
    initThemeAndSidebar();
    initSimulatorPersistence();
    initDashboardActions();
    renderEducationalExtras();
    onAuthChanged();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    showToast,
    renderCompareCharts,
    loadDashboard,
    loadAdmin,
    onAuthChanged,
  };
})();
