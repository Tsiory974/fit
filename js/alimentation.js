/**
 * FitTrack — Page Alimentation
 * ==============================
 * Gère 4 onglets :
 *   1. Aujourd'hui  — repas du jour
 *   2. Planning     — planning alimentaire de la semaine
 *   3. Recettes     — repas et recettes enregistrés
 *   4. Aliments     — base d'aliments (liens vers aliment.html)
 *
 * ALIMENTS_DATA et CAT_SLUG sont définis dans data.js (window.*)
 */

// ── État filtres aliments ──
let currentAlimSearch    = '';
let currentAlimCategorie = '';

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  updateHeaderDate();

  renderAujourdhuiPanel();
  renderPlanningPanel();
  renderRecettesPanel();
  renderAlimentsPanel();

  bindAlimentsEvents();
  bindWaterButton();
  bindModalEvents();
  bindRecettesEvents();
  bindRcModalEvents();
});

/* ═══════════════════════════════════════════════════════════════
   ONGLET 1 — AUJOURD'HUI
═══════════════════════════════════════════════════════════════ */

const MEAL_META = {
  'petit-dejeuner': { label: 'Petit-déjeuner', icon: '🌅' },
  'dejeuner':       { label: 'Déjeuner',        icon: '☀️'  },
  'diner':          { label: 'Dîner',            icon: '🌙' },
  'collations':     { label: 'Collations',       icon: '🍎' },
  'supplements':    { label: 'Suppléments',      icon: '💊' },
};

// Clé du repas en cours d'ajout dans la modale
let _modalMealKey = null;
// Aliment sélectionné dans la modale (étape 2)
let _modalAlim    = null;

function renderAujourdhuiPanel() {
  const today = localDateStr();
  const goals = window.DAILY_GOALS || { kcal: 2500, p: 180, g: 280, l: 80, water: 2500 };
  const day   = window.ALIM_DB.getDay(today);

  // ── Anneau calories ──
  const totals   = window.ALIM_DB.calcTotals(day);
  const kcalPct  = Math.min(1, totals.k / goals.kcal);
  const circ     = 326.73; // 2π×52
  const offset   = circ * (1 - kcalPct);

  const ringFill = document.getElementById('aj-ring-fill');
  if (ringFill) ringFill.style.strokeDashoffset = offset;

  const kcalIn   = document.getElementById('aj-kcal-in');
  const kcalRest = document.getElementById('aj-kcal-rest');
  if (kcalIn)   kcalIn.textContent   = totals.k;
  if (kcalRest) {
    const rest = goals.kcal - totals.k;
    kcalRest.textContent = rest >= 0 ? rest + ' restantes' : Math.abs(rest) + ' dépassées';
    kcalRest.style.color = rest >= 0 ? 'var(--accent)' : '#ef4444';
  }

  // ── Barres macros ──
  const macroMap = [
    { key: 'p', inId: 'aj-p-in', goalId: 'aj-p-goal', barId: 'aj-bar-p', val: totals.p, goal: goals.p },
    { key: 'g', inId: 'aj-g-in', goalId: 'aj-g-goal', barId: 'aj-bar-g', val: totals.g, goal: goals.g },
    { key: 'l', inId: 'aj-l-in', goalId: 'aj-l-goal', barId: 'aj-bar-l', val: totals.l, goal: goals.l },
  ];
  macroMap.forEach(({ inId, goalId, barId, val, goal }) => {
    const inEl   = document.getElementById(inId);
    const goalEl = document.getElementById(goalId);
    const barEl  = document.getElementById(barId);
    if (inEl)   inEl.textContent  = val;
    if (goalEl) goalEl.textContent = goal;
    if (barEl)  barEl.style.width  = Math.min(100, (val / goal) * 100).toFixed(1) + '%';
  });

  // ── Eau ──
  const waterFill = document.getElementById('aj-water-fill');
  const waterMl   = document.getElementById('aj-water-ml');
  const waterGoal = document.getElementById('aj-water-goal');
  if (waterFill) waterFill.style.width = Math.min(100, (day.water / goals.water) * 100).toFixed(1) + '%';
  if (waterMl)   waterMl.textContent   = day.water;
  if (waterGoal) waterGoal.textContent = goals.water;

  // ── Repas ──
  const mealsEl = document.getElementById('aj-meals');
  if (!mealsEl) return;

  mealsEl.innerHTML = '';
  (window.MEAL_KEYS || []).forEach(mk => {
    const meta    = MEAL_META[mk] || { label: mk, icon: '🍽️' };
    const mData   = day.meals[mk];
    const mTotals = window.ALIM_DB.calcMealTotals(day, mk);
    const open    = mData.items.length > 0; // ouvrir si déjà des aliments

    const section = document.createElement('div');
    section.className = 'aj-meal' + (mData.validated ? ' aj-meal--validated' : '') + (open ? ' aj-meal--open' : '');
    section.dataset.meal = mk;

    // Aliments HTML
    const itemsHTML = mData.items.length > 0
      ? mData.items.map((it, idx) => `
          <div class="aj-meal__item">
            <span class="aj-meal__item-name">${it.nom}</span>
            <span class="aj-meal__item-qty">${it.qty}g</span>
            <span class="aj-meal__item-kcal">${it.k} kcal</span>
            <button class="aj-meal__item-del" data-del-meal="${mk}" data-del-idx="${idx}"
                    aria-label="Supprimer">✕</button>
          </div>`).join('')
      : '<p class="aj-meal__empty">Aucun aliment ajouté</p>';

    section.innerHTML = `
      <div class="aj-meal__header" data-toggle-meal="${mk}">
        <span class="aj-meal__icon">${meta.icon}</span>
        <div class="aj-meal__info">
          <div class="aj-meal__name">${meta.label}</div>
          <div class="aj-meal__kcal">${mData.items.length} aliment${mData.items.length > 1 ? 's' : ''} · ${mTotals.k} kcal</div>
        </div>
        <button class="aj-meal__check" data-validate-meal="${mk}" aria-label="Valider le repas">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
      <div class="aj-meal__body">
        <div class="aj-meal__items">${itemsHTML}</div>
        <div class="aj-meal__actions">
          <button class="aj-meal__btn" data-add-to-meal="${mk}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 width="13" height="13">
              <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
            </svg>
            Aliment
          </button>
        </div>
      </div>`;

    mealsEl.appendChild(section);
  });

  // Bind events délégués sur aj-meals
  bindAujourdhuiMealEvents();
}

function bindAujourdhuiMealEvents() {
  const mealsEl = document.getElementById('aj-meals');
  if (!mealsEl || mealsEl._bound) return;
  mealsEl._bound = true;

  mealsEl.addEventListener('click', e => {
    const today = localDateStr();

    // Toggle collapse repas
    const toggleBtn = e.target.closest('[data-toggle-meal]');
    if (toggleBtn) {
      const mk      = toggleBtn.dataset.toggleMeal;
      const section = mealsEl.querySelector(`[data-meal="${mk}"]`);
      if (section) section.classList.toggle('aj-meal--open');
      return;
    }

    // Valider repas
    const validateBtn = e.target.closest('[data-validate-meal]');
    if (validateBtn) {
      e.stopPropagation();
      const mk = validateBtn.dataset.validateMeal;
      window.ALIM_DB.toggleValidated(today, mk);
      renderAujourdhuiPanel();
      return;
    }

    // Supprimer aliment
    const delBtn = e.target.closest('[data-del-meal]');
    if (delBtn) {
      const mk  = delBtn.dataset.delMeal;
      const idx = parseInt(delBtn.dataset.delIdx, 10);
      window.ALIM_DB.removeItem(today, mk, idx);
      renderAujourdhuiPanel();
      return;
    }

    // Ouvrir modale d'ajout
    const addBtn = e.target.closest('[data-add-to-meal]');
    if (addBtn) {
      _modalMealKey = addBtn.dataset.addToMeal;
      const meta    = MEAL_META[_modalMealKey] || {};
      openAlimModal(meta.label || _modalMealKey);
      return;
    }
  });
}

/* ── Bouton eau ── */
function bindWaterButton() {
  const btn = document.getElementById('btn-add-water');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const today = localDateStr();
    const day   = window.ALIM_DB.getDay(today);
    window.ALIM_DB.setWater(today, day.water + 250);
    renderAujourdhuiPanel();
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODALE AJOUT ALIMENT
═══════════════════════════════════════════════════════════════ */

function openAlimModal(mealLabel) {
  const modal = document.getElementById('aj-modal');
  if (!modal) return;
  document.getElementById('aj-modal-title').textContent = 'Ajouter — ' + mealLabel;
  showModalStep('search');
  renderModalList('');
  document.getElementById('aj-modal-search').value = '';
  modal.hidden = false;
  document.getElementById('aj-modal-search').focus();
}

function closeAlimModal() {
  const modal = document.getElementById('aj-modal');
  if (modal) modal.hidden = true;
  _modalMealKey = null;
  _modalAlim    = null;
}

function showModalStep(step) {
  document.getElementById('aj-modal-step-search').hidden = (step !== 'search');
  document.getElementById('aj-modal-step-qty').hidden    = (step !== 'qty');
}

function renderModalList(q) {
  const list = document.getElementById('aj-modal-list');
  if (!list) return;
  const data = window.ALIMENTS_DATA || [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? data.filter(a => a.nom.toLowerCase().includes(term) || a.categorie.toLowerCase().includes(term))
    : data;

  if (filtered.length === 0) {
    list.innerHTML = '<p class="panel-placeholder">Aucun aliment trouvé</p>';
    return;
  }

  list.innerHTML = filtered.map(a => `
    <div class="aj-modal__alim-row" data-pick-alim="${a.id}">
      <span class="aj-modal__alim-name">${a.nom}</span>
      <span class="aj-modal__alim-info">${a.m.k} kcal/100g</span>
    </div>`).join('');
}

function updateQtyMacros() {
  if (!_modalAlim) return;
  const qty    = parseFloat(document.getElementById('aj-modal-qty-input').value) || 0;
  const r      = qty / 100;
  const m      = _modalAlim.m;
  const macros = document.getElementById('aj-modal-qty-macros');
  if (!macros) return;
  macros.innerHTML = `
    <span class="aj-modal__macro-chip">${Math.round(m.k * r)} kcal</span>
    <span class="aj-modal__macro-chip">P ${(m.p * r).toFixed(1)}g</span>
    <span class="aj-modal__macro-chip">G ${(m.g * r).toFixed(1)}g</span>
    <span class="aj-modal__macro-chip">L ${(m.l * r).toFixed(1)}g</span>`;
}

function bindModalEvents() {
  const modal = document.getElementById('aj-modal');
  if (!modal) return;

  // Fermer sur backdrop
  document.getElementById('aj-modal-backdrop').addEventListener('click', closeAlimModal);
  document.getElementById('aj-modal-close').addEventListener('click', closeAlimModal);

  // Recherche
  document.getElementById('aj-modal-search').addEventListener('input', e => {
    renderModalList(e.target.value);
  });

  // Clic sur un aliment → étape 2
  document.getElementById('aj-modal-list').addEventListener('click', e => {
    const row = e.target.closest('[data-pick-alim]');
    if (!row) return;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === row.dataset.pickAlim);
    if (!alim) return;
    _modalAlim = alim;
    document.getElementById('aj-modal-preview').textContent = alim.nom;
    document.getElementById('aj-modal-qty-input').value = '100';
    updateQtyMacros();
    showModalStep('qty');
  });

  // Mise à jour macros en live
  document.getElementById('aj-modal-qty-input').addEventListener('input', updateQtyMacros);

  // Retour
  document.getElementById('aj-modal-back').addEventListener('click', () => {
    showModalStep('search');
    _modalAlim = null;
  });

  // Confirmer ajout
  document.getElementById('aj-modal-confirm').addEventListener('click', () => {
    if (!_modalAlim || !_modalMealKey) return;
    const qty = parseFloat(document.getElementById('aj-modal-qty-input').value);
    if (!qty || qty <= 0) return;
    const today = localDateStr();
    // Ouvrir le repas concerné si fermé
    const section = document.querySelector(`[data-meal="${_modalMealKey}"]`);
    if (section) section.classList.add('aj-meal--open');
    window.ALIM_DB.addItem(today, _modalMealKey, _modalAlim.id, qty);
    closeAlimModal();
    renderAujourdhuiPanel();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 2 — PLANNING
═══════════════════════════════════════════════════════════════ */

function renderPlanningPanel() {
  // À implémenter
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 3 — RECETTES
═══════════════════════════════════════════════════════════════ */

// Recette en cours d'édition
let _rcCurrentId  = null;
// Aliment sélectionné dans le modal recette
let _rcModalAlim  = null;

function renderRecettesPanel() {
  renderRcList();
}

/* ── Vue liste ── */
function renderRcList() {
  const listEl  = document.getElementById('rc-list');
  const emptyEl = document.getElementById('rc-empty');
  if (!listEl) return;

  const recipes = window.RECETTES_DB.getAll();

  if (recipes.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    listEl.innerHTML = '';
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = recipes.map(rec => {
    const totals = window.RECETTES_DB.calcTotals(rec);
    const count  = rec.aliments.length;
    return `
      <div class="rc-card" data-rc-id="${rec.id}">
        <div class="rc-card__body">
          <div class="rc-card__name">${rec.nom}</div>
          <div class="rc-card__info">
            ${count} ingrédient${count > 1 ? 's' : ''} · ${totals.k} kcal
          </div>
        </div>
        <span class="rc-card__arrow" aria-hidden="true">›</span>
      </div>`;
  }).join('');
}

/* ── Vue édition ── */
function showRcList() {
  _rcCurrentId = null;
  const listView = document.getElementById('rc-list-view');
  const editView = document.getElementById('rc-edit-view');
  if (listView) listView.hidden = false;
  if (editView) editView.hidden = true;

  const fab = document.getElementById('fab-add-recette');
  if (fab) fab.classList.remove('rc-fab--hidden');

  renderRcList();
}

function showRcEdit(id) {
  _rcCurrentId = id;
  const listView = document.getElementById('rc-list-view');
  const editView = document.getElementById('rc-edit-view');
  if (listView) listView.hidden = true;
  if (editView) editView.hidden = false;

  // Masquer le FAB en mode édition
  const fab = document.getElementById('fab-add-recette');
  if (fab) fab.classList.add('rc-fab--hidden');

  renderRcEdit();

  // Focus sur le nom si la recette vient d'être créée (vide)
  const rec = window.RECETTES_DB.get(id);
  if (rec && rec.aliments.length === 0) {
    setTimeout(() => {
      const nameInput = document.getElementById('rc-edit-name');
      if (nameInput) { nameInput.select(); nameInput.focus(); }
    }, 80);
  }
}

function renderRcEdit() {
  const rec = window.RECETTES_DB.get(_rcCurrentId);
  if (!rec) { showRcList(); return; }

  // Nom
  const nameInput = document.getElementById('rc-edit-name');
  if (nameInput) nameInput.value = rec.nom;

  // Totaux
  const totals   = window.RECETTES_DB.calcTotals(rec);
  const totalsEl = document.getElementById('rc-edit-totals');
  if (totalsEl) {
    if (rec.aliments.length === 0) {
      totalsEl.innerHTML = '<span class="rc-total__item" style="color:var(--text-idle);font-size:0.75rem">Aucun ingrédient</span>';
    } else {
      totalsEl.innerHTML = `
        <span class="rc-total__kcal">${totals.k} kcal</span>
        <span class="rc-total__sep">·</span>
        <span class="rc-total__item">P ${totals.p}g</span>
        <span class="rc-total__sep">·</span>
        <span class="rc-total__item">G ${totals.g}g</span>
        <span class="rc-total__sep">·</span>
        <span class="rc-total__item">L ${totals.l}g</span>`;
    }
  }

  // Ingrédients
  const itemsEl = document.getElementById('rc-edit-items');
  if (!itemsEl) return;

  if (rec.aliments.length === 0) {
    itemsEl.innerHTML = '<p class="rc-edit__empty">Aucun ingrédient ajouté</p>';
    return;
  }

  itemsEl.innerHTML = rec.aliments.map((item, idx) => {
    const unit = item.type === 'unite' ? 'unité(s)' : 'g';
    return `
      <div class="rc-edit__item">
        <span class="rc-edit__item-name">${item.nom}</span>
        <div class="rc-edit__item-qty">
          <input class="rc-edit__qty-input" type="number"
                 data-rc-item-idx="${idx}"
                 value="${item.quantite}"
                 min="1" max="${item.type === 'unite' ? 99 : 2000}"
                 inputmode="numeric"
                 aria-label="Quantité">
          <span class="rc-edit__qty-unit">${unit}</span>
        </div>
        <button class="rc-edit__item-del" data-rc-del-idx="${idx}" aria-label="Supprimer">✕</button>
      </div>`;
  }).join('');
}

/* ── Événements panel recettes ── */
function bindRecettesEvents() {
  // FAB → nouvelle recette
  const fab = document.getElementById('fab-add-recette');
  if (fab) {
    fab.addEventListener('click', () => {
      const rec = window.RECETTES_DB.add('Nouvelle recette');
      showRcEdit(rec.id);
    });
  }

  // Retour à la liste
  const backBtn = document.getElementById('rc-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (_rcCurrentId) {
        const nameInput = document.getElementById('rc-edit-name');
        if (nameInput) window.RECETTES_DB.updateNom(_rcCurrentId, nameInput.value);
      }
      showRcList();
    });
  }

  // Sauvegarde du nom à la perte de focus
  const nameInput = document.getElementById('rc-edit-name');
  if (nameInput) {
    nameInput.addEventListener('blur', () => {
      if (_rcCurrentId) window.RECETTES_DB.updateNom(_rcCurrentId, nameInput.value);
    });
  }

  // Supprimer la recette
  const delBtn = document.getElementById('rc-edit-delete');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!_rcCurrentId) return;
      if (window.confirm('Supprimer cette recette ?')) {
        window.RECETTES_DB.delete(_rcCurrentId);
        showRcList();
      }
    });
  }

  // Ajouter un ingrédient
  const addAlimBtn = document.getElementById('rc-add-alim-btn');
  if (addAlimBtn) {
    addAlimBtn.addEventListener('click', openRcModal);
  }

  // Délégation sur la liste des ingrédients
  const itemsEl = document.getElementById('rc-edit-items');
  if (itemsEl) {
    itemsEl.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-rc-del-idx]');
      if (delBtn && _rcCurrentId) {
        const idx = parseInt(delBtn.dataset.rcDelIdx, 10);
        window.RECETTES_DB.removeAliment(_rcCurrentId, idx);
        renderRcEdit();
      }
    });

    itemsEl.addEventListener('change', e => {
      const input = e.target.closest('[data-rc-item-idx]');
      if (input && _rcCurrentId) {
        const idx = parseInt(input.dataset.rcItemIdx, 10);
        const qty = parseFloat(input.value);
        if (qty > 0) {
          window.RECETTES_DB.updateQty(_rcCurrentId, idx, qty);
          renderRcEdit();
        }
      }
    });
  }

  // Clic sur une carte → édition
  const listEl = document.getElementById('rc-list');
  if (listEl) {
    listEl.addEventListener('click', e => {
      const card = e.target.closest('[data-rc-id]');
      if (card) showRcEdit(card.dataset.rcId);
    });
  }
}

/* ── Modal ajout ingrédient (recettes) ── */
function openRcModal() {
  const modal = document.getElementById('rc-modal');
  if (!modal) return;
  _rcModalAlim = null;
  document.getElementById('rc-modal-step-search').hidden = false;
  document.getElementById('rc-modal-step-qty').hidden    = true;
  document.getElementById('rc-modal-search').value       = '';
  renderRcModalList('');
  modal.hidden = false;
  document.getElementById('rc-modal-search').focus();
}

function closeRcModal() {
  const modal = document.getElementById('rc-modal');
  if (modal) modal.hidden = true;
  _rcModalAlim = null;
}

function renderRcModalList(q) {
  const list = document.getElementById('rc-modal-list');
  if (!list) return;
  const data   = window.ALIMENTS_DATA || [];
  const term   = q.trim().toLowerCase();
  const items  = term ? data.filter(a => a.nom.toLowerCase().includes(term)) : data;

  if (items.length === 0) {
    list.innerHTML = '<p class="panel-placeholder">Aucun aliment trouvé</p>';
    return;
  }

  list.innerHTML = items.map(a => `
    <div class="aj-modal__alim-row" data-rc-pick="${a.id}">
      <span class="aj-modal__alim-name">${a.nom}</span>
      <span class="aj-modal__alim-info">${a.m.k} kcal/100g</span>
    </div>`).join('');
}

function updateRcQtyMacros() {
  if (!_rcModalAlim) return;
  const qty    = parseFloat(document.getElementById('rc-modal-qty-input').value) || 0;
  const type   = _rcModalAlim.type || 'gramme';
  const grams  = type === 'unite' ? qty * (_rcModalAlim.unitWeight || 100) : qty;
  const r      = grams / 100;
  const m      = _rcModalAlim.m;
  const macros = document.getElementById('rc-modal-qty-macros');
  if (!macros) return;
  macros.innerHTML = `
    <span class="aj-modal__macro-chip">${Math.round(m.k * r)} kcal</span>
    <span class="aj-modal__macro-chip">P ${(m.p * r).toFixed(1)}g</span>
    <span class="aj-modal__macro-chip">G ${(m.g * r).toFixed(1)}g</span>
    <span class="aj-modal__macro-chip">L ${(m.l * r).toFixed(1)}g</span>`;
}

function bindRcModalEvents() {
  const modal = document.getElementById('rc-modal');
  if (!modal) return;

  document.getElementById('rc-modal-backdrop').addEventListener('click', closeRcModal);
  document.getElementById('rc-modal-close').addEventListener('click', closeRcModal);

  document.getElementById('rc-modal-search').addEventListener('input', e => {
    renderRcModalList(e.target.value);
  });

  document.getElementById('rc-modal-list').addEventListener('click', e => {
    const row = e.target.closest('[data-rc-pick]');
    if (!row) return;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === row.dataset.rcPick);
    if (!alim) return;
    _rcModalAlim = alim;

    document.getElementById('rc-modal-preview').textContent = alim.nom;

    const type      = alim.type || 'gramme';
    const isUnite   = type === 'unite';
    const qtyInput  = document.getElementById('rc-modal-qty-input');
    const qtyLabel  = document.getElementById('rc-modal-qty-label');
    const qtyUnit   = document.getElementById('rc-modal-qty-unit');

    qtyInput.value = isUnite ? '1' : '100';
    qtyInput.max   = isUnite ? '99' : '2000';
    if (qtyLabel) qtyLabel.textContent = isUnite ? 'Quantité (unités)' : 'Quantité (g)';
    if (qtyUnit)  qtyUnit.textContent  = isUnite ? 'unité(s)' : 'g';

    document.getElementById('rc-modal-step-search').hidden = true;
    document.getElementById('rc-modal-step-qty').hidden    = false;
    updateRcQtyMacros();
  });

  document.getElementById('rc-modal-qty-input').addEventListener('input', updateRcQtyMacros);

  document.getElementById('rc-modal-back').addEventListener('click', () => {
    document.getElementById('rc-modal-step-search').hidden = false;
    document.getElementById('rc-modal-step-qty').hidden    = true;
    _rcModalAlim = null;
  });

  document.getElementById('rc-modal-confirm').addEventListener('click', () => {
    if (!_rcModalAlim || !_rcCurrentId) return;
    const qty = parseFloat(document.getElementById('rc-modal-qty-input').value);
    if (!qty || qty <= 0) return;
    window.RECETTES_DB.addAliment(_rcCurrentId, _rcModalAlim.id, qty);
    closeRcModal();
    renderRcEdit();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 4 — ALIMENTS
═══════════════════════════════════════════════════════════════ */

function renderAlimentsPanel() {
  const container = document.getElementById('aliments-list');
  if (!container) return;

  const data = window.ALIMENTS_DATA || [];
  const slugs = window.CAT_SLUG    || {};
  const q     = currentAlimSearch.trim().toLowerCase();

  const filtered = data.filter(a => {
    const matchSearch = !q || a.nom.toLowerCase().includes(q);
    const matchCat    = !currentAlimCategorie || a.categorie === currentAlimCategorie;
    return matchSearch && matchCat;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="panel-placeholder">Aucun aliment trouvé</p>';
    return;
  }

  // Cartes = liens <a> vers aliment.html?id=... (même pattern que exercice.html)
  container.innerHTML = filtered.map(a => `
    <a href="aliment.html?id=${a.id}" class="aliment-card">
      <div class="aliment-card__cat-tag aliment-card__cat-tag--${slugs[a.categorie] || ''}">
        ${a.categorie}
      </div>
      <div class="aliment-card__body">
        <h3 class="aliment-card__name">${a.nom}</h3>
        <p  class="aliment-card__info">${a.detail}</p>
      </div>
      <span class="aliment-card__arrow" aria-hidden="true">›</span>
    </a>
  `).join('');
}

function bindAlimentsEvents() {
  // Recherche en temps réel
  const searchInput = document.getElementById('aliment-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentAlimSearch = searchInput.value;
      renderAlimentsPanel();
    });
  }

  // Chips catégorie
  const chipsContainer = document.getElementById('chips-categorie');
  if (chipsContainer) {
    chipsContainer.addEventListener('click', e => {
      const chip = e.target.closest('[data-alim-cat]');
      if (!chip) return;
      chipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentAlimCategorie = chip.dataset.alimCat;
      renderAlimentsPanel();
    });
  }

  // FAB — ajouter un aliment
  const fab = document.getElementById('fab-add-aliment');
  if (fab) {
    fab.addEventListener('click', () => {
      // TODO : ouvrir le formulaire d'ajout
      console.log('Ajouter un aliment');
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTILITAIRES
═══════════════════════════════════════════════════════════════ */

function updateHeaderDate() {
  const el = document.querySelector('.page-header__subtitle');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
