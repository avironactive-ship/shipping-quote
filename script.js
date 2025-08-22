// ui/script.js

// API base: if opened as file:// use localhost; if hosted with API, use relative /api
// production points to Render, local stays on localhost
//const ALT_API  = 'http://localhost:3000/api';
//const PROD_API = 'https://shipping-quote-api.onrender.com/api';
const API = 'https://shipping-quote-api.onrender.com/api';
console.log('API base =', API);
//const API = (location.hostname === 'localhost') ? ALT_API : PROD_API;


const $ = (id) => document.getElementById(id);

let PRODUCT_PRESETS = {};
let SERVICE_OPTIONS = {};
let APP_RULES = null;

// Unit labels for clarity (defaults to "units")
const UNIT_BY_PRODUCT = {
  "TSR1 RB": "pairs",
  "TSR1 FS": "pairs",
  "TSR1 FA": "pair",
  "ISR/TSR - HW Stopper & TSR - HW73": "sets",
};

// Explicit max-per-package map used on the client (for add-on overflow math)
const MAX_PER_PKG_MAP = {
  "TSR1 RB": 6,
  "TSR1 FS": 6,
  "TSR1 FA": 1,
  "TSR1 RM": 1,
  "TSR1 PA": 1,
  "ISR/TSR - HW Stopper & TSR - HW73": 6,
  // Unlisted defaults to 1
};

/* =========================
   Country combobox (searchable)
   ========================= */

// ISO-3166 alpha-2 region codes (broad, includes territories)
const ISO_REGION_CODES = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI",
  "KH","CM","CA","CV","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ",
  "FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP",
  "JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MK","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS",
  "MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC",
  "MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN",
  "TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU","VE","VN","VG","VI","WF","EH","YE","ZM","ZW"
];

// Build [{code, name, norm}] using the browser's locale names
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRIES = ISO_REGION_CODES
  .map(code => ({ code, name: regionNames.of(code) }))
  .filter(x => x.name && x.name !== x.code)
  .map(x => ({ ...x, norm: x.name.toLowerCase() }))
  .sort((a,b) => a.name.localeCompare(b.name));

function setupCountryCombobox() {
  const input = $('countryCombo'); // visible text input
  const hidden = $('country');     // hidden 2-letter code
  const menu = $('countryMenu');
  const clearBtn = $('countryClear');

  function setCountryByCode(code) {
    const found = COUNTRIES.find(c => c.code === code);
    if (found) {
      hidden.value = found.code;
      input.value = found.name;
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
    hidden.value = '';                   // clear selection until they choose
    clearBtn.classList.add('hidden');
    renderMenu(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); }
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-code]');
    if (!opt) return;
    const code = opt.getAttribute('data-code');
    setCountryByCode(code);
    closeMenu();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    hidden.value = '';
    clearBtn.classList.add('hidden');
    renderMenu('');
    input.focus();
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== input) closeMenu();
  });

  // Initialize to Canada by default (keeps prior behavior)
  setCountryByCode(hidden.value || 'CA');
}

// ---------- UI helpers ----------
function setLoading(isLoading, msg = '') {
  $("btnSpinner").classList.toggle("hidden", !isLoading);
  $("btnText").textContent = isLoading ? "Getting quote…" : "Get quote";
  $("status").textContent = msg || (isLoading ? "Contacting UPS…" : "");
}

// NOTE: currency is ignored on purpose; we only display the numeric price.
function showResult(rate, _currency, meta) {
  $("result").textContent = Number(rate).toFixed(2);

  const negotiatedLine = meta?.negotiated ? "Negotiated rate applied." : "Standard rate (no negotiated pricing found).";
  const adj = meta?.adjustments;
  const serverAdjLine = adj && adj.surcharge > 0 ? `Rule adjustment: +$${adj.surcharge.toFixed(2)} (${adj.details})` : "";
  const addonAdj = meta?.addonAdjustment;
  const addonAdjLine = addonAdj && addonAdj.amount > 0
    ? `Add-on adjustment: +$${addonAdj.amount.toFixed(2)} (${addonAdj.details})`
    : "";
  $("metaLine").textContent = [negotiatedLine, serverAdjLine, addonAdjLine].filter(Boolean).join(" • ");
  $("resultCard").classList.remove("hidden");
}

function showError(msg) {
  $("status").textContent = msg || "Something went wrong.";
  $("resultCard").classList.add("hidden");
}

// MAIN product selection → fill dims/weight, signature note, unit label
function applyPreset(key) {
  const p = PRODUCT_PRESETS[key];
  if (!p) return;
  $("productDesc").textContent = p.desc || '';
  $("length").value = p.length ?? '';
  $("width").value  = p.width  ?? '';
  $("height").value = p.height ?? '';
  $("weight").value = p.weight ?? '';
  $("sigNote").classList.toggle("hidden", !p.signature);
  $("qtyUnit").textContent = "";
  updateAddonNote();
}

// ADD-ON description
function updateAddonDesc() {
  const k = $("addonProduct").value;
  const d = PRODUCT_PRESETS[k]?.desc || '';
  $("addonDesc").textContent = d;
  $("addonDesc").classList.toggle('hidden', !d);
}

// ---------- API helpers ----------
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

// ---------- Rules helpers (front-end only add-on calc) ----------
function getSize(key) {
  return PRODUCT_PRESETS[key]?.size || 'medium';
}
function getMaxPerPkg(key) {
  if (key in MAX_PER_PKG_MAP) return MAX_PER_PKG_MAP[key];
  return 1;
}

// For a LARGE main: add-on rides in large up to its max; overflow → +$4 per extra package.
// For SMALL/MEDIUM main + SMALL/MEDIUM add-on: treat add-on as separate package(s) at +$4 per package.
// (Large add-on is disallowed by UI, but we guard anyway.)
function computeAddonSurcharge(mainKey, mainQty, addonKey, addonQty) {
  const qty = Math.max(0, parseInt(addonQty || 0, 10));
  if (!addonKey || qty <= 0) return { amount: 0, details: "" };

  const mainSize  = getSize(mainKey);
  const addonSize = getSize(addonKey);
  const max = getMaxPerPkg(addonKey);

  let extraPkgs = 0;
  let details = "";

  if (addonSize === 'large') {
    extraPkgs = Math.ceil(qty / max);
    details = `Large add-on: ${qty} item(s) → ${extraPkgs} extra pkg(s).`;
  } else if (mainSize === 'large') {
    extraPkgs = Math.max(0, Math.ceil(qty / max) - 1);
    details = extraPkgs
      ? `Large + small/medium: overflow beyond ${max}/pkg → ${extraPkgs} extra pkg(s).`
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
    el.classList.remove("hidden");
  } else {
    el.textContent = "Small/medium-only shipments treat add-ons as separate package(s): +$4 per package.";
    el.classList.remove("hidden");
  }
}

// ---------- Popovers & Modal ----------
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

  triggerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    pop ? (pop.remove(), pop = null) : show();
  });
}

function openReferenceModal() {
  const m = $("refModal");
  const c = $("refContent");
  const r = APP_RULES || {};

  const section = (title, rows = []) => `
    <div>
      <div class="font-medium mb-1">${title}</div>
      <table class="w-full text-left border">
        <thead><tr class="bg-slate-50"><th class="p-2 border">Code</th><th class="p-2 border">Service</th><th class="p-2 border">Delivery time</th></tr></thead>
        <tbody>
          ${(rows || []).map(s => `<tr><td class="p-2 border">${s.code}</td><td class="p-2 border">${s.name}</td><td class="p-2 border">${s.eta}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const maxQty = `
    <div>
      <div class="font-medium mb-1">Maximum quantities per shipment (1 package)</div>
      <table class="w-full text-left border">
        <thead><tr class="bg-slate-50"><th class="p-2 border">Item</th><th class="p-2 border">Qty</th><th class="p-2 border">Notes</th></tr></thead>
        <tbody>
          ${(r.maxPerPackage || []).map(it => `<tr><td class="p-2 border">${it.item}</td><td class="p-2 border">${it.qty}</td><td class="p-2 border">${it.note || ''}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const combo = `
    <div>
      <div class="font-medium mb-1">Rules of thumb (multiple product types)</div>
      <ul class="list-disc pl-5">
        ${(r.combinationRules || []).map(x => `<li class="mb-1">${x}</li>`).join('')}
      </ul>
    </div>`;

  c.innerHTML = `
    ${section("Canada (Domestic)", r.serviceReference?.CA)}
    ${section("Canada → United States", r.serviceReference?.["CA→US"])}
    ${section("Canada → International", r.serviceReference?.["CA→INTL"])}
    ${maxQty}
    ${combo}
  `;

  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeReferenceModal() {
  const m = $("refModal");
  m.classList.add('hidden'); m.classList.remove('flex');
}

// ---------- Load meta ----------
async function loadMeta() {
  const { products, services, rules } = await apiGet('/meta');
  PRODUCT_PRESETS = products || {};
  SERVICE_OPTIONS = services || {};
  APP_RULES = rules || {};

  // Main product select
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
  $("addonProduct").insertAdjacentHTML('beforeend', addonOptions);
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

// ---------- Actions ----------
async function handleAutoFillState() {
  try {
    $("status").textContent = "Looking up state/province…";
    const postalCode = $("postal").value.trim();
    const countryCode = $("country").value; // hidden alpha-2 code from combobox
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
    country: $("country").value, // hidden alpha-2 code
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
      country: $("country").value,        // hidden alpha-2 code
      stateCode: $("state").value.trim(),
      length: parseFloat($("length").value),
      width:  parseFloat($("width").value),
      height: parseFloat($("height").value),
      weight: parseFloat($("weight").value),
      serviceCode: $("service").value,
      signatureRequired: Boolean(preset.signature),
      residential: true,
    };

    // 1) Get base/server-calculated rate for the main product only
    const { rate, currency, meta } = await apiPost('/rate', payload);

    // 2) Client-side add-on adjustment (no backend changes)
    const addonKey = $("addonProduct").value;
    const addonQty = parseInt($("addonQty").value, 10) || 0;
    const addonAdj = computeAddonSurcharge(mainKey, payload.quantity, addonKey, addonQty);

    const finalRate = Math.round((rate + addonAdj.amount) * 100) / 100;

    meta.addonAdjustment = addonAdj;
    showResult(finalRate, currency, meta);
    $("status").textContent = "Done.";
  } catch (err) {
    showError(err.message || "Couldn’t get rate.");
  } finally {
    setLoading(false);
  }
}

// ---------- Wire up ----------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadMeta();
  } catch {
    $("status").textContent = "Meta load failed; using fallback options.";
  }

  // NEW: initialize country combobox (defaults to CA)
  setupCountryCombobox();

  $("product").addEventListener("change", (e) => applyPreset(e.target.value));
  $("addonProduct").addEventListener("change", () => {
    updateAddonDesc();
    updateAddonNote();
  });
  $("autofillState").addEventListener("click", handleAutoFillState);
  $("quoteForm").addEventListener("submit", handleSubmit);

  $("refClose")?.addEventListener("click", closeReferenceModal);
  $("refModal")?.addEventListener("click", (e) => { if (e.target === $("refModal")) closeReferenceModal(); });
  $("openRefLink")?.addEventListener("click", openReferenceModal);
});

// Expose modal opener for inline handler in the service popover
window.openReferenceModal = openReferenceModal;
