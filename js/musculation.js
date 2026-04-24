/**
 * FitTrack — Page Musculation
 * ============================
 * Gère 4 onglets :
 *   1. Aujourd'hui  — séances planifiées du jour
 *   2. Planning     — vue semaine (navigation semaine précédente / suivante)
 *   3. Séances      — gestion des modèles de séance
 *   4. Exercices    — bibliothèque d'exercices
 */

const JOURS_FR      = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_SHORT    = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'août', 'sep', 'oct', 'nov', 'déc'];
const JOURS_COMPLETS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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

// ── État planning semaine ──
let _muscWeekOffset = 0;   // 0 = semaine courante, -1 = précédente, +1 = suivante

// ── État bottom-sheet détail séance ──
let _sdPlannedId   = null;
let _sdExercices   = null;   // copie de travail des exercices de la séance planifiée
let _sdPickSearch  = '';     // filtre texte du picker
let _sdPickerOpen  = false;  // picker visible

document.addEventListener('DOMContentLoaded', () => {
  DB.init();

  renderTodayPanel();
  renderPlanningPanel();
  renderModelesPanel();
  renderExerciseList();
  bindForms();
  updateHeaderDate();
  _bindSessionDetailEvents();
  _bindPlanningWeekNav();
  _bindManageSheetEvents();
  _bindCardioDeclarationEvents();
});

/* ── Helpers semaine planning ── */
function _muscWeekStart(offset) {
  const now = new Date();
  const dow = now.getDay();                     // 0=dim … 6=sam
  const diffToMonday = (dow === 0) ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

function _muscWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

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
      const isCardio = exo.groupe === 'Cardio';
      const infoText = isCardio
        ? (block.duree ? `${block.duree} min` : '30 min')
        : `${block.series}×${block.reps} · ${block.repos}`;
      return `
        <div class="today-exercise-row">
          <span class="today-exercise-row__tag today-exercise-row__tag--${exo.couleur}">${exo.groupe}</span>
          <span class="today-exercise-row__name">${exo.nom}</span>
          <span class="today-exercise-row__info">${infoText}</span>
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

  const weekStart  = _muscWeekStart(_muscWeekOffset);
  const days       = _muscWeekDays(weekStart);
  const weekEnd    = days[6];
  const todayStr   = localDateStr();

  // Mettre à jour le label de navigation semaine
  const labelEl = document.getElementById('musc-week-label');
  if (labelEl) {
    const s = `${weekStart.getDate()} ${MOIS_SHORT[weekStart.getMonth()]}`;
    const e = `${weekEnd.getDate()} ${MOIS_SHORT[weekEnd.getMonth()]}`;
    labelEl.textContent = `${s} → ${e}`;
  }

  const startStr   = localDateStr(days[0]);
  const endStr     = localDateStr(days[6]);
  const allPlanned = DB.getPlannedForRange(startStr, endStr);

  container.innerHTML = '';

  days.forEach((d, i) => {
    const dateStr    = localDateStr(d);
    const isToday    = dateStr === todayStr;
    const isPast     = dateStr < todayStr;
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
        <div class="planning-session${p.completed ? ' planning-session--done' : ''}"
             data-detail-id="${p.id}" role="button" tabindex="0"
             aria-label="Voir le détail de ${tpl.nom}">
          <div class="planning-session__top">
            <span class="planning-session__name">${tpl.nom}</span>
            <div class="planning-session__meta">
              <span class="planning-session__count">${exoCount} exo${exoCount > 1 ? 's' : ''}</span>
              ${p.completed ? '<span class="planning-session__badge">✓ Fait</span>' : ''}
            </div>
            <svg class="planning-session__chevron" xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 width="14" height="14" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
          ${chipsHtml ? `<div class="planning-session__chips">${chipsHtml}</div>` : ''}
        </div>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'musc-day-card'
      + (isToday ? ' musc-day-card--today' : '')
      + (isPast  ? ' musc-day-card--past'  : '');
    card.dataset.date = dateStr;
    card.innerHTML = `
      <div class="musc-day-card__header">
        <div class="musc-day-card__day">${JOURS_COMPLETS[i]}${isToday
          ? '<span class="musc-day-card__today-badge">Aujourd\'hui</span>'
          : ''}</div>
        <div class="musc-day-card__date">${d.getDate()} ${MOIS_SHORT[d.getMonth()]}</div>
      </div>
      <div class="musc-day-card__body">
        ${dayPlanned.length > 0
          ? sessionsHtml
          : '<p class="musc-day-card__empty">Aucune séance planifiée</p>'}
      </div>
      <div class="musc-day-card__footer">
        <button class="musc-day-card__add-btn" data-plan-date="${dateStr}" aria-label="Planifier une séance">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
               width="13" height="13" aria-hidden="true">
            <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          Planifier une séance
        </button>
      </div>`;

    container.appendChild(card);
  });

  // Clic sur une carte séance → ouvrir le détail
  container.querySelectorAll('[data-detail-id]').forEach(card => {
    card.addEventListener('click', () => _openSessionDetail(card.dataset.detailId));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openSessionDetail(card.dataset.detailId);
      }
    });
  });

  // Boutons "Planifier une séance" par jour
  container.querySelectorAll('[data-plan-date]').forEach(btn => {
    btn.addEventListener('click', () => openPlanModal(btn.dataset.planDate));
  });
}

function _bindPlanningWeekNav() {
  document.getElementById('musc-prev-week')?.addEventListener('click', () => {
    _muscWeekOffset--;
    renderPlanningPanel();
  });
  document.getElementById('musc-next-week')?.addEventListener('click', () => {
    _muscWeekOffset++;
    renderPlanningPanel();
  });
}

/* ═══════════════════════════════════════════════════════════════
   BOTTOM-SHEET : DÉTAIL D'UNE SÉANCE PLANIFIÉE
═══════════════════════════════════════════════════════════════ */

const MOIS_LONG = ['janvier','février','mars','avril','mai','juin',
                   'juillet','août','septembre','octobre','novembre','décembre'];
const JOURS_LONG = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function _openSessionDetail(plannedId) {
  const p = DB.getPlanned(plannedId);
  if (!p) return;
  const tpl = DB.getTemplate(p.templateId);
  if (!tpl) return;

  _sdPlannedId  = plannedId;
  _sdPickSearch = '';
  _sdPickerOpen = false;

  // Copie de travail des exercices (migration : anciens planned sans .exercices)
  _sdExercices = p.exercices
    ? p.exercices.map(b => ({ ...b }))
    : tpl.exercices.map(b => ({ ...b }));

  // Fermer le picker
  const pickerEl = document.getElementById('sd-exo-picker');
  if (pickerEl) pickerEl.hidden = true;

  // Titre
  document.getElementById('sd-title').textContent = tpl.nom;

  // Date
  const d = new Date(p.date + 'T12:00:00');
  const isToday = p.date === localDateStr();
  const dayStr  = isToday
    ? "Aujourd'hui"
    : JOURS_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_LONG[d.getMonth()];
  document.getElementById('sd-date').textContent = dayStr;

  _renderSdSummary(p);
  _renderSdExoList(p.completed);
  _renderSdModifiedBadge(tpl);
  _renderSdPhaseBanner();

  // Bouton démarrer / supprimer
  const startBtn  = document.getElementById('sd-start');
  const deleteBtn = document.getElementById('sd-delete');
  if (startBtn)  startBtn.hidden  = p.completed || _sdExercices.length === 0;
  if (deleteBtn) deleteBtn.hidden = p.completed;

  // Cacher le bouton "Ajouter" si séance terminée
  const addZone = document.getElementById('sd-add-zone');
  if (addZone) addZone.hidden = p.completed;

  const sheet = document.getElementById('musc-session-detail');
  if (sheet) sheet.hidden = false;
}

function _renderSdPhaseBanner() {
  const banner = document.getElementById('sd-phase-banner');
  if (!banner || !window.PROGRAMME_DB) return;

  const prog = window.PROGRAMME_DB.get();
  if (!prog) { banner.hidden = true; return; }

  const info = window.PROGRAMME_DB.getActivePhase(prog);
  if (!info) { banner.hidden = true; return; }

  const { phase, phaseIndex, weekInPhase } = info;
  const phaseName = phase.nom || ('Phase ' + (phaseIndex + 1));
  const mc        = window.PROGRAMME_DB.getMicroCycle(prog);
  const cycleLabel = mc ? ' · ' + mc.label : '';
  banner.textContent = phaseName + ' · ' + phase.repsMin + '–' + phase.repsMax + ' reps · Sem. ' + weekInPhase + cycleLabel;
  banner.hidden = false;
}

function _renderSdSummary(p) {
  const exoCount = _sdExercices.length;
  const muscBlocks   = _sdExercices.filter(b => DB.getExercice(b.exoId)?.groupe !== 'Cardio');
  const cardioBlocks = _sdExercices.filter(b => DB.getExercice(b.exoId)?.groupe === 'Cardio');
  const totalSets = muscBlocks.reduce((s, b) => s + (parseInt(b.series) || 3), 0);
  const cardioMin = cardioBlocks.reduce((s, b) => s + (parseInt(b.duree) || 30), 0);

  let html = `<span class="sd-summary__item">${exoCount} exercice${exoCount !== 1 ? 's' : ''}</span>`;
  if (totalSets > 0) {
    html += `<span class="sd-summary__sep">·</span><span class="sd-summary__item">${totalSets} série${totalSets !== 1 ? 's' : ''}</span>`;
  }
  if (cardioMin > 0) {
    html += `<span class="sd-summary__sep">·</span><span class="sd-summary__item">${cardioMin} min cardio</span>`;
  }
  if (p && p.completed) html += '<span class="sd-summary__badge">✓ Terminé</span>';
  document.getElementById('sd-summary').innerHTML = html;
}

function _renderSdExoList(isCompleted) {
  const listEl = document.getElementById('sd-exercises');
  if (!listEl) return;

  if (_sdExercices.length === 0) {
    listEl.innerHTML = '<p class="sd-exo-empty">Aucun exercice. Ajoutes-en un ci-dessous.</p>';
    return;
  }

  listEl.innerHTML = _sdExercices.map((b, idx) => {
    const exo = DB.getExercice(b.exoId);
    if (!exo) return '';
    const isCardio = exo.groupe === 'Cardio';
    const deleteBtn = !isCompleted
      ? `<button class="sd-exo-delete" data-sd-del="${idx}" aria-label="Supprimer ${exo.nom}">✕</button>`
      : '';

    if (isCardio) {
      const dureeLabel = b.duree ? `${b.duree} min` : '30 min';
      const distLabel  = b.distance ? ` · ${b.distance} km` : '';
      const intLabel   = b.intensite ? ` · ${b.intensite}` : '';
      return `
        <div class="sd-exo-row">
          <div class="sd-exo-row__left">
            <span class="sd-exo-dot sd-exo-dot--cardio"></span>
            <span class="sd-exo-name">${exo.nom}</span>
          </div>
          <div class="sd-exo-row__right">
            <span class="sd-exo-cardio-duration">${dureeLabel}</span>
            ${(distLabel || intLabel) ? `<span class="sd-exo-cardio-detail">${distLabel}${intLabel}</span>` : ''}
            ${deleteBtn}
          </div>
        </div>`;
    }

    const repsLabel  = b.reps  ? `${b.series} × ${b.reps}` : `${b.series} série${b.series !== 1 ? 's' : ''}`;
    const poidsLabel = b.poids ? `${b.poids} kg` : '';
    const reposLabel = b.repos ? `${b.repos} s` : '';
    return `
      <div class="sd-exo-row">
        <div class="sd-exo-row__left">
          <span class="sd-exo-dot sd-exo-dot--${exo.couleur}"></span>
          <span class="sd-exo-name">${exo.nom}</span>
        </div>
        <div class="sd-exo-row__right">
          <span class="sd-exo-sets">${repsLabel}</span>
          ${poidsLabel ? `<span class="sd-exo-weight">${poidsLabel}</span>` : ''}
          ${reposLabel ? `<span class="sd-exo-rest">${reposLabel} repos</span>` : ''}
          ${deleteBtn}
        </div>
      </div>`;
  }).join('');

  // Boutons supprimer
  listEl.querySelectorAll('[data-sd-del]').forEach(btn => {
    btn.addEventListener('click', () => _sdDeleteExo(parseInt(btn.dataset.sdDel, 10)));
  });
}

function _renderSdModifiedBadge(tpl) {
  const badgeEl = document.getElementById('sd-modified-badge');
  if (!badgeEl) return;
  const tplIds  = (tpl.exercices || []).map(b => b.exoId).join(',');
  const planIds = (_sdExercices || []).map(b => b.exoId).join(',');
  badgeEl.hidden = (tplIds === planIds);
}

function _sdDeleteExo(idx) {
  if (!_sdExercices || idx < 0 || idx >= _sdExercices.length) return;
  _sdExercices.splice(idx, 1);
  DB.updatePlannedExercices(_sdPlannedId, _sdExercices);

  const p   = DB.getPlanned(_sdPlannedId);
  const tpl = DB.getTemplate(p?.templateId);
  _renderSdSummary(p);
  _renderSdExoList(p?.completed);
  _renderSdModifiedBadge(tpl);

  const startBtn = document.getElementById('sd-start');
  if (startBtn) startBtn.hidden = p?.completed || _sdExercices.length === 0;

  // Rafraîchir le planning
  renderPlanningPanel();
  renderTodayPanel();
}

function _openSdPicker() {
  _sdPickSearch  = '';
  _sdPickerOpen  = true;
  const pickerEl = document.getElementById('sd-exo-picker');
  const inputEl  = document.getElementById('sd-picker-input');
  if (pickerEl) pickerEl.hidden = false;
  if (inputEl)  { inputEl.value = ''; setTimeout(() => inputEl.focus(), 50); }
  _renderSdPickerList();
}

function _closeSdPicker() {
  _sdPickerOpen = false;
  const pickerEl = document.getElementById('sd-exo-picker');
  if (pickerEl) pickerEl.hidden = true;
}

function _renderSdPickerList() {
  const listEl = document.getElementById('sd-picker-list');
  if (!listEl) return;
  const q    = _sdPickSearch.toLowerCase().trim();
  const exos = DB.getAllExercices().filter(e =>
    !q || e.nom.toLowerCase().includes(q) || e.groupe.toLowerCase().includes(q)
  );
  if (exos.length === 0) {
    listEl.innerHTML = '<p class="sd-picker-empty">Aucun exercice trouvé.</p>';
    return;
  }
  listEl.innerHTML = exos.map(e => {
    const isCardio = e.groupe === 'Cardio';
    return `
    <div class="sd-picker-item" data-sd-pick="${e.id}">
      <span class="sd-exo-dot sd-exo-dot--${e.couleur}"></span>
      <span class="sd-picker-item__name">${e.nom}</span>
      ${isCardio
        ? '<span class="sd-picker-item__cardio-badge">Cardio</span>'
        : `<span class="sd-picker-item__group">${e.groupe}</span>`}
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-sd-pick]').forEach(row => {
    row.addEventListener('click', () => _sdSelectExo(row.dataset.sdPick));
  });
}

function _sdSelectExo(exoId) {
  const pickedExo = DB.getExercice(exoId);
  const isCardio  = pickedExo?.groupe === 'Cardio';
  _sdExercices.push(isCardio
    ? { exoId, duree: 30, distance: '', intensite: '' }
    : { exoId, series: 3, reps: 10, repos: 90, poids: '' });
  DB.updatePlannedExercices(_sdPlannedId, _sdExercices);
  _closeSdPicker();

  const p   = DB.getPlanned(_sdPlannedId);
  const tpl = DB.getTemplate(p?.templateId);
  _renderSdSummary(p);
  _renderSdExoList(p?.completed);
  _renderSdModifiedBadge(tpl);

  const startBtn = document.getElementById('sd-start');
  if (startBtn) startBtn.hidden = p?.completed || _sdExercices.length === 0;

  renderPlanningPanel();
  renderTodayPanel();
}

function _closeSessionDetail() {
  const sheet = document.getElementById('musc-session-detail');
  if (sheet) sheet.hidden = true;
  _sdPlannedId  = null;
  _sdExercices  = null;
  _sdPickerOpen = false;
}

function _bindSessionDetailEvents() {
  document.getElementById('sd-backdrop')?.addEventListener('click', _closeSessionDetail);
  document.getElementById('sd-close')?.addEventListener('click', _closeSessionDetail);

  document.getElementById('sd-start')?.addEventListener('click', () => {
    if (_sdPlannedId) window.location.href = `seance.html?id=${_sdPlannedId}`;
  });

  document.getElementById('sd-delete')?.addEventListener('click', () => {
    if (!_sdPlannedId) return;
    if (confirm('Supprimer cette séance du planning ?')) {
      DB.deletePlanned(_sdPlannedId);
      _closeSessionDetail();
      renderPlanningPanel();
      renderTodayPanel();
    }
  });

  // Bouton "Ajouter un exercice" → ouvre/ferme le picker
  document.getElementById('sd-add-exo-btn')?.addEventListener('click', () => {
    if (_sdPickerOpen) _closeSdPicker();
    else               _openSdPicker();
  });

  // Recherche dans le picker
  document.getElementById('sd-picker-input')?.addEventListener('input', e => {
    _sdPickSearch = e.target.value;
    _renderSdPickerList();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 3 — SÉANCES (MODÈLES)
═══════════════════════════════════════════════════════════════ */

function renderModelesPanel() {
  const listEl   = document.getElementById('modeles-list');
  const recentEl = document.getElementById('modeles-recent');
  const linkEl   = document.getElementById('btn-open-manage');
  const linkCt   = document.getElementById('manage-link-count');
  if (!listEl) return;

  const allTemplates    = DB.getAllTemplates();
  const activeTemplates = DB.getActiveTemplates();
  const recent          = DB.getRecentTemplates(5);

  // Masquer dans "Mes modèles actifs" les modèles déjà présents dans "Récemment utilisées"
  const recentIds       = new Set(recent.map(r => r.template.id));
  const otherActives    = activeTemplates.filter(t => !recentIds.has(t.id));

  // Section "Récemment utilisées" — point d'entrée principal
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
      recentEl.innerHTML    = '';
    }
  }

  // Section "Mes modèles actifs" (hors récents)
  if (activeTemplates.length === 0) {
    listEl.innerHTML = `
      <div class="sessions-empty">
        <p>Aucun modèle de séance.</p>
        <p>Crée ton premier modèle pour commencer.</p>
      </div>`;
  } else if (otherActives.length === 0) {
    // Tous les actifs sont déjà dans "Récemment utilisées"
    listEl.innerHTML = '';
  } else {
    listEl.innerHTML = `
      <p class="modeles-section-title">${recent.length > 0 ? 'Autres modèles' : 'Mes modèles'}</p>
      ${otherActives.map(tpl => renderTemplateCard(tpl)).join('')}`;
    bindTemplateCardActions(listEl);
  }

  // Lien "Gérer mes séances" — affiché seulement s'il existe des modèles
  if (linkEl) {
    if (allTemplates.length === 0) {
      linkEl.style.display = 'none';
    } else {
      linkEl.style.display = 'inline-flex';
      if (linkCt) linkCt.textContent = `(${allTemplates.length})`;
    }
  }
}

/* ─── Bottom-sheet "Gérer mes séances" ─── */

function openManageSheet() {
  const sheet = document.getElementById('manage-sheet');
  if (!sheet) return;
  renderManageSheet();
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeManageSheet() {
  const sheet = document.getElementById('manage-sheet');
  if (!sheet) return;
  sheet.hidden = true;
  document.body.style.overflow = '';
}

function renderManageSheet() {
  const actives   = DB.getActiveTemplates();
  const archived  = DB.getArchivedTemplates();

  const activeListEl   = document.getElementById('manage-list-active');
  const archivedListEl = document.getElementById('manage-list-archived');
  const activeCtEl     = document.getElementById('manage-count-active');
  const archivedCtEl   = document.getElementById('manage-count-archived');
  const subtitleEl     = document.getElementById('manage-subtitle');

  if (activeCtEl)   activeCtEl.textContent   = String(actives.length);
  if (archivedCtEl) archivedCtEl.textContent = String(archived.length);
  if (subtitleEl)   subtitleEl.textContent   = `${actives.length} actif${actives.length !== 1 ? 's' : ''} · ${archived.length} archivé${archived.length !== 1 ? 's' : ''}`;

  if (activeListEl) {
    activeListEl.innerHTML = actives.length === 0
      ? `<p class="manage-empty">Aucun modèle actif.</p>`
      : actives.map(tpl => renderManageRow(tpl, false)).join('');
    bindManageRowActions(activeListEl);
  }

  if (archivedListEl) {
    archivedListEl.innerHTML = archived.length === 0
      ? `<p class="manage-empty">Aucun modèle archivé.</p>`
      : archived.map(tpl => renderManageRow(tpl, true)).join('');
    bindManageRowActions(archivedListEl);
  }
}

function renderManageRow(tpl, isArchived) {
  const exoCount = tpl.exercices.length;
  const actionLabel = isArchived ? 'Désarchiver' : 'Archiver';
  const actionAttr  = isArchived ? 'data-unarchive-template' : 'data-archive-template';
  return `
    <div class="manage-row ${isArchived ? 'manage-row--archived' : ''}" data-template-id="${tpl.id}">
      <div class="manage-row__info">
        <span class="manage-row__name">${tpl.nom}</span>
        <span class="manage-row__meta">${exoCount} exercice${exoCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="manage-row__actions">
        <button class="manage-row__btn manage-row__btn--archive"
                ${actionAttr}="${tpl.id}" type="button">${actionLabel}</button>
        <button class="manage-row__btn manage-row__btn--delete"
                data-delete-template-manage="${tpl.id}" type="button" aria-label="Supprimer ${tpl.nom}">✕</button>
      </div>
    </div>`;
}

function bindManageRowActions(container) {
  if (!container) return;

  container.querySelectorAll('[data-archive-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      DB.archiveTemplate(btn.dataset.archiveTemplate);
      renderManageSheet();
      renderModelesPanel();
      renderTodayPanel();
    });
  });

  container.querySelectorAll('[data-unarchive-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      DB.unarchiveTemplate(btn.dataset.unarchiveTemplate);
      renderManageSheet();
      renderModelesPanel();
      renderTodayPanel();
    });
  });

  container.querySelectorAll('[data-delete-template-manage]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.deleteTemplateManage;
      const tpl = DB.getTemplate(id);
      if (tpl && confirm(`Supprimer le modèle "${tpl.nom}" ?\nLes séances futures planifiées avec ce modèle seront également supprimées.`)) {
        DB.deleteTemplate(id);
        renderManageSheet();
        renderModelesPanel();
        renderTodayPanel();
        renderPlanningPanel();
      }
    });
  });
}

function _bindManageSheetEvents() {
  const openBtn   = document.getElementById('btn-open-manage');
  const closeBtn  = document.getElementById('manage-close');
  const backdrop  = document.getElementById('manage-backdrop');
  if (openBtn)  openBtn.addEventListener('click', openManageSheet);
  if (closeBtn) closeBtn.addEventListener('click', closeManageSheet);
  if (backdrop) backdrop.addEventListener('click', closeManageSheet);
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
    const isCardio = exo.groupe === 'Cardio';
    const rm   = isCardio ? null : calculerRMDepuisHistorique(exo);
    let infoText;
    if (isCardio) {
      const lastEntry = (exo.historique || []).find(e => e.duree);
      infoText = lastEntry ? `Dernière : ${lastEntry.duree} min` : 'Aucune activité enregistrée';
    } else {
      infoText = rm ? `${rm} kg max` : 'Pas encore de 1RM';
    }
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
          ${infoText}
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

  // Liste des modèles (actifs uniquement)
  const tplList   = document.getElementById('plan-template-list');
  const templates = DB.getActiveTemplates();

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
    const isCardio = exo.groupe === 'Cardio';
    const metaHtml = isCardio
      ? `<span class="tpl-exo-row__param">${block.duree || 30} min</span>`
      : `<span class="tpl-exo-row__param">${block.series}×${block.reps}</span>
         <span class="tpl-exo-row__param">${block.repos}</span>
         <span class="tpl-exo-row__obj">${OBJECTIF_LABELS[block.objectif] ?? 'Libre'}</span>`;
    return `
      <div class="tpl-exo-row" data-idx="${idx}" role="button" tabindex="0"
           aria-label="Modifier ${exo.nom}">
        <div class="tpl-exo-row__left">
          <span class="ws-muscle-tag ws-muscle-tag--${exo.couleur || 'pecto'}">${exo.groupe}</span>
          <span class="tpl-exo-row__name">${exo.nom}</span>
        </div>
        <div class="tpl-exo-row__meta">
          ${metaHtml}
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
    // Valeurs par défaut musculation
    document.getElementById('exo-config-series').value = '3';
    document.getElementById('exo-config-reps').value   = '10';
    document.getElementById('exo-config-repos').value  = '90 s';
    document.getElementById('exo-config-duree').value  = '30';
    const radio = document.querySelector('[name="exo-config-obj"][value="hypertrophie"]');
    if (radio) radio.checked = true;
    // Afficher les champs musculation par défaut (le select déclenchera le toggle)
    _exoConfigToggleCardio(false);
  } else {
    selectWrap.style.display = 'none';
    const block    = templateDraftExercices[idx];
    const exo      = DB.getExercice(block.exoId);
    const isCardio = exo?.groupe === 'Cardio';
    title.textContent      = exo?.nom || 'Modifier';
    confirmLbl.textContent = 'Enregistrer';
    _exoConfigToggleCardio(isCardio);
    if (isCardio) {
      document.getElementById('exo-config-duree').value = block.duree || 30;
    } else {
      document.getElementById('exo-config-series').value = block.series;
      document.getElementById('exo-config-reps').value   = block.reps;
      document.getElementById('exo-config-repos').value  = block.repos;
      const radio = document.querySelector(`[name="exo-config-obj"][value="${block.objectif}"]`);
      if (radio) radio.checked = true;
      const rirEl  = document.getElementById('exo-config-rir');
      const noteEl = document.getElementById('exo-config-note');
      if (rirEl)  rirEl.value  = block.rir != null ? block.rir : '';
      if (noteEl) noteEl.value = block.noteTechnique || '';
    }
  }

  modal.classList.add('exo-config-modal--open');
}

/** Ferme le bottom sheet de configuration exercice */
function closeExoConfigModal() {
  document.getElementById('modal-exo-config').classList.remove('exo-config-modal--open');
  editingExoIdx = null;
}

function _exoConfigIsCardio() {
  if (editingExoIdx !== null) {
    const block = templateDraftExercices[editingExoIdx];
    return DB.getExercice(block?.exoId)?.groupe === 'Cardio';
  }
  const exoId = document.getElementById('exo-config-select')?.value;
  return exoId ? DB.getExercice(exoId)?.groupe === 'Cardio' : false;
}

function _exoConfigToggleCardio(isCardio) {
  const standardRows = document.getElementById('exo-config-standard-rows');
  const cardioRow    = document.getElementById('exo-config-cardio-row');
  const objRow       = document.getElementById('exo-config-obj-row');
  const extraRow     = document.getElementById('exo-config-muscu-extra');
  if (standardRows) standardRows.style.display = isCardio ? 'none' : '';
  if (cardioRow)    cardioRow.style.display    = isCardio ? '' : 'none';
  if (objRow)       objRow.style.display       = isCardio ? 'none' : '';
  if (extraRow)     extraRow.style.display     = isCardio ? 'none' : '';
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
    select.addEventListener('change', () => {
      _exoConfigToggleCardio(_exoConfigIsCardio());
    });
  }

  document.getElementById('exo-config-overlay')?.addEventListener('click', closeExoConfigModal);
  document.getElementById('exo-config-cancel')?.addEventListener('click',  closeExoConfigModal);

  document.getElementById('exo-config-confirm')?.addEventListener('click', () => {
    const isCardio = _exoConfigIsCardio();

    if (editingExoIdx !== null) {
      if (isCardio) {
        const duree = parseInt(document.getElementById('exo-config-duree').value) || 30;
        templateDraftExercices[editingExoIdx] = {
          ...templateDraftExercices[editingExoIdx],
          duree,
        };
      } else {
        const series        = parseInt(document.getElementById('exo-config-series').value) || 3;
        const reps          = parseInt(document.getElementById('exo-config-reps').value)   || 10;
        const repos         = document.getElementById('exo-config-repos').value.trim()     || '90 s';
        const objectif      = document.querySelector('[name="exo-config-obj"]:checked')?.value ?? 'hypertrophie';
        const rirRaw        = document.getElementById('exo-config-rir')?.value;
        const rir           = rirRaw !== '' && rirRaw != null ? parseInt(rirRaw) : null;
        const noteTechnique = (document.getElementById('exo-config-note')?.value || '').trim();
        templateDraftExercices[editingExoIdx] = {
          ...templateDraftExercices[editingExoIdx],
          series, reps, repos, objectif, rir, noteTechnique,
        };
      }
    } else {
      const exoId = document.getElementById('exo-config-select').value;
      if (!exoId) return;
      if (isCardio) {
        const duree = parseInt(document.getElementById('exo-config-duree').value) || 30;
        templateDraftExercices.push({ exoId, duree, distance: '', intensite: '' });
      } else {
        const series        = parseInt(document.getElementById('exo-config-series').value) || 3;
        const reps          = parseInt(document.getElementById('exo-config-reps').value)   || 10;
        const repos         = document.getElementById('exo-config-repos').value.trim()     || '90 s';
        const objectif      = document.querySelector('[name="exo-config-obj"]:checked')?.value ?? 'hypertrophie';
        const rirRaw        = document.getElementById('exo-config-rir')?.value;
        const rir           = rirRaw !== '' && rirRaw != null ? parseInt(rirRaw) : null;
        const noteTechnique = (document.getElementById('exo-config-note')?.value || '').trim();
        templateDraftExercices.push({ exoId, series, reps, repos, objectif, rir, noteTechnique });
      }
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
    const fieldSG      = document.getElementById('field-sous-groupe');
    const selectSG     = document.getElementById('new-exo-sous-groupe');
    const fieldType    = document.getElementById('field-exo-type');
    const fieldMat     = document.getElementById('field-exo-materiel');
    const isCardio     = groupeSelect.value === 'Cardio';
    const sousGroupes  = SOUS_GROUPES[groupeSelect.value] || [];

    // Sous-groupe : uniquement pour les groupes musculaires avec zones
    if (!isCardio && sousGroupes.length > 0) {
      selectSG.innerHTML = '<option value="">Indifférent</option>' +
        sousGroupes.map(sg =>
          `<option value="${sg}">${sg.charAt(0).toUpperCase() + sg.slice(1)}</option>`
        ).join('');
      fieldSG.style.display = 'block';
    } else {
      fieldSG.style.display = 'none';
      selectSG.innerHTML    = '';
    }

    // Type et matériel : non pertinents pour Cardio
    if (fieldType)  fieldType.style.display  = isCardio ? 'none' : '';
    if (fieldMat)   fieldMat.style.display   = isCardio ? 'none' : '';
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const nomInput   = document.getElementById('new-exo-nom');
    const nom        = nomInput.value.trim();
    const groupe     = groupeSelect.value;
    const couleur    = groupeSelect.selectedOptions[0]?.dataset.couleur || 'autre';
    const sousGroupe = document.getElementById('new-exo-sous-groupe')?.value || '';
    const isCardio   = groupe === 'Cardio';
    const type       = isCardio ? 'cardio' : (form.querySelector('[name="new-exo-type"]:checked')?.value     || '');
    const materiel   = isCardio ? ''       : (form.querySelector('[name="new-exo-materiel"]:checked')?.value || '');

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
    const ft = document.getElementById('field-exo-type');
    const fm = document.getElementById('field-exo-materiel');
    if (ft) ft.style.display = '';
    if (fm) fm.style.display = '';
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

/* ═══════════════════════════════════════════════════════════════
   CARDIO — DÉCLARATION MANUELLE
═══════════════════════════════════════════════════════════════ */

let _cardioDeclIntensiteVal = '';

function openCardioDeclarationSheet() {
  const sheet  = document.getElementById('cardio-declare-sheet');
  const select = document.getElementById('cardio-decl-exo');
  if (!sheet || !select) return;

  // Peupler la liste des activités cardio
  const cardioExos = DB.getAllExercices().filter(e => e.groupe === 'Cardio');
  select.innerHTML = cardioExos.length
    ? cardioExos.map(e => `<option value="${e.id}">${e.nom}</option>`).join('')
    : '<option value="">Aucune activité cardio disponible</option>';

  // Date par défaut : aujourd'hui
  const dateInput = document.getElementById('cardio-decl-date');
  if (dateInput) {
    dateInput.value = localDateStr();
    dateInput.max   = localDateStr();
  }

  // Reset formulaire
  const dureeInput    = document.getElementById('cardio-decl-duree');
  const distanceInput = document.getElementById('cardio-decl-distance');
  if (dureeInput)    dureeInput.value    = '';
  if (distanceInput) distanceInput.value = '';
  _cardioDeclIntensiteVal = '';
  document.querySelectorAll('#cardio-decl-intensite-chips .cardio-intensite-chip').forEach(c => {
    c.classList.remove('cardio-intensite-chip--selected');
  });

  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCardioDeclarationSheet() {
  const sheet = document.getElementById('cardio-declare-sheet');
  if (sheet) sheet.hidden = true;
  document.body.style.overflow = '';
}

function saveCardioDeclaration() {
  const exoId    = document.getElementById('cardio-decl-exo')?.value;
  const dateVal  = document.getElementById('cardio-decl-date')?.value;
  const dureeVal = parseInt(document.getElementById('cardio-decl-duree')?.value);
  const distRaw  = parseFloat(document.getElementById('cardio-decl-distance')?.value);
  const distance = distRaw > 0 ? distRaw : null;

  if (!exoId) { alert('Sélectionne une activité.'); return; }
  if (!dureeVal || dureeVal < 1) { alert('Saisis une durée valide.'); return; }

  const exo = DB.getExercice(exoId);
  if (!exo) return;

  const isoDate = dateVal
    ? new Date(dateVal + 'T12:00:00').toISOString()
    : new Date().toISOString();

  exo.historique.unshift({
    titre:     'Déclaration manuelle',
    duree:     dureeVal,
    distance:  distance,
    intensite: _cardioDeclIntensiteVal || null,
    date:      isoDate,
  });
  DB.saveExercice(exo);

  closeCardioDeclarationSheet();
}

function _bindCardioDeclarationEvents() {
  document.getElementById('btn-cardio-declare')?.addEventListener('click', openCardioDeclarationSheet);
  document.getElementById('cardio-declare-close')?.addEventListener('click', closeCardioDeclarationSheet);
  document.getElementById('cardio-declare-backdrop')?.addEventListener('click', closeCardioDeclarationSheet);
  document.getElementById('cardio-decl-save')?.addEventListener('click', saveCardioDeclaration);

  // Chips intensité
  document.querySelectorAll('#cardio-decl-intensite-chips .cardio-intensite-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.intensite;
      if (_cardioDeclIntensiteVal === val) {
        _cardioDeclIntensiteVal = '';
        chip.classList.remove('cardio-intensite-chip--selected');
      } else {
        document.querySelectorAll('#cardio-decl-intensite-chips .cardio-intensite-chip').forEach(c => {
          c.classList.remove('cardio-intensite-chip--selected');
        });
        _cardioDeclIntensiteVal = val;
        chip.classList.add('cardio-intensite-chip--selected');
      }
    });
  });
}
