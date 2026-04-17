/**
 * FitTrack — Page Accueil (coach journalier)
 * ===========================================
 * Agrège les données existantes. Ne crée aucune donnée.
 * Rôle : orienter, prioriser, proposer une action claire.
 *
 * Dépendances (chargées avant ce script) :
 *   data.js → window.DB, window.ALIM_DB, window.MEAL_PLAN_DB,
 *              window.DAILY_GOALS, window.localDateStr
 */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════ */

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _today() {
    return window.localDateStr ? window.localDateStr() : new Date().toISOString().slice(0, 10);
  }

  /* ════════════════════════════════════════════════
     COLLECTE DES DONNÉES DU JOUR
  ════════════════════════════════════════════════ */

  function _collectTodayData() {
    const today = _today();

    const todayPlanned  = window.DB ? window.DB.getTodayPlanned() : [];
    const activeSession = window.DB ? window.DB.getActiveSession() : null;

    const alimDay    = window.ALIM_DB ? window.ALIM_DB.getDay(today) : null;
    const alimTotals = alimDay ? window.ALIM_DB.calcTotals(alimDay) : { k: 0, p: 0, g: 0, l: 0 };
    const goals      = window.DAILY_GOALS || { kcal: 2500, p: 180, g: 280, l: 80 };

    const mealPlan     = window.MEAL_PLAN_DB ? window.MEAL_PLAN_DB.getDay(today) : { entries: [] };
    const pendingMeals = (mealPlan.entries || []).filter(e => !e.status || e.status === 'planifie');

    return { today, todayPlanned, activeSession, alimTotals, goals, pendingMeals };
  }

  /* ════════════════════════════════════════════════
     CONTEXTE DU JOUR — classification centralisée
     Toute la logique décisionnelle est ici.
  ════════════════════════════════════════════════ */

  function _buildContext(data) {
    const { todayPlanned, activeSession, alimTotals, goals } = data;

    const hasActive  = !!activeSession;
    const hasPending = todayPlanned.some(p => !p.completed);
    const hasDone    = todayPlanned.some(p => p.completed);
    const hasRest    = !hasActive && !hasPending && !hasDone;

    const kcalGoal   = goals.kcal || 2500;
    const alimPct    = Math.round(alimTotals.k / kcalGoal * 100);
    const hasEaten   = alimTotals.k > 0;

    // Priorité du jour : quel bloc mérite l'action immédiate ?
    // muscu : séance active ou à démarrer
    // alim  : jour de repos ou séance terminée, et nutrition non suivie
    // none  : tout est en ordre
    let priority;
    if (hasActive || hasPending) {
      priority = 'muscu';
    } else if (!hasEaten || alimPct < 80) {
      priority = 'alim';
    } else {
      priority = 'none';
    }

    return { hasActive, hasPending, hasDone, hasRest, kcalGoal, alimPct, hasEaten, priority };
  }

  /* ════════════════════════════════════════════════
     EN-TÊTE — message coach contextuel
  ════════════════════════════════════════════════ */

  function renderHeader(data, ctx) {
    const dateEl  = document.getElementById('home-date');
    const msgEl   = document.getElementById('home-message');
    const hintEl  = document.getElementById('home-hint');
    const badgeEl = document.getElementById('home-mode-badge');
    const stripEl = document.getElementById('home-goal-strip');
    if (!dateEl || !msgEl) return;

    // ── Date ──
    const now     = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    // ── Badge de mode ──
    if (badgeEl) {
      if (ctx.hasActive) {
        badgeEl.textContent = 'Séance en cours';
        badgeEl.className   = 'home-mode-badge home-mode-badge--active';
      } else if (ctx.hasPending) {
        badgeEl.textContent = 'Jour d\'entraînement';
        badgeEl.className   = 'home-mode-badge home-mode-badge--training';
      } else if (ctx.hasDone) {
        badgeEl.textContent = 'Séance terminée';
        badgeEl.className   = 'home-mode-badge home-mode-badge--done';
      } else {
        badgeEl.textContent = 'Jour de repos';
        badgeEl.className   = 'home-mode-badge home-mode-badge--rest';
      }
      badgeEl.hidden = false;
    }

    // ── Message principal + sous-texte ──
    let msg, hint;

    if (ctx.hasActive) {
      msg  = 'Continue sur ta lancée 🔥';
      hint = 'Ta séance est en cours — termine ce que tu as commencé.';
    } else if (ctx.hasPending && !ctx.hasEaten) {
      msg  = 'Mange d\'abord, entraîne-toi ensuite.';
      hint = 'Séance prévue aujourd\'hui — commence par noter ton repas.';
    } else if (ctx.hasPending) {
      msg  = 'Séance à faire aujourd\'hui.';
      hint = 'Lance-toi maintenant — plus tôt c\'est fait, mieux tu récupères.';
    } else if (ctx.hasDone && !ctx.hasEaten) {
      msg  = 'Séance faite — mange maintenant.';
      hint = 'La récupération passe par l\'alimentation.';
    } else if (ctx.hasDone && ctx.alimPct >= 80) {
      msg  = 'Belle journée 🎯';
      hint = 'Séance et nutrition en bonne voie.';
    } else if (ctx.hasDone) {
      msg  = 'Séance faite — suis ta nutrition.';
      hint = 'Il te reste des repas à enregistrer pour atteindre ton objectif.';
    } else if (!ctx.hasEaten) {
      msg  = 'Commence par ton premier repas.';
      hint = 'Enregistre ce que tu manges pour suivre tes calories.';
    } else if (ctx.alimPct >= 80) {
      msg  = 'Tu gères — journée bien engagée.';
      hint = 'Nutrition en bonne voie. Profite de la récupération.';
    } else {
      msg  = 'Jour de repos — reste attentif.';
      hint = 'Suis ton alimentation et planifie ta prochaine séance.';
    }

    msgEl.textContent = msg;
    if (hintEl) hintEl.textContent = hint;

    // ── Strip objectif discret ──
    if (stripEl) {
      const goals = window.DAILY_GOALS;
      const prof  = window.PROFIL_DB?.get();
      if (goals && goals.kcal && prof) {
        const label = prof.objectif === 'maintien' ? 'Maintien' : 'Perte de gras';
        stripEl.textContent = label + ' · ' + goals.kcal + ' kcal / jour · ' + goals.p + 'g protéines';
        stripEl.hidden = false;
      } else {
        stripEl.hidden = true;
      }
    }
  }

  /* ════════════════════════════════════════════════
     PRIORITÉ VISUELLE — bordure accent sur la carte active
  ════════════════════════════════════════════════ */

  function _applyPriority(ctx) {
    const muscuCard = document.getElementById('home-muscu-card');
    const alimCard  = document.getElementById('home-alim-card');
    if (!muscuCard || !alimCard) return;

    muscuCard.classList.remove('home-card--priority', 'home-card--first');
    alimCard.classList.remove('home-card--priority', 'home-card--first');

    if (ctx.priority === 'muscu') {
      muscuCard.classList.add('home-card--priority', 'home-card--first');
    } else if (ctx.priority === 'alim') {
      alimCard.classList.add('home-card--priority', 'home-card--first');
    }
  }

  /* ════════════════════════════════════════════════
     BLOC MUSCULATION
  ════════════════════════════════════════════════ */

  function renderMuscuBlock(data, ctx) {
    const block = document.getElementById('home-muscu-block');
    if (!block) return;

    const { todayPlanned, activeSession } = data;

    // ── Séance active ──
    if (activeSession) {
      const sessionId = activeSession.sessionId || activeSession.id || '';
      const nom       = activeSession.nom || 'Séance en cours';
      block.innerHTML =
        _badge('active', '<span class="home-card__status-dot"></span>En cours') +
        '<p class="home-card__info">' + _esc(nom) + '</p>' +
        '<a href="seance.html?id=' + _esc(sessionId) + '" class="home-btn home-btn--primary">' +
          _svgPlay() + ' Reprendre la séance' +
        '</a>';
      return;
    }

    // ── Planifiée, non démarrée ──
    const pending = todayPlanned.filter(p => !p.completed);
    if (pending.length > 0) {
      const first    = pending[0];
      const template = window.DB ? window.DB.getTemplate(first.templateId) : null;
      const nom      = template ? template.nom : 'Séance planifiée';
      block.innerHTML =
        _badge('planned', 'Planifiée') +
        '<p class="home-card__info">' + _esc(nom) + '</p>' +
        _coach('Lance-toi maintenant — plus tôt c\'est fait, mieux tu récupères.') +
        '<a href="seance.html?id=' + _esc(first.id) + '" class="home-btn home-btn--primary">' +
          _svgPlay() + ' Démarrer la séance' +
        '</a>' +
        '<a href="musculation.html" class="home-btn home-btn--ghost">Voir le planning</a>';
      return;
    }

    // ── Terminée aujourd'hui ──
    const done = todayPlanned.filter(p => p.completed);
    if (done.length > 0) {
      const template = window.DB ? window.DB.getTemplate(done[0].templateId) : null;
      const nom      = template ? template.nom : 'Séance';
      block.innerHTML =
        _badge('done', '✓ Terminée') +
        '<p class="home-card__info">' + _esc(nom) + '</p>' +
        _coach('Bien joué. Laisse ton corps récupérer.') +
        '<a href="musculation.html" class="home-btn home-btn--ghost">Voir le planning</a>';
      return;
    }

    // ── Jour de repos ──
    block.innerHTML =
      _badge('rest', 'Repos') +
      _coach('Un bon moment pour planifier ta prochaine séance.') +
      '<a href="musculation.html" class="home-btn home-btn--primary">Planifier une séance</a>';
  }

  /* ════════════════════════════════════════════════
     BLOC ALIMENTATION
  ════════════════════════════════════════════════ */

  function renderAlimBlock(data, ctx) {
    const block = document.getElementById('home-alim-block');
    if (!block) return;

    const { alimTotals, goals, pendingMeals } = data;
    const { alimPct, hasEaten, kcalGoal }     = ctx;

    // ── État 1 : rien enregistré ──
    if (!hasEaten) {
      const pendingHint = pendingMeals.length > 0
        ? _coach(pendingMeals.length + ' repas planifié' + (pendingMeals.length > 1 ? 's' : '') + ' prévu aujourd\'hui.')
        : '';
      block.innerHTML =
        '<p class="home-alim-step">Aucun repas enregistré aujourd\'hui.</p>' +
        pendingHint +
        '<a href="alimentation/alimentation.html" class="home-btn home-btn--primary">Ajouter un repas</a>';
      return;
    }

    // ── État 2 : objectif atteint ou dépassé ──
    if (alimPct >= 100) {
      const isOver      = alimTotals.k > kcalGoal;
      const protOk      = alimTotals.p >= goals.p;
      const protLabel   = alimTotals.p + 'g' + (protOk ? ' ✓' : ' / ' + goals.p + 'g');
      const protCls     = protOk ? 'home-alim-secondary__val home-alim-secondary__val--ok' : 'home-alim-secondary__val';
      block.innerHTML =
        _badge(isOver ? 'planned' : 'done', isOver ? 'Objectif dépassé' : '✓ Objectif kcal atteint') +
        _coach(isOver ? 'Tu as dépassé ton objectif calorique.' : 'Bien joué — tu es dans le vert.') +
        '<div class="home-alim-secondary">' +
          '<div class="home-alim-secondary__item">' +
            '<span class="home-alim-secondary__label">Protéines</span>' +
            '<span class="' + protCls + '">' + protLabel + '</span>' +
          '</div>' +
        '</div>' +
        '<a href="alimentation/alimentation.html" class="home-btn home-btn--ghost">Voir aujourd\'hui</a>';
      return;
    }

    // ── État 3 : en cours ──
    const barPct  = Math.min(100, alimPct);
    const restant = kcalGoal - alimTotals.k;
    let coachMsg;
    if (alimPct < 40) {
      coachMsg = 'Début de journée — n\'oublie pas tes repas.';
    } else if (alimPct < 70) {
      coachMsg = 'Bonne progression. Continue.';
    } else {
      coachMsg = 'Presque à l\'objectif — encore un effort.';
    }
    block.innerHTML =
      '<div class="home-alim-macro">' +
        '<div class="home-alim-macro__main">' +
          '<span class="home-alim-macro__val">' + alimTotals.k + '</span>' +
          '<span class="home-alim-macro__sep">/</span>' +
          '<span class="home-alim-macro__goal">' + kcalGoal + ' kcal</span>' +
        '</div>' +
        '<div class="home-alim-bar">' +
          '<div class="home-alim-bar__fill" style="width:' + barPct + '%"></div>' +
        '</div>' +
      '</div>' +
      '<p class="home-alim-reste">' + restant + ' kcal restantes</p>' +
      _coach(coachMsg) +
      '<div class="home-alim-secondary">' +
        '<div class="home-alim-secondary__item">' +
          '<span class="home-alim-secondary__label">Protéines</span>' +
          '<span class="home-alim-secondary__val">' + alimTotals.p + 'g' +
            ' <span class="home-alim-secondary__goal">/ ' + goals.p + 'g</span>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<a href="alimentation/alimentation.html" class="home-btn home-btn--primary">Voir aujourd\'hui</a>';
  }

  /* ════════════════════════════════════════════════
     COMPOSANTS HTML réutilisables
  ════════════════════════════════════════════════ */

  function _badge(type, label) {
    return '<div class="home-card__status home-card__status--' + type + '">' + label + '</div>';
  }

  /** Texte coach discret sous le badge/info */
  function _coach(text) {
    return '<p class="home-card__coach">' + _esc(text) + '</p>';
  }

  function _svgPlay() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"' +
           ' width="14" height="14" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }

  /* ════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════ */

  function init() {
    if (window.DB) window.DB.init();

    const data = _collectTodayData();
    const ctx  = _buildContext(data);

    renderHeader(data, ctx);
    _applyPriority(ctx);
    renderMuscuBlock(data, ctx);
    renderAlimBlock(data, ctx);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── bfcache : re-render si la page est restaurée depuis le cache navigateur
  // (bouton retour iOS Safari / Android Chrome) pour refléter un objectif
  // modifié dans Profil sans nécessiter de rechargement manuel.
  window.addEventListener('pageshow', (e) => { if (e.persisted) init(); });

})();
