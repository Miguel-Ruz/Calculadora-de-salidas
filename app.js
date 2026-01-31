/**
 * Divide — Calculadora de gastos compartidos
 * Calcula quién debe pagar a quién cuando un grupo de personas comparte gastos
 */

// Configuración de monedas
const CURRENCIES = {
  COP: {
    code: 'COP',
    name: 'Peso colombiano',
    symbol: '$',
    decimals: 0,
    locale: 'es-CO'
  },
  USD: {
    code: 'USD',
    name: 'Dólar estadounidense',
    symbol: 'US$',
    decimals: 2,
    locale: 'en-US'
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimals: 2,
    locale: 'de-DE'
  }
};

// Estado de la aplicación
const state = {
  participants: [],
  expenses: [],
  currency: 'COP'
};

// Referencias DOM
const elements = {
  participantName: document.getElementById('participantName'),
  addParticipant: document.getElementById('addParticipant'),
  participantsTags: document.getElementById('participantsTags'),
  participantsHint: document.getElementById('participantsHint'),
  expenseSectionLock: document.getElementById('expenseSectionLock'),
  expenseForm: document.getElementById('expenseForm'),
  expenseDescription: document.getElementById('expenseDescription'),
  expenseAmount: document.getElementById('expenseAmount'),
  expensePayer: document.getElementById('expensePayer'),
  addExpense: document.getElementById('addExpense'),
  expensesList: document.getElementById('expensesList'),
  resultsSection: document.getElementById('resultsSection'),
  resultsContent: document.getElementById('resultsContent'),
  emptyResults: document.getElementById('emptyResults'),
  settlementDetails: document.getElementById('settlementDetails'),
  resultsPreview: document.getElementById('resultsPreview'),
  totalAmount: document.getElementById('totalAmount'),
  perPerson: document.getElementById('perPerson'),
  balancesList: document.getElementById('balancesList'),
  settlementsList: document.getElementById('settlementsList'),
  exportActions: document.getElementById('exportActions'),
  exportImage: document.getElementById('exportImage'),
  exportPdf: document.getElementById('exportPdf'),
  comprobante: document.getElementById('comprobante'),
  comprobanteTotal: document.getElementById('comprobanteTotal'),
  comprobantePerPerson: document.getElementById('comprobantePerPerson'),
  comprobanteBalances: document.getElementById('comprobanteBalances'),
  comprobanteSettlementsList: document.getElementById('comprobanteSettlementsList'),
  comprobanteDate: document.getElementById('comprobanteDate'),
  currencySelect: document.getElementById('currencySelect'),
  expenseAmountLabel: document.getElementById('expenseAmountLabel')
};

// Añadir participante
function addParticipant() {
  const name = elements.participantName.value.trim();
  if (!name) return;
  
  const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (state.participants.includes(normalized)) return;
  
  state.participants.push(normalized);
  elements.participantName.value = '';
  elements.participantName.focus();
  
  renderParticipants();
  updateExpensePayerSelect();
  calculateAndRender();
}

// Eliminar participante
function removeParticipant(name) {
  state.participants = state.participants.filter(p => p !== name);
  state.expenses = state.expenses.filter(e => e.payer !== name);
  
  renderParticipants();
  updateExpensePayerSelect();
  renderExpenses();
  calculateAndRender();
}

// Actualizar estado del bloqueo de gastos
function updateExpenseSectionLock() {
  const canAddExpenses = state.participants.length >= 2;
  elements.expenseSectionLock.hidden = canAddExpenses;
  elements.expenseSectionLock.setAttribute('aria-hidden', String(canAddExpenses));
  if ('inert' in document.documentElement) {
    elements.expenseForm.inert = !canAddExpenses;
  }
  elements.expenseForm.classList.toggle('form-locked', !canAddExpenses);
}

// Renderizar tags de participantes
function renderParticipants() {
  elements.participantsTags.innerHTML = '';
  elements.participantsHint.textContent = state.participants.length < 2
    ? 'Añade al menos 2 personas para registrar gastos'
    : `${state.participants.length} personas`;
  updateExpenseSectionLock();
  
  state.participants.forEach(name => {
    const li = document.createElement('li');
    li.className = 'participant-tag';
    li.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <button type="button" data-name="${escapeHtml(name)}" aria-label="Eliminar ${escapeHtml(name)}">×</button>
    `;
    li.querySelector('button').addEventListener('click', () => removeParticipant(name));
    elements.participantsTags.appendChild(li);
  });
}

// Actualizar select de quien pagó
function updateExpensePayerSelect() {
  const options = state.participants.map(p =>
    `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`
  ).join('');
  
  elements.expensePayer.innerHTML = 
    '<option value="">Selecciona quién pagó</option>' + options;
  updateExpenseSectionLock();
}

// Añadir gasto
function addExpense() {
  if (state.participants.length < 2) return;
  const description = elements.expenseDescription.value.trim();
  const amount = parseFloat(elements.expenseAmount.value);
  const payer = elements.expensePayer.value;
  
  if (!description || isNaN(amount) || amount <= 0 || !payer) return;
  
  state.expenses.push({
    id: Date.now(),
    description,
    amount: Math.round(amount * 100) / 100,
    payer
  });
  
  elements.expenseDescription.value = '';
  elements.expenseAmount.value = '';
  elements.expensePayer.value = '';
  elements.expenseDescription.focus();
  
  renderExpenses();
  calculateAndRender();
}

// Eliminar gasto
function removeExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  renderExpenses();
  calculateAndRender();
}

// Renderizar lista de gastos
function renderExpenses() {
  elements.expensesList.innerHTML = '';
  
  state.expenses.forEach(exp => {
    const li = document.createElement('li');
    li.className = 'expense-item';
    li.innerHTML = `
      <div class="expense-item-info">
        <div class="expense-item-description">${escapeHtml(exp.description)}</div>
        <div class="expense-item-meta">Pagado por ${escapeHtml(exp.payer)}</div>
      </div>
      <span class="expense-item-amount">${formatAmount(exp.amount)}</span>
      <button type="button" data-id="${exp.id}" aria-label="Eliminar gasto">×</button>
    `;
    li.querySelector('button').addEventListener('click', () => removeExpense(exp.id));
    elements.expensesList.appendChild(li);
  });
}

/**
 * Calcula los pagos necesarios para equilibrar.
 * Algoritmo: repartir el total a partes iguales, calcular balance por persona,
 * minimizar transacciones emparejando deudores con acreedores.
 */
function calculateSettlements() {
  if (state.participants.length < 2 || state.expenses.length === 0) {
    return null;
  }
  
  const total = state.expenses.reduce((sum, e) => sum + e.amount, 0);
  const share = total / state.participants.length;
  
  // Cuánto pagó cada uno
  const paid = {};
  state.participants.forEach(p => { paid[p] = 0; });
  state.expenses.forEach(e => {
    paid[e.payer] = (paid[e.payer] || 0) + e.amount;
  });
  
  // Balance: positivo = le deben, negativo = debe
  const balances = {};
  state.participants.forEach(p => {
    balances[p] = Math.round((paid[p] - share) * 100) / 100;
  });
  
  // Separar acreedores (positive) y deudores (negative)
  const creditors = state.participants
    .filter(p => balances[p] > 0.01)
    .map(p => ({ name: p, amount: balances[p] }))
    .sort((a, b) => b.amount - a.amount);
  
  const debtors = state.participants
    .filter(p => balances[p] < -0.01)
    .map(p => ({ name: p, amount: -balances[p] }))
    .sort((a, b) => b.amount - a.amount);
  
  // Algoritmo greedy: mínimo número de transacciones
  const settlements = [];
  let i = 0, j = 0;
  
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i];
    const deb = debtors[j];
    const amount = Math.min(cred.amount, deb.amount);
    const rounded = Math.round(amount * 100) / 100;
    
    if (rounded > 0.01) {
      settlements.push({
        from: deb.name,
        to: cred.name,
        amount: rounded
      });
    }
    
    cred.amount -= amount;
    deb.amount -= amount;
    
    if (cred.amount < 0.01) i++;
    if (deb.amount < 0.01) j++;
  }
  
  return {
    total,
    share,
    balances,
    settlements
  };
}

// Mostrar resultados y actualizar comprobante
function calculateAndRender() {
  const result = calculateSettlements();
  
  if (!result) {
    elements.emptyResults.hidden = false;
    elements.settlementDetails.hidden = true;
    elements.exportActions.hidden = true;
    return;
  }
  
  elements.emptyResults.hidden = true;
  elements.settlementDetails.hidden = false;
  elements.exportActions.hidden = false;
  
  elements.totalAmount.textContent = formatAmount(result.total);
  elements.perPerson.textContent = formatAmount(result.share);
  
  // Balances
  elements.balancesList.innerHTML = '';
  state.participants.forEach(name => {
    const bal = result.balances[name];
    const div = document.createElement('div');
    div.className = 'balance-item';
    let balanceClass = 'balance-zero';
    if (bal > 0.01) balanceClass = 'balance-positive';
    else if (bal < -0.01) balanceClass = 'balance-negative';
    
    div.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <span class="${balanceClass}">
        ${bal > 0.01 ? '+' : ''}${formatAmount(bal)}
      </span>
    `;
    elements.balancesList.appendChild(div);
  });
  
  // Settlements
  elements.settlementsList.innerHTML = '';
  if (result.settlements.length === 0) {
    const li = document.createElement('li');
    li.className = 'settlement-item';
    li.textContent = '¡Todo el mundo está a mano!';
    elements.settlementsList.appendChild(li);
  } else {
    result.settlements.forEach(s => {
      const li = document.createElement('li');
      li.className = 'settlement-item';
      li.innerHTML = `
        <span>${escapeHtml(s.from)}</span>
        <span class="settlement-arrow">→</span>
        <span>${escapeHtml(s.to)}</span>
        <span class="settlement-amount">${formatAmount(s.amount)}</span>
      `;
      elements.settlementsList.appendChild(li);
    });
  }
  
  // Actualizar comprobante para exportación
  updateComprobante(result);
}

function updateComprobante(result) {
  elements.comprobanteTotal.textContent = formatAmount(result.total);
  elements.comprobantePerPerson.textContent = formatAmount(result.share);
  elements.comprobanteDate.textContent = new Date().toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  
  elements.comprobanteBalances.innerHTML = '';
  state.participants.forEach(name => {
    const bal = result.balances[name];
    const div = document.createElement('div');
    div.className = 'comprobante-balance-row';
    let balClass = '';
    if (bal > 0.01) balClass = 'comprobante-balance-positive';
    else if (bal < -0.01) balClass = 'comprobante-balance-negative';
    div.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <span class="${balClass}">${bal > 0.01 ? '+' : ''}${formatAmount(bal)}</span>
    `;
    elements.comprobanteBalances.appendChild(div);
  });
  
  elements.comprobanteSettlementsList.innerHTML = '';
  if (result.settlements.length === 0) {
    const li = document.createElement('li');
    li.className = 'comprobante-settlement-item comprobante-settlement-empty';
    li.textContent = 'Todo el mundo está a mano';
    elements.comprobanteSettlementsList.appendChild(li);
  } else {
    result.settlements.forEach(s => {
      const li = document.createElement('li');
      li.className = 'comprobante-settlement-item';
      li.innerHTML = `
        <span class="comprobante-from">${escapeHtml(s.from)}</span>
        <span class="comprobante-arrow">→</span>
        <span class="comprobante-to">${escapeHtml(s.to)}</span>
        <span class="comprobante-amount">${formatAmount(s.amount)}</span>
      `;
      elements.comprobanteSettlementsList.appendChild(li);
    });
  }
}

// Exportar como imagen
async function exportAsImage() {
  const comprobante = elements.comprobante;
  
  if (elements.settlementDetails.hidden) return;
  
  try {
    comprobante.classList.add('comprobante-visible');
    const canvas = await html2canvas(comprobante, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });
    
    const link = document.createElement('a');
    link.download = `gastos-compartidos-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    comprobante.classList.remove('comprobante-visible');
  } catch (err) {
    console.error('Error al exportar imagen:', err);
    comprobante.classList.remove('comprobante-visible');
  }
}

// Exportar como PDF
async function exportAsPdf() {
  const comprobante = elements.comprobante;
  
  if (elements.settlementDetails.hidden) return;
  
  try {
    comprobante.classList.add('comprobante-visible');
    const JsPDF = (window.jspdf && (window.jspdf.jsPDF || window.jspdf)) || window.jsPDF;
    if (!JsPDF) throw new Error('jsPDF no está disponible');
    const canvas = await html2canvas(comprobante, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pageHeight - 20));
    pdf.save(`gastos-compartidos-${Date.now()}.pdf`);
    comprobante.classList.remove('comprobante-visible');
  } catch (err) {
    console.error('Error al exportar PDF:', err);
    comprobante.classList.remove('comprobante-visible');
  }
}

// Utilidades
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

function updateCurrencyUI() {
  const curr = getCurrency();
  elements.expenseAmountLabel.textContent = `Importe (${curr.symbol})`;
  elements.expenseAmount.placeholder = curr.decimals === 0 ? '0' : '0.00';
  elements.expenseAmount.step = curr.decimals === 0 ? '1' : '0.01';
  renderExpenses();
  calculateAndRender();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
elements.addParticipant.addEventListener('click', addParticipant);
elements.participantName.addEventListener('keydown', e => {
  if (e.key === 'Enter') addParticipant();
});

elements.addExpense.addEventListener('click', addExpense);
elements.expenseDescription.addEventListener('keydown', e => {
  if (e.key === 'Enter') elements.expenseAmount.focus();
});
elements.expenseAmount.addEventListener('keydown', e => {
  if (e.key === 'Enter') addExpense();
});

elements.expenseAmount.addEventListener('blur', () => {
  const val = elements.expenseAmount.value;
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 0) {
    elements.expenseAmount.value = formatInputAmount(num);
  }
});

elements.exportImage.addEventListener('click', exportAsImage);
elements.exportPdf.addEventListener('click', exportAsPdf);

elements.currencySelect.addEventListener('change', (e) => {
  state.currency = e.target.value;
  updateCurrencyUI();
});

// Estado inicial
updateExpenseSectionLock();
updateCurrencyUI();
