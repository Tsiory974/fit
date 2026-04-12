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
  loadCustomAliments();

  renderAujourdhuiPanel();
  renderPlanningPanel();
  renderRecettesPanel();
  renderAlimentsPanel();

  bindAlimentsEvents();
  bindWaterButton();
  bindModalEvents();
  bindRecettesEvents();
  bindRcPickerEvents();
  bindRcNewModalEvents();
  bindRcAlimConfigModalEvents();
  bindAlimNewModalEvents();
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
        <button class="rc-card__del" data-rc-del="${rec.id}" aria-label="Supprimer ${rec.nom}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               width="12" height="12" aria-hidden="true">
            <line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/>
          </svg>
        </button>
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
  // FAB → modale nouvelle recette
  const fab = document.getElementById('fab-add-recette');
  if (fab) {
    fab.addEventListener('click', openRcNewModal);
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

  // Ajouter un ingrédient (depuis la vue édition d'une recette existante)
  const addAlimBtn = document.getElementById('rc-add-alim-btn');
  if (addAlimBtn) {
    addAlimBtn.addEventListener('click', () => {
      openRcAlimConfigModal('edit');
    });
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

  // Clic sur une carte → édition / clic sur croix → suppression
  const listEl = document.getElementById('rc-list');
  if (listEl) {
    listEl.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-rc-del]');
      if (delBtn) {
        if (window.confirm('Supprimer cette recette ?')) {
          window.RECETTES_DB.delete(delBtn.dataset.rcDel);
          renderRcList();
        }
        return;
      }
      const card = e.target.closest('[data-rc-id]');
      if (card) showRcEdit(card.dataset.rcId);
    });
  }
}

/* ── Picker plein écran — sélection aliment pour une recette ── */

let _rcPickerSearch = '';
let _rcPickerCat    = '';
let _rcPickerMode   = 'config'; // 'config' : sélection pour la modale config aliment
let _rcDraftAliments = [];     // ingrédients de la nouvelle recette avant sauvegarde
let _rcAlimConfigSelectedAlim = null;
let _rcAlimConfigMode = 'draft'; // 'draft' | 'edit'

function openRcPicker() {
  const picker = document.getElementById('rc-picker');
  if (!picker) return;
  _rcPickerSearch = '';
  _rcPickerCat    = '';
  const searchInput = document.getElementById('rc-picker-search');
  if (searchInput) searchInput.value = '';
  // Réinitialiser les chips
  document.querySelectorAll('#rc-picker-chips [data-rc-cat]').forEach(c => {
    c.classList.toggle('chip--active', c.dataset.rcCat === '');
  });
  renderRcPickerList();
  picker.classList.add('rc-picker--open');
  if (searchInput) setTimeout(() => searchInput.focus(), 80);
}

function closeRcPicker() {
  const picker = document.getElementById('rc-picker');
  if (picker) picker.classList.remove('rc-picker--open');
}

function renderRcPickerList() {
  const list = document.getElementById('rc-picker-list');
  if (!list) return;
  const data  = window.ALIMENTS_DATA || [];
  const q     = _rcPickerSearch.trim().toLowerCase();
  const cat   = _rcPickerCat;

  const items = data.filter(a => {
    const matchQ   = !q   || a.nom.toLowerCase().includes(q) || a.categorie.toLowerCase().includes(q);
    const matchCat = !cat || a.categorie === cat;
    return matchQ && matchCat;
  });

  if (items.length === 0) {
    list.innerHTML = '<p class="panel-placeholder">Aucun aliment trouvé</p>';
    return;
  }

  const isUniteLabel = a => (a.type || 'gramme') === 'unite' ? 'par unité' : '/100g';

  list.innerHTML = items.map(a => `
    <div class="rc-picker__item" data-rc-pick="${a.id}">
      <div class="rc-picker__item-body">
        <div class="rc-picker__item-name">${a.nom}</div>
        <div class="rc-picker__item-cat">${a.categorie}</div>
      </div>
      <div class="rc-picker__item-right">
        <span class="rc-picker__item-kcal">${a.m.k} kcal</span>
        <span class="rc-picker__item-unit">${isUniteLabel(a)}</span>
      </div>
      <div class="rc-picker__item-add" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
             width="12" height="12">
          <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
        </svg>
      </div>
    </div>`).join('');
}

function bindRcPickerEvents() {
  const picker = document.getElementById('rc-picker');
  if (!picker) return;

  // Bouton retour
  document.getElementById('rc-picker-back')?.addEventListener('click', closeRcPicker);

  // Recherche
  document.getElementById('rc-picker-search')?.addEventListener('input', e => {
    _rcPickerSearch = e.target.value;
    renderRcPickerList();
  });

  // Filtres catégorie
  document.getElementById('rc-picker-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-rc-cat]');
    if (!chip) return;
    _rcPickerCat = chip.dataset.rcCat;
    document.querySelectorAll('#rc-picker-chips [data-rc-cat]').forEach(c => {
      c.classList.toggle('chip--active', c.dataset.rcCat === _rcPickerCat);
    });
    renderRcPickerList();
  });

  // Clic aliment → renvoie vers la modale config aliment
  document.getElementById('rc-picker-list')?.addEventListener('click', e => {
    const item = e.target.closest('[data-rc-pick]');
    if (!item) return;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.dataset.rcPick);
    if (!alim) return;

    // Remplir la modale config aliment
    _rcAlimConfigSelectedAlim = alim;
    const nameEl = document.getElementById('rc-alim-config-name');
    if (nameEl) { nameEl.textContent = alim.nom; nameEl.classList.add('rc-alim-config__pick-name--selected'); }
    const isUnite = (alim.type || 'gramme') === 'unite';
    const unitEl  = document.getElementById('rc-alim-config-unit');
    const qtyEl   = document.getElementById('rc-alim-config-qty');
    if (unitEl) unitEl.textContent = isUnite ? 'unité(s)' : 'g';
    if (qtyEl)  { qtyEl.value = isUnite ? '1' : '100'; qtyEl.max = isUnite ? '99' : '2000'; }
    const confirmBtn = document.getElementById('rc-alim-config-confirm');
    if (confirmBtn) confirmBtn.disabled = false;
    closeRcPicker();
    setTimeout(() => document.getElementById('rc-alim-config-qty')?.focus(), 80);
  });
}

/* ── Modale config aliment ── */

function openRcAlimConfigModal(mode) {
  _rcAlimConfigMode = mode;
  _rcAlimConfigSelectedAlim = null;
  const searchEl = document.getElementById('rc-alim-config-search');
  if (searchEl) searchEl.value = '';
  const listEl = document.getElementById('rc-alim-config-list');
  if (listEl) { listEl.innerHTML = ''; listEl.classList.remove('rc-alim-search-list--visible'); }
  const wrapEl = document.getElementById('rc-alim-search-wrap');
  if (wrapEl) wrapEl.classList.remove('rc-alim-search-wrap--open');
  const qtyEl = document.getElementById('rc-alim-config-qty');
  if (qtyEl) { qtyEl.value = '100'; qtyEl.max = '2000'; }
  const unitEl = document.getElementById('rc-alim-config-unit');
  if (unitEl) unitEl.textContent = 'g';
  const confirmBtn = document.getElementById('rc-alim-config-confirm');
  if (confirmBtn) confirmBtn.disabled = true;
  document.getElementById('rc-alim-config-modal')?.classList.add('rc-alim-config-modal--open');
  setTimeout(() => searchEl?.focus(), 80);
}

function closeRcAlimConfigModal() {
  document.getElementById('rc-alim-config-modal')?.classList.remove('rc-alim-config-modal--open');
  _rcAlimConfigSelectedAlim = null;
}

function selectAlimForConfig(alim) {
  _rcAlimConfigSelectedAlim = alim;
  const searchEl = document.getElementById('rc-alim-config-search');
  if (searchEl) searchEl.value = alim.nom;
  const listEl = document.getElementById('rc-alim-config-list');
  if (listEl) { listEl.innerHTML = ''; listEl.classList.remove('rc-alim-search-list--visible'); }
  const wrapEl = document.getElementById('rc-alim-search-wrap');
  if (wrapEl) wrapEl.classList.remove('rc-alim-search-wrap--open');
  const isUnite = (alim.type || 'gramme') === 'unite';
  const unitEl = document.getElementById('rc-alim-config-unit');
  const qtyEl  = document.getElementById('rc-alim-config-qty');
  if (unitEl) unitEl.textContent = isUnite ? 'unité(s)' : 'g';
  if (qtyEl)  { qtyEl.value = isUnite ? '1' : '100'; qtyEl.max = isUnite ? '99' : '2000'; }
  const confirmBtn = document.getElementById('rc-alim-config-confirm');
  if (confirmBtn) confirmBtn.disabled = false;
  setTimeout(() => qtyEl?.focus(), 80);
}

function bindRcAlimConfigModalEvents() {
  document.getElementById('rc-alim-config-backdrop')?.addEventListener('click', closeRcAlimConfigModal);
  document.getElementById('rc-alim-config-cancel')?.addEventListener('click', closeRcAlimConfigModal);

  const searchEl = document.getElementById('rc-alim-config-search');
  const listEl   = document.getElementById('rc-alim-config-list');
  const wrapEl   = document.getElementById('rc-alim-search-wrap');

  function showAlimDropdown(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      listEl.innerHTML = '';
      listEl.classList.remove('rc-alim-search-list--visible');
      wrapEl.classList.remove('rc-alim-search-wrap--open');
      return;
    }
    const data     = window.ALIMENTS_DATA || [];
    const filtered = data
      .filter(a => a.nom.toLowerCase().includes(term) || (a.categorie || '').toLowerCase().includes(term))
      .slice(0, 15);
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="rc-alim-search-empty">Aucun résultat</div>';
    } else {
      listEl.innerHTML = filtered.map(a => `
        <div class="rc-alim-search-item" data-alim-pick="${a.id}">
          <span class="rc-alim-search-item__name">${a.nom}</span>
          <span class="rc-alim-search-item__kcal">${a.m.k} kcal/100g</span>
        </div>`).join('');
    }
    listEl.classList.add('rc-alim-search-list--visible');
    wrapEl.classList.add('rc-alim-search-wrap--open');
  }

  searchEl?.addEventListener('input', e => {
    _rcAlimConfigSelectedAlim = null;
    const confirmBtn = document.getElementById('rc-alim-config-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    showAlimDropdown(e.target.value);
  });

  searchEl?.addEventListener('focus', e => {
    if (e.target.value && !_rcAlimConfigSelectedAlim) showAlimDropdown(e.target.value);
  });

  searchEl?.addEventListener('blur', () => {
    setTimeout(() => {
      listEl.innerHTML = '';
      listEl.classList.remove('rc-alim-search-list--visible');
      wrapEl.classList.remove('rc-alim-search-wrap--open');
    }, 200);
  });

  // mousedown + touchstart pour éviter que le blur masque la liste avant la sélection
  function pickAlimFromList(e) {
    e.preventDefault();
    const item = e.target.closest('[data-alim-pick]');
    if (!item) return;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.dataset.alimPick);
    if (alim) selectAlimForConfig(alim);
  }
  listEl?.addEventListener('mousedown', pickAlimFromList);
  listEl?.addEventListener('touchstart', pickAlimFromList, { passive: false });

  document.getElementById('rc-alim-config-confirm')?.addEventListener('click', () => {
    if (!_rcAlimConfigSelectedAlim) return;
    const qty = parseFloat(document.getElementById('rc-alim-config-qty')?.value);
    if (!qty || qty <= 0) return;

    if (_rcAlimConfigMode === 'draft') {
      _rcDraftAliments.push({
        alimId:   _rcAlimConfigSelectedAlim.id,
        nom:      _rcAlimConfigSelectedAlim.nom,
        type:     _rcAlimConfigSelectedAlim.type || 'gramme',
        quantite: qty,
      });
      closeRcAlimConfigModal();
      renderRcNewDraftList();
    } else {
      if (!_rcCurrentId) return;
      window.RECETTES_DB.addAliment(_rcCurrentId, _rcAlimConfigSelectedAlim.id, qty);
      closeRcAlimConfigModal();
      renderRcEdit();
    }
  });
}

/* ── Modale nouvelle recette ── */

function openRcNewModal() {
  _rcDraftAliments = [];
  const nomInput = document.getElementById('rc-new-nom');
  if (nomInput) nomInput.value = '';
  renderRcNewDraftList();
  const modal = document.getElementById('rc-new-modal');
  if (modal) modal.classList.add('rc-new-modal--open');
  setTimeout(() => nomInput?.focus(), 80);
}

function closeRcNewModal() {
  document.getElementById('rc-new-modal')?.classList.remove('rc-new-modal--open');
  _rcDraftAliments = [];
}

function renderRcNewDraftList() {
  const list = document.getElementById('rc-new-draft-list');
  if (!list) return;
  if (!_rcDraftAliments.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = _rcDraftAliments.map((item, idx) => `
    <div class="rc-new-draft-item">
      <div>
        <div class="rc-new-draft-item__name">${item.nom}</div>
        <div class="rc-new-draft-item__qty">${item.quantite} ${item.type === 'unite' ? 'unité(s)' : 'g'}</div>
      </div>
      <button class="rc-new-draft-item__del" data-draft-del="${idx}" aria-label="Supprimer">✕</button>
    </div>`).join('');
  list.querySelectorAll('[data-draft-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      _rcDraftAliments.splice(parseInt(btn.dataset.draftDel, 10), 1);
      renderRcNewDraftList();
    });
  });
}

function bindRcNewModalEvents() {
  document.getElementById('rc-new-backdrop')?.addEventListener('click', closeRcNewModal);
  document.getElementById('rc-new-cancel')?.addEventListener('click', closeRcNewModal);

  document.getElementById('rc-new-add-alim')?.addEventListener('click', () => {
    openRcAlimConfigModal('draft');
  });

  document.getElementById('rc-new-save')?.addEventListener('click', () => {
    const nom = (document.getElementById('rc-new-nom')?.value || '').trim() || 'Nouvelle recette';
    const rec = window.RECETTES_DB.add(nom);
    _rcDraftAliments.forEach(item => {
      window.RECETTES_DB.addAliment(rec.id, item.alimId, item.quantite);
    });
    closeRcNewModal();
    renderRcList();
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
    fab.addEventListener('click', openAlimNewModal);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 4 — ALIMENTS — CRÉATION
═══════════════════════════════════════════════════════════════ */

const CUSTOM_ALIM_KEY = 'ft_custom_aliments';

function loadCustomAliments() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_ALIM_KEY) || '[]');
    stored.forEach(a => {
      if (!(window.ALIMENTS_DATA || []).find(x => x.id === a.id)) {
        (window.ALIMENTS_DATA = window.ALIMENTS_DATA || []).push(a);
      }
    });
  } catch (e) {}
}

function _saveCustomAliment(alim) {
  const stored = JSON.parse(localStorage.getItem(CUSTOM_ALIM_KEY) || '[]');
  stored.push(alim);
  localStorage.setItem(CUSTOM_ALIM_KEY, JSON.stringify(stored));
  (window.ALIMENTS_DATA = window.ALIMENTS_DATA || []).push(alim);
}

// Type par défaut selon la catégorie
const CATEGORY_TYPE_MAP = {
  'Viandes':          'gramme',
  'Poissons':         'gramme',
  'Féculents':        'gramme',
  'Légumes':          'gramme',
  'Produits laitiers':'gramme',
  'Fruits':           'unite',
  'Boissons':         'ml',
  'Autres':           'gramme',
};

// Libellé de l'unité selon le type
const TYPE_UNIT_LABEL = {
  gramme: 'g',
  ml:     'ml',
  unite:  'unité(s)',
};

// Portion de référence par défaut selon le type
const TYPE_DEFAULT_PORTION = {
  gramme: 100,
  ml:     100,
  unite:  1,
};

let _alimNewType    = 'gramme';
let _alimNewCat     = 'Autres';
let _alimNewKind    = 'simple'; // 'simple' | 'produit'

// Applique un type de portion : toggle + portion + unité
function _applyAlimType(type) {
  _alimNewType = type;
  document.querySelectorAll('[data-alim-type]').forEach(b => {
    b.classList.toggle('alim-new__toggle--active', b.dataset.alimType === type);
  });
  const portionEl   = document.getElementById('alim-new-portion');
  const portionUnit = document.getElementById('alim-new-portion-unit');
  if (portionEl)   portionEl.value        = TYPE_DEFAULT_PORTION[type] ?? 100;
  if (portionUnit) portionUnit.textContent = TYPE_UNIT_LABEL[type]     ?? 'g';
}

// Applique le mode simple / produit
function _applyAlimKind(kind) {
  _alimNewKind = kind;

  // Boutons kind
  document.querySelectorAll('[data-alim-kind]').forEach(b => {
    b.classList.toggle('alim-new__kind--active', b.dataset.alimKind === kind);
  });

  const isProduit      = kind === 'produit';
  const titleEl        = document.getElementById('alim-new-title');
  const nomLabelEl     = document.getElementById('alim-new-nom-label');
  const nomEl          = document.getElementById('alim-new-nom');
  const marqueField    = document.getElementById('alim-new-marque-field');
  const macrosBtn      = document.getElementById('alim-new-macros-btn');
  const macrosSection  = document.getElementById('alim-new-macros-section');
  const portionLabelEl = document.getElementById('alim-new-portion-label');

  if (titleEl)        titleEl.textContent      = isProduit ? 'Nouveau produit' : 'Nouvel aliment';
  if (nomLabelEl)     nomLabelEl.textContent   = isProduit ? 'Nom du produit'  : 'Nom de l\'aliment';
  if (nomEl)          nomEl.placeholder        = isProduit ? 'Ex : Yaourt nature, Soupe tomate…' : 'Ex : Poulet, Riz, Banane…';
  if (portionLabelEl) portionLabelEl.textContent = isProduit ? 'Portion du produit' : 'Portion de référence';

  if (marqueField) marqueField.hidden = !isProduit;

  const scanZone = document.getElementById('alim-scan-zone');
  if (scanZone) scanZone.hidden = !isProduit;

  if (isProduit) {
    // Macros toujours visibles pour un produit
    if (macrosBtn)     macrosBtn.hidden     = true;
    if (macrosSection) macrosSection.hidden = false;
  } else {
    // Macros optionnelles pour un aliment simple
    if (macrosBtn)     macrosBtn.hidden     = false;
    if (macrosSection) macrosSection.hidden = true;
    if (macrosBtn)     macrosBtn.textContent = '+ Ajouter infos nutritionnelles';
  }
}

function openAlimNewModal() {
  _alimNewType = 'gramme';
  _alimNewCat  = 'Autres';
  _alimNewKind = 'simple';

  const nomEl = document.getElementById('alim-new-nom');
  if (nomEl) nomEl.value = '';

  const marqueEl = document.getElementById('alim-new-marque');
  if (marqueEl) marqueEl.value = '';

  _applyAlimType('gramme');
  _applyAlimKind('simple');

  document.querySelectorAll('#alim-new-cat-chips [data-alim-cat]').forEach(chip => {
    chip.classList.toggle('alim-new__cat-chip--active', chip.dataset.alimCat === 'Autres');
  });

  ['alim-new-kcal', 'alim-new-prot', 'alim-new-gluc', 'alim-new-lip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const saveBtn = document.getElementById('alim-new-save');
  if (saveBtn) saveBtn.disabled = true;

  // Reset champ barcode
  const barcodeInput = document.getElementById('alim-barcode-input');
  if (barcodeInput) barcodeInput.value = '';
  const barcodeSearch = document.getElementById('alim-barcode-search');
  if (barcodeSearch) barcodeSearch.disabled = true;
  const barcodeError = document.getElementById('alim-barcode-error');
  if (barcodeError) barcodeError.hidden = true;

  document.getElementById('alim-new-modal')?.classList.add('alim-new-modal--open');
  setTimeout(() => nomEl?.focus(), 80);
}

function closeAlimNewModal() {
  document.getElementById('alim-new-modal')?.classList.remove('alim-new-modal--open');
}

function bindAlimNewModalEvents() {
  document.getElementById('alim-new-backdrop')?.addEventListener('click', closeAlimNewModal);
  document.getElementById('alim-new-cancel')?.addEventListener('click', closeAlimNewModal);

  // Toggle kind (simple / produit)
  document.querySelectorAll('[data-alim-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      _applyAlimKind(btn.dataset.alimKind);
      // Vérifier si le nom est déjà rempli pour activer le bouton
      const nom = document.getElementById('alim-new-nom')?.value.trim();
      const saveBtn = document.getElementById('alim-new-save');
      if (saveBtn) saveBtn.disabled = !nom;
    });
  });

  // Activer le bouton Créer dès qu'un nom est saisi
  const nomEl = document.getElementById('alim-new-nom');
  nomEl?.addEventListener('input', () => {
    const saveBtn = document.getElementById('alim-new-save');
    if (saveBtn) saveBtn.disabled = !nomEl.value.trim();
  });

  // Toggle manuel du type (gramme / ml / unité)
  document.querySelectorAll('[data-alim-type]').forEach(btn => {
    btn.addEventListener('click', () => _applyAlimType(btn.dataset.alimType));
  });

  // Chips catégorie → type automatique
  const catChips = document.getElementById('alim-new-cat-chips');
  catChips?.addEventListener('click', e => {
    const chip = e.target.closest('[data-alim-cat]');
    if (!chip) return;
    _alimNewCat = chip.dataset.alimCat;
    catChips.querySelectorAll('[data-alim-cat]').forEach(c => {
      c.classList.toggle('alim-new__cat-chip--active', c.dataset.alimCat === _alimNewCat);
    });
    _applyAlimType(CATEGORY_TYPE_MAP[_alimNewCat] || 'gramme');
  });

  // Toggle infos nutritionnelles (aliment simple uniquement)
  const macrosBtn     = document.getElementById('alim-new-macros-btn');
  const macrosSection = document.getElementById('alim-new-macros-section');
  macrosBtn?.addEventListener('click', () => {
    if (!macrosSection) return;
    macrosSection.hidden = !macrosSection.hidden;
    macrosBtn.textContent = macrosSection.hidden
      ? '+ Ajouter infos nutritionnelles'
      : '— Masquer infos nutritionnelles';
  });

  // Enregistrer
  document.getElementById('alim-new-save')?.addEventListener('click', () => {
    const nom = document.getElementById('alim-new-nom')?.value.trim();
    if (!nom) return;

    const portion = parseFloat(document.getElementById('alim-new-portion')?.value)
      || (TYPE_DEFAULT_PORTION[_alimNewType] ?? 100);
    const kcal = parseFloat(document.getElementById('alim-new-kcal')?.value) || 0;
    const prot = parseFloat(document.getElementById('alim-new-prot')?.value) || 0;
    const gluc = parseFloat(document.getElementById('alim-new-gluc')?.value) || 0;
    const lip  = parseFloat(document.getElementById('alim-new-lip')?.value)  || 0;

    const unitSuffix = { gramme: ' / 100g', ml: ' / 100ml', unite: ' / unité' }[_alimNewType] || ' / 100g';
    let detail = '';
    if (kcal > 0) {
      detail = `${kcal} kcal`;
      if (prot > 0) detail += ` · ${prot}g protéines`;
      detail += unitSuffix;
    } else {
      detail = _alimNewType === 'unite' ? '1 unité' : `pour ${portion}${TYPE_UNIT_LABEL[_alimNewType] || 'g'}`;
    }

    const alim = {
      id:               'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      nom,
      typeAliment:      _alimNewKind,
      categorie:        _alimNewCat,
      detail,
      type:             _alimNewType,
      portionReference: portion,
      m:                { k: kcal, p: prot, g: gluc, l: lip },
      custom:           true,
    };

    if (_alimNewKind === 'produit') {
      const marque = document.getElementById('alim-new-marque')?.value.trim();
      if (marque) alim.marque = marque;
    }
    if (_alimNewType === 'unite') alim.unitWeight = portion;

    _saveCustomAliment(alim);
    closeAlimNewModal();
    renderAlimentsPanel();
  });
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
