/**
 * FitTrack — Page Musculation
 * ============================
 * Gère 4 onglets :
 *   1. Aujourd'hui  — séances planifiées du jour
 *   2. Planning     — vue 14 jours (passé proche + futur)
 *   3. Séances      — gestion des modèles de séance
 *   4. Exercices    — bibliothèque d'exercices
 */

const JOURS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'août', 'sep', 'oct', 'nov', 'déc'];

// ── Filtres exercices ──
let currentSearch     = '';
let currentGroupe     = '';
let currentSousGroupe = '';
let currentType       = '';
let currentMateriel   = '';

const SOUS_GROUPES = {
  'Pectoraux': ['haut', 'milieu', 'bas'],
  'Dos':       ['largeur', 'épaisseur'],
  'Jambes':    ['quadriceps', 'ischios', 'mollets'],
};

// ── État modal planification ──
let planModalTemplateId = null;
let planModalDate       = null;

document.addEventListener('DOMContentLoaded', () => {
  DB.init();

  renderTodayPanel();
  renderPlanningPanel();
  renderModelesPanel();
  renderExerciseList();
  bindForms();
  updateHeaderDate();
});

/* ═══════════════════════════════════════════════════════════════
   ONGLET 1 — AUJOURD'HUI
═══════════════════════════════════════════════════════════════ */

function renderTodayPanel() {
  const emptyEl    = document.getElementById('today-empty');
  const listEl     = document.getElementById('today-sessions-list');
  const bannerEl   = document.getElementById('active-session-banner');
  if (!listEl) return;

  // ── Bannière "Reprendre" si une séance a été interrompue ──
  const activeSaved = DB.getActiveSession();
  if (bannerEl) {
    if (activeSaved) {
      const elapsedMs  = Date.now() - new Date(activeSaved.savedAt).getTime();
      const elapsedMin = Math.round(elapsedMs / 60000);
      const timeStr    = elapsedMin < 60
        ? `il y a ${elapsedMin} min`
        : `il y a ${Math.round(elapsedMin / 60)} h`;
      const exoLabel   = `Exercice ${(activeSaved.currentExoIdx || 0) + 1} · Série ${activeSaved.currentSerie || 1}`;

      bannerEl.innerHTML = `
        <div class="resume-banner">
          <div class="resume-banner__body">
            <span class="resume-banner__pill">Séance en cours</span>
            <p class="resume-banner__name">${activeSaved.sessionName}</p>
            <p class="resume-banner__detail">${exoLabel} · ${timeStr}</p>
          </div>
          <div class="resume-banner__actions">
            <a href="seance.html?id=${activeSaved.sessionId}" class="resume-btn resume-btn--resume">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                   width="14" height="14" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Reprendre
            </a>
            <button class="resume-btn resume-btn--abandon" id="btn-abandon-session" type="button">
              Abandonner
            </button>
          </div>
        </div>`;

      document.getElementById('btn-abandon-session')?.addEventListener('click', () => {
        if (confirm(`Abandonner la séance "${activeSaved.sessionName}" ?\nLa progression de cette séance sera perdue.`)) {
          DB.clearActiveSession();
          renderTodayPanel();
        }
      });
    } else {
      bannerEl.innerHTML = '';
    }
  }

  const today   = localDateStr();
  const planned = DB.getTodayPlanned();

  if (planned.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    listEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = 'block';

  listEl.innerHTML = planned.map(p => {
    const tpl = DB.getTemplate(p.templateId);
    if (!tpl) return '';

    const exoCount = tpl.exercices.length;
    const isDone   = p.completed;

    const exercisesHtml = tpl.exercices.slice(0, 5).map(block => {
      const exo = DB.getExercice(block.exoId);
      if (!exo) return '';
      return `
        <div class="today-exercise-row">
          <span class="today-exercise-row__tag today-exercise-row__tag--${exo.couleur}">${exo.groupe}</span>
          <span class="today-exercise-row__name">${exo.nom}</span>
          <span class="today-exercise-row__info">${block.series}×${block.reps} · ${block.repos}</span>
        </div>`;
    }).join('');

    const moreCount = tpl.exercices.length - 5;
    const moreHtml  = moreCount > 0
      ? `<p class="today-more">+ ${moreCount} exercice${moreCount > 1 ? 's' : ''}</p>`
      : '';

    return `
      <div class="today-session-block${isDone ? ' today-session-block--done' : ''}">
        <div class="today-session-header">
          <div class="today-session-header__info">
            <span class="today-session-header__label">${isDone ? 'Terminée ✓' : 'Séance du jour'}</span>
            <h2 class="today-session-header__name">${tpl.nom}</h2>
          </div>
          <span class="today-exercise-count panel-header__badge">${exoCount} exercice${exoCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="today-exercise-list">${exercisesHtml}${moreHtml}</div>
        ${!isDone && exoCount > 0 ? `
        <button class="btn-start-session" data-planned-id="${p.id}" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Commencer la séance
        </button>` : ''}
      </div>`;
  }).join('');

  // Bouton "Ajouter une séance à aujourd'hui"
  listEl.innerHTML += `
    <button class="btn-add-today" id="btn-add-today" type="button">
      ＋ Ajouter une séance aujourd'hui
    </button>`;

  // Boutons "Commencer"
  listEl.querySelectorAll('.btn-start-session').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `seance.html?id=${btn.dataset.plannedId}`;
    });
  });

  // Bouton "Ajouter"
  const addBtn = document.getElementById('btn-add-today');
  if (addBtn) addBtn.addEventListener('click', () => openPlanModal(today));
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 2 — PLANNING (14 jours)
═══════════════════════════════════════════════════════════════ */

function renderPlanningPanel() {
  const container = document.getElementById('planning-list');
  if (!container) return;

  // Aujourd'hui à midi (heure locale) — midi évite les ambiguïtés DST à minuit
  const todayMs  = new Date();
  todayMs.setHours(12, 0, 0, 0);
  const todayStr = localDateStr();

  // 3 jours passés + aujourd'hui + 10 jours futurs = 14 jours
  const days = [];
  for (let i = -3; i <= 10; i++) {
    const d = new Date(todayMs);
    d.setDate(todayMs.getDate() + i);
    days.push(d);
  }

  const startStr = localDateStr(days[0]);
  const endStr   = localDateStr(days[days.length - 1]);
  const allPlanned = DB.getPlannedForRange(startStr, endStr);

  container.innerHTML = days.map(d => {
    const dateStr  = localDateStr(d);
    const isToday  = dateStr === todayStr;
    const isPast   = dateStr < todayStr;
    const jsDay    = d.getDay();            // 0=Dim, 1=Lun…
    const frDay    = jsDay === 0 ? 6 : jsDay - 1;
    const dayLabel = isToday ? "Aujourd'hui" : JOURS_FR[frDay];
    const dayNum   = d.getDate();
    const monthLbl = MOIS_SHORT[d.getMonth()];

    const dayPlanned = allPlanned.filter(p => p.date === dateStr);

    const sessionsHtml = dayPlanned.map(p => {
      const tpl = DB.getTemplate(p.templateId);
      if (!tpl) return '';
      const exoCount = tpl.exercices.length;
      const chipsHtml = tpl.exercices.slice(0, 3).map(b => {
        const exo = DB.getExercice(b.exoId);
        return exo
          ? `<span class="session-card__exo-chip session-card__exo-chip--${exo.couleur}">${exo.nom}</span>`
          : '';
      }).join('') + (tpl.exercices.length > 3
        ? `<span class="session-card__exo-more">+${tpl.exercices.length - 3}</span>`
        : '');

      return `
        <div class="planning-session${p.completed ? ' planning-session--done' : ''}">
          <div class="planning-session__top">
            <span class="planning-session__name">${tpl.nom}</span>
            <span class="planning-session__count">${exoCount} exo${exoCount > 1 ? 's' : ''}</span>
            ${p.completed ? '<span class="planning-session__badge">✓ Fait</span>' : ''}
          </div>
          ${chipsHtml ? `<div class="planning-session__chips">${chipsHtml}</div>` : ''}
          <div class="planning-session__actions">
            ${!p.completed && exoCount > 0 ? `
            <button class="planning-session__start" data-planned-id="${p.id}" type="button">▶ Démarrer</button>` : ''}
            ${!p.completed ? `
            <button class="planning-session__delete" data-delete-planned="${p.id}" type="button" aria-label="Supprimer">✕</button>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="planning-day${isToday ? ' planning-day--today' : ''}${isPast ? ' planning-day--past' : ''}">
        <div class="planning-day__header">
          <div class="planning-day__label">
            <span class="planning-day__weekday">${dayLabel}</span>
            <span class="planning-day__num">${dayNum} ${monthLbl}</span>
          </div>
          ${!isPast ? `
          <button class="planning-day__add" data-date="${dateStr}" aria-label="Planifier une séance">＋</button>` : ''}
        </div>
        ${sessionsHtml ? `<div class="planning-day__sessions">${sessionsHtml}</div>` : ''}
      </div>`;
  }).join('');

  // Boutons "Démarrer"
  container.querySelectorAll('.planning-session__start').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `seance.html?id=${btn.dataset.plannedId}`;
    });
  });

  // Boutons "Supprimer instance"
  container.querySelectorAll('[data-delete-planned]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Supprimer cette séance du planning ?')) {
        DB.deletePlanned(btn.dataset.deletePlanned);
        renderPlanningPanel();
        renderTodayPanel();
      }
    });
  });

  // Boutons "+" par jour
  container.querySelectorAll('.planning-day__add').forEach(btn => {
    btn.addEventListener('click', () => openPlanModal(btn.dataset.date));
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 3 — SÉANCES (MODÈLES)
═══════════════════════════════════════════════════════════════ */

function renderModelesPanel() {
  const listEl   = document.getElementById('modeles-list');
  const recentEl = document.getElementById('modeles-recent');
  if (!listEl) return;

  const templates = DB.getAllTemplates();
  const recent    = DB.getRecentTemplates(3);

  // Section "Récemment utilisées"
  if (recentEl) {
    if (recent.length > 0) {
      recentEl.style.display = 'block';
      recentEl.innerHTML = `
        <p class="modeles-section-title">Récemment utilisées</p>
        ${recent.map(({ template: tpl, completedAt }) => {
          const when  = new Date(completedAt);
          const label = when.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
          return renderTemplateCard(tpl, label);
        }).join('')}`;
      bindTemplateCardActions(recentEl);
    } else {
      recentEl.style.display = 'none';
    }
  }

  // Section "Mes modèles"
  if (templates.length === 0) {
    listEl.innerHTML = `
      <div class="sessions-empty">
        <p>Aucun modèle de séance.</p>
        <p>Crée ton premier modèle pour commencer.</p>
      </div>`;
  } else {
    listEl.innerHTML = `
      <p class="modeles-section-title">Mes modèles</p>
      ${templates.map(tpl => renderTemplateCard(tpl)).join('')}`;
    bindTemplateCardActions(listEl);
  }
}

function renderTemplateCard(tpl, recentLabel = null) {
  const exoCount = tpl.exercices.length;
  const chipsHtml = tpl.exercices.slice(0, 4).map(b => {
    const exo = DB.getExercice(b.exoId);
    return exo
      ? `<span class="session-card__exo-chip session-card__exo-chip--${exo.couleur}">${exo.nom}</span>`
      : '';
  }).join('') + (tpl.exercices.length > 4
    ? `<span class="session-card__exo-more">+${tpl.exercices.length - 4}</span>`
    : '');

  return `
    <div class="template-card" data-template-id="${tpl.id}">
      <div class="template-card__header">
        <span class="template-card__name">${tpl.nom}</span>
        <button class="template-card__delete" data-delete-template="${tpl.id}"
                aria-label="Supprimer ${tpl.nom}" title="Supprimer">✕</button>
      </div>
      ${recentLabel ? `<div class="template-card__recent">${recentLabel}</div>` : ''}
      <div class="template-card__meta">
        <span class="template-card__count">${exoCount} exercice${exoCount !== 1 ? 's' : ''}</span>
      </div>
      ${chipsHtml ? `<div class="template-card__exercises">${chipsHtml}</div>` : ''}
      <div class="template-card__actions">
        <button class="template-card__plan" data-plan-template="${tpl.id}" type="button">
          📅 Planifier
        </button>
        ${exoCount > 0 ? `
        <button class="template-card__start" data-start-template="${tpl.id}" type="button">
          ▶ Démarrer
        </button>` : ''}
      </div>
    </div>`;
}

function bindTemplateCardActions(container) {
  if (!container) return;

  container.querySelectorAll('[data-delete-template]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id  = btn.dataset.deleteTemplate;
      const tpl = DB.getTemplate(id);
      if (tpl && confirm(`Supprimer le modèle "${tpl.nom}" ?\nLes séances futures planifiées avec ce modèle seront également supprimées.`)) {
        DB.deleteTemplate(id);
        renderModelesPanel();
        renderTodayPanel();
        renderPlanningPanel();
      }
    });
  });

  container.querySelectorAll('[data-plan-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      const today = localDateStr();
      openPlanModal(today, btn.dataset.planTemplate);
    });
  });

  container.querySelectorAll('[data-start-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `seance.html?id=${btn.dataset.startTemplate}`;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 4 — EXERCICES
═══════════════════════════════════════════════════════════════ */

function renderExerciseList() {
  const container = document.querySelector('.exercises-list');
  if (!container) return;

  container.innerHTML = '';

  const q         = currentSearch.trim().toLowerCase();
  const exercises = DB.getAllExercices().filter(exo => {
    const matchSearch     = !q || exo.nom.toLowerCase().includes(q) || exo.groupe.toLowerCase().includes(q);
    const matchGroupe     = !currentGroupe     || exo.groupe     === currentGroupe;
    const matchSousGroupe = !currentSousGroupe || exo.sousGroupe === currentSousGroupe;
    const matchType       = !currentType       || exo.type       === currentType;
    const matchMateriel   = !currentMateriel   || exo.materiel   === currentMateriel;
    return matchSearch && matchGroupe && matchSousGroupe && matchType && matchMateriel;
  });

  exercises.forEach(exo => {
    const rm   = calculerRMDepuisHistorique(exo);
    const card = document.createElement('a');
    card.href      = `exercice.html?id=${exo.id}`;
    card.className = 'exercise-card';
    card.innerHTML = `
      <div class="exercise-card__muscle-tag exercise-card__muscle-tag--${exo.couleur}">
        ${exo.groupe}
      </div>
      <div class="exercise-card__body">
        <h3 class="exercise-card__name">${exo.nom}</h3>
        <p  class="exercise-card__info">
          ${rm ? rm + ' kg max' : 'Pas encore de 1RM'}
        </p>
      </div>
      <button class="exercise-card__delete" data-delete-exo="${exo.id}"
              aria-label="Supprimer ${exo.nom}" title="Supprimer">✕</button>`;

    card.querySelector('[data-delete-exo]').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openDeleteConfirm(exo.id, exo.nom);
    });

    container.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODAL — PLANIFIER UNE SÉANCE
═══════════════════════════════════════════════════════════════ */

function openPlanModal(dateStr, preselectedTemplateId = null) {
  const modal = document.getElementById('modal-plan-session');
  if (!modal) return;

  planModalDate       = dateStr;
  planModalTemplateId = preselectedTemplateId;

  // Affichage de la date
  const dateDisplay = document.getElementById('plan-date-display');
  const dateInput   = document.getElementById('plan-date-input');

  const updateDateDisplay = () => {
    if (!dateDisplay || !planModalDate) return;
    // T12:00:00 → midi heure locale, évite le décalage UTC sur iOS Safari
    const nd = new Date(planModalDate + 'T12:00:00');
    dateDisplay.textContent = nd.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  };

  if (dateDisplay) updateDateDisplay();
  if (dateInput) {
    // Cloner AVANT d'assigner .value — cloneNode ne copie pas les propriétés JS,
    // seulement les attributs HTML. Assigner après le remplacement garantit que
    // Safari voit la bonne valeur dans l'input.
    const newInput = dateInput.cloneNode(true);
    dateInput.parentNode.replaceChild(newInput, dateInput);
    newInput.value = dateStr;   // ← APRÈS le replaceChild
    newInput.addEventListener('change', () => {
      if (newInput.value) {
        // Normaliser via T12:00:00 pour éviter tout glissement UTC sur iOS
        planModalDate = localDateStr(new Date(newInput.value + 'T12:00:00'));
      }
      updateDateDisplay();
    });
  }

  // Liste des modèles
  const tplList   = document.getElementById('plan-template-list');
  const templates = DB.getAllTemplates();

  if (tplList) {
    if (templates.length === 0) {
      tplList.innerHTML = `
        <p class="sessions-empty">
          Aucun modèle disponible.<br>
          Créez d'abord un modèle dans l'onglet <strong>Séances</strong>.
        </p>`;
    } else {
      tplList.innerHTML = templates.map(tpl => {
        const isSelected = tpl.id === preselectedTemplateId;
        return `
          <div class="plan-template-item${isSelected ? ' plan-template-item--selected' : ''}"
               data-tpl-id="${tpl.id}">
            <span class="plan-template-item__name">${tpl.nom}</span>
            <span class="plan-template-item__count">${tpl.exercices.length} exo${tpl.exercices.length > 1 ? 's' : ''}</span>
          </div>`;
      }).join('');

      tplList.querySelectorAll('.plan-template-item').forEach(item => {
        item.addEventListener('click', () => {
          tplList.querySelectorAll('.plan-template-item').forEach(i => i.classList.remove('plan-template-item--selected'));
          item.classList.add('plan-template-item--selected');
          planModalTemplateId = item.dataset.tplId;
        });
      });
    }
  }

  modal.classList.add('plan-modal--open');

  // Bouton Confirmer
  const confirmBtn = document.getElementById('plan-confirm');
  if (confirmBtn) {
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', () => {
      if (!planModalTemplateId || !planModalDate) {
        alert('Sélectionne un modèle et une date.');
        return;
      }
      DB.addPlanned({ templateId: planModalTemplateId, date: planModalDate });
      closePlanModal();
      renderPlanningPanel();
      renderTodayPanel();
    });
  }

  // Bouton Annuler
  const cancelBtn = document.getElementById('plan-cancel');
  if (cancelBtn) {
    const newBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
    newBtn.addEventListener('click', closePlanModal);
  }

  // Overlay
  const overlay = modal.querySelector('.plan-modal__overlay');
  if (overlay) {
    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);
    newOverlay.addEventListener('click', closePlanModal);
  }
}

function closePlanModal() {
  const modal = document.getElementById('modal-plan-session');
  if (modal) modal.classList.remove('plan-modal--open');
  planModalTemplateId = null;
  planModalDate       = null;
}

/* ═══════════════════════════════════════════════════════════════
   FORMULAIRES
═══════════════════════════════════════════════════════════════ */

function bindForms() {
  bindAddTemplateForm();
  bindAddExerciseForm();
  bindExerciseSearch();
  bindFilterChips();
}

function bindExerciseSearch() {
  const input = document.getElementById('exercise-search');
  if (!input) return;
  input.addEventListener('input', () => {
    currentSearch = input.value;
    renderExerciseList();
  });
}

function bindFilterChips() {
  // Rangée 1 : groupes
  document.querySelectorAll('#chips-groupe .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#chips-groupe .chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentGroupe     = chip.dataset.filterGroupe;
      currentSousGroupe = '';
      updateSousGroupeChips();
      renderExerciseList();
    });
  });

  // Rangée 3 : type
  document.querySelectorAll('[data-filter-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentType = chip.dataset.filterType;
      renderExerciseList();
    });
  });

  // Rangée 3 : matériel
  document.querySelectorAll('[data-filter-materiel]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-materiel]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentMateriel = chip.dataset.filterMateriel;
      renderExerciseList();
    });
  });
}

function updateSousGroupeChips() {
  const container  = document.getElementById('chips-sous-groupe');
  if (!container) return;

  const sousGroupes = SOUS_GROUPES[currentGroupe] || [];
  if (sousGroupes.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = `<span class="chip chip--sub chip--active" data-filter-sg="">Tous</span>` +
    sousGroupes.map(sg =>
      `<span class="chip chip--sub" data-filter-sg="${sg}">${sg.charAt(0).toUpperCase() + sg.slice(1)}</span>`
    ).join('');

  container.querySelectorAll('[data-filter-sg]').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('[data-filter-sg]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentSousGroupe = chip.dataset.filterSg;
      renderExerciseList();
    });
  });
}

/* ── Formule Epley (même logique qu'exercice.js) ── */
function calculerRMDepuisHistorique(exo) {
  if (exo.materiel === 'Poids du corps') return null;
  const entries = (exo.historique || []).filter(
    e => e.poids > 0 && typeof e.reps === 'number' && e.reps > 0
  );
  if (entries.length === 0) return null;
  const best = Math.max(...entries.map(e => e.poids * (1 + e.reps / 30)));
  return Math.round(best * 2) / 2;
}

/* ── État draft du formulaire de modèle ── */
let templateDraftExercices = []; // [{ exoId, series, reps, repos, objectif }]
let editingExoIdx = null;        // null = ajout, number = édition

const OBJECTIF_LABELS = { hypertrophie: 'Hypertrophie', force: 'Force', endurance: 'Endurance', '': 'Libre' };

/** Rend la liste read-only des exercices du draft courant */
function renderTemplateDraftList() {
  const container = document.getElementById('template-exo-blocks');
  if (!container) return;

  if (!templateDraftExercices.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = templateDraftExercices.map((block, idx) => {
    const exo = DB.getExercice(block.exoId);
    if (!exo) return '';
    return `
      <div class="tpl-exo-row" data-idx="${idx}" role="button" tabindex="0"
           aria-label="Modifier ${exo.nom}">
        <div class="tpl-exo-row__left">
          <span class="ws-muscle-tag ws-muscle-tag--${exo.couleur || 'pecto'}">${exo.groupe}</span>
          <span class="tpl-exo-row__name">${exo.nom}</span>
        </div>
        <div class="tpl-exo-row__meta">
          <span class="tpl-exo-row__param">${block.series}×${block.reps}</span>
          <span class="tpl-exo-row__param">${block.repos}</span>
          <span class="tpl-exo-row__obj">${OBJECTIF_LABELS[block.objectif] ?? 'Libre'}</span>
        </div>
        <button type="button" class="tpl-exo-row__remove"
                data-remove-idx="${idx}" aria-label="Retirer">✕</button>
      </div>`;
  }).join('');

  // Clic sur la carte → ouvrir en édition
  container.querySelectorAll('.tpl-exo-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-remove-idx]')) return;
      openExoConfigModal('edit', parseInt(row.dataset.idx));
    });
  });

  // Bouton ✕ → retirer sans modal
  container.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      templateDraftExercices.splice(parseInt(btn.dataset.removeIdx), 1);
      renderTemplateDraftList();
    });
  });
}

/** Ouvre le bottom sheet de configuration exercice */
function openExoConfigModal(mode, idx) {
  editingExoIdx = mode === 'edit' ? idx : null;

  const modal       = document.getElementById('modal-exo-config');
  const selectWrap  = document.getElementById('exo-config-select-wrap');
  const title       = document.getElementById('exo-config-title');
  const confirmLbl  = document.getElementById('exo-config-confirm-label');

  if (mode === 'add') {
    selectWrap.style.display = '';
    title.textContent        = 'Ajouter un exercice';
    confirmLbl.textContent   = 'Ajouter';
    // Valeurs par défaut
    document.getElementById('exo-config-series').value = '3';
    document.getElementById('exo-config-reps').value   = '10';
    document.getElementById('exo-config-repos').value  = '90 s';
    const radio = document.querySelector('[name="exo-config-obj"][value="hypertrophie"]');
    if (radio) radio.checked = true;
  } else {
    selectWrap.style.display = 'none';
    const block = templateDraftExercices[idx];
    const exo   = DB.getExercice(block.exoId);
    title.textContent      = exo?.nom || 'Modifier';
    confirmLbl.textContent = 'Enregistrer';
    document.getElementById('exo-config-series').value = block.series;
    document.getElementById('exo-config-reps').value   = block.reps;
    document.getElementById('exo-config-repos').value  = block.repos;
    const radio = document.querySelector(`[name="exo-config-obj"][value="${block.objectif}"]`);
    if (radio) radio.checked = true;
  }

  modal.classList.add('exo-config-modal--open');
}

/** Ferme le bottom sheet de configuration exercice */
function closeExoConfigModal() {
  document.getElementById('modal-exo-config').classList.remove('exo-config-modal--open');
  editingExoIdx = null;
}

/** Câble le bottom sheet de configuration exercice */
function bindExoConfigModal() {
  // Peupler le select
  const select = document.getElementById('exo-config-select');
  if (select) {
    DB.getAllExercices().forEach(exo => {
      const opt       = document.createElement('option');
      opt.value       = exo.id;
      opt.textContent = `${exo.nom} (${exo.groupe})`;
      select.appendChild(opt);
    });
  }

  document.getElementById('exo-config-overlay')?.addEventListener('click', closeExoConfigModal);
  document.getElementById('exo-config-cancel')?.addEventListener('click',  closeExoConfigModal);

  document.getElementById('exo-config-confirm')?.addEventListener('click', () => {
    const series   = parseInt(document.getElementById('exo-config-series').value) || 3;
    const reps     = parseInt(document.getElementById('exo-config-reps').value)   || 10;
    const repos    = document.getElementById('exo-config-repos').value.trim()     || '90 s';
    const objectif = document.querySelector('[name="exo-config-obj"]:checked')?.value ?? 'hypertrophie';

    if (editingExoIdx !== null) {
      // Mode édition : mettre à jour le bloc existant
      templateDraftExercices[editingExoIdx] = {
        ...templateDraftExercices[editingExoIdx],
        series, reps, repos, objectif,
      };
    } else {
      // Mode ajout : vérifier qu'un exercice est sélectionné
      const exoId = document.getElementById('exo-config-select').value;
      if (!exoId) return;
      templateDraftExercices.push({ exoId, series, reps, repos, objectif });
    }

    renderTemplateDraftList();
    closeExoConfigModal();
  });
}

/* ── Formulaire : créer un modèle de séance ── */
function bindAddTemplateForm() {
  const form = document.getElementById('add-template-form');
  if (!form) return;

  // Câbler le bottom sheet de config exercice
  bindExoConfigModal();

  // Bouton "Ajouter un exercice" → ouvre le bottom sheet en mode ajout
  document.getElementById('btn-add-exo-to-template')?.addEventListener('click', () => {
    openExoConfigModal('add');
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const nom = document.getElementById('template-nom').value.trim();
    if (!nom) return;

    DB.addTemplate({ nom, exercices: [...templateDraftExercices] });

    const toggle = document.getElementById('show-add-template');
    if (toggle) toggle.checked = false;
    form.reset();
    templateDraftExercices = [];
    renderTemplateDraftList();

    renderModelesPanel();
  });
}

/* ─────────────────────────────────────────────────────────────
   INFOS EXERCICE — photos optionnelles lors de la création
───────────────────────────────────────────────────────────── */

/** Images en cours d'ajout dans le formulaire de création */
let newExoImages = [];

/**
 * Redimensionne un fichier image via canvas — max 800 px, JPEG 0.72.
 * Identique à la version dans exercice.js.
 */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Lecture image échouée')); };
    img.src = url;
  });
}

/** Met à jour la grille de prévisualisation dans le formulaire de création. */
function renderNewExoImages() {
  const gridEl = document.getElementById('new-exo-images-grid');
  const hintEl = document.getElementById('new-exo-images-hint');
  const addBtn = document.getElementById('btn-new-exo-add-photo');
  if (!gridEl) return;

  gridEl.innerHTML = newExoImages.map((src, idx) => `
    <div class="info-image-wrap">
      <img src="${src}" alt="Photo ${idx + 1}" loading="lazy">
      <button class="info-image-del" data-idx="${idx}" type="button" aria-label="Supprimer">✕</button>
    </div>`).join('');

  gridEl.querySelectorAll('.info-image-del').forEach(btn => {
    btn.addEventListener('click', () => {
      newExoImages.splice(parseInt(btn.dataset.idx), 1);
      renderNewExoImages();
    });
  });

  const n = newExoImages.length;
  if (addBtn) addBtn.disabled = n >= 3;
  if (hintEl) hintEl.textContent = n >= 3
    ? 'Limite de 3 photos atteinte'
    : `${n}/3 photo${n !== 1 ? 's' : ''} · stockées sur cet appareil`;
}

/* ── Formulaire : ajouter un exercice ── */
function bindAddExerciseForm() {
  const form         = document.getElementById('add-exercise-form');
  const groupeSelect = document.getElementById('new-exo-groupe');
  if (!form) return;

  // Photos optionnelles
  const addPhotoBtn = document.getElementById('btn-new-exo-add-photo');
  const photoInput  = document.getElementById('new-exo-photo-input');
  if (addPhotoBtn && photoInput) {
    addPhotoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const files = Array.from(photoInput.files || []);
      if (!files.length) return;
      const slots = 3 - newExoImages.length;
      if (slots <= 0) return;
      try {
        const resized = await Promise.all(files.slice(0, slots).map(resizeImage));
        newExoImages = [...newExoImages, ...resized];
        renderNewExoImages();
      } catch (e) {
        alert('Impossible de lire une ou plusieurs images.');
      }
      photoInput.value = '';
    });
  }

  groupeSelect.addEventListener('change', () => {
    const fieldSG     = document.getElementById('field-sous-groupe');
    const selectSG    = document.getElementById('new-exo-sous-groupe');
    const sousGroupes = SOUS_GROUPES[groupeSelect.value] || [];

    if (sousGroupes.length > 0) {
      selectSG.innerHTML = '<option value="">Indifférent</option>' +
        sousGroupes.map(sg =>
          `<option value="${sg}">${sg.charAt(0).toUpperCase() + sg.slice(1)}</option>`
        ).join('');
      fieldSG.style.display = 'block';
    } else {
      fieldSG.style.display = 'none';
      selectSG.innerHTML    = '';
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const nomInput   = document.getElementById('new-exo-nom');
    const nom        = nomInput.value.trim();
    const groupe     = groupeSelect.value;
    const couleur    = groupeSelect.selectedOptions[0]?.dataset.couleur || 'autre';
    const sousGroupe = document.getElementById('new-exo-sous-groupe')?.value || '';
    const type       = form.querySelector('[name="new-exo-type"]:checked')?.value     || '';
    const materiel   = form.querySelector('[name="new-exo-materiel"]:checked')?.value || '';

    if (!nom || !groupe) return;

    const result = DB.addExercice({ nom, groupe, couleur, sousGroupe, type, materiel });
    if (!result) {
      nomInput.setCustomValidity('Un exercice avec ce nom existe déjà.');
      nomInput.reportValidity();
      return;
    }
    nomInput.setCustomValidity('');

    // Sauvegarder les infos optionnelles (photos + notes)
    const notes = (document.getElementById('new-exo-notes')?.value || '').trim();
    if (newExoImages.length > 0 || notes) {
      DB.saveExoInfo(result.id, { notes, images: newExoImages });
    }

    const toggle = document.getElementById('show-add-exercise');
    if (toggle) toggle.checked = false;
    form.reset();
    document.getElementById('field-sous-groupe').style.display = 'none';
    // Réinitialiser la section infos
    newExoImages = [];
    renderNewExoImages();
    const infoSection = document.getElementById('exo-info-section');
    if (infoSection) infoSection.removeAttribute('open');
    renderExerciseList();
  });
}

/* ═══════════════════════════════════════════════════════════════
   UTILITAIRES
═══════════════════════════════════════════════════════════════ */

function openDeleteConfirm(exoId, exoNom) {
  const modal    = document.getElementById('modal-delete-exo');
  const nameEl   = document.getElementById('confirm-exo-name');
  const btnDel   = document.getElementById('confirm-delete');
  const btnCancel = document.getElementById('confirm-cancel');
  const overlay  = document.getElementById('confirm-overlay');

  nameEl.textContent = exoNom;
  modal.classList.add('confirm-modal--open');

  const close = () => modal.classList.remove('confirm-modal--open');

  const onDelete = () => { DB.deleteExercice(exoId); renderExerciseList(); close(); cleanup(); };
  const onCancel = () => { close(); cleanup(); };
  const cleanup  = () => {
    btnDel.removeEventListener('click', onDelete);
    btnCancel.removeEventListener('click', onCancel);
    overlay.removeEventListener('click', onCancel);
  };

  btnDel.addEventListener('click', onDelete);
  btnCancel.addEventListener('click', onCancel);
  overlay.addEventListener('click', onCancel);
}

function updateHeaderDate() {
  const el = document.querySelector('.page-header__subtitle');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
