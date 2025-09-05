// ui/script.js

// API base (GH Pages -> Render, localhost -> local)
const ALT_API  = 'http://localhost:3000/api';
const PROD_API = 'https://shipping-quote-api.onrender.com/api';
const API = (location.hostname === 'localhost') ? ALT_API : PROD_API;

const $ = (id) => document.getElementById(id);

let PRODUCT_PRESETS = {};
let SERVICE_OPTIONS = {};
let APP_RULES = null;

// Items shown as "(pair)" in the description
const PAIR_ITEMS = new Set(['TSR1 RB', 'TSR1 FS', 'TSR1 FA']);
function formattedDesc(key) {
  const base = PRODUCT_PRESETS[key]?.desc || '';
  return PAIR_ITEMS.has(key) ? `${base} (pair)` : base;
}

// Explicit max-per-package map (used for add-on logic)
const MAX_PER_PKG_MAP = {
  "TSR1 RB": 6, "TSR1 FS": 6, "TSR1 FA": 1,
  "TSR1 RM": 1, "TSR1 PA": 1, "ISR/TSR - HW Stopper & TSR - HW73": 6,
};

/* =========================
   Country combobox (searchable) — robust
   ========================= */

// ISO-3166 alpha-2 region codes (includes territories)
const ISO_REGION_CODES = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI",
  "KH","CM","CA","CV","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ",
  "FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP",
  "JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MK","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS",
  "MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC",
  "MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN",
  "TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU","VE","VN","VG","VI","WF","EH","YE","ZM","ZW"
];

// Build [{code, name, norm}] using the browser's locale names (fallback to code)
const regionNames = (typeof Intl?.DisplayNames === 'function')
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const COUNTRIES = ISO_REGION_CODES
  .map(code => {
    const name = regionNames?.of?.(code) || code;
    return { code, name, norm: String(name).toLowerCase() };
  })
  .filter(x => x.name && x.name !== x.code)
  .sort((a,b) => a.name.localeCompare(b.name));

// Common name overrides (handy shortcuts)
const NAME_TO_CODE_OVERRIDES = {
  'us': 'US', 'usa': 'US', 'united states': 'US', 'united states of america': 'US',
  'uk': 'GB', 'united kingdom': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'uae': 'AE', 'emirates': 'AE',
  'south korea': 'KR', 'korea': 'KR',
  'north korea': 'KP',
  'czech republic': 'CZ',
  'russia': 'RU',
  'vietnam': 'VN',
  'laos': 'LA',
};

function resolveCountryInputToCode(str) {
  const q = (str || '').trim().toLowerCase();
  if (!q) return '';
  if (NAME_TO_CODE_OVERRIDES[q]) return NAME_TO_CODE_OVERRIDES[q];

  // exact match
  let exact = COUNTRIES.find(c => c.norm === q);
  if (exact) return exact.code;

  // startsWith (unique)
  const starts = COUNTRIES.filter(c => c.norm.startsWith(q));
  if (starts.length === 1) return starts[0].code;

  // includes (unique)
  const incl = COUNTRIES.filter(c => c.norm.includes(q));
  if (incl.length === 1) return incl[0].code;

  return '';
}

function setupCountryCombobox() {
  const input   = $('countryCombo');
  const hidden  = $('country');
  const menu    = $('countryMenu');
  const clearBtn= $('countryClear');

  function setCountryByCode(code) {
    const found = COUNTRIES.find(c => c.code === code);
    if (found) {
      hidden.value = found.code;
      input.value  = found.name;
      clearBtn.classList.remove('hidden');
    }
  }

  function renderMenu(query = '') {
    const q = query.trim().toLowerCase();
    const items = (q ? COUNTRIES.filter(c => c.norm.includes(q)) : COUNTRIES).slice(0, 75);
    menu.innerHTML = items.map(c =>
      `<div role="option" data-code="${c.code}" class="px-3 py-2 hover:bg-slate-100 cursor-pointer">${c.name}</div>`
    ).join('');
    menu.classList.toggle('hidden', items.length === 0);
  }

  function closeMenu() { menu.classList.add('hidden'); }

  input.addEventListener('focus', () => renderMenu(input.value));
  input.addEventListener('input', () => {
    hidden.value = '';
    clearBtn.classList.add('hidden');
    renderMenu(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = menu.querySelector('[data-code]');
      if (first) {
        setCountryByCode(first.getAttribute('data-code'));
      } else {
        const code = resolveCountryInputToCode(input.value);
        if (code) setCountryByCode(code);
      }
      closeMenu();
    }
    if (e.key === 'Escape') closeMenu();
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-code]');
    if (!opt) return;
    setCountryByCode(opt.getAttribute('data-code'));
    closeMenu();
  });

  input.addEventListener('blur', () => {
    if (!hidden.value && input.value.trim()) {
      const code = resolveCountryInputToCode(input.value);
      if (code) setCountryByCode(code);
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    hidden.value = '';
    clearBtn.classList.add('hidden');
    renderMenu('');
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== input) closeMenu();
  });

  // Default: Canada
  setCountryByCode(hidden.value || 'CA');
}

// Resolve code even if the user typed and didn’t pick from the menu
function getCountryCode() {
  const hidden = $('country')?.value || '';
  if (hidden) return hidden;
  const typed = $('countryCombo')?.value || '';
  const code = resolveCountryInputToCode(typed);
  if (code) {
    const hiddenEl = $('country');
    const inputEl  = $('countryCombo');
    if (hiddenEl && inputEl) {
      hiddenEl.value = code;
      const found = COUNTRIES.find(c => c.code === code);
      if (found) inputEl.value = found.name;
    }
  }
  return code || '';
}

/* =========================
   UI helpers
   ========================= */
function setLoading(isLoading, msg = '') {
  $("btnSpinner").classList.toggle("hidden", !isLoading);
  $("btnText").textContent = isLoading ? "Getting quote…" : "Get quote";
  $("status").textContent = msg || (isLoading ? "Contacting UPS…" : "");
}

function showResult(rate, _currency, meta) {
  $("result").textContent = `${Number(rate).toFixed(2)} CAD`;
  const negotiatedLine = meta?.negotiated ? "Negotiated rate applied." : "Standard rate (no negotiated pricing found).";
  const adj = meta?.adjustments;
  const serverAdjLine = adj && adj.surcharge > 0 ? `Rule adjustment: +$${adj.surcharge.toFixed(2)} (${adj.details})` : "";
  const addonAdj = meta?.addonAdjustment;
  const addonAdjLine = addonAdj && addonAdj.amount > 0 ? `Add-on adjustment: +$${addonAdj.amount.toFixed(2)} (${addonAdj.details})` : "";
  $("metaLine").textContent = [negotiatedLine, serverAdjLine, addonAdjLine].filter(Boolean).join(" • ");
  $("resultCard").classList.remove("hidden");
}

function showError(msg) {
  $("status").textContent = msg || "Something went wrong.";
  $("resultCard").classList.add("hidden");
}

/* =========================
   Wake banner helpers
   ========================= */
function showWakeBanner(text = "Waking the server… this can take 30–60 seconds on first load.") {
  const b = $("wakeBanner"); if (!b) return;
  b.classList.remove("hidden");
  const t = $("wakeText"); if (t) t.textContent = text;
}
function hideWakeBanner() { $("wakeBanner")?.classList.add("hidden"); }

async function pingMetaUntilUp({ timeoutMs = 60000, intervalMs = 5000 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${API}/meta?wake=${Date.now()}`, { cache: "no-store" });
      if (res.ok) { await res.json().catch(()=>({})); return true; }
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

/* =========================
   Product preset + Add-on helpers
   ========================= */
function applyPreset(key) {
  const p = PRODUCT_PRESETS[key];
  if (!p) return;
  $("productDesc").textContent = formattedDesc(key);
  $("length").value = p.length ?? '';
  $("width").value  = p.width  ?? '';
  $("height").value = p.height ?? '';
  $("weight").value = p.weight ?? '';
  $("sigNote").classList.toggle("hidden", !p.signature);
  const unitEl = $("qtyUnit"); if (unitEl) unitEl.textContent = "";
  updateAddonNote();
}

function updateAddonDesc() {
  const k = $("addonProduct").value;
  const d = formattedDesc(k);
  $("addonDesc").textContent = d || '';
  $("addonDesc").classList.toggle('hidden', !d);
}

/* =========================
   API helpers
   ========================= */
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `POST ${path} failed`);
  return data;
}

/* =========================
   Rules helpers (add-on surcharge)
   ========================= */
function getSize(key) { return PRODUCT_PRESETS[key]?.size || 'medium'; }
function getMaxPerPkg(key) { return (key in MAX_PER_PKG_MAP) ? MAX_PER_PKG_MAP[key] : 1; }

function computeAddonSurcharge(mainKey, mainQty, addonKey, addonQty) {
  const qty = Math.max(0, parseInt(addonQty || 0, 10));
  if (!addonKey || qty <= 0) return { amount: 0, details: "" };
  const mainSize  = getSize(mainKey);
  const addonSize = getSize(addonKey);
  const max = getMaxPerPkg(addonKey);
  let extraPkgs = 0, details = "";
  if (addonSize === 'large') {
    extraPkgs = Math.ceil(qty / max);
    details = `Large add-on: ${qty} item(s) → ${extraPkgs} extra pkg(s).`;
  } else if (mainSize === 'large') {
    extraPkgs = Math.max(0, Math.ceil(qty / max) - 1);
    details = extraPkgs ? `Large + small/medium: overflow beyond ${max}/pkg → ${extraPkgs} extra pkg(s).`
                        : `Large + small/medium: within ${max}/pkg → no extra package.`;
  } else {
    extraPkgs = Math.ceil(qty / max);
    details = `Small/medium main + add-on: add-on needs ${extraPkgs} package(s).`;
  }
  return { amount: extraPkgs * 4, details };
}

function updateAddonNote() {
  const mainKey = $("product").value;
  const size = getSize(mainKey);
  const el = $("addonNote");
  if (size === 'large') {
    el.textContent = "Selected product is a large item (e.g., screen). Add-ons (small/medium) use the large package’s rate; overflow creates extra packages at +$4 each.";
  } else {
    el.textContent = "Small/medium-only shipments treat add-ons as separate package(s): +$4 per package.";
  }
  el.classList.remove("hidden");
}

/* =========================
   Reference modal
   ========================= */
function attachPopover(triggerEl, getHtml) {
  if (!triggerEl) return;
  let pop = null;
  const show = () => {
    const html = typeof getHtml === 'function' ? getHtml() : getHtml;
    pop = document.createElement('div');
    pop.className = 'absolute z-50 mt-2 w-72 rounded-xl border bg-white p-3 shadow';
    pop.innerHTML = html;
    const r = triggerEl.getBoundingClientRect();
    pop.style.left = `${r.left + window.scrollX}px`;
    pop.style.top  = `${r.bottom + window.scrollY}px`;
    document.body.appendChild(pop);
    const hide = (e) => {
      if (pop && !pop.contains(e.target) && e.target !== triggerEl) {
        pop.remove(); pop = null;
        document.removeEventListener('click', hide);
      }
    };
    setTimeout(() => document.addEventListener('click', hide), 0);
  };
  triggerEl.addEventListener('click', (e) => { e.stopPropagation(); pop ? (pop.remove(), pop = null) : show(); });
}

function openReferenceModal() {
  const m = $("refModal");
  const c = $("refContent");
  const r = APP_RULES || {};

  const section = (title, rows = []) => `
    <div>
      <div class="font-medium mb-1">${title}</div>
      <table class="w-full text-left border">
        <thead>
          <tr class="bg-slate-50">
            <th class="p-2 border">Code</th>
            <th class="p-2 border">Service</th>
            <th class="p-2 border">Delivery time</th>
          </tr>
        </thead>
        <tbody>
          ${(rows || []).map(s =>
            `<tr><td class="p-2 border">${s.code}</td><td class="p-2 border">${s.name}</td><td class="p-2 border">${s.eta}</td></tr>`
          ).join('')}
        </tbody>
      </table>
    </div>`;

  c.innerHTML = `
    ${section("Canada (Domestic)", r.serviceReference?.CA)}
    ${section("Canada → United States", r.serviceReference?.["CA→US"])}
    ${section("Canada → International", r.serviceReference?.["CA→INTL"])}
  `;

  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeReferenceModal() { const m = $("refModal"); m.classList.add('hidden'); m.classList.remove('flex'); }

/* =========================
   Loading metadata
   ========================= */
async function loadMeta() {
  const { products, services, rules } = await apiGet('/meta');
  PRODUCT_PRESETS = products || {};
  SERVICE_OPTIONS = services || {};
  APP_RULES = rules || {};

  // Item code select
  const productKeys = Object.keys(PRODUCT_PRESETS);
  $("product").innerHTML = productKeys.map(k => `<option value="${k}">${k}</option>`).join("");
  if (productKeys.length) applyPreset(productKeys[0]);

  // Add-on select (small/medium only)
  const addonOptions = productKeys
    .filter(k => {
      const s = PRODUCT_PRESETS[k]?.size;
      return s === 'small' || s === 'medium';
    })
    .map(k => `<option value="${k}">${k}</option>`)
    .join("");
  const addonEl = $("addonProduct");
  addonEl.innerHTML = `<option value="">— None —</option>${addonOptions}`;
  updateAddonDesc();
  updateAddonNote();

  // Service select
  $("service").innerHTML = Object.entries(SERVICE_OPTIONS)
    .map(([code, label]) => `<option value="${code}">${label} (${code})</option>`)
    .join("");

  // Popovers
  attachPopover($("tipPostal"), () => `
    <div class="text-sm">
      <div class="font-medium mb-1">Postal code tips</div>
      <div>US: ${APP_RULES?.postalTips?.US || ''}</div>
      <div>CA: ${APP_RULES?.postalTips?.CA || ''}</div>
    </div>
  `);
  attachPopover($("tipService"), () => `
    <div class="text-sm">
      <div class="font-medium mb-1">Common services (Canada)</div>
      <ul class="list-disc pl-5">
        ${(APP_RULES?.serviceReference?.CA || [])
          .map(s => `<li>${s.name} (${s.code}) — ${s.eta}</li>`).join('')}
      </ul>
      <a class="text-blue-600 underline cursor-pointer mt-2 inline-block" onclick="openReferenceModal()">See full reference</a>
    </div>
  `);
}

/* =========================
   Actions
   ========================= */
async function handleAutoFillState() {
  try {
    $("status").textContent = "Looking up state/province…";
    const postalCode = $("postal").value.trim();
    const countryCode = getCountryCode();
    const { stateCode } = await apiPost('/state', { postalCode, countryCode });
    $("state").value = stateCode || '';
    $("status").textContent = stateCode ? "State filled." : "No match found for state.";
  } catch {
    showError("State lookup failed.");
  }
}

function validateInputs() {
  const required = {
    product: $("product").value,
    qty: parseInt($("qty").value, 10),
    postal: $("postal").value.trim(),
    country: getCountryCode(),
    state: $("state").value.trim(),
    length: parseFloat($("length").value),
    width:  parseFloat($("width").value),
    height: parseFloat($("height").value),
    weight: parseFloat($("weight").value),
    service: $("service").value,
  };
  const missing = Object.entries(required)
    .filter(([k, v]) =>
      v === '' || v == null ||
      (['length','width','height','weight'].includes(k) && !Number.isFinite(v)) ||
      (k === 'qty' && (!Number.isInteger(v) || v < 1))
    );
  if (missing.length) {
    showError(`Missing/invalid: ${missing.map(([k]) => k).join(', ')}`);
    return null;
  }
  return required;
}

async function handleSubmit(e) {
  e.preventDefault();
  $("resultCard").classList.add("hidden");
  const vals = validateInputs();
  if (!vals) return;

  setLoading(true);
  try {
    const mainKey = $("product").value;
    const preset = PRODUCT_PRESETS[mainKey] || {};
    const payload = {
      productKey: mainKey,
      quantity: parseInt($("qty").value, 10) || 1,
      postalCode: $("postal").value.trim(),
      country: getCountryCode(),
      stateCode: $("state").value.trim(),
      length: parseFloat($("length").value),
      width:  parseFloat($("width").value),
      height: parseFloat($("height").value),
      weight: parseFloat($("weight").value),
      serviceCode: $("service").value,
      signatureRequired: Boolean(preset.signature),
      residential: true,
    };

    const { rate, currency, meta } = await apiPost('/rate', payload);

    const addonKey = $("addonProduct").value;
    const addonQty = parseInt($("addonQty").value, 10) || 0;
    const addonAdj = computeAddonSurcharge(mainKey, payload.quantity, addonKey, addonQty);
    const finalRate = Math.round((rate + addonAdj.amount) * 100) / 100;

    meta.addonAdjustment = addonAdj;
    showResult(finalRate, currency, meta);
    $("status").textContent = "Done.";
  } catch (err) {
    // If the server was asleep, show the banner and prompt a retry
    showWakeBanner("Waking the server… please try again in ~30–60 seconds.");
    showError(err.message || "Couldn’t get rate.");
  } finally {
    setLoading(false);
  }
}

/* =========================
   Wire up
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  $("wakeClose")?.addEventListener("click", () => hideWakeBanner());

  try {
    await loadMeta();
    $("status").textContent = "Ready.";
  } catch {
    // Server likely sleeping: inform user and poll until up, then load meta
    showWakeBanner();
    $("status").textContent = "Waking server…";
    const ok = await pingMetaUntilUp({ timeoutMs: 60000, intervalMs: 5000 });
    if (ok) {
      hideWakeBanner();
      await loadMeta();
      $("status").textContent = "Ready.";
    } else {
      $("status").textContent = "Server is still waking… please retry shortly.";
    }
  }

  setupCountryCombobox();

  $("product").addEventListener("change", (e) => applyPreset(e.target.value));
  $("addonProduct").addEventListener("change", () => { updateAddonDesc(); updateAddonNote(); });
  $("autofillState").addEventListener("click", handleAutoFillState);
  $("quoteForm").addEventListener("submit", handleSubmit);

  $("refClose")?.addEventListener("click", closeReferenceModal);
  $("refModal")?.addEventListener("click", (e) => { if (e.target === $("refModal")) closeReferenceModal(); });
  $("openRefLink")?.addEventListener("click", openReferenceModal);
});

// Expose for the inline handler
window.openReferenceModal = openReferenceModal;
