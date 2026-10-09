/* Utilidades gerais: HTML seguro, formatação, datas, diálogos. */

// Template HTML que escapa tudo por padrão. Use raw() só para HTML gerado pelo próprio app.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = s => new Raw(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function html(strings, ...vals) {
  let out = '';
  const part = v => v instanceof Raw ? v.s : (v === false || v == null) ? '' : esc(v);
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += Array.isArray(vals[i]) ? vals[i].map(part).join('') : part(vals[i]);
  });
  return raw(out);
}

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const round2 = n => Math.round((+n || 0) * 100) / 100;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => BRL.format(+v || 0);
const num = v => new Intl.NumberFormat('pt-BR').format(+v || 0);
const pct = v => (isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0') + '%';

// ---- datas (sempre strings ISO "AAAA-MM-DD" no fuso local) ----
const localISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayISO = () => localISO(new Date());
const parseISO = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = s => s ? parseISO(s).toLocaleDateString('pt-BR') : '';
const fmtDateShort = s => s ? parseISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return localISO(d); };
function addMonths(iso, n) {
  const d = parseISO(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return localISO(d);
}
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthLabel = iso => { const d = parseISO(iso); return `${MONTHS[d.getMonth()]}/${d.getFullYear()}`; };

console.assert(addMonths('2026-01-31', 1) === '2026-02-28', 'addMonths fim de mês');
console.assert(addMonths('2026-11-15', 2) === '2027-01-15', 'addMonths virada de ano');

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const onlyDigits = s => String(s || '').replace(/\D/g, '');
const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Telefone brasileiro → formato do wa.me (55 + DDD + número)
function waPhone(phone) {
  let d = onlyDigits(phone);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return d;
}
function openWhatsApp(text, phone = '') {
  const url = `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

// ---- ícones (traço simples, estilo Lucide) ----
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.6"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
  report: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  whats: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  send: '<path d="M4 12h12M12 6l6 6-6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
};
const icon = (name, size) => raw(`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"${size ? ` style="width:${size}px;height:${size}px"` : ''}>${ICONS[name] || ''}</svg>`);

// ---- toast ----
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---- diálogo único reaproveitado ----
// openModal({ title, body, actions, onSubmit, onOpen }) — onSubmit(form) pode retornar false para manter aberto.
const Modal = {
  open({ title, body, actions = [], submitText = 'Salvar', onSubmit, onOpen, hideSubmit = false }) {
    const dlg = $('#dlg'), form = $('#dlg-form');
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = String(body);
    const foot = actions.map(a => html`<button type="button" class="btn ${a.cls || ''}" data-dlg-act="${a.id}">${a.icon ? icon(a.icon) : ''}${a.label}</button>`);
    if (actions.length) foot.push(raw('<span class="spacer"></span>'));
    foot.push(html`<button type="button" class="btn" data-close>${hideSubmit ? 'Fechar' : 'Cancelar'}</button>`);
    if (!hideSubmit) foot.push(html`<button type="submit" class="btn primary">${submitText}</button>`);
    $('#dlg-foot').innerHTML = foot.join('');
    form.onsubmit = async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = $('button[type=submit]', form);
      if (btn) btn.disabled = true;
      try {
        const keep = onSubmit ? await onSubmit(form) : undefined;
        if (keep !== false) dlg.close();
      } catch (err) {
        console.error(err);
        toast('Erro: ' + err.message);
      } finally { if (btn) btn.disabled = false; }
    };
    $('#dlg-foot').onclick = e => {
      const b = e.target.closest('[data-dlg-act]');
      if (b) actions.find(a => a.id === b.dataset.dlgAct)?.run(form);
    };
    if (!dlg.open) dlg.showModal();
    $('#dlg-body').scrollTop = 0;
    onOpen?.(form);
  },
  close() { const d = $('#dlg'); if (d.open) d.close(); },
};
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) Modal.close(); });

function confirmBox(message, okText = 'Confirmar', danger = true) {
  return new Promise(resolve => {
    let ok = false;
    Modal.open({
      title: 'Confirmar', body: html`<p>${message}</p>`, submitText: okText,
      onSubmit: () => { ok = true; },
    });
    if (danger) $('#dlg-foot button[type=submit]').classList.add('danger');
    $('#dlg').addEventListener('close', () => resolve(ok), { once: true });
  });
}

// Lê um formulário como objeto simples
const formData = form => Object.fromEntries(new FormData(form).entries());

// Reduz a foto no próprio aparelho antes de salvar/enviar (economiza espaço e internet)
async function resizeImage(file, max = 1100, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}

function dataURLtoFile(dataURL, name) {
  const [head, b64] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
