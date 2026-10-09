/* Regras de negócio e cálculos (vendas, lucro, carteira, rankings).
 * Lucro líquido = preço de venda − valor investido − comissão da revendedora (sem impostos).
 * O custo e o preço ficam "congelados" na venda: editar o produto depois não muda vendas antigas.
 */

function calcSale(s) {
  s.subtotal = round2(s.items.reduce((a, i) => a + i.qty * i.price, 0));
  s.discount = round2(Math.min(+s.discount || 0, s.subtotal));
  s.total = round2(s.subtotal - s.discount);
  s.cost = round2(s.items.reduce((a, i) => a + i.qty * i.cost, 0));
  s.commission = s.resellerId ? round2(s.total * (+s.commissionRate || 0) / 100) : 0;
  s.profit = round2(s.total - s.cost - s.commission);
  return s;
}

// Parte "líquida" de cada real recebido nessa venda
const netRatio = s => s.total > 0 ? s.profit / s.total : 0;

function splitInstallments(total, count, firstDate) {
  count = Math.max(1, Math.min(48, +count || 1));
  const base = Math.floor(total * 100 / count) / 100;
  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    dueDate: addMonths(firstDate, i),
    amount: i === count - 1 ? round2(total - base * (count - 1)) : base,
    paidAt: null,
  }));
}

function saleStatus(s) {
  const paid = s.installments.filter(i => i.paidAt).length;
  const today = todayISO();
  if (paid === s.installments.length) return { key: 'paid', label: 'Pago', cls: 'good', paid };
  if (s.installments.some(i => !i.paidAt && i.dueDate < today)) return { key: 'late', label: 'Atrasada', cls: 'bad', paid };
  return { key: 'open', label: `${paid}/${s.installments.length} pagas`, cls: 'warn', paid };
}

// ---- períodos ----
function startOfWeek(iso) { const d = parseISO(iso); const wd = (d.getDay() + 6) % 7; return addDays(iso, -wd); } // semana começa na segunda
function periodRange(preset, ref = todayISO()) {
  const d = parseISO(ref), y = d.getFullYear(), m = d.getMonth();
  const monthStart = localISO(new Date(y, m, 1)), monthEnd = localISO(new Date(y, m + 1, 0));
  switch (preset) {
    case 'week': { const from = startOfWeek(ref); return { from, to: addDays(from, 6) }; }
    case 'month': return { from: monthStart, to: monthEnd };
    case 'lastmonth': return { from: localISO(new Date(y, m - 1, 1)), to: localISO(new Date(y, m, 0)) };
    case 'last7': return { from: addDays(ref, -6), to: ref };
    case 'last30': return { from: addDays(ref, -29), to: ref };
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: '2000-01-01', to: '2100-12-31' };
  }
}
// Período anterior de mesmo tamanho (para comparativos)
function prevRange({ from, to }) {
  const f = parseISO(from), t = parseISO(to);
  const isFullMonth = f.getDate() === 1 && addDays(to, 1).slice(8) === '01';
  if (isFullMonth) {
    const months = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1;
    const pf = addMonths(from, -months);
    return { from: pf, to: addDays(from, -1) };
  }
  const days = Math.round((t - f) / 864e5) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}
const inRange = (iso, r) => iso >= r.from && iso <= r.to;

// Período em andamento (ex.: mês atual até hoje) compara com os mesmos dias do período anterior,
// senão "1 a 9 de outubro" seria comparado com "setembro inteiro".
function prevComparable(range, today = todayISO()) {
  const prev = prevRange(range);
  if (!inRange(today, range) || today === range.to) return prev;
  const elapsed = Math.round((parseISO(today) - parseISO(range.from)) / 864e5);
  return { from: prev.from, to: addDays(prev.from, elapsed) < prev.to ? addDays(prev.from, elapsed) : prev.to };
}

console.assert(JSON.stringify(prevRange({ from: '2026-03-01', to: '2026-03-31' })) === '{"from":"2026-02-01","to":"2026-02-28"}', 'prevRange mês');
console.assert(JSON.stringify(prevRange({ from: '2026-10-05', to: '2026-10-11' })) === '{"from":"2026-09-28","to":"2026-10-04"}', 'prevRange semana');

// ---- linhas de venda (um registro por item vendido) ----
function saleLines(sales) {
  const lines = [];
  for (const s of sales) {
    const f = s.subtotal > 0 ? s.total / s.subtotal : 0; // desconto distribuído proporcionalmente
    for (const it of s.items) {
      const revenue = it.qty * it.price * f;
      const commission = s.resellerId ? revenue * (+s.commissionRate || 0) / 100 : 0;
      const cost = it.qty * it.cost;
      lines.push({
        saleId: s.id, date: s.date, clientId: s.clientId, resellerId: s.resellerId || '',
        productId: it.productId, categoryId: it.categoryId, name: it.name, qty: it.qty,
        revenue, cost, commission, profit: revenue - cost - commission,
      });
    }
  }
  return lines;
}

// filtros: { range, clientId, productId, categoryId, resellerId ('' todos | 'direct' | id) }
function filterLines(lines, f = {}) {
  return lines.filter(l =>
    (!f.range || inRange(l.date, f.range)) &&
    (!f.clientId || l.clientId === f.clientId) &&
    (!f.productId || l.productId === f.productId) &&
    (!f.categoryId || l.categoryId === f.categoryId) &&
    (!f.resellerId || (f.resellerId === 'direct' ? !l.resellerId : l.resellerId === f.resellerId)));
}

function summarize(lines) {
  const s = { revenue: 0, cost: 0, commission: 0, profit: 0, pieces: 0 };
  const sales = new Set();
  for (const l of lines) {
    s.revenue += l.revenue; s.cost += l.cost; s.commission += l.commission; s.profit += l.profit; s.pieces += l.qty;
    sales.add(l.saleId);
  }
  s.count = sales.size;
  s.ticket = s.count ? s.revenue / s.count : 0;
  s.margin = s.revenue ? s.profit / s.revenue : 0;
  return s;
}

// Agrupa e ordena por faturamento
function groupLines(lines, keyFn, labelFn) {
  const m = new Map();
  for (const l of lines) {
    const k = keyFn(l);
    const g = m.get(k) || { key: k, label: labelFn(k, l), revenue: 0, profit: 0, qty: 0, commission: 0, sales: new Set() };
    g.revenue += l.revenue; g.profit += l.profit; g.qty += l.qty; g.commission += l.commission; g.sales.add(l.saleId);
    m.set(k, g);
  }
  return [...m.values()].map(g => ({ ...g, count: g.sales.size })).sort((a, b) => b.revenue - a.revenue);
}

const byProduct = lines => groupLines(lines, l => l.productId, (k, l) => Store.product(k)?.name || l.name);
const byCategory = lines => groupLines(lines, l => l.categoryId || '-', k => Store.category(k)?.name || 'Sem categoria');
const byClient = lines => groupLines(lines, l => l.clientId, k => Store.clientName(k));
const byReseller = lines => groupLines(lines, l => l.resellerId, k => Store.sellerName(k));

function byWeekday(lines) {
  const out = WEEKDAYS.map((label, i) => ({ key: i, label, revenue: 0, qty: 0, sales: new Set() }));
  lines.forEach(l => { const g = out[parseISO(l.date).getDay()]; g.revenue += l.revenue; g.qty += l.qty; g.sales.add(l.saleId); });
  return out.map(g => ({ ...g, count: g.sales.size }));
}

// Série temporal: por dia (até ~62 dias) ou por mês
function timeSeries(lines, range) {
  const days = Math.round((parseISO(range.to) - parseISO(range.from)) / 864e5) + 1;
  const monthly = days > 62;
  const keyOf = iso => monthly ? iso.slice(0, 7) : iso;
  const keys = [];
  if (monthly) {
    let cur = range.from.slice(0, 7) + '-01';
    while (cur <= range.to && keys.length < 120) { keys.push(cur.slice(0, 7)); cur = addMonths(cur, 1); }
  } else {
    for (let i = 0; i < days; i++) keys.push(addDays(range.from, i));
  }
  const map = new Map(keys.map(k => [k, { revenue: 0, profit: 0 }]));
  lines.forEach(l => { const g = map.get(keyOf(l.date)); if (g) { g.revenue += l.revenue; g.profit += l.profit; } });
  const label = k => monthly ? `${MONTHS[+k.slice(5) - 1].slice(0, 3)}/${k.slice(2, 4)}` : fmtDateShort(k);
  return { monthly, labels: keys.map(label), keys, revenue: keys.map(k => map.get(k).revenue), profit: keys.map(k => map.get(k).profit) };
}

// Data com maior faturamento
function bestDay(lines) {
  const m = new Map();
  lines.forEach(l => m.set(l.date, (m.get(l.date) || 0) + l.revenue));
  let best = null;
  m.forEach((v, k) => { if (!best || v > best.revenue) best = { date: k, revenue: v }; });
  return best;
}

// ---- carteira ----
// Recebido = parcelas pagas dentro do período; a receber = todas as parcelas em aberto.
function walletStats(sales, range, resellerId = '') {
  const today = todayISO();
  const w = { gross: 0, net: 0, cost: 0, commission: 0, toReceive: 0, toReceiveNet: 0, late: 0, lateCount: 0, openCount: 0 };
  for (const s of sales) {
    if (resellerId && (resellerId === 'direct' ? s.resellerId : s.resellerId !== resellerId)) continue;
    const r = netRatio(s);
    const costShare = s.total > 0 ? s.cost / s.total : 0;
    const comShare = s.total > 0 ? s.commission / s.total : 0;
    for (const i of s.installments) {
      if (i.paidAt) {
        if (!range || inRange(i.paidAt, range)) {
          w.gross += i.amount; w.net += i.amount * r; w.cost += i.amount * costShare; w.commission += i.amount * comShare;
        }
      } else {
        w.toReceive += i.amount; w.toReceiveNet += i.amount * r; w.openCount++;
        if (i.dueDate < today) { w.late += i.amount; w.lateCount++; }
      }
    }
  }
  return w;
}

(() => { // verificação rápida da regra de lucro
  const s = calcSale({ resellerId: 'r', commissionRate: 10, discount: 0, items: [{ qty: 2, price: 100, cost: 40 }] });
  console.assert(s.total === 200 && s.cost === 80 && s.commission === 20 && s.profit === 100, 'calcSale');
  const p = splitInstallments(100, 3, '2026-01-10');
  console.assert(p.map(x => x.amount).join() === '33.33,33.33,33.34' && p[2].dueDate === '2026-03-10', 'parcelas');
})();
