/**
 * FitTrack — Phase Detail overlay (partagé index + profil)
 * =========================================================
 * Usage : window.PhaseDetail.open(prog, phaseIndex)
 *         window.PhaseDetail.close()
 * S'auto-injecte dans le DOM à la première ouverture.
 */

window.PhaseDetail = (function () {
  'use strict';

  /* ── Styles injectés une seule fois dans <head> ── */
  const _CSS = [
    '#phase-detail-overlay{position:fixed;inset:0;z-index:1200;display:flex;',
    'align-items:flex-end;background:rgba(0,0,0,0);visibility:hidden;',
    'transition:background .25s,visibility 0s linear .25s;}',

    '#phase-detail-overlay.--open{background:rgba(0,0,0,.55);visibility:visible;',
    'transition:background .25s,visibility 0s;}',

    '.pd-sheet{background:#13171b;border-radius:20px 20px 0 0;',
    'border-top:1px solid #1f2a22;width:100%;',
    'height:var(--h,85dvh);max-height:var(--h,85dvh);box-sizing:border-box;',
    'display:flex;flex-direction:column;',
    'transform:translateY(100%);transition:transform .3s cubic-bezier(.32,.72,0,1);}',

    '#phase-detail-overlay.--open .pd-sheet{transform:translateY(0);}',

    '.pd-handle{width:36px;height:4px;background:#2d3748;border-radius:2px;',
    'margin:.75rem auto 0;flex-shrink:0;}',

    '.pd-header{display:flex;align-items:flex-start;justify-content:space-between;',
    'padding:1rem 1.25rem .875rem;border-bottom:1px solid #1f2a22;flex-shrink:0;gap:.75rem;}',

    '.pd-header__info{flex:1;min-width:0;}',

    '.pd-title{font-size:1rem;font-weight:700;color:#f0f0f0;margin:0 0 .25rem;line-height:1.3;}',

    '.pd-meta{font-size:.75rem;color:#6b7280;margin:0;}',

    '.pd-meta .pd-meta__cycle{color:#39e07a;font-weight:600;}',

    '.pd-close{background:none;border:none;color:#6b7280;font-size:1.1rem;',
    'padding:.25rem .25rem .25rem .5rem;cursor:pointer;flex-shrink:0;line-height:1;}',

    '.pd-body{flex:1;min-height:0;overflow-y:auto;',
    'padding:1.125rem 1.25rem;display:flex;flex-direction:column;gap:1.25rem;}',

    '.pd-objectif{font-size:.85rem;color:#e5e7eb;',
    'font-style:italic;margin:0;line-height:1.4;}',

    '.pd-reps-badge{display:inline-flex;align-items:center;gap:.5rem;',
    'background:rgba(57,224,122,.1);border:1px solid rgba(57,224,122,.25);',
    'border-radius:10px;padding:.5rem .875rem;width:fit-content;}',

    '.pd-reps-badge__val{font-size:1.1rem;font-weight:700;color:#39e07a;}',

    '.pd-reps-badge__label{font-size:.75rem;color:#6b7280;}',

    '.pd-section{display:flex;flex-direction:column;gap:.5rem;}',

    '.pd-section__title{font-size:.68rem;font-weight:700;text-transform:uppercase;',
    'letter-spacing:.08em;color:#6b7280;}',

    '.pd-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.4rem;}',

    '.pd-list li{font-size:.85rem;color:#e5e7eb;',
    'display:flex;align-items:baseline;gap:.5rem;}',

    '.pd-list li::before{content:"·";color:#39e07a;font-weight:700;flex-shrink:0;}',

    /* Surcharge pour la section "Ce que l'app surveille" (ton plus discret) */
    '.pd-section--auto .pd-list li{color:#9ca3af;font-size:.8rem;}',

    '.pd-footer{border-top:1px solid #1f2a22;padding:.875rem 1.25rem;',
    'display:flex;flex-direction:column;gap:.5rem;flex-shrink:0;}',

    '.pd-next-phase{font-size:.8rem;color:#6b7280;}',

    '.pd-next-phase strong{color:#e5e7eb;}',

    '.pd-deload{font-size:.8rem;color:#f59e0b;}',

    '.pd-link{font-size:.8rem;color:#39e07a;text-decoration:none;font-weight:600;}',
  ].join('');

  let _overlay       = null;
  let _stylesInjected = false;

  /* ════════════════════════════════════════════════
     INITIALISATION
  ════════════════════════════════════════════════ */

  function _injectStyles() {
    if (_stylesInjected) return;
    const s = document.createElement('style');
    s.textContent = _CSS;
    document.head.appendChild(s);
    _stylesInjected = true;
  }

  function _ensureOverlay() {
    if (_overlay) return _overlay;
    _injectStyles();

    const el = document.createElement('div');
    el.id = 'phase-detail-overlay';
    el.innerHTML =
      '<div class="pd-sheet">' +
        '<div class="pd-handle"></div>' +
        '<div class="pd-header">' +
          '<div class="pd-header__info">' +
            '<h2 class="pd-title" id="pd-title"></h2>' +
            '<p class="pd-meta"  id="pd-meta"></p>' +
          '</div>' +
          '<button class="pd-close" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="pd-body"   id="pd-body"></div>' +
        '<div class="pd-footer" id="pd-footer"></div>' +
      '</div>';

    document.body.appendChild(el);
    _overlay = el;

    el.querySelector('.pd-close').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });

    return el;
  }

  /* ════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════ */

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ════════════════════════════════════════════════
     "Ce que l'app surveille" — adapté au micro-cycle
  ════════════════════════════════════════════════ */

  function _surveilleItems(phase, mcType) {
    const plage = phase.repsMin + '–' + phase.repsMax;
    if (mcType === 'overreaching') {
      return [
        'Fatigue accumulée — récupération prioritaire',
        'Maintien du volume, pas de progression forcée',
        'Signal de deload si performance en baisse',
      ];
    }
    if (mcType === 'metabolique') {
      return [
        'Séries dans la plage ' + plage,
        'Progression ou maintien selon performance',
        'Volume maintenu semaine après semaine',
      ];
    }
    return [
      'Qualité d’exécution et maîtrise de la charge',
      'Séries dans la plage ' + plage,
      'Mise en place des habitudes de progression',
    ];
  }

  /* ════════════════════════════════════════════════
     API PUBLIQUE
  ════════════════════════════════════════════════ */

  function open(prog, phaseIndex) {
    const overlay = _ensureOverlay();
    const phase   = prog && prog.phases && prog.phases[phaseIndex];
    if (!phase) return;

    const info           = window.PROGRAMME_DB ? window.PROGRAMME_DB.getActivePhase(prog) : null;
    const isCurrentPhase = info && info.phaseIndex === phaseIndex;
    const isPastPhase    = info ? phaseIndex < info.phaseIndex : true;

    /* ── Micro-cycle (moteur interne, utilisateur voit début/milieu/fin) ── */
    const mc = (isCurrentPhase && window.PROGRAMME_DB)
      ? window.PROGRAMME_DB.getMicroCycle(prog)
      : null;

    /* ── En-tête ── */
    document.getElementById('pd-title').textContent =
      phase.nom || ('Phase ' + (phaseIndex + 1));

    let metaHtml;
    if (isCurrentPhase) {
      const weekStr = 'Semaine ' + info.weekInPhase + ' / ' + info.totalWeeksInPhase;
      const cycleStr = mc ? ' · <span class="pd-meta__cycle">' + mc.label + '</span>' : '';
      metaHtml = weekStr + cycleStr;
    } else if (isPastPhase) {
      metaHtml = 'Terminée · ' + phase.durationWeeks + ' sem.';
    } else {
      metaHtml = 'À venir · ' + phase.durationWeeks + ' sem.';
    }
    document.getElementById('pd-meta').innerHTML = metaHtml;

    /* ── Corps ── */
    let bodyHtml = '';

    // Objectif de la phase (texte utilisateur)
    if (phase.objectif) {
      bodyHtml += '<p class="pd-objectif">' + _esc(phase.objectif) + '</p>';
    }

    // Badge reps cibles
    bodyHtml +=
      '<div class="pd-reps-badge">' +
        '<span class="pd-reps-badge__val">' + phase.repsMin + '–' + phase.repsMax + '</span>' +
        '<span class="pd-reps-badge__label">reps cibles</span>' +
      '</div>';

    // Règles (custom si définies par l'utilisateur, sinon génériques)
    const regles = (phase.regles && phase.regles.length)
      ? phase.regles
      : ['Priorité reps avant charge', '1–2 reps en réserve (RIR)', 'Échec musculaire non recherché'];

    bodyHtml +=
      '<div class="pd-section">' +
        '<p class="pd-section__title">Règles</p>' +
        '<ul class="pd-list">' +
          '<li>Fourchette : ' + phase.repsMin + '–' + phase.repsMax + ' reps</li>' +
          regles.map(function (r) { return '<li>' + _esc(r) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';

    // Ce que l'app surveille (adapté au micro-cycle, ton discret)
    const mcType = mc ? mc.type : 'mecanique';
    const items  = _surveilleItems(phase, mcType);

    bodyHtml +=
      '<div class="pd-section pd-section--auto">' +
        '<p class="pd-section__title">Ce que l’app surveille</p>' +
        '<ul class="pd-list">' +
          items.map(function (s) { return '<li>' + _esc(s) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';

    document.getElementById('pd-body').innerHTML = bodyHtml;

    /* ── Pied ── */
    const next = prog.phases[phaseIndex + 1];
    let footerHtml = next
      ? '<p class="pd-next-phase">Prochaine — <strong>' + _esc(next.nom) +
        '</strong> · ' + next.repsMin + '–' + next.repsMax + ' reps</p>'
      : '<p class="pd-deload">Fin de cycle — semaine allégée (deload) recommandée.</p>';

    footerHtml += '<a class="pd-link" href="musculation.html">Voir le planning →</a>';
    document.getElementById('pd-footer').innerHTML = footerHtml;

    overlay.classList.add('--open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (_overlay) _overlay.classList.remove('--open');
    document.body.style.overflow = '';
  }

  return { open: open, close: close };

})();
