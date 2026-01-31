/**
 * Divide — Gastos compartidos en viajes
 * Viajes con múltiples salidas. Cada salida tiene sus propios participantes y gastos.
 */

const CURRENCIES = {
  COP: { code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 0, locale: 'es-CO' },
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, locale: 'de-DE' }
};

const STORAGE_KEY = 'divide-viajes';

const state = {
  currency: 'COP',
  trips: [],
  currentTripId: null
};

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      state.trips = data.trips || [];
      state.currency = data.currency || 'COP';
      state.currentTripId = data.currentTripId;
    }
  } catch (e) {}
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      trips: state.trips,
      currency: state.currency,
      currentTripId: state.currentTripId
    }));
  } catch (e) {}
}
function genId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function getCurrency() {
  return CURRENCIES[state.currency] || CURRENCIES.COP;
}

function formatAmount(n, includeSymbol = true) {
  const curr = getCurrency();
  const decimals = curr.decimals;
  const formatted = n.toLocaleString(curr.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  if (!includeSymbol) return formatted;
  return curr.code === 'COP' ? `${curr.symbol} ${formatted}` : `${formatted} ${curr.symbol}`;
}

function formatInputAmount(n) {
  const curr = getCurrency();
  return Number(n).toFixed(curr.decimals);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Vistas ---
function showTripsList() {
  document.getElementById('tripsListSection').hidden = false;
  document.getElementById('tripDetailSection').hidden = true;
  state.currentTripId = null;
  renderTripsList();
}

function showTripDetail(tripId) {
  state.currentTripId = tripId;
  document.getElementById('tripsListSection').hidden = true;
  document.getElementById('tripDetailSection').hidden = false;
  const trip = getTrip(tripId);
  if (trip) {
    document.getElementById('tripNameBreadcrumb').textContent = trip.name;
  }
  renderTripDetail();
}

function getTrip(id) {
  return state.trips.find(t => t.id === id);
}

function getCurrentTrip() {
  return state.currentTripId ? getTrip(state.currentTripId) : null;
}

// --- CRUD Viajes ---
function createTrip(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const trip = {
    id: genId(),
    name: trimmed,
    people: [],
    outings: []
  };
  state.trips.push(trip);
  saveToStorage();
  renderTripsList();
  return trip;
}

function deleteTrip(id) {
  state.trips = state.trips.filter(t => t.id !== id);
  saveToStorage();
  if (state.currentTripId === id) {
    showTripsList();
  } else {
    renderTripsList();
  }
}

// --- CRUD Personas del viaje ---
function addTripPerson(tripId, name) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const normalized = name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
  if (!normalized || trip.people.includes(normalized)) return;
  trip.people.push(normalized);
  saveToStorage();
  renderTripDetail();
}

function removeTripPerson(tripId, name) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.people = trip.people.filter(p => p !== name);
  trip.outings.forEach(o => {
    o.participants = o.participants.filter(p => p !== name);
    o.expenses = o.expenses.filter(e => e.payer !== name);
  });
  saveToStorage();
  renderTripDetail();
}

// --- CRUD Salidas ---
function addOuting(tripId, name) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const trimmed = (name || '').trim() || 'Salida';
  const outing = {
    id: genId(),
    name: trimmed,
    participants: [...trip.people],
    expenses: []
  };
  trip.outings.push(outing);
  saveToStorage();
  renderTripDetail();
  closeOutingModal();
}

function removeOuting(tripId, outingId) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.outings = trip.outings.filter(o => o.id !== outingId);
  saveToStorage();
  renderTripDetail();
}

function toggleOutingParticipant(tripId, outingId, personName) {
  const trip = getTrip(tripId);
  const outing = trip?.outings.find(o => o.id === outingId);
  if (!outing) return;
  const idx = outing.participants.indexOf(personName);
  if (idx >= 0) {
    if (outing.participants.length <= 1) return;
    outing.participants.splice(idx, 1);
    outing.expenses = outing.expenses.filter(e => e.payer !== personName);
  } else {
    outing.participants.push(personName);
  }
  saveToStorage();
  renderTripDetail();
}

// --- CRUD Gastos ---
function addExpense(tripId, outingId, description, amount, payer) {
  const trip = getTrip(tripId);
  const outing = trip?.outings.find(o => o.id === outingId);
  if (!outing || !description || !payer || isNaN(amount) || amount <= 0) return;
  if (!outing.participants.includes(payer)) return;
  outing.expenses.push({
    id: genId(),
    description: description.trim(),
    amount: Math.round(amount * 100) / 100,
    payer
  });
  saveToStorage();
  renderTripDetail();
}

function removeExpense(tripId, outingId, expenseId) {
  const trip = getTrip(tripId);
  const outing = trip?.outings.find(o => o.id === outingId);
  if (!outing) return;
  outing.expenses = outing.expenses.filter(e => e.id !== expenseId);
  saveToStorage();
  renderTripDetail();
}

// --- Cálculo de settlements ---
function calculateSettlementsForParticipants(participants, expenses) {
  if (participants.length < 2 || expenses.length === 0) {
    return { total: 0, share: 0, balances: {}, settlements: [] };
  }
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const share = total / participants.length;
  const paid = {};
  participants.forEach(p => { paid[p] = 0; });
  expenses.forEach(e => { paid[e.payer] = (paid[e.payer] || 0) + e.amount; });
  const balances = {};
  participants.forEach(p => {
    balances[p] = Math.round((paid[p] - share) * 100) / 100;
  });
  const creditors = participants.filter(p => balances[p] > 0.01)
    .map(p => ({ name: p, amount: balances[p] })).sort((a, b) => b.amount - a.amount);
  const debtors = participants.filter(p => balances[p] < -0.01)
    .map(p => ({ name: p, amount: -balances[p] })).sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i], deb = debtors[j];
    const amount = Math.min(cred.amount, deb.amount);
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.01) {
      settlements.push({ from: deb.name, to: cred.name, amount: rounded });
    }
    cred.amount -= amount;
    deb.amount -= amount;
    if (cred.amount < 0.01) i++;
    if (deb.amount < 0.01) j++;
  }
  return { total, share, balances, settlements };
}

function calculateTripSummary(trip) {
  if (!trip || trip.people.length < 2) return null;
  const aggregatedBalances = {};
  trip.people.forEach(p => { aggregatedBalances[p] = 0; });
  let totalSpent = 0;
  trip.outings.forEach(outing => {
    const result = calculateSettlementsForParticipants(outing.participants, outing.expenses);
    totalSpent += result.total;
    Object.keys(result.balances).forEach(p => {
      aggregatedBalances[p] = (aggregatedBalances[p] || 0) + result.balances[p];
    });
  });
  Object.keys(aggregatedBalances).forEach(p => {
    aggregatedBalances[p] = Math.round(aggregatedBalances[p] * 100) / 100;
  });
  const peopleWithActivity = trip.people.filter(p => Math.abs(aggregatedBalances[p] || 0) > 0.01);
  if (peopleWithActivity.length < 2) {
    return { total: totalSpent, balances: aggregatedBalances, settlements: [], trip };
  }
  const creditors = trip.people.filter(p => aggregatedBalances[p] > 0.01)
    .map(p => ({ name: p, amount: aggregatedBalances[p] })).sort((a, b) => b.amount - a.amount);
  const debtors = trip.people.filter(p => aggregatedBalances[p] < -0.01)
    .map(p => ({ name: p, amount: -aggregatedBalances[p] })).sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i], deb = debtors[j];
    const amount = Math.min(cred.amount, deb.amount);
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.01) settlements.push({ from: deb.name, to: cred.name, amount: rounded });
    cred.amount -= amount;
    deb.amount -= amount;
    if (cred.amount < 0.01) i++;
    if (deb.amount < 0.01) j++;
  }
  return { total: totalSpent, balances: aggregatedBalances, settlements, trip };
}

// --- Render ---
function renderTripsList() {
  const list = document.getElementById('tripsList');
  const hint = document.getElementById('tripsListHint');
  list.innerHTML = '';
  if (state.trips.length === 0) {
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  state.trips.forEach(trip => {
    const li = document.createElement('li');
    li.className = 'trip-item';
    const outingsCount = trip.outings.length;
    const peopleCount = trip.people.length;
    li.innerHTML = `
      <div class="trip-item-main">
        <strong>${escapeHtml(trip.name)}</strong>
        <span class="trip-item-meta">${peopleCount} personas · ${outingsCount} salidas</span>
      </div>
      <div class="trip-item-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="open">Abrir</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="delete" aria-label="Eliminar viaje">×</button>
      </div>
    `;
    li.querySelector('[data-action="open"]').addEventListener('click', () => showTripDetail(trip.id));
    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm(`¿Eliminar el viaje "${trip.name}"?`)) deleteTrip(trip.id);
    });
    list.appendChild(li);
  });
}

function renderTripDetail() {
  const trip = getCurrentTrip();
  if (!trip) return;
  renderParticipants();
  renderOutings();
  renderTripSummary();
  const addOutingBtn = document.getElementById('addOutingBtn');
  addOutingBtn.disabled = trip.people.length < 2;
  addOutingBtn.title = trip.people.length < 2 ? 'Añade al menos 2 personas primero' : '';
}

function renderParticipants() {
  const trip = getCurrentTrip();
  const tags = document.getElementById('participantsTags');
  const hint = document.getElementById('participantsHint');
  tags.innerHTML = '';
  hint.textContent = trip.people.length < 2 ? 'Añade al menos 2 personas' : `${trip.people.length} personas`;
  trip.people.forEach(name => {
    const li = document.createElement('li');
    li.className = 'participant-tag';
    li.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <button type="button" data-name="${escapeHtml(name)}" aria-label="Eliminar">×</button>
    `;
    li.querySelector('button').addEventListener('click', () => removeTripPerson(trip.id, name));
    tags.appendChild(li);
  });
}

function renderOutings() {
  const trip = getCurrentTrip();
  const list = document.getElementById('outingsList');
  const hint = document.getElementById('outingsHint');
  list.innerHTML = '';
  if (trip.outings.length === 0) {
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  trip.outings.forEach(outing => {
    const card = document.createElement('div');
    card.className = 'outing-card card';
    const result = calculateSettlementsForParticipants(outing.participants, outing.expenses);
    const totalOuting = result.total;
    const payerOptions = outing.participants.map(p =>
      `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`
    ).join('');
    card.innerHTML = `
      <div class="outing-header">
        <h3 class="outing-name">${escapeHtml(outing.name)}</h3>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-outing aria-label="Eliminar salida">×</button>
      </div>
      <div class="outing-participants">
        <span class="outing-label">Participan en esta salida:</span>
        <div class="participants-checkboxes" data-outing-id="${outing.id}"></div>
      </div>
      <div class="outing-expenses">
        <div class="expense-form-mini">
          <input type="text" class="expense-desc" placeholder="Concepto" data-outing-id="${outing.id}">
          <input type="number" class="expense-amt" placeholder="0" min="0" step="0.01" data-outing-id="${outing.id}">
          <select class="expense-payer" data-outing-id="${outing.id}">
            <option value="">Quién pagó</option>${payerOptions}
          </select>
          <button type="button" class="btn btn-primary btn-sm add-expense-btn" data-outing-id="${outing.id}">Añadir</button>
        </div>
        <ul class="expenses-list-mini" data-outing-id="${outing.id}"></ul>
      </div>
      <div class="outing-summary">
        <span>Total: <strong>${formatAmount(totalOuting)}</strong></span>
        ${result.settlements.length > 0 ? `<span class="outing-settlements-preview">${result.settlements.map(s => `${s.from}→${s.to}`).join(', ')}</span>` : ''}
      </div>
    `;
    const checkboxesDiv = card.querySelector('.participants-checkboxes');
    trip.people.forEach(p => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      const checked = outing.participants.includes(p);
      label.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} data-person="${escapeHtml(p)}" data-outing-id="${outing.id}">
        <span>${escapeHtml(p)}</span>
      `;
      label.querySelector('input').addEventListener('change', () => {
        toggleOutingParticipant(trip.id, outing.id, p);
      });
      checkboxesDiv.appendChild(label);
    });
    const expensesList = card.querySelector('.expenses-list-mini');
    outing.expenses.forEach(exp => {
      const li = document.createElement('li');
      li.className = 'expense-item-mini';
      li.innerHTML = `
        <span>${escapeHtml(exp.description)} · ${escapeHtml(exp.payer)}</span>
        <span>${formatAmount(exp.amount)}</span>
        <button type="button" data-expense-id="${exp.id}" data-outing-id="${outing.id}" aria-label="Eliminar">×</button>
      `;
      li.querySelector('button').addEventListener('click', () => removeExpense(trip.id, outing.id, exp.id));
      expensesList.appendChild(li);
    });
    card.querySelector('[data-remove-outing]').addEventListener('click', () => {
      if (confirm(`¿Eliminar la salida "${outing.name}"?`)) removeOuting(trip.id, outing.id);
    });
    card.querySelector('.add-expense-btn').addEventListener('click', () => {
      const desc = card.querySelector('.expense-desc').value;
      const amt = parseFloat(card.querySelector('.expense-amt').value);
      const payer = card.querySelector('.expense-payer').value;
      addExpense(trip.id, outing.id, desc, amt, payer);
      card.querySelector('.expense-desc').value = '';
      card.querySelector('.expense-amt').value = '';
      card.querySelector('.expense-payer').value = '';
    });
    list.appendChild(card);
  });
}

function renderTripSummary() {
  const trip = getCurrentTrip();
  const summary = calculateTripSummary(trip);
  const emptyResults = document.getElementById('emptyResults');
  const settlementDetails = document.getElementById('settlementDetails');
  const exportActions = document.getElementById('exportActions');
  const totalAmount = document.getElementById('totalAmount');
  const balancesList = document.getElementById('balancesList');
  const settlementsList = document.getElementById('settlementsList');
  if (!summary || summary.total < 0.01) {
    emptyResults.hidden = false;
    settlementDetails.hidden = true;
    exportActions.hidden = true;
    return;
  }
  emptyResults.hidden = true;
  settlementDetails.hidden = false;
  exportActions.hidden = false;
  totalAmount.textContent = formatAmount(summary.total);
  balancesList.innerHTML = '';
  trip.people.forEach(name => {
    const bal = summary.balances[name] || 0;
    let balanceClass = 'balance-zero';
    if (bal > 0.01) balanceClass = 'balance-positive';
    else if (bal < -0.01) balanceClass = 'balance-negative';
    const div = document.createElement('div');
    div.className = 'balance-item';
    div.innerHTML = `<span>${escapeHtml(name)}</span><span class="${balanceClass}">${bal > 0.01 ? '+' : ''}${formatAmount(bal)}</span>`;
    balancesList.appendChild(div);
  });
  settlementsList.innerHTML = '';
  if (summary.settlements.length === 0) {
    const li = document.createElement('li');
    li.className = 'settlement-item';
    li.textContent = '¡Todo el mundo está a mano!';
    settlementsList.appendChild(li);
  } else {
    summary.settlements.forEach(s => {
      const li = document.createElement('li');
      li.className = 'settlement-item';
      li.innerHTML = `<span>${escapeHtml(s.from)}</span> <span class="settlement-arrow">→</span> <span>${escapeHtml(s.to)}</span> <span class="settlement-amount">${formatAmount(s.amount)}</span>`;
      settlementsList.appendChild(li);
    });
  }
  updateComprobante(summary);
}

function updateComprobante(summary) {
  document.getElementById('comprobanteSubtitle').textContent = `Resumen: ${escapeHtml(summary.trip.name)}`;
  document.getElementById('comprobanteTotal').textContent = formatAmount(summary.total);
  document.getElementById('comprobanteDate').textContent = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const balancesEl = document.getElementById('comprobanteBalances');
  balancesEl.innerHTML = '';
  summary.trip.people.forEach(name => {
    const bal = summary.balances[name] || 0;
    let cls = '';
    if (bal > 0.01) cls = 'comprobante-balance-positive';
    else if (bal < -0.01) cls = 'comprobante-balance-negative';
    const div = document.createElement('div');
    div.className = 'comprobante-balance-row';
    div.innerHTML = `<span>${escapeHtml(name)}</span><span class="${cls}">${bal > 0.01 ? '+' : ''}${formatAmount(bal)}</span>`;
    balancesEl.appendChild(div);
  });
  const list = document.getElementById('comprobanteSettlementsList');
  list.innerHTML = '';
  if (summary.settlements.length === 0) {
    const li = document.createElement('li');
    li.className = 'comprobante-settlement-item comprobante-settlement-empty';
    li.textContent = 'Todo el mundo está a mano';
    list.appendChild(li);
  } else {
    summary.settlements.forEach(s => {
      const li = document.createElement('li');
      li.className = 'comprobante-settlement-item';
      li.innerHTML = `<span class="comprobante-from">${escapeHtml(s.from)}</span><span class="comprobante-arrow">→</span><span class="comprobante-to">${escapeHtml(s.to)}</span><span class="comprobante-amount">${formatAmount(s.amount)}</span>`;
      list.appendChild(li);
    });
  }
}

// --- Modal salida ---
function openOutingModal() {
  const overlay = document.getElementById('outingModalOverlay');
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('outingNameInput').value = '';
  document.getElementById('outingNameInput').focus();
  document.addEventListener('keydown', handleModalKeydown);
}

function closeOutingModal() {
  const overlay = document.getElementById('outingModalOverlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(e) {
  if (e.key === 'Escape') closeOutingModal();
}

// --- Export ---
async function exportAsImage() {
  const comprobante = document.getElementById('comprobante');
  if (document.getElementById('settlementDetails').hidden) return;
  try {
    comprobante.classList.add('comprobante-visible');
    const canvas = await html2canvas(comprobante, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
    const link = document.createElement('a');
    link.download = `resumen-viaje-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    comprobante.classList.remove('comprobante-visible');
  } catch (e) {
    console.error(e);
    comprobante.classList.remove('comprobante-visible');
  }
}

async function exportAsPdf() {
  const comprobante = document.getElementById('comprobante');
  if (document.getElementById('settlementDetails').hidden) return;
  try {
    comprobante.classList.add('comprobante-visible');
    const JsPDF = (window.jspdf?.jsPDF || window.jspdf) || window.jsPDF;
    if (!JsPDF) throw new Error('jsPDF no disponible');
    const canvas = await html2canvas(comprobante, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const iw = pw - 20;
    const ih = (canvas.height * iw) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, iw, Math.min(ih, ph - 20));
    pdf.save(`resumen-viaje-${Date.now()}.pdf`);
    comprobante.classList.remove('comprobante-visible');
  } catch (e) {
    console.error(e);
    comprobante.classList.remove('comprobante-visible');
  }
}

// --- Init & Events ---
document.getElementById('createTripBtn').addEventListener('click', () => {
  const input = document.getElementById('tripNameInput');
  const trip = createTrip(input.value);
  if (trip) {
    input.value = '';
    showTripDetail(trip.id);
  }
});

document.getElementById('tripNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('createTripBtn').click();
});

document.getElementById('backToTripsBtn').addEventListener('click', showTripsList);

document.getElementById('addParticipant').addEventListener('click', () => {
  const trip = getCurrentTrip();
  const input = document.getElementById('participantName');
  if (trip) addTripPerson(trip.id, input.value);
  input.value = '';
  input.focus();
});

document.getElementById('participantName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addParticipant').click();
});

document.getElementById('addOutingBtn').addEventListener('click', () => {
  const trip = getCurrentTrip();
  if (trip && trip.people.length >= 2) openOutingModal();
});

document.getElementById('confirmOutingBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const trip = getCurrentTrip();
  const input = document.getElementById('outingNameInput');
  if (trip) {
    addOuting(trip.id, input.value);
    closeOutingModal();
  }
});

document.getElementById('outingNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('confirmOutingBtn').click();
});

document.getElementById('cancelOutingBtn').addEventListener('click', closeOutingModal);

document.getElementById('outingModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'outingModalOverlay') closeOutingModal();
});

document.getElementById('currencySelect').addEventListener('change', (e) => {
  state.currency = e.target.value;
  saveToStorage();
  renderTripDetail();
  if (!state.currentTripId) renderTripsList();
});

document.getElementById('exportImage').addEventListener('click', exportAsImage);
document.getElementById('exportPdf').addEventListener('click', exportAsPdf);

// Inicial
loadFromStorage();
if (state.currentTripId && getTrip(state.currentTripId)) {
  showTripDetail(state.currentTripId);
} else {
  state.currentTripId = null;
  showTripsList();
}
