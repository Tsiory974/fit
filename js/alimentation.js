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
  bindAddMealSheetEvents();
  bindModalEvents();
  bindPlanningWeekNav();
  bindPlanningAddSheetEvents();
  bindDayPickSheetEvents();
  bindRecettesEvents();
  bindRcPickerEvents();
  bindRcNewModalEvents();
  bindRcAlimConfigModalEvents();
  bindAlimNewModalEvents();
  bindMenuDetailSheetEvents();
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

  // ── Repas planifiés pour aujourd'hui (lecture seule depuis MEAL_PLAN_DB) ──
  const planToday     = window.MEAL_PLAN_DB ? window.MEAL_PLAN_DB.getDay(today) : { entries: [] };
  const planEntries   = planToday.entries || [];
  // N'afficher dans la bannière que les repas encore en attente (non consommés, non sautés)
  const pendingEntries = planEntries.filter(e => !e.status || e.status === 'planifie');

  if (pendingEntries.length > 0) {
    const planSection = document.createElement('div');
    planSection.className = 'aj-planned-section';

    const planHeader = document.createElement('div');
    planHeader.className = 'aj-planned-header';
    planHeader.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           width="13" height="13" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8"  y1="2" x2="8"  y2="6"/>
        <line x1="3"  y1="10" x2="21" y2="10"/>
      </svg>
      Planifié aujourd'hui`;
    planSection.appendChild(planHeader);

    // Grouper les entrées dans l'ordre des MEAL_KEYS
    const planByMeal = {};
    pendingEntries.forEach(e => {
      if (!planByMeal[e.mealKey]) planByMeal[e.mealKey] = [];
      planByMeal[e.mealKey].push(e);
    });

    (window.MEAL_KEYS || []).forEach(mk => {
      if (!planByMeal[mk]) return;
      const meta = MEAL_META[mk] || { label: mk, icon: '🍽️' };
      planByMeal[mk].forEach(e => {
        const row = document.createElement('div');
        row.className = 'aj-planned-entry';
        row.dataset.plEntryId = e.id;
        row.innerHTML = `
          <span class="aj-planned-entry__icon">${meta.icon}</span>
          <div class="aj-planned-entry__body">
            <span class="aj-planned-entry__meal">${meta.label}</span>
            <span class="aj-planned-entry__name">${e.recetteNom}</span>
          </div>
          <span class="aj-planned-entry__kcal">${e.totalKcal} kcal</span>
          <span class="aj-planned-entry__arrow" aria-hidden="true">›</span>`;
        planSection.appendChild(row);
      });
    });

    mealsEl.appendChild(planSection);
  }

  // Seulement les repas qui ont des aliments
  const filledMeals = (window.MEAL_KEYS || []).filter(mk =>
    day.meals[mk] && day.meals[mk].items.length > 0
  );

  if (filledMeals.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'aj-meals-empty';

    if (pendingEntries.length === 0) {
      // Vide total : rien planifié + rien consommé → pédagogie complète
      emptyEl.innerHTML = `
        <div class="aj-meals-empty__icon" aria-hidden="true">🍽️</div>
        <p class="aj-meals-empty__title">Rien de consommé aujourd'hui</p>
        <p class="aj-meals-empty__hint">Les barres ci-dessus se remplissent au fur et à mesure que tu enregistres tes repas.</p>
        <div class="aj-meals-empty__explainer">
          <span class="aj-meals-empty__explainer-label">💡 Comment ça marche</span>
          <span class="aj-meals-empty__explainer-row">
            <strong>Planning</strong> → ce que tu prévois de manger
          </span>
          <span class="aj-meals-empty__explainer-row">
            <strong>Aujourd'hui</strong> → ce que tu as vraiment mangé
          </span>
        </div>
        <label for="alim-planning" class="aj-meals-empty__cta" role="button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               width="14" height="14" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          Voir le planning
        </label>
        <button class="aj-meals-empty__secondary" data-open-add-meal>
          Ou ajouter un repas manuellement
        </button>`;
    } else {
      // Des repas sont planifiés mais pas encore saisies → encourager à les valider
      emptyEl.innerHTML = `
        <div class="aj-meals-empty__icon" aria-hidden="true">🍽️</div>
        <p class="aj-meals-empty__title">Aucun repas enregistré</p>
        <p class="aj-meals-empty__hint">Validez vos repas planifiés ou ajoutez-en un manuellement.</p>
        <button class="aj-meals-empty__cta" data-add-to-meal="dejeuner">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               width="13" height="13" aria-hidden="true">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          Ajouter manuellement
        </button>`;
    }
    mealsEl.appendChild(emptyEl);
  } else {
    filledMeals.forEach(mk => {
      const meta    = MEAL_META[mk] || { label: mk, icon: '🍽️' };
      const mData   = day.meals[mk];
      const mTotals = window.ALIM_DB.calcMealTotals(day, mk);

      const section = document.createElement('div');
      section.className = 'aj-meal aj-meal--open' + (mData.validated ? ' aj-meal--validated' : '');
      section.dataset.meal = mk;

      const itemsHTML = mData.items.map((it, idx) => `
        <div class="aj-meal__item">
          <span class="aj-meal__item-name">${it.nom}</span>
          <span class="aj-meal__item-qty">${it.qty}g</span>
          <span class="aj-meal__item-kcal">${it.k} kcal</span>
          <button class="aj-meal__item-del" data-del-meal="${mk}" data-del-idx="${idx}"
                  aria-label="Supprimer">✕</button>
        </div>`).join('');

      section.innerHTML = `
        <div class="aj-meal__header" data-toggle-meal="${mk}">
          <span class="aj-meal__icon">${meta.icon}</span>
          <div class="aj-meal__info">
            <div class="aj-meal__name">${meta.label}</div>
            <div class="aj-meal__kcal">${mData.items.length} aliment${mData.items.length > 1 ? 's' : ''} · <strong>${mTotals.k} kcal</strong></div>
            <div class="aj-meal__macros">
              <span class="aj-meal__macro aj-meal__macro--p">P <strong>${mTotals.p}g</strong></span>
              <span class="aj-meal__macro aj-meal__macro--g">G <strong>${mTotals.g}g</strong></span>
              <span class="aj-meal__macro aj-meal__macro--l">L <strong>${mTotals.l}g</strong></span>
            </div>
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
  }

  // Bouton "Ajouter un repas" toujours présent en bas
  const addMealBtn = document.createElement('button');
  addMealBtn.className = 'aj-add-meal-btn';
  addMealBtn.id = 'btn-add-meal';
  addMealBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
         width="16" height="16" aria-hidden="true">
      <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
    </svg>
    Ajouter un repas`;
  mealsEl.appendChild(addMealBtn);

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

    // Ouvrir modale d'ajout aliment (depuis un repas déjà existant)
    const addBtn = e.target.closest('[data-add-to-meal]');
    if (addBtn) {
      _modalMealKey = addBtn.dataset.addToMeal;
      const meta    = MEAL_META[_modalMealKey] || {};
      openAlimModal(meta.label || _modalMealKey);
      return;
    }

    // Bouton "Ajouter un repas" (principal et secondaire état vide)
    if (e.target.closest('#btn-add-meal') || e.target.closest('[data-open-add-meal]')) {
      openAddMealSheet();
      return;
    }

    // Clic sur un repas planifié → ouvrir le détail
    const planEntry = e.target.closest('[data-pl-entry-id]');
    if (planEntry) {
      const entryId = planEntry.dataset.plEntryId;
      const planDay = window.MEAL_PLAN_DB ? window.MEAL_PLAN_DB.getDay(localDateStr()) : { entries: [] };
      const entry   = (planDay.entries || []).find(en => en.id === entryId);
      if (entry) _openMenuDetail(entry);
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
   BOTTOM-SHEET "AJOUTER UN REPAS"
═══════════════════════════════════════════════════════════════ */

let _addSheetMealKey = null;

function openAddMealSheet() {
  const sheet = document.getElementById('aj-add-sheet');
  if (!sheet) return;
  _addSheetMealKey = null;
  _showAddSheetStep('type');
  sheet.hidden = false;
}

function closeAddMealSheet() {
  const sheet = document.getElementById('aj-add-sheet');
  if (sheet) sheet.hidden = true;
  _addSheetMealKey = null;
}

function _showAddSheetStep(step) {
  document.getElementById('aj-add-sheet-step-type').hidden    = (step !== 'type');
  document.getElementById('aj-add-sheet-step-content').hidden = (step !== 'content');
  document.getElementById('aj-add-sheet-step-recette').hidden = (step !== 'recette');

  const backBtn = document.getElementById('aj-add-sheet-back');
  const titleEl = document.getElementById('aj-add-sheet-title');

  if (step === 'type') {
    backBtn.hidden = true;
    titleEl.textContent = 'Ajouter un repas';
  } else if (step === 'content') {
    backBtn.hidden = false;
    const meta = MEAL_META[_addSheetMealKey] || { label: _addSheetMealKey };
    titleEl.textContent = meta.label;
  } else if (step === 'recette') {
    backBtn.hidden = false;
    titleEl.textContent = 'Choisir un repas type';
  }
}

function _renderAddSheetRecetteList() {
  const listEl = document.getElementById('aj-add-sheet-rc-list');
  if (!listEl) return;
  const recettes = window.RECETTES_DB.getAll();
  if (recettes.length === 0) {
    listEl.innerHTML = '<p class="panel-placeholder" style="padding-top:1rem">Aucun repas enregistré</p>';
    return;
  }
  listEl.innerHTML = recettes.map(rec => {
    const totals = window.RECETTES_DB.calcTotals(rec);
    return `
      <div class="aj-modal__alim-row" data-add-rc-id="${rec.id}">
        <span class="aj-modal__alim-name">${rec.nom}</span>
        <span class="aj-modal__alim-info">${totals.k} kcal · ${rec.aliments.length} ingr.</span>
      </div>`;
  }).join('');
}

function bindAddMealSheetEvents() {
  if (!document.getElementById('aj-add-sheet')) return;

  document.getElementById('aj-add-sheet-backdrop').addEventListener('click', closeAddMealSheet);
  document.getElementById('aj-add-sheet-close').addEventListener('click', closeAddMealSheet);

  document.getElementById('aj-add-sheet-back').addEventListener('click', () => {
    if (!document.getElementById('aj-add-sheet-step-content').hidden) {
      _showAddSheetStep('type');
    } else if (!document.getElementById('aj-add-sheet-step-recette').hidden) {
      _showAddSheetStep('content');
    }
  });

  // Sélection du type de repas
  document.getElementById('aj-add-sheet-step-type').addEventListener('click', e => {
    const btn = e.target.closest('[data-meal-type]');
    if (!btn) return;
    _addSheetMealKey = btn.dataset.mealType;
    _showAddSheetStep('content');
  });

  // Choix "Un aliment"
  document.getElementById('aj-content-opt-aliment').addEventListener('click', () => {
    if (!_addSheetMealKey) return;
    const meta = MEAL_META[_addSheetMealKey] || { label: _addSheetMealKey };
    _modalMealKey = _addSheetMealKey;
    closeAddMealSheet();
    openAlimModal(meta.label);
  });

  // Choix "Une recette"
  document.getElementById('aj-content-opt-recette').addEventListener('click', () => {
    _renderAddSheetRecetteList();
    _showAddSheetStep('recette');
  });

  // Sélection d'une recette → ajout de tous ses aliments au repas
  document.getElementById('aj-add-sheet-rc-list').addEventListener('click', e => {
    const row = e.target.closest('[data-add-rc-id]');
    if (!row || !_addSheetMealKey) return;
    const rec = window.RECETTES_DB.get(row.dataset.addRcId);
    if (!rec || rec.aliments.length === 0) return;
    const today = localDateStr();
    rec.aliments.forEach(item => {
      window.ALIM_DB.addItem(today, _addSheetMealKey, item.alimId, item.quantite);
    });
    closeAddMealSheet();
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
  const list     = document.getElementById('aj-modal-list');
  const countEl  = document.getElementById('aj-modal-count');
  if (!list) return;
  const data = window.ALIMENTS_DATA || [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? data.filter(a => a.nom.toLowerCase().includes(term) || a.categorie.toLowerCase().includes(term))
    : data;

  if (filtered.length === 0) {
    if (countEl) countEl.textContent = '';
    list.innerHTML = `
      <div class="aj-modal__empty">
        <span class="aj-modal__empty-icon">🔍</span>
        <span>Aucun résultat pour « ${term} »</span>
      </div>`;
    return;
  }

  if (countEl) {
    countEl.textContent = term
      ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`
      : '';
  }

  list.innerHTML = filtered.map(a => `
    <div class="aj-modal__alim-row" data-pick-alim="${a.id}">
      <span class="aj-modal__alim-name">${a.nom}</span>
      <span class="aj-modal__alim-info">${a.m.k} kcal/100g</span>
    </div>`).join('');
}

// Déduit le mode depuis le type legacy stocké sur l'aliment
function _modeFromType(type) {
  if (type === 'ml')    return 'volume';
  if (type === 'unite') return 'piece';
  return 'poids';
}

// Mode effectif d'un aliment (champ moderne prioritaire, fallback legacy)
function _alimMode(alim) {
  return alim.modeConsommation || _modeFromType(alim.type);
}

// Configure l'étape 2 (quantité) selon le mode de l'aliment
function _setupQtyStep(alim) {
  const mode      = _alimMode(alim);
  const counterEl = document.getElementById('aj-qty-counter');
  const inputWrap = document.getElementById('aj-qty-input-wrap');
  const countEl   = document.getElementById('aj-qty-count');
  const unitEl    = document.getElementById('aj-qty-unit');
  const hintEl    = document.getElementById('aj-qty-hint');
  const qtyInput  = document.getElementById('aj-modal-qty-input');
  const labelEl   = document.getElementById('aj-modal-qty-label');

  if (mode === 'piece') {
    if (counterEl) counterEl.hidden = false;
    if (inputWrap) inputWrap.hidden = true;
    if (countEl)   countEl.textContent = '1';
    if (unitEl)    unitEl.textContent  = 'pièce';
    const w = alim.unitWeight || alim.portionReference || 0;
    if (hintEl)    hintEl.textContent  = w ? `≈ ${w} g par pièce` : '';

  } else if (mode === 'portion') {
    if (counterEl) counterEl.hidden = false;
    if (inputWrap) inputWrap.hidden = true;
    if (countEl)   countEl.textContent = '1';
    if (unitEl)    unitEl.textContent  = 'portion';
    const p = alim.portionReference || 100;
    if (hintEl)    hintEl.textContent  = `1 portion = ${p} g`;

  } else if (mode === 'volume') {
    if (counterEl) counterEl.hidden = true;
    if (inputWrap) inputWrap.hidden = false;
    if (labelEl)   labelEl.textContent = 'Quantité (ml)';
    if (qtyInput)  qtyInput.value = String(alim.portionReference || 200);
    if (hintEl)    hintEl.textContent  = '';

  } else { // poids
    if (counterEl) counterEl.hidden = true;
    if (inputWrap) inputWrap.hidden = false;
    if (labelEl)   labelEl.textContent = 'Quantité (g)';
    if (qtyInput)  qtyInput.value = '100';
    if (hintEl)    hintEl.textContent  = '';
  }
}

// Convertit la saisie UI en grammes (ou ml) pour ALIM_DB
function _getQtyGrams(alim) {
  const mode = _alimMode(alim);
  if (mode === 'piece') {
    const count = parseInt(document.getElementById('aj-qty-count')?.textContent) || 1;
    return count * (alim.unitWeight || alim.portionReference || 100);
  }
  if (mode === 'portion') {
    const count = parseInt(document.getElementById('aj-qty-count')?.textContent) || 1;
    return count * (alim.portionReference || 100);
  }
  return parseFloat(document.getElementById('aj-modal-qty-input')?.value) || 0;
}

function updateQtyMacros() {
  if (!_modalAlim) return;
  const qty    = _getQtyGrams(_modalAlim);
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
    _setupQtyStep(alim);
    updateQtyMacros();
    showModalStep('qty');
  });

  // Mise à jour macros en live (mode poids / volume)
  document.getElementById('aj-modal-qty-input').addEventListener('input', updateQtyMacros);

  // Compteur − / + (mode pièce / portion)
  document.getElementById('aj-qty-minus')?.addEventListener('click', () => {
    const el = document.getElementById('aj-qty-count');
    if (!el) return;
    el.textContent = String(Math.max(1, (parseInt(el.textContent) || 1) - 1));
    updateQtyMacros();
  });
  document.getElementById('aj-qty-plus')?.addEventListener('click', () => {
    const el = document.getElementById('aj-qty-count');
    if (!el) return;
    el.textContent = String((parseInt(el.textContent) || 1) + 1);
    updateQtyMacros();
  });

  // Retour
  document.getElementById('aj-modal-back').addEventListener('click', () => {
    showModalStep('search');
    _modalAlim = null;
  });

  // Confirmer ajout
  document.getElementById('aj-modal-confirm').addEventListener('click', () => {
    if (!_modalAlim || !_modalMealKey) return;
    const qty = _getQtyGrams(_modalAlim);
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

/* ── Constantes de localisation ── */
const PL_DAY_NAMES   = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const PL_MONTH_SHORT = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.'];

/* ── État Planning ── */
let _planWeekOffset   = 0;       // 0 = semaine courante, -1 = précédente, +1 = suivante
let _plSheetDate      = null;    // date du jour visé lors de l'ajout
let _plSheetMealKey   = null;    // type de repas sélectionné
let _plDayPickMode    = null;    // 'dup-entry' | 'copy-day'
let _plDayPickFrom    = null;    // date source pour copie/dup
let _plDayPickEntryId = null;    // id de l'entrée à dupliquer

/* ── Helpers semaine ── */
function _planWeekStart(offset) {
  const now = new Date();
  const dow = now.getDay(); // 0=dim … 6=sam
  const diffToMonday = (dow === 0) ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function _planWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

/* ── Rendu du panneau ── */
function renderPlanningPanel() {
  const weekStart = _planWeekStart(_planWeekOffset);
  const days      = _planWeekDays(weekStart);
  const weekEnd   = days[6];

  // Label semaine
  const labelEl = document.getElementById('pl-week-label');
  if (labelEl) {
    const s = `${weekStart.getDate()} ${PL_MONTH_SHORT[weekStart.getMonth()]}`;
    const e = `${weekEnd.getDate()} ${PL_MONTH_SHORT[weekEnd.getMonth()]}`;
    labelEl.textContent = `${s} → ${e}`;
  }

  const daysEl = document.getElementById('pl-days');
  if (!daysEl) return;
  daysEl.innerHTML = '';

  const today = window.localDateStr();

  days.forEach((d, i) => {
    const dateStr = window.localDateStr(d);
    const plan    = window.MEAL_PLAN_DB.getDay(dateStr);
    const isToday = dateStr === today;

    // Grouper les entrées par mealKey pour l'ordre d'affichage
    const entriesByMeal = {};
    plan.entries.forEach(e => {
      if (!entriesByMeal[e.mealKey]) entriesByMeal[e.mealKey] = [];
      entriesByMeal[e.mealKey].push(e);
    });

    const orderedMealKeys = window.MEAL_KEYS || [];
    const entriesHTML = orderedMealKeys
      .filter(mk => entriesByMeal[mk] && entriesByMeal[mk].length > 0)
      .flatMap(mk => {
        const meta = MEAL_META[mk] || { label: mk, icon: '🍽️' };
        return entriesByMeal[mk].map(e => {
          // Calcul macros à la volée depuis la recette
          const rec = window.RECETTES_DB ? window.RECETTES_DB.get(e.recetteId) : null;
          const mac = rec ? window.RECETTES_DB.calcTotals(rec) : null;
          const macrosHTML = mac ? `
            <div class="pl-entry__macros">
              <span class="pl-entry__macro pl-entry__macro--p">P <strong>${mac.p}g</strong></span>
              <span class="pl-entry__macro pl-entry__macro--g">G <strong>${mac.g}g</strong></span>
              <span class="pl-entry__macro pl-entry__macro--l">L <strong>${mac.l}g</strong></span>
            </div>` : '';
          const status = e.status || 'planifie';
          const statusLabels = { planifie: 'Planifié', consomme: '✓ Consommé', saute: 'Sauté' };
          const badgeHTML = `<span class="pl-entry__badge pl-entry__badge--${status}">${statusLabels[status]}</span>`;
          return `
          <div class="pl-entry pl-entry--${status}" data-entry-id="${e.id}" data-entry-date="${dateStr}">
            <span class="pl-entry__icon">${meta.icon}</span>
            <div class="pl-entry__body">
              <span class="pl-entry__meal">${meta.label}</span>
              <span class="pl-entry__name">${e.recetteNom}</span>
              ${macrosHTML}
              ${badgeHTML}
            </div>
            <span class="pl-entry__kcal">${e.totalKcal} kcal</span>
            <div class="pl-entry__btns">
              <button class="pl-entry__btn pl-entry__btn--dup"
                      data-dup-entry="${e.id}" data-dup-date="${dateStr}"
                      aria-label="Dupliquer ce repas">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                     width="14" height="14" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="pl-entry__btn pl-entry__btn--del"
                      data-del-entry="${e.id}" data-del-date="${dateStr}"
                      aria-label="Supprimer ce repas">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                     width="14" height="14" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>`;
        }); // .map — retourne un tableau de strings
      })    // .flatMap — aplatit en un seul tableau
      .join('');

    const hasEntries = plan.entries.length > 0;

    const card = document.createElement('div');
    card.className = 'pl-day-card' + (isToday ? ' pl-day-card--today' : '');
    card.dataset.date = dateStr;
    card.innerHTML = `
      <div class="pl-day-card__header">
        <div class="pl-day-card__day">${PL_DAY_NAMES[i]}${isToday ? '<span class="pl-day-card__today-badge">Aujourd\'hui</span>' : ''}</div>
        <div class="pl-day-card__date">${d.getDate()} ${PL_MONTH_SHORT[d.getMonth()]}</div>
      </div>
      <div class="pl-day-card__body">
        ${hasEntries ? entriesHTML : '<p class="pl-day-card__empty">Aucun repas planifié</p>'}
      </div>
      <div class="pl-day-card__footer">
        <button class="pl-day-card__add-btn" data-add-pl-date="${dateStr}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               width="13" height="13" aria-hidden="true">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          Planifier un repas
        </button>
        ${hasEntries ? `<button class="pl-day-card__copy-btn" data-copy-day="${dateStr}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               width="14" height="14" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copier la journée
        </button>` : ''}
      </div>`;
    daysEl.appendChild(card);
  });

  bindPlanningEvents();
}

/* ── Événements du panneau Planning ── */
function bindPlanningWeekNav() {
  const prev = document.getElementById('pl-prev-week');
  const next = document.getElementById('pl-next-week');
  if (!prev || !next) return;
  prev.addEventListener('click', () => { _planWeekOffset--; renderPlanningPanel(); });
  next.addEventListener('click', () => { _planWeekOffset++; renderPlanningPanel(); });
}

function bindPlanningEvents() {
  const daysEl = document.getElementById('pl-days');
  if (!daysEl || daysEl._plBound) return;
  daysEl._plBound = true;

  daysEl.addEventListener('click', e => {
    // Ajouter un repas planifié
    const addBtn = e.target.closest('[data-add-pl-date]');
    if (addBtn) {
      _plSheetDate    = addBtn.dataset.addPlDate;
      _plSheetMealKey = null;
      openPlanningAddSheet();
      return;
    }
    // Supprimer une entrée
    const delBtn = e.target.closest('[data-del-entry]');
    if (delBtn) {
      window.MEAL_PLAN_DB.removeEntry(delBtn.dataset.delDate, delBtn.dataset.delEntry);
      renderPlanningPanel();
      return;
    }
    // Dupliquer une entrée → sélection de jours
    const dupBtn = e.target.closest('[data-dup-entry]');
    if (dupBtn) {
      _plDayPickMode    = 'dup-entry';
      _plDayPickFrom    = dupBtn.dataset.dupDate;
      _plDayPickEntryId = dupBtn.dataset.dupEntry;
      openDayPickSheet();
      return;
    }
    // Copier une journée complète → sélection de jours
    const copyBtn = e.target.closest('[data-copy-day]');
    if (copyBtn) {
      _plDayPickMode    = 'copy-day';
      _plDayPickFrom    = copyBtn.dataset.copyDay;
      _plDayPickEntryId = null;
      openDayPickSheet();
      return;
    }
  });
}

/* ── Bottom-sheet ajout repas planifié ── */
function openPlanningAddSheet() {
  _showPlAddSheetStep('type');
  document.getElementById('pl-add-sheet').hidden = false;
}

function closePlanningAddSheet() {
  document.getElementById('pl-add-sheet').hidden = true;
  _plSheetDate    = null;
  _plSheetMealKey = null;
}

function _showPlAddSheetStep(step) {
  document.getElementById('pl-add-step-type').hidden    = (step !== 'type');
  document.getElementById('pl-add-step-recette').hidden = (step !== 'recette');
  const backBtn = document.getElementById('pl-add-back');
  const titleEl = document.getElementById('pl-add-title');
  if (step === 'type') {
    backBtn.hidden     = true;
    titleEl.textContent = 'Planifier un repas';
  } else {
    backBtn.hidden     = false;
    titleEl.textContent = 'Choisir un repas type';
  }
}

function _renderPlRecetteList() {
  const listEl = document.getElementById('pl-add-rc-list');
  if (!listEl) return;
  const recettes = window.RECETTES_DB.getAll();
  if (recettes.length === 0) {
    listEl.innerHTML = `
      <div class="pl-rc-empty">
        <p class="pl-rc-empty__text">Aucun repas enregistré.</p>
        <p class="pl-rc-empty__hint">Créez d'abord un repas dans l'onglet <strong>Repas</strong>.</p>
      </div>`;
    return;
  }
  listEl.innerHTML = recettes.map(rec => {
    const totals = window.RECETTES_DB.calcTotals(rec);
    return `
      <div class="aj-modal__alim-row"
           data-pick-pl-rc="${rec.id}"
           data-pick-pl-rc-nom="${rec.nom.replace(/"/g, '&quot;')}"
           data-pick-pl-rc-kcal="${totals.k}">
        <span class="aj-modal__alim-name">${rec.nom}</span>
        <span class="aj-modal__alim-info">${totals.k} kcal · ${rec.aliments.length} ingr.</span>
      </div>`;
  }).join('');
}

function bindPlanningAddSheetEvents() {
  const sheet = document.getElementById('pl-add-sheet');
  if (!sheet) return;

  document.getElementById('pl-add-backdrop').addEventListener('click', closePlanningAddSheet);
  document.getElementById('pl-add-close').addEventListener('click', closePlanningAddSheet);

  document.getElementById('pl-add-back').addEventListener('click', () => {
    _showPlAddSheetStep('type');
  });

  // Étape 1 → choisir type de repas
  document.getElementById('pl-add-step-type').addEventListener('click', e => {
    const btn = e.target.closest('[data-pl-meal-type]');
    if (!btn) return;
    _plSheetMealKey = btn.dataset.plMealType;
    _renderPlRecetteList();
    _showPlAddSheetStep('recette');
  });

  // Étape 2 → choisir recette et confirmer
  document.getElementById('pl-add-rc-list').addEventListener('click', e => {
    const row = e.target.closest('[data-pick-pl-rc]');
    if (!row || !_plSheetDate || !_plSheetMealKey) return;
    const recId   = row.dataset.pickPlRc;
    const recNom  = row.dataset.pickPlRcNom;
    const recKcal = parseInt(row.dataset.pickPlRcKcal, 10) || 0;
    window.MEAL_PLAN_DB.addEntry(_plSheetDate, _plSheetMealKey, recId, recNom, recKcal);
    closePlanningAddSheet();
    renderPlanningPanel();
  });
}

/* ── Bottom-sheet sélection de jours (copie / duplication) ── */
function openDayPickSheet() {
  _renderDayPickSheet();
  document.getElementById('pl-day-pick-sheet').hidden = false;
}

function closeDayPickSheet() {
  document.getElementById('pl-day-pick-sheet').hidden = true;
}

function _renderDayPickSheet() {
  const listEl  = document.getElementById('pl-day-pick-list');
  const titleEl = document.getElementById('pl-day-pick-title');
  if (!listEl) return;

  if (titleEl) {
    titleEl.textContent = _plDayPickMode === 'copy-day' ? 'Copier la journée vers…' : 'Dupliquer ce repas vers…';
  }

  const weekStart = _planWeekStart(_planWeekOffset);
  const days      = _planWeekDays(weekStart);

  listEl.innerHTML = days.map((d, i) => {
    const dateStr  = window.localDateStr(d);
    const isSource = dateStr === _plDayPickFrom;
    return `
      <label class="pl-day-pick-item${isSource ? ' pl-day-pick-item--source' : ''}">
        <input class="pl-day-pick-cb" type="checkbox" value="${dateStr}"${isSource ? ' disabled' : ''}>
        <span class="pl-day-pick-name">${PL_DAY_NAMES[i]}</span>
        <span class="pl-day-pick-date">${d.getDate()} ${PL_MONTH_SHORT[d.getMonth()]}</span>
        ${isSource ? '<span class="pl-day-pick-badge">Source</span>' : ''}
      </label>`;
  }).join('');
}

function bindDayPickSheetEvents() {
  const sheet = document.getElementById('pl-day-pick-sheet');
  if (!sheet) return;

  document.getElementById('pl-day-pick-backdrop').addEventListener('click', closeDayPickSheet);
  document.getElementById('pl-day-pick-close').addEventListener('click', closeDayPickSheet);

  document.getElementById('pl-day-pick-confirm').addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('.pl-day-pick-cb:checked')).map(cb => cb.value);
    if (checked.length > 0) {
      if (_plDayPickMode === 'copy-day') {
        window.MEAL_PLAN_DB.copyDay(_plDayPickFrom, checked);
      } else if (_plDayPickMode === 'dup-entry' && _plDayPickEntryId) {
        window.MEAL_PLAN_DB.duplicateEntry(_plDayPickFrom, _plDayPickEntryId, checked);
      }
    }
    closeDayPickSheet();
    renderPlanningPanel();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 3 — RECETTES
═══════════════════════════════════════════════════════════════ */

// Recette en cours d'édition
let _rcCurrentId    = null;
let _rcSearchQuery  = '';

function renderRecettesPanel() {
  renderRcList();
}

/* ── Vue liste ── */
function renderRcList() {
  const listEl  = document.getElementById('rc-list');
  const emptyEl = document.getElementById('rc-empty');
  const countEl = document.getElementById('rc-header-count');
  if (!listEl) return;

  const allRecipes = window.RECETTES_DB.getAll();
  const q = _rcSearchQuery.trim().toLowerCase();
  const recipes = q
    ? allRecipes.filter(r => r.nom.toLowerCase().includes(q))
    : allRecipes;

  // Mise à jour du compteur dans le header
  if (countEl) {
    countEl.textContent = allRecipes.length > 0
      ? `${allRecipes.length} repas`
      : '';
  }

  // État vide (aucun menu créé du tout)
  if (allRecipes.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    listEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  // Aucun résultat de recherche
  if (recipes.length === 0) {
    listEl.innerHTML = '<p class="rc-no-result">Aucun repas ne correspond à votre recherche.</p>';
    return;
  }

  listEl.innerHTML = recipes.map(rec => {
    const totals = window.RECETTES_DB.calcTotals(rec);
    const count  = rec.aliments.length;
    const hasNutrition = count > 0;
    return `
      <div class="rc-card" data-rc-id="${rec.id}">
        <div class="rc-card__toprow">
          <span class="rc-card__name">${rec.nom}</span>
          <button class="rc-card__del" data-rc-del="${rec.id}" aria-label="Supprimer ${rec.nom}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                 width="11" height="11" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/>
            </svg>
          </button>
        </div>
        <span class="rc-card__count">${count} ingrédient${count > 1 ? 's' : ''}</span>
        ${hasNutrition ? `
        <div class="rc-card__nutrition">
          <div class="rc-card__kcal">
            ${totals.k}<span class="rc-card__kcal-unit"> kcal</span>
          </div>
          <div class="rc-card__macros">
            <span class="rc-card__macro rc-card__macro--p">P <strong>${totals.p}g</strong></span>
            <span class="rc-card__macro rc-card__macro--g">G <strong>${totals.g}g</strong></span>
            <span class="rc-card__macro rc-card__macro--l">L <strong>${totals.l}g</strong></span>
          </div>
        </div>` : `<p class="rc-card__no-ingredients">Aucun ingrédient — appuyez pour modifier</p>`}
      </div>`;
  }).join('');
}

/* ── Vue édition ── */
function showRcList() {
  _rcCurrentId   = null;
  _rcSearchQuery = '';
  const searchInput = document.getElementById('rc-search-input');
  if (searchInput) searchInput.value = '';

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

  // Bouton header "Créer" → même action
  document.getElementById('rc-header-create')?.addEventListener('click', openRcNewModal);

  // Bouton CTA état vide → même action
  document.getElementById('rc-empty-cta')?.addEventListener('click', openRcNewModal);

  // Recherche live
  const searchInput = document.getElementById('rc-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _rcSearchQuery = searchInput.value;
      renderRcList();
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
      if (window.confirm('Supprimer ce repas ?')) {
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
        if (window.confirm('Supprimer ce repas ?')) {
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
  // Réinitialiser la zone de recherche inline
  const searchEl = document.getElementById('rc-new-alim-search');
  if (searchEl) searchEl.value = '';
  const listEl = document.getElementById('rc-new-alim-list');
  if (listEl) { listEl.hidden = true; listEl.innerHTML = ''; }
  const qtyRowEl = document.getElementById('rc-new-qty-row');
  if (qtyRowEl) qtyRowEl.hidden = true;
  document.getElementById('rc-new-search-wrap')?.classList.remove('rc-new__search-wrap--open');
  renderRcNewDraftList();
  const modal = document.getElementById('rc-new-modal');
  if (modal) modal.classList.add('rc-new-modal--open');
  setTimeout(() => nomInput?.focus(), 80);
}

function closeRcNewModal() {
  document.getElementById('rc-new-modal')?.classList.remove('rc-new-modal--open');
  _rcDraftAliments = [];
}

/* ── Calcule les kcal d'un item du draft ── */
function _draftItemKcal(item) {
  const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
  if (!alim) return 0;
  const factor = (alim.type || 'gramme') === 'unite' ? item.quantite : item.quantite / 100;
  return Math.round(alim.m.k * factor);
}

/* ── Mise à jour du résumé nutritionnel ── */
function renderRcNewTotals() {
  const goals = window.DAILY_GOALS || { kcal: 2500, p: 180, g: 280, l: 80 };
  let totK = 0, totP = 0, totG = 0, totL = 0;

  _rcDraftAliments.forEach(item => {
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
    if (!alim) return;
    const factor = (alim.type || 'gramme') === 'unite' ? item.quantite : item.quantite / 100;
    totK += alim.m.k * factor;
    totP += alim.m.p * factor;
    totG += alim.m.g * factor;
    totL += alim.m.l * factor;
  });

  totK = Math.round(totK);
  totP = Math.round(totP * 10) / 10;
  totG = Math.round(totG * 10) / 10;
  totL = Math.round(totL * 10) / 10;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('rc-new-total-k', totK);
  setEl('rc-new-total-p', totP);
  setEl('rc-new-total-g', totG);
  setEl('rc-new-total-l', totL);

  [
    { barId: 'rc-new-bar-k', pctId: 'rc-new-pct-k', val: totK, goal: goals.kcal },
    { barId: 'rc-new-bar-p', pctId: 'rc-new-pct-p', val: totP, goal: goals.p   },
    { barId: 'rc-new-bar-g', pctId: 'rc-new-pct-g', val: totG, goal: goals.g   },
    { barId: 'rc-new-bar-l', pctId: 'rc-new-pct-l', val: totL, goal: goals.l   },
  ].forEach(({ barId, pctId, val, goal }) => {
    const pct   = Math.min(100, (val / goal) * 100);
    const barEl = document.getElementById(barId);
    const pctEl = document.getElementById(pctId);
    if (barEl) barEl.style.width = pct.toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  });
}

function renderRcNewDraftList() {
  const list = document.getElementById('rc-new-draft-list');
  if (!list) return;

  if (!_rcDraftAliments.length) {
    list.innerHTML = '';
    renderRcNewTotals();
    return;
  }

  list.innerHTML = _rcDraftAliments.map((item, idx) => {
    const kcal   = _draftItemKcal(item);
    const unit   = item.type === 'unite' ? 'u' : 'g';
    const maxQty = item.type === 'unite' ? 99 : 2000;
    return `
      <div class="rc-new-draft-item">
        <div class="rc-new-draft-item__info">
          <div class="rc-new-draft-item__name">${item.nom}</div>
          <span class="rc-new-draft-item__kcal" data-kcal-idx="${idx}">${kcal} kcal</span>
        </div>
        <div class="rc-new-draft-item__right">
          <div class="rc-new-draft-item__qty-wrap">
            <input class="rc-new-draft-item__qty-input" type="number"
                   data-draft-qty="${idx}" value="${item.quantite}"
                   min="1" max="${maxQty}" inputmode="numeric" aria-label="Quantité">
            <span class="rc-new-draft-item__unit">${unit}</span>
          </div>
          <button class="rc-new-draft-item__del" data-draft-del="${idx}" aria-label="Supprimer">✕</button>
        </div>
      </div>`;
  }).join('');

  // Suppression
  list.querySelectorAll('[data-draft-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      _rcDraftAliments.splice(parseInt(btn.dataset.draftDel, 10), 1);
      renderRcNewDraftList();
    });
  });

  // Modification de quantité (mise à jour sans re-rendu total)
  list.querySelectorAll('[data-draft-qty]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.draftQty, 10);
      const qty = parseFloat(input.value);
      if (qty > 0 && _rcDraftAliments[idx]) {
        _rcDraftAliments[idx].quantite = qty;
        // Mettre à jour le kcal de la ligne sans toucher au focus
        const kcalEl = list.querySelector(`[data-kcal-idx="${idx}"]`);
        if (kcalEl) kcalEl.textContent = _draftItemKcal(_rcDraftAliments[idx]) + ' kcal';
        renderRcNewTotals();
      }
    });
  });

  renderRcNewTotals();
}

function bindRcNewModalEvents() {
  document.getElementById('rc-new-backdrop')?.addEventListener('click', closeRcNewModal);
  document.getElementById('rc-new-cancel')?.addEventListener('click', closeRcNewModal);

  // ── Recherche inline d'aliment ──
  const searchEl  = document.getElementById('rc-new-alim-search');
  const listEl    = document.getElementById('rc-new-alim-list');
  const wrapEl    = document.getElementById('rc-new-search-wrap');
  const qtyRowEl  = document.getElementById('rc-new-qty-row');
  const qtyNameEl = document.getElementById('rc-new-qty-name');
  const qtyEl     = document.getElementById('rc-new-alim-qty');
  const unitEl    = document.getElementById('rc-new-alim-unit');
  let _newSheetAlim = null;

  function _showNewDropdown(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      listEl.hidden = true;
      listEl.innerHTML = '';
      wrapEl.classList.remove('rc-new__search-wrap--open');
      return;
    }
    const data     = window.ALIMENTS_DATA || [];
    const filtered = data
      .filter(a => a.nom.toLowerCase().includes(term) || (a.categorie || '').toLowerCase().includes(term))
      .slice(0, 12);
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="rc-alim-search-empty">Aucun résultat</div>';
    } else {
      listEl.innerHTML = filtered.map(a => `
        <div class="rc-alim-search-item" data-new-pick="${a.id}">
          <span class="rc-alim-search-item__name">${a.nom}</span>
          <span class="rc-alim-search-item__kcal">${a.m.k} kcal/100g</span>
        </div>`).join('');
    }
    listEl.hidden = false;
    wrapEl.classList.add('rc-new__search-wrap--open');
  }

  function _selectNewAlim(alim) {
    _newSheetAlim = alim;
    if (searchEl)  searchEl.value = alim.nom;
    listEl.hidden = true;
    listEl.innerHTML = '';
    wrapEl.classList.remove('rc-new__search-wrap--open');
    const isUnite = (alim.type || 'gramme') === 'unite';
    if (qtyNameEl) qtyNameEl.textContent = alim.nom;
    if (unitEl)    unitEl.textContent = isUnite ? 'unité(s)' : 'g';
    if (qtyEl)     { qtyEl.value = isUnite ? '1' : '100'; qtyEl.max = isUnite ? '99' : '2000'; }
    if (qtyRowEl)  { qtyRowEl.hidden = false; setTimeout(() => qtyEl?.focus(), 80); }
  }

  searchEl?.addEventListener('input', e => {
    _newSheetAlim = null;
    if (qtyRowEl) qtyRowEl.hidden = true;
    _showNewDropdown(e.target.value);
  });

  searchEl?.addEventListener('blur', () => {
    setTimeout(() => {
      if (!_newSheetAlim) {
        listEl.hidden = true;
        listEl.innerHTML = '';
        wrapEl.classList.remove('rc-new__search-wrap--open');
      }
    }, 200);
  });

  function _pickNewFromList(e) {
    e.preventDefault();
    const item = e.target.closest('[data-new-pick]');
    if (!item) return;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.dataset.newPick);
    if (alim) _selectNewAlim(alim);
  }
  listEl?.addEventListener('mousedown', _pickNewFromList);
  listEl?.addEventListener('touchstart', _pickNewFromList, { passive: false });

  // ── Confirmer l'ajout d'un ingrédient ──
  document.getElementById('rc-new-alim-add-confirm')?.addEventListener('click', () => {
    if (!_newSheetAlim) return;
    const qty = parseFloat(qtyEl?.value);
    if (!qty || qty <= 0) return;
    _rcDraftAliments.push({
      alimId:   _newSheetAlim.id,
      nom:      _newSheetAlim.nom,
      type:     _newSheetAlim.type || 'gramme',
      quantite: qty,
    });
    // Réinitialiser pour le prochain aliment
    _newSheetAlim = null;
    if (searchEl)  { searchEl.value = ''; searchEl.focus(); }
    if (qtyRowEl)  qtyRowEl.hidden = true;
    renderRcNewDraftList();
  });

  // ── Enregistrer le menu ──
  document.getElementById('rc-new-save')?.addEventListener('click', () => {
    const nom = (document.getElementById('rc-new-nom')?.value || '').trim() || 'Nouveau repas';
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
  const countEl   = document.getElementById('al-header-count');
  if (!container) return;

  const data  = window.ALIMENTS_DATA || [];
  const slugs = window.CAT_SLUG || {};
  const q     = currentAlimSearch.trim().toLowerCase();

  const filtered = data.filter(a => {
    const matchSearch = !q || a.nom.toLowerCase().includes(q);
    const matchCat    = !currentAlimCategorie || a.categorie === currentAlimCategorie;
    return matchSearch && matchCat;
  });

  // Compteur dans le header (total, pas filtré)
  if (countEl) {
    countEl.textContent = data.length > 0 ? `${data.length}` : '';
  }

  // État vide
  if (filtered.length === 0) {
    const isFiltered = q || currentAlimCategorie;
    container.innerHTML = isFiltered
      ? `<div class="al-empty">
           <p class="al-empty__title">Aucun aliment trouvé</p>
           <p class="al-empty__hint">Essayez un autre mot-clé ou changez de catégorie.</p>
         </div>`
      : `<div class="al-empty">
           <div class="al-empty__icon" aria-hidden="true">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                  width="48" height="48">
               <line x1="8" y1="6" x2="21" y2="6"/>
               <line x1="8" y1="12" x2="21" y2="12"/>
               <line x1="8" y1="18" x2="21" y2="18"/>
               <circle cx="3.5" cy="6"  r="1.5" fill="currentColor" stroke="none"/>
               <circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
               <circle cx="3.5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
             </svg>
           </div>
           <p class="al-empty__title">Aucun aliment</p>
           <p class="al-empty__hint">Créez votre premier aliment personnalisé pour le retrouver ici.</p>
           <button type="button" class="al-empty__cta" id="al-empty-cta">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  width="13" height="13" aria-hidden="true">
               <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
             </svg>
             Ajouter un aliment
           </button>
         </div>`;
    document.getElementById('al-empty-cta')?.addEventListener('click', openAlimNewModal);
    return;
  }

  // Cartes = liens <a> vers aliment.html?id=...
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
  // Bouton header "Ajouter" → même action que le FAB
  document.getElementById('al-header-create')?.addEventListener('click', openAlimNewModal);

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

// Mode de consommation par défaut selon la catégorie
const CATEGORY_MODE_MAP = {
  'Viandes':           'poids',
  'Poissons':          'poids',
  'Féculents':         'poids',
  'Légumes':           'poids',
  'Produits laitiers': 'portion',
  'Fruits':            'piece',
  'Boissons':          'volume',
  'Compléments':       'portion',
  'Autres':            'poids',
};

// Mode → type interne stocké dans l'aliment
const MODE_TO_TYPE = {
  piece:   'unite',
  portion: 'gramme',
  poids:   'gramme',
  volume:  'ml',
};

let _alimNewMode = 'poids'; // 'piece' | 'portion' | 'poids' | 'volume'
let _alimNewCat  = 'Autres';
let _alimNewKind = 'simple'; // 'simple' | 'produit'

// Applique un mode de consommation : toggle + champ portion contextuel
function _applyAlimMode(mode) {
  _alimNewMode = mode;

  document.querySelectorAll('[data-alim-mode]').forEach(b => {
    b.classList.toggle('alim-new__mode-btn--active', b.dataset.alimMode === mode);
  });

  const portionRow   = document.getElementById('alim-new-portion-row');
  const portionEl    = document.getElementById('alim-new-portion');
  const portionUnit  = document.getElementById('alim-new-portion-unit');
  const portionLabel = document.getElementById('alim-new-portion-label');
  const macroRef     = document.getElementById('alim-new-macro-ref');

  if (mode === 'piece') {
    if (portionRow)   portionRow.hidden             = false;
    if (portionLabel) portionLabel.textContent      = 'Poids d\'une pièce (g) — optionnel';
    if (portionEl) { portionEl.value = ''; portionEl.placeholder = 'Ex : 120'; portionEl.min = '0'; }
    if (portionUnit)  portionUnit.textContent       = 'g';
    if (macroRef)     macroRef.textContent          = 'Valeurs pour 100g';
  } else if (mode === 'portion') {
    if (portionRow)   portionRow.hidden             = false;
    if (portionLabel) portionLabel.textContent      = 'Poids d\'une portion (g)';
    if (portionEl) { portionEl.value = '100'; portionEl.placeholder = ''; portionEl.min = '1'; }
    if (portionUnit)  portionUnit.textContent       = 'g';
    if (macroRef)     macroRef.textContent          = 'Valeurs pour 100g';
  } else if (mode === 'poids') {
    if (portionRow)   portionRow.hidden             = true;
    if (macroRef)     macroRef.textContent          = 'Valeurs pour 100g';
  } else if (mode === 'volume') {
    if (portionRow)   portionRow.hidden             = true;
    if (macroRef)     macroRef.textContent          = 'Valeurs pour 100ml';
  }
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
    // Mode par défaut : "par portion" (le scanner peut ensuite passer à 'volume' si liquide)
    _applyAlimMode('portion');
  } else {
    // Macros optionnelles pour un aliment simple
    if (macrosBtn)     macrosBtn.hidden     = false;
    if (macrosSection) macrosSection.hidden = true;
    if (macrosBtn)     macrosBtn.textContent = '+ Ajouter infos nutritionnelles';
  }
}

function openAlimNewModal() {
  _alimNewMode = 'poids';
  _alimNewCat  = 'Autres';
  _alimNewKind = 'simple';

  const nomEl = document.getElementById('alim-new-nom');
  if (nomEl) nomEl.value = '';

  const marqueEl = document.getElementById('alim-new-marque');
  if (marqueEl) marqueEl.value = '';

  _applyAlimMode('poids');
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

  // Toggle mode de consommation
  document.querySelectorAll('[data-alim-mode]').forEach(btn => {
    btn.addEventListener('click', () => _applyAlimMode(btn.dataset.alimMode));
  });

  // Chips catégorie → mode automatique
  const catChips = document.getElementById('alim-new-cat-chips');
  catChips?.addEventListener('click', e => {
    const chip = e.target.closest('[data-alim-cat]');
    if (!chip) return;
    _alimNewCat = chip.dataset.alimCat;
    catChips.querySelectorAll('[data-alim-cat]').forEach(c => {
      c.classList.toggle('alim-new__cat-chip--active', c.dataset.alimCat === _alimNewCat);
    });
    _applyAlimMode(CATEGORY_MODE_MAP[_alimNewCat] || 'poids');
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

    const mode = _alimNewMode;
    const type = MODE_TO_TYPE[mode] || 'gramme';

    // Portion de référence selon le mode
    let portion;
    if (mode === 'piece') {
      portion = parseFloat(document.getElementById('alim-new-portion')?.value) || 0;
    } else if (mode === 'portion') {
      portion = parseFloat(document.getElementById('alim-new-portion')?.value) || 100;
    } else {
      portion = 100; // poids et volume → référence 100g / 100ml
    }

    const kcal = parseFloat(document.getElementById('alim-new-kcal')?.value) || 0;
    const prot = parseFloat(document.getElementById('alim-new-prot')?.value) || 0;
    const gluc = parseFloat(document.getElementById('alim-new-gluc')?.value) || 0;
    const lip  = parseFloat(document.getElementById('alim-new-lip')?.value)  || 0;

    const macroSuffix = mode === 'volume' ? ' / 100ml' : ' / 100g';
    let detail = '';
    if (kcal > 0) {
      detail = `${kcal} kcal`;
      if (prot > 0) detail += ` · ${prot}g protéines`;
      detail += macroSuffix;
    } else if (mode === 'piece') {
      detail = portion > 0 ? `environ ${portion}g / pièce` : '1 pièce';
    } else if (mode === 'portion') {
      detail = `1 portion · ${portion}g`;
    } else if (mode === 'volume') {
      detail = 'pour 100ml';
    } else {
      detail = 'pour 100g';
    }

    const alim = {
      id:               'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      nom,
      typeAliment:      _alimNewKind,
      categorie:        _alimNewCat,
      detail,
      type,
      modeConsommation: mode,
      portionReference: portion || 100,
      m:                { k: kcal, p: prot, g: gluc, l: lip },
      custom:           true,
    };

    if (_alimNewKind === 'produit') {
      const marque = document.getElementById('alim-new-marque')?.value.trim();
      if (marque) alim.marque = marque;
    }
    if (type === 'unite' && portion > 0) alim.unitWeight = portion;

    _saveCustomAliment(alim);
    closeAlimNewModal();
    renderAlimentsPanel();
  });
}

/* ═══════════════════════════════════════════════════════════════
   BOTTOM-SHEET — DÉTAIL MENU PLANIFIÉ
═══════════════════════════════════════════════════════════════ */

let _mdEntry   = null;   // entrée du planning (read-only)
let _mdRecette = null;   // recette résolue
let _mdDraft   = [];     // [{ alimId, nom, type, quantite }] — copie modifiable
let _mdEditMode = false; // true = mode "Modifier pour aujourd'hui"

/**
 * Calcule kcal/p/g/l pour un item du draft.
 * La recette stocke les quantités "brutes" (g / ml / unités).
 * ALIM_DB.addItem divise ensuite par 100, donc on reproduit la même logique ici.
 */
function _mdItemMacros(item) {
  const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
  if (!alim || !alim.m) return { k: 0, p: 0, g: 0, l: 0 };
  const factor = (alim.type || 'gramme') === 'unite' ? item.quantite : item.quantite / 100;
  return {
    k: alim.m.k * factor,
    p: alim.m.p * factor,
    g: alim.m.g * factor,
    l: alim.m.l * factor,
  };
}

function _mdTotals() {
  return _mdDraft.reduce((acc, item) => {
    const m = _mdItemMacros(item);
    acc.k += m.k; acc.p += m.p; acc.g += m.g; acc.l += m.l;
    return acc;
  }, { k: 0, p: 0, g: 0, l: 0 });
}

function _openMenuDetail(entry) {
  const recette = window.RECETTES_DB ? window.RECETTES_DB.get(entry.recetteId) : null;
  if (!recette) return;

  _mdEntry    = entry;
  _mdRecette  = recette;
  _mdEditMode = false;
  // Copie défensive des aliments de la recette
  _mdDraft = (recette.aliments || []).map(a => ({ ...a }));

  _renderMenuDetail();

  const sheet = document.getElementById('pl-menu-detail-sheet');
  if (sheet) sheet.removeAttribute('hidden');
}

function _closeMenuDetail() {
  const sheet = document.getElementById('pl-menu-detail-sheet');
  if (sheet) sheet.setAttribute('hidden', '');
  _mdEntry = null; _mdRecette = null; _mdDraft = []; _mdEditMode = false;
}

function _renderMenuDetail() {
  const meta = MEAL_META[_mdEntry.mealKey] || { label: _mdEntry.mealKey, icon: '🍽️' };

  // Badge + titre
  const badgeEl = document.getElementById('pl-detail-meal-badge');
  const titleEl = document.getElementById('pl-detail-title');
  if (badgeEl) badgeEl.textContent = `${meta.icon} ${meta.label}`;
  if (titleEl) titleEl.textContent = _mdEntry.recetteNom;

  // Boutons : libellé "Modifier" ↔ "Sauvegarder les quantités"
  const editBtn = document.getElementById('pl-detail-edit');
  if (editBtn) editBtn.textContent = _mdEditMode ? 'Confirmer les quantités' : 'Modifier pour aujourd\'hui';

  _renderMenuDetailTotals();
  _renderMenuDetailAliments();
}

function _renderMenuDetailTotals() {
  const tot = _mdTotals();
  const el  = document.getElementById('pl-detail-totals');
  if (!el) return;
  el.innerHTML = `
    <div class="pl-detail__total-kcal"><span>${Math.round(tot.k)}</span> kcal</div>
    <div class="pl-detail__total-macros">
      <span class="pl-detail__total-macro">P <strong>${tot.p.toFixed(1)}g</strong></span>
      <span class="pl-detail__total-sep">·</span>
      <span class="pl-detail__total-macro">G <strong>${tot.g.toFixed(1)}g</strong></span>
      <span class="pl-detail__total-sep">·</span>
      <span class="pl-detail__total-macro">L <strong>${tot.l.toFixed(1)}g</strong></span>
    </div>`;
}

function _renderMenuDetailAliments() {
  const listEl = document.getElementById('pl-detail-aliments');
  if (!listEl) return;

  listEl.innerHTML = '';
  _mdDraft.forEach((item, idx) => {
    const macros   = _mdItemMacros(item);
    const kcal     = Math.round(macros.k);
    const alim     = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
    const unitLabel = alim
      ? (alim.type === 'ml' ? 'ml' : alim.type === 'unite' ? 'u' : 'g')
      : 'g';

    const row = document.createElement('div');
    row.className = 'pl-detail__alim-row';

    if (_mdEditMode) {
      row.innerHTML = `
        <span class="pl-detail__alim-name">${item.nom}</span>
        <div class="pl-detail__alim-edit">
          <input class="pl-detail__qty-input" type="number" min="1"
                 value="${item.quantite}" data-md-idx="${idx}" aria-label="Quantité">
          <span class="pl-detail__qty-unit">${unitLabel}</span>
        </div>
        <span class="pl-detail__alim-kcal" data-md-kcal="${idx}">${kcal} kcal</span>`;
    } else {
      row.innerHTML = `
        <span class="pl-detail__alim-name">${item.nom}</span>
        <span class="pl-detail__alim-qty">${item.quantite} ${unitLabel}</span>
        <span class="pl-detail__alim-kcal">${kcal} kcal</span>`;
    }

    listEl.appendChild(row);
  });

  // En mode édition, écoute les changements de quantité
  if (_mdEditMode) {
    listEl.querySelectorAll('.pl-detail__qty-input').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.mdIdx, 10);
        const val = parseFloat(input.value) || 0;
        _mdDraft[idx].quantite = val;
        const kcal = Math.round(_mdItemMacros(_mdDraft[idx]).k);
        const kcalEl = listEl.querySelector(`[data-md-kcal="${idx}"]`);
        if (kcalEl) kcalEl.textContent = `${kcal} kcal`;
        _renderMenuDetailTotals();
      });
    });
  }
}

function _consumeMenuDetail() {
  const today = localDateStr();
  // Copier les aliments dans le journal du jour
  _mdDraft.forEach(item => {
    window.ALIM_DB.addItem(today, _mdEntry.mealKey, item.alimId, item.quantite);
  });
  // Marquer l'entrée Planning comme consommée (sans modifier le modèle de repas)
  if (_mdEntry && window.MEAL_PLAN_DB) {
    window.MEAL_PLAN_DB.setStatus(today, _mdEntry.id, 'consomme');
  }
  _closeMenuDetail();
  renderAujourdhuiPanel();
  renderPlanningPanel();
}

function bindMenuDetailSheetEvents() {
  document.getElementById('pl-detail-backdrop')?.addEventListener('click', _closeMenuDetail);
  document.getElementById('pl-detail-close')?.addEventListener('click', _closeMenuDetail);

  document.getElementById('pl-detail-ignore')?.addEventListener('click', () => {
    // Marquer comme sauté dans le Planning, sans rien ajouter au journal
    if (_mdEntry && window.MEAL_PLAN_DB) {
      window.MEAL_PLAN_DB.setStatus(localDateStr(), _mdEntry.id, 'saute');
    }
    _closeMenuDetail();
    renderAujourdhuiPanel();
    renderPlanningPanel();
  });

  document.getElementById('pl-detail-consume')?.addEventListener('click', _consumeMenuDetail);

  document.getElementById('pl-detail-edit')?.addEventListener('click', () => {
    if (_mdEditMode) {
      // Confirmer : passer en mode lecture avec les nouvelles quantités
      _mdEditMode = false;
      _renderMenuDetail();
    } else {
      _mdEditMode = true;
      _renderMenuDetail();
    }
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
