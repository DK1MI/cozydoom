'use strict';

const PCT_MIN = 5, PCT_MAX = 300, PCT_STEP = 5;
const choices = {};          // slotKey -> { src, pct }
const rows = {};             // slotKey -> { tr, select, range, num, hp, note }

const PRESETS = {
  reset: () => ({}),
  classic: () => ({
    MT_VILE: { src: 'MT_TROOP', pct: 100 },
    MT_UNDEAD: { src: 'MT_TROOP', pct: 100 },
    MT_PAIN: { src: 'MT_HEAD', pct: 100 },
    MT_SKULL: { src: 'MT_SKULL', pct: 20 },
  }),
};

const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const clampPct = v => Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(Number(v) || 100)));

function get(slotKey) {
  return choices[slotKey] || { src: slotKey, pct: 100 };
}

function set(slotKey, patch) {
  const c = { ...get(slotKey), ...patch };
  if (c.src === slotKey && c.pct === 100) delete choices[slotKey];
  else choices[slotKey] = c;
  refresh();
}

function notesFor(slot, src) {
  const n = [];
  if (slot.key === 'MT_SKULL' && src.key !== 'MT_SKULL')
    n.push(`Pain Elementals will spit ${src.name}s instead of Lost Souls.`);
  if (needsBossFix(slot, src))
    n.push('Boss-exit fix added so MAP07 still opens (needs a DEHEXTRA port such as dsda-doom, Woof or Nugget; GZDoom is fine).');
  return n.join(' ');
}

function buildTable() {
  const body = $('#monsters');
  for (const slot of MONSTERS) {
    const select = el('select', {},
      ...MONSTERS.map(m => el('option', { value: m.key, textContent: `${m.name} (${m.spawnhealth} HP)` })));
    select.setAttribute('aria-label', `Replacement for ${slot.name}`);
    select.addEventListener('change', () => set(slot.key, { src: select.value }));

    const range = el('input', { type: 'range', min: PCT_MIN, max: PCT_MAX, step: PCT_STEP });
    range.setAttribute('aria-label', `Health percentage for ${slot.name}`);
    range.addEventListener('input', () => set(slot.key, { pct: clampPct(range.value) }));

    const num = el('input', { type: 'number', min: PCT_MIN, max: PCT_MAX, step: 1, className: 'pct-num' });
    num.setAttribute('aria-label', `Health percentage for ${slot.name}`);
    num.addEventListener('change', () => { num.value = clampPct(num.value); set(slot.key, { pct: Number(num.value) }); });

    const hp = el('span', { className: 'hp' });
    const note = el('div', { className: 'note' });
    const tr = el('tr', {},
      el('th', { scope: 'row' },
        el('span', { className: 'mname', textContent: slot.name }),
        el('span', { className: 'meta', textContent: `#${slot.doomednum} · ${slot.spawnhealth} HP` })),
      el('td', { className: 'c-repl' }, select, note),
      el('td', { className: 'c-health' },
        el('div', { className: 'health' }, range, el('label', { className: 'pct' }, num, '%'), hp)));
    body.append(tr);
    rows[slot.key] = { tr, select, range, num, hp, note };
  }
}

function refresh() {
  for (const slot of MONSTERS) {
    const c = get(slot.key), r = rows[slot.key], src = BY_KEY[c.src];
    r.select.value = c.src;
    r.range.value = c.pct;
    if (document.activeElement !== r.num) r.num.value = c.pct;
    r.hp.textContent = `${scaledHealth(src, c.pct)} HP`;
    r.tr.classList.toggle('changed', c.src !== slot.key || c.pct !== 100);
    r.note.textContent = notesFor(slot, src);
  }
  const lumps = buildLumps(choices);
  const n = lumps.changes.length;
  $('#summary').textContent = n
    ? `${n} monster${n === 1 ? '' : 's'} changed`
    : 'No changes yet: the WAD would leave Doom II untouched';
  $('#download').disabled = n === 0;
  for (const name of ['DEHACKED', 'ZSCRIPT', 'ZMAPINFO']) $(`#lump-${name}`).textContent = lumps[name];
  writeHash();
}

// ---- shareable links: #c=<slot>.<src>.<pct>,... (indices into MONSTERS) ----
function writeHash() {
  const parts = MONSTERS.flatMap((slot, i) => {
    const c = choices[slot.key];
    return c ? [`${i}.${MONSTERS.findIndex(m => m.key === c.src)}.${c.pct}`] : [];
  });
  const h = parts.length ? '#c=' + parts.join(',') : '';
  if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
}

function readHash() {
  const m = /[#&]c=([\d.,]+)/.exec(location.hash);
  if (!m) return false;
  for (const part of m[1].split(',')) {
    const [s, r, p] = part.split('.').map(Number);
    if (MONSTERS[s] && MONSTERS[r]) choices[MONSTERS[s].key] = { src: MONSTERS[r].key, pct: clampPct(p) };
  }
  return true;
}

function applyPreset(name) {
  for (const k of Object.keys(choices)) delete choices[k];
  Object.assign(choices, PRESETS[name]());
  refresh();
}

function applyAllHealth() {
  const pct = clampPct($('#all-pct').value);
  for (const slot of MONSTERS) set(slot.key, { pct });
}

function download() {
  const bytes = buildWad(choices);
  let name = ($('#filename').value || 'cozydoom').trim().replace(/[^\w.-]+/g, '_');
  if (!/\.wad$/i.test(name)) name += '.wad';
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyLink() {
  navigator.clipboard.writeText(location.href).then(
    () => { $('#copy-link').textContent = 'Link copied'; setTimeout(() => { $('#copy-link').textContent = 'Copy share link'; }, 1500); },
    () => prompt('Copy this link:', location.href));
}

buildTable();
readHash();
refresh();
$('#builder').addEventListener('submit', e => { e.preventDefault(); download(); });
// Enter in a percentage box commits the value instead of downloading the WAD.
$('#builder').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.type !== 'number') return;
  e.preventDefault();
  if (e.target.id === 'all-pct') applyAllHealth();
  else e.target.dispatchEvent(new Event('change'));
});
$('#preset-reset').addEventListener('click', () => applyPreset('reset'));
$('#preset-classic').addEventListener('click', () => applyPreset('classic'));
$('#all-apply').addEventListener('click', applyAllHealth);
$('#copy-link').addEventListener('click', copyLink);
