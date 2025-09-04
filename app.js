/* ===== app.js ===== */

// Save this as app.js
(function(){
  // Elements
  const amountEl = document.getElementById('amount');
  const categoryEl = document.getElementById('category');
  const descEl = document.getElementById('desc');
  const dateEl = document.getElementById('date');
  const currencyEl = document.getElementById('currency');
  const expenseForm = document.getElementById('expenseForm');
  const expenseList = document.getElementById('expenseList');
  const todayTotalEl = document.getElementById('todayTotal');
  const budgetValEl = document.getElementById('budgetVal');
  const spentPctEl = document.getElementById('spentPct');
  const progressBar = document.getElementById('progressBar');
  const alertsEl = document.getElementById('alerts');
  const pieCtx = document.getElementById('pieChart').getContext('2d');
  const barCtx = document.getElementById('barChart').getContext('2d');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettings = document.getElementById('closeSettings');
  const saveSettings = document.getElementById('saveSettings');
  const dailyBudgetInput = document.getElementById('dailyBudget');
  const autoCatToggle = document.getElementById('autoCatToggle');
  const keywordMapInput = document.getElementById('keywordMap');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadJsonBtn = document.getElementById('downloadBtn');

  // Defaults
  const LS_KEY = 'ure_expenses_v1';
  const LS_SETTINGS = 'ure_settings_v1';

  const DEFAULT_CATEGORIES = ['Food','Transport','Groceries','Rent','Utilities','Entertainment','Subscriptions','Healthcare','Office','Other'];
  let KEYWORD_CATEGORY_MAP = {coffee:'Food',lunch:'Food',bus:'Transport',uber:'Transport',rent:'Rent',electricity:'Utilities',amazon:'Office',medical:'Healthcare',pharmacy:'Healthcare'};

  // State
  let state = read(LS_KEY, {expenses:[]});
  let settings = read(LS_SETTINGS, {dailyBudget:0,autoCat:true,keywordMap:{}});

  // Initialize
  function init(){
    populateCategories();
    dateEl.value = new Date().toISOString().slice(0,10);
    bindEvents();
    if(settings.keywordMap){ KEYWORD_CATEGORY_MAP = Object.assign({}, KEYWORD_CATEGORY_MAP, settings.keywordMap); }
    dailyBudgetInput.value = settings.dailyBudget || '';
    autoCatToggle.checked = settings.autoCat;
    keywordMapInput.value = mapToString(settings.keywordMap || {});
    renderAll();
    requestNotificationPermission();
  }

  function bindEvents(){
    expenseForm.addEventListener('submit', onAddExpense);
    settingsBtn.addEventListener('click', ()=> settingsModal.classList.remove('hidden'));
    closeSettings.addEventListener('click', ()=> settingsModal.classList.add('hidden'));
    saveSettings.addEventListener('click', saveSettingsHandler);
    clearBtn.addEventListener('click', clearAll);
    exportBtn.addEventListener('click', exportCSV);
    downloadBtn.addEventListener('click', downloadJSON);
  }

  function populateCategories(){
    categoryEl.innerHTML = '';
    DEFAULT_CATEGORIES.forEach(c=>{
      const opt = document.createElement('option'); opt.value=c; opt.textContent=c; categoryEl.appendChild(opt);
    });
  }

  function onAddExpense(e){
    e.preventDefault();
    const amount = parseFloat(amountEl.value || 0);
    if(!amount || isNaN(amount)) { flash('Enter a valid amount'); return; }
    const desc = descEl.value.trim();
    const date = dateEl.value || new Date().toISOString().slice(0,10);
    let category = categoryEl.value;
    const currency = currencyEl.value || 'INR';

    if(settings.autoCat && desc){
      const auto = autoCategorize(desc);
      if(auto) category = auto;
    }

    const item = {id:uid(), amount:amount, desc:desc, date:date, category:category, currency:currency, created: new Date().toISOString()};
    state.expenses.push(item);
    save(LS_KEY, state);
    expenseForm.reset(); dateEl.value = new Date().toISOString().slice(0,10);
    renderAll();
    subtlePulse();
  }

  function renderAll(){
    renderList();
    renderStats();
    renderCharts();
  }

  function renderList(){
    expenseList.innerHTML = '';
    const items = state.expenses.slice().reverse();
    if(items.length===0){ expenseList.innerHTML = '<li class="expense-item"><div>No expenses yet</div></li>'; return; }
    items.forEach(it=>{
      const li = document.createElement('li'); li.className='expense-item';
      const info = document.createElement('div'); info.className='expense-info';
      const tag = document.createElement('div'); tag.className='tag'; tag.textContent=it.category;
      const text = document.createElement('div'); text.innerHTML = `<strong>${formatCurrency(it.amount, it.currency)}</strong><div class="muted">${it.desc||'—'} • ${it.date}</div>`;
      info.appendChild(tag); info.appendChild(text);
      const actions = document.createElement('div');
      const del = document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.onclick = ()=>{ deleteExpense(it.id); };
      actions.appendChild(del);
      li.appendChild(info); li.appendChild(actions);
      expenseList.appendChild(li);
    })
  }

  function renderStats(){
    const today = new Date().toISOString().slice(0,10);
    const todayExpenses = state.expenses.filter(e=>e.date===today);
    const total = todayExpenses.reduce((s,i)=>s+i.amount,0);
    todayTotalEl.textContent = formatCurrency(total, (todayExpenses[0] && todayExpenses[0].currency) || 'INR');
    const budget = settings.dailyBudget || 0;
    budgetValEl.textContent = formatCurrency(budget, (todayExpenses[0] && todayExpenses[0].currency) || 'INR');
    const pct = budget>0 ? Math.round((total/budget)*100) : 0;
    spentPctEl.textContent = pct + '%';
    progressBar.style.width = Math.min(100, pct) + '%';
    alertsEl.innerHTML = '';
    if(budget>0 && total>budget){ alertsEl.textContent = '⚠️ You have exceeded your daily budget!'; notify('Budget exceeded', `You spent ${formatCurrency(total)} today (budget ${formatCurrency(budget)})`); }
    else if(budget>0 && pct>=80){ alertsEl.textContent = '⚠️ You are approaching your budget limit.'; }
  }

  let pieChart, barChart;
  function renderCharts(){
    const byCat = {};
    const byDay = {};
    state.expenses.forEach(e=>{ byCat[e.category] = (byCat[e.category]||0)+e.amount; byDay[e.date] = (byDay[e.date]||0)+e.amount; });
    const pieData = Object.keys(byCat).map((k,i)=>({name:k,value:byCat[k]}));
    const barData = Object.keys(byDay).sort().map(k=>({date:k, value: byDay[k]}));

    // Pie
    const pieLabels = pieData.map(d=>d.name);
    const pieValues = pieData.map(d=>d.value);
    if(pieChart) pieChart.destroy();
    pieChart = new Chart(pieCtx, {type:'pie',data:{labels:pieLabels,datasets:[{data:pieValues,backgroundColor:generateColors(pieValues.length)}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});

    // Bar
    const barLabels = barData.map(d=>d.date);
    const barValues = barData.map(d=>d.value);
    if(barChart) barChart.destroy();
    barChart = new Chart(barCtx, {type:'bar',data:{labels:barLabels,datasets:[{label:'Daily spending', data:barValues}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  }

  function deleteExpense(id){ state.expenses = state.expenses.filter(x=>x.id!==id); save(LS_KEY, state); renderAll(); }

  function clearAll(){ if(!confirm('Clear all expenses? This cannot be undone.')) return; state.expenses = []; save(LS_KEY, state); renderAll(); }

  function exportCSV(){
    if(!state.expenses.length){ alert('No data to export'); return; }
    const header = ['id','amount','currency','category','desc','date','created'];
    const rows = state.expenses.map(e=> header.map(h => JSON.stringify(e[h] ?? '')).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `expenses_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function downloadJSON(){ const blob = new Blob([JSON.stringify(state, null, 2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='expenses.json'; a.click(); URL.revokeObjectURL(url); }

  function saveSettingsHandler(){
    const budgetVal = parseFloat(dailyBudgetInput.value || 0);
    settings.dailyBudget = isNaN(budgetVal)?0:budgetVal;
    settings.autoCat = !!autoCatToggle.checked;
    const custom = parseMapString(keywordMapInput.value||'');
    settings.keywordMap = custom;
    KEYWORD_CATEGORY_MAP = Object.assign({}, KEYWORD_CATEGORY_MAP, custom);
    save(LS_SETTINGS, settings);
    settingsModal.classList.add('hidden');
    renderAll();
  }

  // Helpers
  function formatCurrency(val, cur='INR'){ return `${cur} ${Number(val).toFixed(2)}`; }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function read(k, fallback){ try{ return JSON.parse(localStorage.getItem(k)) || fallback; }catch{ return fallback; } }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function flash(msg){ alertsEl.textContent = msg; setTimeout(()=>{ alertsEl.textContent=''; }, 3000); }
  function subtlePulse(){ document.querySelector('.app').animate([{transform:'scale(1)'},{transform:'scale(0.998)'},{transform:'scale(1)'}],{duration:300}) }

  function autoCategorize(text){ const t = text.toLowerCase(); for(const k in KEYWORD_CATEGORY_MAP){ if(t.includes(k)) return KEYWORD_CATEGORY_MAP[k]; } return null; }

  function parseMapString(s){ const map={}; if(!s) return map; s.split(',').forEach(pair=>{ const [k,v]=pair.split(':').map(p=>p&&p.trim()); if(k && v) map[k.toLowerCase()] = v; }); return map; }
  function mapToString(map){ return Object.entries(map||{}).map(([k,v])=>`${k}:${v}`).join(','); }

  function generateColors(n){ const base = ['#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0','#00BCD4','#FFC107','#8BC34A','#FF5722','#607D8B']; const out=[]; for(let i=0;i<n;i++) out.push(base[i%base.length]); return out; }

  function requestNotificationPermission(){ if('Notification' in window && Notification.permission !== 'granted'){ try{ Notification.requestPermission().then(()=>{}); }catch(e){} } }
  function notify(title, body){ if('Notification' in window && Notification.permission === 'granted'){ new Notification(title, {body}); } }

  function formatMapForDisplay(map){ return Object.entries(map||{}).map(([k,v])=>`${k}:${v}`).join(', '); }

  function uid(){ return Math.random().toString(36).slice(2,9); }

  init();
})();
