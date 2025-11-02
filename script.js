// ==================== PASSWORD PROTECTION ====================

/**
 * Check authentication status on page load
 */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth-status');
    const data = await res.json();
    
    if (data.authenticated) {
      // Already authenticated
      document.getElementById('password-screen').style.display = 'none';
      document.getElementById('main-content').classList.add('unlocked');
      fetchData();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

/**
 * Handle password form submission
 */
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('password-input');
  const error = document.getElementById('password-error');
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value })
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Correct password
      document.getElementById('password-screen').style.display = 'none';
      document.getElementById('main-content').classList.add('unlocked');
      fetchData();
    } else {
      // Wrong password
      error.textContent = 'Incorrect password';
      input.value = '';
      input.focus();
    }
  } catch (err) {
    error.textContent = 'Connection error';
    console.error('Login failed:', err);
  }
});

// Check auth on page load
checkAuth();

// ==================== GLOBAL VARIABLES ====================
let dailyPLChart;

// ==================== UTILITY FUNCTIONS ====================

/** Format a Date object as YYYY-MM-DD */
function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Convert various date formats to YYYY-MM-DD */
function normalizeDateKey(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const dt = new Date(s);
  return isNaN(dt) ? '' : dt.toISOString().slice(0,10);
}

/** Format YYYY-MM-DD as MM/DD/YYYY for display */
function formatDateDisplay(s) {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}/${m[1]}`;
  const dt = new Date(s);
  return isNaN(dt) ? s : `${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getDate().toString().padStart(2,'0')}/${dt.getFullYear()}`;
}

/** Parse a currency/number string to float */
function parseNum(val) {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(/\$|,/g,'')) || 0;
}

/** Format a number as currency */
function formatCurrency(val) {
  return '$' + parseNum(val).toFixed(2);
}

/** Escape HTML special characters */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'
  }[c]));
}

// ==================== DATA FETCHING ====================

/** Fetch all bet data from API and render tables/charts */
async function fetchData() {
  try {
    const [betsRes, singlesRes, parlaysRes, betTypesRes] = await Promise.all([
      fetch('/api/bets'),
      fetch('/api/singles'),
      fetch('/api/parlays'),
      fetch('/api/bettypes')
    ]);

    const betsData = await betsRes.json();
    const singlesData = await singlesRes.json();
    const parlaysData = await parlaysRes.json();
    const betTypesData = await betTypesRes.json();

    window.betsData = betsData;

    updateBalance(betsData);
    renderSimpleTable('#singles-table tbody', [singlesData]);
    renderSimpleTable('#parlays-table tbody', [parlaysData]);
    renderBetTypesTable(betTypesData);
    renderBetsTable(betsData);
    renderCreditsTable(betsData);
    populateTypeFilter(betsData);
    setupBetsFilters();
    setupChartFilters();
    initializeChart(betsData);

  } catch (err) {
    console.error('Error fetching data:', err);
    document.getElementById('balance').textContent = 'Error';
  }
}

// ==================== BALANCE CALCULATION ====================

/** Calculate and display current balance */
function updateBalance(betsData) {
  const balance = betsData.reduce((sum, b) => sum + parseNum(b.Balance), 0);
  const balanceEl = document.getElementById('balance');
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.parentElement.style.color = balance < 0 ? 'red' : 'var(--accent)';
}

// ==================== TABLE RENDERING ====================

/** Render a simple table (Singles/Parlays) */
function renderSimpleTable(selector, rows) {
  const tbody = document.querySelector(selector);
  tbody.innerHTML = '';
  rows.forEach(data => {
    const tr = document.createElement('tr');
    data.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val ?? '0';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/** Render bet types table */
function renderBetTypesTable(data) {
  const tbody = document.querySelector('#bettypes-table tbody');
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    ['type','win_pct','wins','losses','avg_odds','expected_pct','totals'].forEach(col => {
      const td = document.createElement('td');
      td.textContent = row[col] ?? '0';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/** Render all bets table with expandable parlays */
function renderBetsTable(betsData) {
  const tbody = document.querySelector('#bets-table tbody');
  tbody.innerHTML = '';

  betsData.sort((a,b) => new Date(b.Date) - new Date(a.Date));

  betsData.forEach(bet => {
    const type = (bet.Type || '').toLowerCase();
    if (type === 'credit' || type === 'deposit' || type === 'withdrawal') return;

    const isParlay = type === 'parlay';
    const tr = document.createElement('tr');
    tr.classList.add('bet-row');

    const toggleTd = document.createElement('td');
    if (isParlay) {
      toggleTd.textContent = '+';
      toggleTd.style.cursor = 'pointer';
    }
    tr.appendChild(toggleTd);

    ['Date','Bet','Stake','Odds','To_Win','Type','Result','Balance'].forEach(key => {
      const td = document.createElement('td');
      let val = bet[key] ?? '';
      if (['Stake','To_Win','Balance'].includes(key)) {
        val = formatCurrency(val);
      }
      td.textContent = val;
      tr.appendChild(td);
    });

    tr.dataset.Stake = parseNum(bet.Stake);
    tr.dataset.Odds = (bet.Odds ?? '').toString();
    tr.dataset.To_Win = parseNum(bet.To_Win);
    tr.dataset.Type = (bet.Type ?? '').toString();
    tr.dataset.Result = (bet.Result ?? '').toString();
    tr.dataset.Balance = parseNum(bet.Balance);
    tr.dataset.DateKey = normalizeDateKey(bet.Date || '');

    tbody.appendChild(tr);

    if (isParlay) {
      const nestedTr = document.createElement('tr');
      nestedTr.classList.add('nested-row');
      nestedTr.style.display = 'none';
      const nestedTd = document.createElement('td');
      nestedTd.colSpan = 9;
      nestedTd.innerHTML = '<em>Loading...</em>';
      nestedTr.appendChild(nestedTd);
      tbody.appendChild(nestedTr);

      toggleTd.addEventListener('click', async () => {
        if (nestedTr.style.display === 'none') {
          nestedTr.style.display = 'table-row';
          toggleTd.textContent = '-';
          try {
            const res = await fetch(`/api/parlay_bets?parlay_name=${encodeURIComponent(bet.Bet)}`);
            const parlayBets = await res.json();
            if (parlayBets.length > 0) {
              nestedTd.innerHTML = '<table class="nested"><thead><tr><th>Date</th><th>Bet</th><th>Odds</th><th>Type</th><th>Result</th></tr></thead><tbody>' +
                parlayBets.map(b => `<tr>
                  <td>${formatDateDisplay(b.date || b.Date)}</td>
                  <td>${escapeHtml(b.individual_bet || b.Bet || '')}</td>
                  <td>${escapeHtml(b.odds || '')}</td>
                  <td>${escapeHtml(b.type || '')}</td>
                  <td>${escapeHtml(b.result || '')}</td>
                </tr>`).join('') + '</tbody></table>';
            } else {
              nestedTd.innerHTML = '<em>No details</em>';
            }
          } catch (err) {
            nestedTd.innerHTML = '<em>Error loading</em>';
          }
        } else {
          nestedTr.style.display = 'none';
          toggleTd.textContent = '+';
        }
      });
    }
  });
}

/** Render credits table (Description column removed) */
function renderCreditsTable(betsData) {
  const tbody = document.querySelector('#credits-table tbody');
  tbody.innerHTML = '';

  betsData
    .filter(b => ['credit','deposit','withdrawal'].includes((b.Type || '').toLowerCase()))
    .sort((a,b) => new Date(b.Date) - new Date(a.Date))
    .forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.Date}</td>
        <td>${formatCurrency(c.Balance)}</td>
      `;
      tbody.appendChild(tr);
    });
}

// ==================== FILTER SETUP ====================

/** Populate type filter dropdown with unique bet types */
function populateTypeFilter(betsData) {
  const typeSet = new Set(
    betsData
      .map(b => (b.Type || '').toUpperCase())
      .filter(t => t && t !== 'CREDIT')
  );
  typeSet.add('SINGLES');
  
  const typeSelect = document.getElementById('type-filter');
  typeSelect.innerHTML = '<option value="">All</option>';
  
  [...typeSet].sort().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });
}

/** Setup event listeners for All Bets filters */
function setupBetsFilters() {
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const filterDropdown = document.getElementById("filter-dropdown");
  const typeSelect = document.getElementById('type-filter');

  filterToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    filterDropdown.classList.toggle("hidden");
  });

  document.getElementById('bets-filter-btn').addEventListener('click', () => {
    const type = typeSelect.value.toLowerCase();
    const result = document.getElementById('result-filter').value.toLowerCase();
    const start = normalizeDateKey(document.getElementById('bets-start-date').value);
    const end = normalizeDateKey(document.getElementById('bets-end-date').value);

    const filtered = window.betsData.filter(b => {
      const t = (b.Type || '').toLowerCase();
      const r = (b.Result || '').toLowerCase();
      const d = normalizeDateKey(b.Date);

      let typeMatch = true;
      if (type === 'singles') typeMatch = t !== 'parlay' && t !== 'credit';
      else if (type) typeMatch = t === type;

      const resultMatch = !result || r === result;
      const startMatch = !start || (d && d >= start);
      const endMatch = !end || (d && d <= end);

      return typeMatch && resultMatch && startMatch && endMatch;
    });

    renderBetsTable(filtered);
    filterDropdown.classList.add('hidden');
  });

  document.getElementById('bets-clear-btn').addEventListener('click', () => {
    typeSelect.value = '';
    document.getElementById('result-filter').value = '';
    document.getElementById('bets-start-date').value = '';
    document.getElementById('bets-end-date').value = '';
    renderBetsTable(window.betsData);
    filterDropdown.classList.add('hidden');
  });

  document.addEventListener("click", (e) => {
    if (!filterDropdown.classList.contains("hidden") &&
        !filterDropdown.contains(e.target) &&
        !filterToggleBtn.contains(e.target)) {
      filterDropdown.classList.add('hidden');
    }
  });
}

/** Setup event listeners for Daily P/L chart filters */
function setupChartFilters() {
  const chartFilterToggleBtn = document.getElementById("chart-filter-toggle-btn");
  const chartFilterDropdown = document.getElementById("chart-filter-dropdown");
  const startInput = document.getElementById("start-date");
  const endInput = document.getElementById("end-date");

  chartFilterToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    chartFilterDropdown.classList.toggle("hidden");
  });

  document.getElementById("pl-filter-apply-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const s = normalizeDateKey(startInput.value);
    const eDate = normalizeDateKey(endInput.value);
    updateChart(window.betsData, s, eDate);
    chartFilterDropdown.classList.add("hidden");
  });

  document.getElementById("pl-filter-reset-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const now = new Date();
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    startInput.value = start;
    endInput.value = end;
    updateChart(window.betsData, normalizeDateKey(start), normalizeDateKey(end));
    chartFilterDropdown.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!chartFilterDropdown.contains(e.target) && !chartFilterToggleBtn.contains(e.target)) {
      chartFilterDropdown.classList.add("hidden");
    }
  });
}

// ==================== CHART ====================

/** Initialize chart with default date range (current month) */
function initializeChart(betsData) {
  const now = new Date();
  const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  document.getElementById('start-date').value = start;
  document.getElementById('end-date').value = end;
  updateChart(betsData, normalizeDateKey(start), normalizeDateKey(end));
}

/** Update chart with filtered date range */
function updateChart(betsData, startDate, endDate) {
  const dailyTotals = {};

  betsData.forEach(bet => {
    const type = (bet.Type || '').toLowerCase();
    if (type === 'credit' || type === 'deposit' || type === 'withdrawal') return;
    
    const d = normalizeDateKey(bet.Date);
    if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return;

    const result = (bet.Result || '').toLowerCase();
    let dayPL = 0;
    if (result === 'win') dayPL = parseNum(bet.To_Win);
    else if (result === 'loss') dayPL = -parseNum(bet.Stake);

    dailyTotals[d] = (dailyTotals[d] || 0) + dayPL;
  });

  const dates = Object.keys(dailyTotals).sort();
  if (dates.length === 0) {
    renderChart([], []);
    return;
  }

  const labels = [''];
  const cumulative = [0];
  let running = 0;

  dates.forEach(d => {
    running += dailyTotals[d];
    cumulative.push(running);
    const [y, m, day] = d.split('-');
    labels.push(`${m}/${day}`);
  });

  renderChart(labels, cumulative);
}

/** Render or update Chart.js instance */
function renderChart(labels, data) {
  const canvas = document.getElementById('daily-pl-chart');
  if (!canvas) return;

  if (dailyPLChart) {
    dailyPLChart.data.labels = labels;
    dailyPLChart.data.datasets[0].data = data;
    dailyPLChart.update();
    return;
  }

  dailyPLChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative P/L',
        data,
        borderColor: '#1e90ff',
        backgroundColor: 'rgba(30,144,255,0.2)',
        fill: true,
        tension: 0.2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      scales: {
        x: {
          title: { display: true, text: 'Date' },
          ticks: { maxRotation: 0, autoSkip: true }
        },
        y: {
          title: { display: true, text: 'Balance ($)' },
          beginAtZero: false
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ==================== SORTING ====================

/** Setup sortable column headers */
document.querySelectorAll('#bets-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const tbody = document.querySelector('#bets-table tbody');
    const key = th.dataset.key;
    if (!key) return;

    const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
    
    document.querySelectorAll('#bets-table th.sortable').forEach(h => {
      h.classList.remove('asc','desc');
      h.dataset.sortDir = '';
    });
    th.dataset.sortDir = dir;
    th.classList.add(dir);

    const betRows = Array.from(tbody.querySelectorAll('tr.bet-row'));
    const pairs = betRows.map(mainRow => ({
      mainRow,
      nestedRow: mainRow.nextElementSibling?.classList.contains('nested-row') ? mainRow.nextElementSibling : null
    }));

    pairs.sort((a,b) => {
      const aVal = a.mainRow.dataset[key] ?? '';
      const bVal = b.mainRow.dataset[key] ?? '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return dir === 'asc' ? aNum - bNum : bNum - aNum;
      return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    tbody.innerHTML = '';
    pairs.forEach(p => {
      tbody.appendChild(p.mainRow);
      if (p.nestedRow) tbody.appendChild(p.nestedRow);
    });
  });
});