'use strict';

// Records live only in this phone's storage: v1 has no server (backup is R6, a later ticket).
const STORE_KEY = 'kasuwabook.records.v1';
const MAX_AMOUNT = 10000000;

const COPY = {
  sale: {
    amount: 'How much did you sell?',
    note: 'What did you sell? (optional)',
    notePlaceholder: '2 yards ankara',
    save: 'Save sale',
    missing: 'Enter how much you sold',
    saved: 'Sale saved',
    name: 'Sale',
  },
  expense: {
    amount: 'How much did you spend?',
    note: 'What was it for? (optional)',
    notePlaceholder: 'Transport to market',
    save: 'Save expense',
    missing: 'Enter how much you spent',
    saved: 'Expense saved',
    name: 'Expense',
  },
};

const $ = (id) => document.getElementById(id);
const form = $('entry');
const amountInput = $('amount');
const noteInput = $('note');
const errorEl = $('amount-error');
const fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

// The trader's local calendar day, so "today" ends at their midnight, not UTC's.
function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORE_KEY, JSON.stringify(records)); // throws when storage is full or blocked
}

function currentType() {
  return form.elements.type.value;
}

// Whole numbers only; commas and spaces are fine: "3,500" -> 3500.
function parseAmount(raw) {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (cleaned === '' || /^0+$/.test(cleaned)) return { missing: true };
  if (!/^\d+$/.test(cleaned)) return { error: 'Enter a whole number, like 3500' };
  const value = Number(cleaned);
  if (value > MAX_AMOUNT) return { error: `The most you can enter is ${fmt.format(MAX_AMOUNT)}` };
  return { value };
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  amountInput.setAttribute('aria-invalid', 'true');
  amountInput.focus();
}

function clearError() {
  errorEl.hidden = true;
  amountInput.removeAttribute('aria-invalid');
}

function applyType() {
  const copy = COPY[currentType()];
  $('amount-label').textContent = copy.amount;
  $('note-label').textContent = copy.note;
  noteInput.placeholder = copy.notePlaceholder;
  $('save').textContent = copy.save;
  form.classList.toggle('is-expense', currentType() === 'expense');
  clearError();
}

function recordItem(record) {
  const li = document.createElement('li');

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = new Date(record.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = record.note || COPY[record.type].name;
  if (record.note) {
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = COPY[record.type].name;
    what.append(kind);
  }

  const amount = document.createElement('span');
  amount.className = `amount ${record.type}`;
  amount.textContent = (record.type === 'sale' ? '+' : '−') + fmt.format(record.amount);

  li.append(time, what, amount);
  return li;
}

let renderedDay = '';
function render() {
  const now = new Date();
  renderedDay = dayKey(now);
  $('today-label').textContent = 'Today, ' + now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const today = loadRecords()
    .filter((r) => r.day === renderedDay)
    .sort((a, b) => b.at.localeCompare(a.at));

  let sales = 0;
  let expenses = 0;
  for (const r of today) {
    if (r.type === 'sale') sales += r.amount;
    else expenses += r.amount;
  }
  const profit = sales - expenses;

  $('total-sales').textContent = fmt.format(sales);
  $('total-expenses').textContent = fmt.format(expenses);
  $('total-profit').textContent = fmt.format(Math.abs(profit));
  $('profit-label').textContent = profit < 0 ? 'Loss' : 'Profit';
  $('profit-tile').classList.toggle('loss', profit < 0);

  $('records').replaceChildren(...today.map(recordItem));
  $('empty').hidden = today.length > 0;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const type = currentType();
  const parsed = parseAmount(amountInput.value);
  if (parsed.missing) return showError(COPY[type].missing);
  if (parsed.error) return showError(parsed.error);

  const now = new Date();
  const record = {
    id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
    type,
    amount: parsed.value,
    note: noteInput.value.trim(),
    at: now.toISOString(),
    day: dayKey(now),
  };

  try {
    saveRecords([...loadRecords(), record]);
  } catch {
    toast('Could not save on this phone. Storage may be full.');
    return;
  }

  amountInput.value = '';
  noteInput.value = '';
  clearError();
  render();
  toast(COPY[type].saved);
  amountInput.focus();
});

form.addEventListener('change', (event) => {
  if (event.target.name === 'type') applyType();
});
amountInput.addEventListener('input', clearError);

function updateNetwork() {
  $('net-status').hidden = navigator.onLine;
}
window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);

// A new day starts the totals from zero, even when the app stays open overnight.
setInterval(() => { if (dayKey(new Date()) !== renderedDay) render(); }, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyType();
updateNetwork();
render();
