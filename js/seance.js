/**
 * FitTrack — Séance guidée (seance.js)
 * ======================================
 * Machine à états :
 *   READY → ACTIVE → VALIDATE → REST → (boucle)
 *                                     → RECAP (fin)
 *
 * URL attendue : seance.html?id=<sessionId>
 */

/* ── Constante ring SVG ──────────────────────────────────────
   Cercle r=54, viewBox 120×120 → 2π×54 ≈ 339.292             */
const CIRC = 2 * Math.PI * 54;

/* ── Volume hebdomadaire optimal par groupe musculaire ───────
   En dessous de MIN → volume insuffisant → progression suspendue
   Au-dessus de MAX → survolume → progression suspendue        */
const VOL_OPTIMAL_MIN = 10;
const VOL_OPTIMAL_MAX = 20;

/* ── État global ─────────────────────────────────────────────
   Toutes les variables mutables de la séance                  */
let session          = null;   // SessionTemplate courant
let plannedId        = null;   // PlannedSession.id si démarré depuis le planning (null si direct)
let exercises        = [];     // [{ block, exo }]
let results          = [];     // [{ exoId, nom, groupe, couleur, series[] }]
let currentExoIdx    = 0;
let currentSerie     = 1;
let currentState     = 'ready';

let stopwatchStart   = 0;    // timestamp ms du début de la série (Date.now())
let stopwatchTimer   = null;

let cardioStopwatchStart = 0;
let cardioTimer          = null;
let cardioDistanceVal    = 0;
let cardioIntensiteVal   = '';

let restTotal        = 0;   // durée totale en secondes (pour l'arc SVG)
let restEndTime      = 0;   // timestamp ms de fin — temps restant = restEndTime - Date.now()
let restTimer        = null;
let pendingLastSerie = false;

let stepperVal       = 0;
let pendingSerieReps = 0;   // reps validés, en attente du poids
let preWeightVal     = 0;   // poids décidé sur l'écran READY avant de commencer la série
let weightVal        = 0;   // valeur courante de l'input poids (écran WEIGHT post-série)
let ressentiVal      = 'ok'; // ressenti de la série en cours : 'facile' | 'ok' | 'dur'

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);

function init() {
  DB.init();

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  if (!id) { showError('Aucun identifiant de séance dans l\'URL.'); return; }

  // ── Résolution de l'ID ──
  // Cas 1 : séance planifiée (id = 'plan-…') → charger le modèle associé
  // Cas 2 : modèle direct (id = 'tpl-…' ou legacy 'session-…')
  if (id.startsWith('plan-')) {
    const planned = DB.getPlanned(id);
    if (!planned) {
      showError('Séance planifiée introuvable.<br><small>ID : ' + id + '</small>');
      return;
    }
    plannedId = id;
    session   = DB.getTemplate(planned.templateId);
    if (!session) {
      showError('Modèle de séance introuvable.<br><small>Template ID : ' + planned.templateId + '</small>');
      return;
    }
  } else {
    // Modèle direct (nouveau format 'tpl-…' ou legacy 'session-…' migré)
    session = DB.getTemplate(id);
    if (!session) {
      showError(`Séance introuvable.<br><small style="font-weight:400;color:#9ca3af">ID : ${id}</small>`);
      return;
    }
  }

  // Construire le tableau d'exercices — on garde les blocs même si l'exo est introuvable
  // (on créé alors un placeholder pour ne pas bloquer la séance)
  exercises = (session.exercices || []).map(block => {
    const exo = DB.getExercice(block.exoId) || {
      id:      block.exoId,
      nom:     block.exoId,       // fallback : affiche l'ID brut
      groupe:  'Exercice',
      couleur: 'pecto',
      rm:      null,
    };
    return { block, exo };
  });

  if (!exercises.length) {
    showError('Cette séance ne contient aucun exercice.\nAjoute des exercices depuis l\'onglet Séances.');
    return;
  }

  // Initialiser la structure de résultats (vierge)
  results = exercises.map(({ exo }) => ({
    exoId:   exo.id,
    nom:     exo.nom,
    groupe:  exo.groupe,
    couleur: exo.couleur,
    series:  [],
  }));

  // ── Restauration d'une séance interrompue ──────────────────
  const saved = DB.getActiveSession();
  if (saved && saved.sessionId === id && Array.isArray(saved.results)
      && saved.results.length === results.length) {
    currentExoIdx = saved.currentExoIdx || 0;
    currentSerie  = saved.currentSerie  || 1;
    results       = saved.results;
    // s'assurer que les indices restent dans les bornes
    currentExoIdx = Math.min(currentExoIdx, exercises.length - 1);
    currentSerie  = Math.max(1, currentSerie);
  }

  document.getElementById('ws-session-name').textContent = session.nom;

  // Boutons fixes
  document.getElementById('btn-back').addEventListener('click', confirmQuit);
  document.getElementById('btn-start-serie').addEventListener('click', startSerie);
  document.getElementById('btn-serie-done').addEventListener('click', serieDone);
  document.getElementById('btn-full-reps').addEventListener('click', () => validateReps(null));
  document.getElementById('btn-adjust-reps').addEventListener('click', () => validateReps(stepperVal));
  document.getElementById('btn-rep-minus').addEventListener('click', () => changeStepper(-1));
  document.getElementById('btn-rep-plus').addEventListener('click',  () => changeStepper(+1));
  document.getElementById('btn-skip-rest').addEventListener('click', skipRest);
  document.getElementById('btn-sound-toggle').addEventListener('click', toggleSound);
  updateSoundToggle();
  document.getElementById('btn-weight-confirm').addEventListener('click', confirmWeight);
  document.getElementById('btn-weight-skip').addEventListener('click', () => commitSerie(pendingSerieReps, null));
  document.getElementById('btn-weight-minus').addEventListener('click', () => changeWeight(-2.5));
  document.getElementById('btn-weight-plus').addEventListener('click',  () => changeWeight(+2.5));
  document.getElementById('weight-input').addEventListener('input', e => {
    weightVal = parseFloat(e.target.value) || 0;
  });

  // Poids pré-série (écran READY)
  document.getElementById('btn-pre-weight-minus').addEventListener('click', () => changePreWeight(-2.5));
  document.getElementById('btn-pre-weight-plus').addEventListener('click',  () => changePreWeight(+2.5));
  document.getElementById('pre-weight-input').addEventListener('input', e => {
    preWeightVal = parseFloat(e.target.value) || 0;
  });

  // Ressenti chips
  document.querySelectorAll('.ws-ressenti__chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ws-ressenti__chip').forEach(c => {
        c.classList.remove('ws-ressenti__chip--selected');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('ws-ressenti__chip--selected');
      chip.setAttribute('aria-pressed', 'true');
      ressentiVal = chip.dataset.ressenti;
    });
  });

  // ── Boutons cardio ──────────────────────────────────────────
  document.getElementById('btn-cardio-stop')?.addEventListener('click', stopCardio);
  document.getElementById('btn-cardio-confirm')?.addEventListener('click', confirmCardio);
  document.getElementById('btn-cardio-dur-minus')?.addEventListener('click', () => changeCardioValue('duree', -1));
  document.getElementById('btn-cardio-dur-plus')?.addEventListener('click',  () => changeCardioValue('duree', +1));
  document.getElementById('btn-cardio-dist-minus')?.addEventListener('click', () => changeCardioValue('distance', -0.5));
  document.getElementById('btn-cardio-dist-plus')?.addEventListener('click',  () => changeCardioValue('distance', +0.5));
  document.querySelectorAll('#cardio-intensite-chips .cardio-intensite-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.intensite;
      if (cardioIntensiteVal === val) {
        cardioIntensiteVal = '';
        chip.classList.remove('cardio-intensite-chip--selected');
      } else {
        document.querySelectorAll('#cardio-intensite-chips .cardio-intensite-chip').forEach(c => {
          c.classList.remove('cardio-intensite-chip--selected');
        });
        cardioIntensiteVal = val;
        chip.classList.add('cardio-intensite-chip--selected');
      }
    });
  });

  // ── Sauvegarde + resync chrono repos à la navigation ──────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionState();
    } else if (currentState === 'rest') {
      // Retour en avant-plan : recalculer le temps restant depuis l'horloge réelle
      syncRestTimer();
    } else if (currentState === 'active') {
      // Retour en avant-plan pendant l'exercice : forcer un refresh du chrono
      updateStopwatch();
    }
  });
  window.addEventListener('pagehide', saveSessionState);

  showReady();
}

/** Affiche un message d'erreur dans le premier écran (ne redirige jamais) */
function showError(msg) {
  const screen = document.getElementById('screen-ready');
  if (!screen) return;
  screen.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;flex:1;gap:1rem;text-align:center;padding:2rem">
      <div style="font-size:2.5rem">⚠️</div>
      <p style="color:#e5e7eb;font-weight:700;font-size:1rem;margin:0">${msg}</p>
      <a href="musculation.html"
         style="margin-top:1rem;padding:.75rem 1.5rem;background:var(--accent);
                color:#0a1a0d;border-radius:12px;font-weight:700;text-decoration:none">
        Retour
      </a>
    </div>`;
  screen.classList.add('ws-screen--active');
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION ENTRE ÉCRANS
═══════════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.ws-screen').forEach(s =>
    s.classList.remove('ws-screen--active')
  );
  const el = document.getElementById(id);
  if (el) el.classList.add('ws-screen--active');
}

/* ═══════════════════════════════════════════════════════════
   PROGRAMME — bande de phase + récap
═══════════════════════════════════════════════════════════ */
function _updatePhaseStrip() {
  const strip = document.getElementById('ws-phase-strip');
  if (!strip || !window.PROGRAMME_DB) return;

  const prog = window.PROGRAMME_DB.get();
  if (!prog) { strip.hidden = true; return; }

  const info = window.PROGRAMME_DB.getActivePhase(prog);
  if (!info) { strip.hidden = true; return; }

  const { phase, phaseIndex } = info;
  const phaseName = phase.nom || ('Phase ' + (phaseIndex + 1));
  strip.textContent = phaseName + ' · ' + phase.repsMin + '–' + phase.repsMax + ' reps · Garder 1–2 reps en réserve';
  strip.hidden = false;
}

function _renderRecapProgramme() {
  const block = document.getElementById('recap-programme');
  if (!block || !window.PROGRAMME_DB) return;

  const prog = window.PROGRAMME_DB.get();
  if (!prog) { block.hidden = true; return; }

  const info       = window.PROGRAMME_DB.getActivePhase(prog);
  const totalWeeks = window.PROGRAMME_DB.getTotalWeeks(prog);

  if (!info) {
    block.innerHTML =
      '<span class="ws-recap-prog__icon">🏁</span>' +
      '<span class="ws-recap-prog__text">Programme terminé — pense à planifier une semaine de décharge.</span>';
    block.hidden = false;
    return;
  }

  const { phase, phaseIndex, weekOverall } = info;
  const phaseName = phase.nom || ('Phase ' + (phaseIndex + 1));

  block.innerHTML =
    '<span class="ws-recap-prog__icon">📋</span>' +
    '<div class="ws-recap-prog__body">' +
      '<span class="ws-recap-prog__phase">' + phaseName + '</span>' +
      '<span class="ws-recap-prog__reps">Objectif reps : ' + phase.repsMin + '–' + phase.repsMax + '</span>' +
      '<span class="ws-recap-prog__week">Semaine ' + weekOverall + ' / ' + totalWeeks + '</span>' +
    '</div>';
  block.hidden = false;
}

/* ═══════════════════════════════════════════════════════════
   ÉCRAN 1 : READY
═══════════════════════════════════════════════════════════ */
function showReady() {
  currentState = 'ready';
  const { block, exo } = exercises[currentExoIdx];

  // Branche cardio : contourne le flux series/reps/poids
  if (exo.groupe === 'Cardio') {
    showCardioScreen();
    return;
  }

  updateHeader();

  setMuscleTag('ready-muscle-tag', exo.groupe, exo.couleur);
  document.getElementById('ready-exo-name').textContent    = exo.nom;
  document.getElementById('ready-serie-num').textContent   = currentSerie;
  document.getElementById('ready-serie-total').textContent = block.series || '?';
  document.getElementById('ready-reps').textContent        = block.reps   || '?';
  document.getElementById('ready-repos').textContent       = block.repos  || '90 s';

  // Séries déjà faites pour cet exercice
  const done   = results[currentExoIdx].series;
  const prevEl = document.getElementById('ready-prev-series');

  if (done.length) {
    prevEl.innerHTML = done.map((s, i) => {
      const miss = s.actual < s.planned;
      const poidsStr = s.poids ? ` · ${s.poids} kg` : '';
      return `
        <div class="ws-prev-row">
          <span class="ws-prev-row__label">Série ${i + 1}</span>
          <span class="ws-prev-row__reps${miss ? ' ws-prev-row__reps--miss' : ''}">
            ${s.actual} reps${miss ? ` (obj. ${s.planned})` : ' ✓'}${poidsStr}
          </span>
        </div>`;
    }).join('');
  } else {
    prevEl.innerHTML = '';
  }

  // ── Section poids pré-série ──────────────────────────────
  const RESSENTI_ICON = { facile: '💪', ok: '👍', dur: '😰' };
  const weightSection = document.getElementById('ready-weight-section');
  const isBodyweight  = exo.materiel === 'Poids du corps';

  if (isBodyweight) {
    weightSection.style.display = 'none';
  } else {
    weightSection.style.display = '';

    // Titre : préciser "par haltère" pour les Haltères
    const isHalteres = exo.materiel === 'Haltères';
    const titleEl = weightSection.querySelector('.ws-ready-weight__title');
    if (titleEl) titleEl.textContent = isHalteres ? 'Par haltère' : 'Charge prévue';

    const lastEl = document.getElementById('ready-last-session');
    const hintEl = document.getElementById('pre-weight-hint');
    const kgLabel = isHalteres ? 'kg/h.' : 'kg';

    if (done.length > 0) {
      // Séries 2+ : utiliser le poids de la série précédente dans cette séance
      const lastDone = done[done.length - 1];
      preWeightVal = lastDone.poids || 0;
      if (lastDone.poids) {
        const icon = RESSENTI_ICON[lastDone.ressenti] || '';
        lastEl.textContent = `Série ${done.length} · ${lastDone.poids} ${kgLabel} · ${lastDone.actual} reps ${icon}`.trim();
        lastEl.style.display = '';
      } else {
        lastEl.style.display = 'none';
      }
      hintEl.style.display = 'none';
    } else {
      // Première série : suggestion depuis l'historique + objectif
      const lastHist = (exo.historique || []).find(e => e.poids > 0);
      if (lastHist) {
        const icon = RESSENTI_ICON[lastHist.ressenti] || '';
        lastEl.textContent = `Dernière séance · ${lastHist.poids} ${kgLabel} · ${lastHist.reps} reps ${icon}`.trim();
        lastEl.style.display = '';
      } else {
        lastEl.style.display = 'none';
      }
      const { poids, raison } = calculerSuggestionPoids(exo, block);
      preWeightVal = poids;
      if (raison) {
        hintEl.textContent = raison;
        hintEl.style.display = '';
      } else {
        hintEl.style.display = 'none';
      }
    }

    document.getElementById('pre-weight-input').value = preWeightVal || '';
  }

  _updatePhaseStrip();
  showScreen('screen-ready');
}

/* ═══════════════════════════════════════════════════════════
   ÉCRAN 2 : ACTIVE
═══════════════════════════════════════════════════════════ */
function startSerie() {
  // Capturer le poids saisi sur l'écran READY avant de passer en ACTIVE
  const preInput = document.getElementById('pre-weight-input');
  if (preInput) {
    const v = parseFloat(preInput.value);
    preWeightVal = v > 0 ? v : preWeightVal;
  }

  currentState = 'active';
  const { block, exo } = exercises[currentExoIdx];

  setMuscleTag('active-muscle-tag', exo.groupe, exo.couleur);
  document.getElementById('active-exo-name').textContent = exo.nom;
  document.getElementById('active-target').textContent   =
    `Série ${currentSerie} / ${block.series}  ·  ${block.reps} reps`;

  stopwatchStart = Date.now();
  clearInterval(stopwatchTimer);
  updateStopwatch();
  stopwatchTimer = setInterval(updateStopwatch, 1000);

  showScreen('screen-active');
}

/* ═══════════════════════════════════════════════════════════
   ÉCRAN 3 : VALIDATE
═══════════════════════════════════════════════════════════ */
function serieDone() {
  clearInterval(stopwatchTimer);
  currentState = 'validate';

  const { block } = exercises[currentExoIdx];
  const planned = parseInt(block.reps) || 10;

  stepperVal = planned;
  document.getElementById('stepper-val').textContent         = stepperVal;
  document.getElementById('validate-target').textContent     = `Objectif : ${planned} reps`;
  document.getElementById('validate-full-label').textContent = `(${planned})`;

  showScreen('screen-validate');
}

function changeStepper(delta) {
  stepperVal = Math.max(0, stepperVal + delta);
  document.getElementById('stepper-val').textContent = stepperVal;
}

function validateReps(actual) {
  const { block } = exercises[currentExoIdx];
  const planned    = parseInt(block.reps) || 10;
  const actualReps = (actual === null) ? planned : actual;

  pendingSerieReps = actualReps;

  // Poids du corps : on garde l'écran (chips ressenti) mais on masque la saisie poids.
  showWeightScreen(actualReps, block);
}

function showWeightScreen(actualReps, block) {
  const { exo } = exercises[currentExoIdx];
  const isBodyweight = exo.materiel === 'Poids du corps';
  const isHalteres   = exo.materiel === 'Haltères';

  // Réinitialiser le ressenti → OK par défaut
  ressentiVal = 'ok';
  document.querySelectorAll('.ws-ressenti__chip').forEach(c => {
    const isOk = c.dataset.ressenti === 'ok';
    c.classList.toggle('ws-ressenti__chip--selected', isOk);
    c.setAttribute('aria-pressed', isOk ? 'true' : 'false');
  });

  // Mettre à jour le label de la question
  const labelEl = document.querySelector('.ws-weight-label');
  if (labelEl) {
    labelEl.textContent = isBodyweight
      ? 'Comment c\'était ?'
      : isHalteres
        ? 'Poids utilisé (par haltère) ?'
        : 'Quel poids as-tu utilisé ?';
  }

  document.getElementById('weight-serie-info').textContent =
    `Série ${currentSerie} · ${actualReps} reps`;

  // Bloc saisie poids — masqué pour le poids du corps (seul le ressenti compte).
  const weightCenter = document.querySelector('.ws-weight-center');
  if (weightCenter) weightCenter.style.display = isBodyweight ? 'none' : '';

  // Bouton "Sans poids / ignorer" — n'a pas de sens en poids du corps
  // (la confirmation = ressenti capturé, pas un skip).
  const skipBtn = document.getElementById('btn-weight-skip');
  if (skipBtn) skipBtn.style.display = isBodyweight ? 'none' : '';

  if (!isBodyweight) {
    // Utiliser le poids pré-décidé sur l'écran READY (ou fallback suggestion)
    weightVal = preWeightVal > 0
      ? preWeightVal
      : calculerSuggestionPoids(exo, block).poids;

    const input = document.getElementById('weight-input');
    input.value = weightVal || '';

    // Hint : confirmer le poids prévu
    const hintEl = document.getElementById('weight-hint');
    if (weightVal > 0) {
      const kgLabel = isHalteres ? 'kg/haltère' : 'kg';
      hintEl.textContent = `Prévu : ${weightVal} ${kgLabel} — ajuste si tu as utilisé autre chose`;
      hintEl.style.display = '';
    } else {
      hintEl.style.display = 'none';
    }
  }

  showScreen('screen-weight');
}

function changeWeight(delta) {
  weightVal = Math.max(0, Math.round((weightVal + delta) * 2) / 2);
  document.getElementById('weight-input').value = weightVal || '';
}

function changePreWeight(delta) {
  preWeightVal = Math.max(0, Math.round((preWeightVal + delta) * 2) / 2);
  document.getElementById('pre-weight-input').value = preWeightVal || '';
}

function confirmWeight() {
  const { exo } = exercises[currentExoIdx];
  // Poids du corps : on ignore l'input (masqué) et on commit sans poids.
  if (exo.materiel === 'Poids du corps') {
    commitSerie(pendingSerieReps, null);
    return;
  }
  const inputVal = parseFloat(document.getElementById('weight-input').value);
  weightVal = inputVal > 0 ? inputVal : 0;
  commitSerie(pendingSerieReps, weightVal || null);
}

function commitSerie(actualReps, poids) {
  const { block } = exercises[currentExoIdx];
  const planned     = parseInt(block.reps)   || 10;
  const totalSeries = parseInt(block.series) || 1;

  results[currentExoIdx].series.push({
    planned:  planned,
    actual:   actualReps,
    duration: Math.floor((Date.now() - stopwatchStart) / 1000),
    poids:    poids,
    ressenti: ressentiVal, // toujours stocké — utile aussi en poids du corps
  });

  const isLastSerie = currentSerie >= totalSeries;
  const isLastExo   = currentExoIdx >= exercises.length - 1;

  // Autosave après chaque série (sauf la toute dernière → gérée par saveAllResults)
  if (!(isLastSerie && isLastExo)) saveSessionState();

  if (isLastSerie && isLastExo) {
    saveAllResults();
    showRecap();
    return;
  }

  pendingLastSerie = isLastSerie;
  startRest(parseRepos(block.repos), isLastSerie);
}

/**
 * Pas d'ajustement selon le matériel.
 * Barre / Machine / Haltères / Élastique → 2,5 kg
 * Kettlebell → 4 kg (paliers standards KB)
 */
function getPasAjustement(materiel) {
  return materiel === 'Kettlebell' ? 4 : 2.5;
}

/**
 * Groupe l'historique d'un exercice par session (YYYY-MM-DD).
 * Retourne les sessions triées du plus récent au plus ancien.
 * Chaque session est un tableau d'entrées triées par numéro de série (1 → N).
 */
function getHistByDate(exo) {
  const hist = (exo.historique || []).filter(e => typeof e.reps === 'number');
  const byDate = {};
  hist.forEach(e => {
    const d = e.date ? e.date.slice(0, 10) : 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });
  return Object.keys(byDate)
    .sort()
    .reverse()
    .map(d => byDate[d].sort((a, b) => (a.series || 0) - (b.series || 0)));
}

/**
 * Analyse les indicateurs de performance d'une session.
 * Les entrées doivent être triées par numéro de série (série 1 en premier).
 *
 * Règle clé : la première série est l'indicateur de référence.
 * La fatigue entraîne une baisse naturelle des séries suivantes (ex : 10/9/8 est normal).
 * "Chute extrême" = dernière série < 60 % de l'objectif (ex : 10 → 5 reps).
 */
function analyzeSessionEntries(entries, target) {
  if (!entries.length) return null;
  const first = entries[0];
  const last  = entries[entries.length - 1];
  return {
    firstHit:    first.reps >= target,
    allHit:      entries.every(e => e.reps >= target),
    extremeDrop: entries.length > 1 && last.reps < target * 0.60,
    anyDur:      entries.some(e => e.ressenti === 'dur'),
    anyFacile:   entries.some(e => e.ressenti === 'facile'),
  };
}

/**
 * Calcule le poids conseillé pour la série + une raison textuelle affichée à l'utilisateur.
 *
 * Priorité :
 *   1. Si historique avec poids → ajustement selon ressenti + reps atteintes
 *   2. Sinon → 1RM + objectif (première fois sur cet exercice)
 *   3. Compat : si ancien bloc avec poids fixe et pas d'historique → block.poids
 *
 * @returns {{ poids: number, raison: string|null }}
 */
function calculerSuggestionPoids(exo, block) {
  const step     = getPasAjustement(exo.materiel);
  const target   = parseInt(block.reps) || 10;
  // Garder uniquement les sessions où au moins une série a un poids renseigné
  const sessions = getHistByDate(exo).filter(s => s.some(e => e.poids > 0));

  // ── Cas 1 : historique disponible ──
  if (sessions.length) {
    const lastSess = sessions[0];
    const base     = lastSess.find(e => e.poids > 0)?.poids || 0;
    const perf     = analyzeSessionEntries(lastSess, target);

    // Une séance est considérée "ratée" quand la 1ère série manque l'objectif
    // ou que la dernière série s'effondre (chute extrême). Le ressenti "dur" seul
    // n'est JAMAIS un motif de baisse — on reste à la même charge pour retenter.
    const isSessionFailed = p => !!p && (!p.firstHit || p.extremeDrop);
    const lastFailed      = isSessionFailed(perf);

    if (lastFailed) {
      // Baisse de charge uniquement après 2 séances ratées consécutives.
      // Protège la progression d'un mauvais jour isolé (fatigue, sommeil, stress…).
      const prevSess   = sessions[1];
      const prevPerf   = prevSess ? analyzeSessionEntries(prevSess, target) : null;
      const prevFailed = isSessionFailed(prevPerf);

      if (prevFailed) {
        const nouveau = Math.max(step, Math.round((base - step) / 2.5) * 2.5);
        return {
          poids:  nouveau,
          raison: `↓ −${step} kg · 2 séances consécutives manquées (${base} → ${nouveau} kg)`,
        };
      }

      // Séance ratée isolée → on garde la charge, on retente avant d'envisager une baisse
      return {
        poids:  base,
        raison: `= ${base} kg · séance difficile, on retente à la même charge`,
      };
    }

    // Garde-fou volume : si le groupe musculaire est hors zone hebdo (trop peu ou trop),
    // on bloque toute hausse de charge pour éviter la surcharge involontaire.
    const volStatus = getVolumeStatus(exo.groupe);
    if (volStatus.status !== 'ok') {
      const label = volStatus.status === 'low' ? 'insuffisant' : 'élevé';
      return {
        poids:  base,
        raison: `= ${base} kg · volume hebdo ${label} (${volStatus.count} sér./sem.), progression suspendue`,
      };
    }

    // Cooldown : compter le nombre de sessions effectuées à cette charge
    // On n'augmente jamais lors de la 1ère séance à un nouveau poids
    const sessionsABase = sessions.filter(s => (s.find(e => e.poids > 0)?.poids || 0) === base);
    const stableCount   = sessionsABase.length; // inclut la session d'aujourd'hui

    // Isolation : double progression — on privilégie d'abord la hausse de reps.
    // La charge ne bouge qu'une fois atteint le haut de la fourchette de reps.
    // (Combiné à stableCount >= 2 ci-dessous, cela garantit "plusieurs fois au sommet".)
    const range = getRepRange(block, exo);
    if (exo.type === 'isolation' && range && target < range.max) {
      return {
        poids:  base,
        raison: `= ${base} kg · isolation · vise ${range.max} reps avant d'augmenter (actuel : ${target})`,
      };
    }

    if (perf.allHit && stableCount >= 2) {
      // Vérifier que la session précédente à cette même charge était aussi complète
      const prevABase = sessionsABase[1]; // 2ème session à cette charge (avant aujourd'hui)
      const prevPerf  = analyzeSessionEntries(prevABase, target);
      if (prevPerf?.allHit) {
        // Signal doux "dur" : une séance validée mais ressentie dure ajoute
        // une stabilisation (3 séances réussies au lieu de 2). Jamais de
        // deload — juste un délai pour laisser la récupération rattraper.
        const hasDurSignal = perf.anyDur || prevPerf.anyDur;
        if (hasDurSignal) {
          const prev2ABase = sessionsABase[2];
          const prev2Perf  = prev2ABase ? analyzeSessionEntries(prev2ABase, target) : null;
          if (!prev2Perf?.allHit) {
            return {
              poids:  base,
              raison: `= ${base} kg · séance dure malgré la réussite, on stabilise encore`,
            };
          }
        }

        const nouveau = Math.round((base + step) / 2.5) * 2.5;
        const nbOk    = hasDurSignal ? 3 : 2;
        const raison  = (perf.anyFacile || prevPerf.anyFacile)
          ? `↑ +${step} kg · tu étais à l'aise (${base} → ${nouveau} kg)`
          : `↑ +${step} kg · ${nbOk} séances réussies à ${base} kg (→ ${nouveau} kg)`;
        return { poids: nouveau, raison };
      }
    }

    // Garder : 1ère séance à cette charge (cooldown) ou progression en cours
    return {
      poids:  base,
      raison: stableCount === 1
        ? `= ${base} kg · séance de stabilisation avant d'augmenter`
        : `= Même charge · continue à progresser sur les séries (${base} kg)`,
    };
  }

  // ── Cas 2 : pas d'historique → 1RM + objectif ──
  const baseObjectif = suggererPoidsObjectif(exo, block.objectif);
  if (baseObjectif) {
    const LABELS = { hypertrophie: 'Hypertrophie', force: 'Force', endurance: 'Endurance' };
    const rm     = calculerRMLocal(exo);
    const label  = LABELS[block.objectif] || '';
    return {
      poids:  baseObjectif,
      raison: rm
        ? `${label ? label + ' · ' : ''}1RM ≈ ${rm} kg → ${baseObjectif} kg conseillé`
        : null,
    };
  }

  // ── Cas 3 : compat anciens templates avec poids fixe ──
  if (block.poids) {
    return { poids: block.poids, raison: null };
  }

  return { poids: 0, raison: null };
}

/** Calcul 1RM local (Epley, meilleure série) — même logique qu'exercice.js */
function calculerRMLocal(exo) {
  if (!exo || exo.materiel === 'Poids du corps') return null;
  const entries = (exo.historique || []).filter(e => e.poids > 0 && e.reps > 0);
  if (!entries.length) return null;
  const best = Math.max(...entries.map(e => e.poids * (1 + e.reps / 30)));
  return Math.round(best * 2) / 2;
}

/**
 * Calcule le poids conseillé dynamiquement à partir du 1RM actuel et de l'objectif.
 * Appelé à chaque démarrage de série — reflète toujours la progression réelle.
 *
 * Ratios :
 *   hypertrophie poly  → 75 % (zone 70–85 %)
 *   hypertrophie iso   → 60 % (zone 50–70 %)
 *   force              → 87,5 % (zone 85–90 %)
 *   endurance          → 50 %
 *   libre ('')         → pas de suggestion (retourne 0)
 *
 * @param {object} exo      — exercice avec historique à jour
 * @param {string} objectif — 'hypertrophie' | 'force' | 'endurance' | ''
 * @returns {number} poids arrondi à 2,5 kg, ou 0 si aucun 1RM ou objectif libre
 */
function suggererPoidsObjectif(exo, objectif) {
  if (!objectif) return 0;                    // objectif 'libre' → pas de suggestion
  const rm = calculerRMLocal(exo);
  if (!rm) return 0;

  let ratio;
  if (objectif === 'force') {
    ratio = 0.875;
  } else if (objectif === 'endurance') {
    ratio = 0.50;
  } else {
    // hypertrophie (défaut)
    ratio = (exo.type === 'isolation') ? 0.60 : 0.75;
  }
  return Math.round(rm * ratio / 2.5) * 2.5;
}

/* ═══════════════════════════════════════════════════════════
   SON DE FIN DE REPOS
═══════════════════════════════════════════════════════════ */

function isSoundEnabled() {
  return localStorage.getItem('ft_sound_enabled') !== 'false';
}

function toggleSound() {
  localStorage.setItem('ft_sound_enabled', isSoundEnabled() ? 'false' : 'true');
  updateSoundToggle();
}

function updateSoundToggle() {
  const btn = document.getElementById('btn-sound-toggle');
  if (!btn) return;
  const on = isSoundEnabled();
  btn.setAttribute('aria-pressed', String(on));
  btn.classList.toggle('ws-sound-btn--off', !on);
  btn.innerHTML = on
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         width="15" height="15" aria-hidden="true">
         <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
         <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
         <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
       </svg>Son activé`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         width="15" height="15" aria-hidden="true">
         <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
         <line x1="23" y1="9" x2="17" y2="15"/>
         <line x1="17" y1="9" x2="23" y2="15"/>
       </svg>Son désactivé`;
}

/**
 * Joue un double bip (chime) de fin de repos via Web Audio API.
 * Fonctionne sans fichier externe. Ne joue rien si son désactivé.
 * Si l'app était en arrière-plan, le son se déclenche au retour
 * au premier plan (syncRestTimer → playRestEndSound).
 */
function playRestEndSound() {
  if (!isSoundEnabled()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [[880, 0], [1047, 0.2]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.36);
      osc.start(now + delay);
      osc.stop(now + delay + 0.4);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════
   ÉCRAN 4 : REST
═══════════════════════════════════════════════════════════ */
function startRest(secs, isLastSerie) {
  currentState = 'rest';
  restTotal    = secs || 90;
  restEndTime  = Date.now() + restTotal * 1000;

  let nextText;
  if (isLastSerie && currentExoIdx + 1 < exercises.length) {
    nextText = `Prochain : ${exercises[currentExoIdx + 1].exo.nom}`;
  } else {
    nextText = `Prochain : Série ${currentSerie + 1}`;
  }
  document.getElementById('rest-next-text').textContent = nextText;

  // Reset arc sans transition parasite
  const arc = document.getElementById('rest-arc');
  arc.style.transition       = 'none';
  arc.style.strokeDashoffset = 0;
  void arc.getBoundingClientRect(); // force reflow
  arc.style.transition = '';

  updateRestDisplay();
  showScreen('screen-rest');

  clearInterval(restTimer);
  restTimer = setInterval(tickRest, 1000);
}

/** Tick appelé toutes les secondes — calcule le restant depuis l'horloge réelle */
function tickRest() {
  updateRestDisplay();
  if (Date.now() >= restEndTime) {
    clearInterval(restTimer);
    playRestEndSound();
    advanceAfterRest();
  }
}

/**
 * Resynchronise le chrono après un retour en avant-plan.
 * Si le temps est déjà écoulé, avance directement.
 */
function syncRestTimer() {
  clearInterval(restTimer);
  updateRestDisplay();
  if (Date.now() >= restEndTime) {
    playRestEndSound();
    advanceAfterRest();
  } else {
    restTimer = setInterval(tickRest, 1000);
  }
}

function skipRest() {
  clearInterval(restTimer);
  advanceAfterRest();
}

function advanceAfterRest() {
  if (pendingLastSerie) {
    currentExoIdx++;
    currentSerie = 1;
  } else {
    currentSerie++;
  }
  showReady();
}

/* ═══════════════════════════════════════════════════════════
   ÉCRAN 5 : RÉCAP
═══════════════════════════════════════════════════════════ */
function showRecap() {
  currentState = 'recap';
  updateHeader();

  document.getElementById('recap-session-name').textContent = session.nom;

  const listEl = document.getElementById('recap-list');
  listEl.innerHTML = results.map((r, i) => {
    const block    = session.exercices[i] || {};
    const isCardio = r.groupe === 'Cardio';
    const couleur  = r.couleur || 'pecto';

    if (isCardio) {
      const c = r.cardio || {};
      const INTENSITE_LABELS = { faible: 'Faible', moderee: 'Modérée', elevee: 'Élevée' };
      return `
        <div class="ws-recap-exo">
          <div class="ws-recap-exo__header">
            <span class="ws-muscle-tag ws-muscle-tag--cardio">Cardio</span>
            <span class="ws-recap-exo__name">${r.nom}</span>
          </div>
          <div class="ws-recap-cardio">
            ${c.duree ? `<span class="ws-recap-cardio__val">${c.duree}</span><span class="ws-recap-cardio__label">min</span>` : ''}
            ${c.distance ? `<span class="ws-recap-cardio__val">${c.distance}</span><span class="ws-recap-cardio__label">km</span>` : ''}
            ${c.intensite ? `<span class="ws-recap-cardio__badge">${INTENSITE_LABELS[c.intensite] || c.intensite}</span>` : ''}
          </div>
        </div>`;
    }

    const RESSENTI_ICON = { facile: '💪', ok: '👍', dur: '😰' };
    const seriesHtml = r.series.map((s, idx) => {
      const miss = s.actual < s.planned;
      return `
        <div class="ws-recap-serie">
          <span class="ws-recap-serie__num">Série ${idx + 1}</span>
          <span class="ws-recap-serie__reps">
            <span class="${miss ? 'miss' : 'ok'}">${s.actual}</span>
            <span class="planned"> / ${s.planned} reps</span>
          </span>
          ${s.poids ? `<span class="ws-recap-serie__poids">${s.poids} kg</span>` : ''}
          ${s.ressenti ? `<span class="ws-recap-serie__ressenti" title="${s.ressenti}">${RESSENTI_ICON[s.ressenti] || ''}</span>` : ''}
          <span class="ws-recap-serie__time">${formatTime(s.duration)}</span>
        </div>`;
    }).join('');

    return `
      <div class="ws-recap-exo">
        <div class="ws-recap-exo__header">
          <span class="ws-muscle-tag ws-muscle-tag--${couleur}">${r.groupe}</span>
          <span class="ws-recap-exo__name">${r.nom}</span>
        </div>
        ${seriesHtml || '<div style="padding:.75rem 1rem;font-size:.8rem;color:#4b5563">Aucune série</div>'}
      </div>`;
  }).join('');

  // ── Suggestions bilan ──────────────────────────────────
  const suggestionsEl = document.getElementById('recap-suggestions');
  const suggestions   = buildRecapSuggestions();

  const SUGGESTION_ICONS = {
    'reps-up':     '💡',
    'reps-down':   '📉',
    'volume-low':  '🔴',
    'volume-ok':   '🟢',
    'volume-high': '⚠️',
  };

  if (suggestions.length > 0) {
    const isReps = s => s.type === 'reps-up' || s.type === 'reps-down';
    suggestionsEl.innerHTML = `
      <p class="ws-recap-section-title">Bilan &amp; suggestions</p>
      ${suggestions.map((s, idx) => `
        <div class="ws-recap-suggestion ws-recap-suggestion--${s.type}">
          <span class="ws-recap-suggestion__icon">${SUGGESTION_ICONS[s.type] || '💡'}</span>
          <div class="ws-recap-suggestion__body">
            <div class="ws-recap-suggestion__label">${s.label}</div>
            <div class="ws-recap-suggestion__text">${s.text}</div>
            ${isReps(s) ? `<button class="ws-apply-btn" data-suggestion-idx="${idx}"
              data-exo-id="${s.exoId}" data-suggested="${s.suggested}">
              Appliquer pour la prochaine séance
            </button>` : ''}
          </div>
        </div>`).join('')}`;

    // Attacher les listeners sur les boutons Appliquer
    suggestionsEl.querySelectorAll('.ws-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const exoId     = btn.dataset.exoId;
        const suggested = parseInt(btn.dataset.suggested);
        applyRepsSuggestion(exoId, suggested);
        btn.textContent = 'Appliqué ✓';
        btn.disabled    = true;
        btn.classList.add('ws-apply-btn--done');
      });
    });
  } else {
    suggestionsEl.innerHTML = '';
  }

  _renderRecapProgramme();
  showScreen('screen-recap');
}

/* ═══════════════════════════════════════════════════════════
   AUTO-AJUSTEMENT : ANALYSE REPS & VOLUME
═══════════════════════════════════════════════════════════ */

/**
 * Retourne la plage [min, max] de reps pour un objectif + type d'exercice donné.
 * Aligner avec OBJECTIF_PRESETS dans exercice.js.
 * Retourne null si l'objectif est "libre" (pas de contrainte).
 */
function getRepRange(block, exo) {
  const obj  = block.objectif || '';
  const type = exo.type       || '';
  if (obj === 'hypertrophie') {
    if (type === 'polyarticulaire') return { min: 6,  max: 10 };
    if (type === 'isolation')       return { min: 10, max: 20 };
    return { min: 6, max: 15 }; // défaut hypertrophie sans type précisé
  }
  if (obj === 'force')     return { min: 1,  max: 6  };
  if (obj === 'endurance') return { min: 15, max: 30 };
  return null; // 'libre' ou vide → pas de contrainte de plage
}

/**
 * Analyse les sessions PRÉCÉDENTES (pas aujourd'hui) pour suggérer un ajustement des reps.
 * Plus lent que le poids : nécessite 3 sessions passées pour augmenter, 2 pour diminuer.
 * Respecte la plage cible selon l'objectif du bloc (ex: hypertrophie 6–10 reps).
 *
 * @returns {{ type: 'increase'|'decrease', target: number, suggested: number }|null}
 */
function analyzeRepsProgression(exo, block) {
  const sessions = getHistByDate(exo);
  // On analyse les sessions PRÉCÉDENTES uniquement (sessions[0] = aujourd'hui)
  const prev = sessions.slice(1);
  if (!prev.length) return null;

  const target = parseInt(block.reps) || 10;
  const range  = getRepRange(block, exo);

  // ── Augmenter : 3 sessions précédentes toutes complètes ──
  // Bloqué si le volume hebdo du groupe est hors zone (garde-fou cohérent avec le poids).
  const volStatus = getVolumeStatus(exo.groupe);
  if (volStatus.status === 'ok' && prev.length >= 3) {
    const perfs       = prev.slice(0, 3).map(s => analyzeSessionEntries(s, target));
    const allThreeHit = perfs.every(p => p?.allHit);
    if (allThreeHit) {
      // Signal doux "dur" symétrique au poids : si l'une des 3 séances réussies
      // a été ressentie dure, on exige une 4ᵉ séance allHit avant d'augmenter.
      // Pas de deload — juste un délai pour laisser la fatigue retomber.
      const hasDurSignal = perfs.some(p => p?.anyDur);
      if (hasDurSignal) {
        const fourth = prev[3] ? analyzeSessionEntries(prev[3], target) : null;
        if (!fourth?.allHit) return null; // on stabilise, pas d'augmentation cette fois
      }
      if (range && target >= range.max) return null; // déjà au plafond de l'objectif
      // +1 rep par défaut (progression conservatrice) ; +2 pour les isolations
      const step      = exo.type === 'isolation' ? 2 : 1;
      const suggested = range ? Math.min(target + step, range.max) : target + step;
      return { type: 'increase', target, suggested };
    }
  }

  // ── Diminuer : 2 sessions précédentes ont raté la première série ──
  if (prev.length >= 2) {
    const bothFailed = prev.slice(0, 2).every(s => !analyzeSessionEntries(s, target)?.firstHit);
    if (bothFailed) {
      if (range && target <= range.min) return null; // déjà au plancher de l'objectif
      const suggested = range ? Math.max(target - 1, range.min) : Math.max(1, target - 1);
      return { type: 'decrease', target, suggested };
    }
  }

  return null;
}

/**
 * Calcule le nombre de séries par groupe musculaire sur les 7 derniers jours.
 * @returns {{ [groupe: string]: number }}
 */
function calculateWeeklyVolume() {
  const allExos  = DB.getAllExercices();
  const weekMs   = 7 * 24 * 60 * 60 * 1000;
  const nowMs    = Date.now();
  const volume   = {};

  allExos.forEach(exo => {
    (exo.historique || []).forEach(e => {
      if (!e.date) return;
      if (nowMs - new Date(e.date).getTime() <= weekMs) {
        volume[exo.groupe] = (volume[exo.groupe] || 0) + 1;
      }
    });
  });
  return volume;
}

/**
 * Retourne le statut du volume hebdomadaire d'un groupe musculaire.
 * @returns {{ status: 'low'|'ok'|'high', count: number }}
 */
function getVolumeStatus(groupe) {
  const vol   = calculateWeeklyVolume();
  const count = vol[groupe] || 0;
  const status = count < VOL_OPTIMAL_MIN ? 'low' : count > VOL_OPTIMAL_MAX ? 'high' : 'ok';
  return { status, count };
}

/**
 * Applique une suggestion de reps en mettant à jour le template en base.
 * Modifie session.exercices[i].reps pour l'exoId donné.
 */
function applyRepsSuggestion(exoId, newReps) {
  if (!session) return;
  const tpl = DB.getTemplate(session.id);
  if (!tpl) return;
  let changed = false;
  tpl.exercices.forEach(block => {
    if (block.exoId === exoId) {
      block.reps = newReps;
      changed = true;
    }
  });
  if (changed) {
    DB.updateTemplate(tpl);
    session = tpl; // mettre à jour la référence locale
  }
}

/**
 * Construit les suggestions à afficher dans le récap.
 * Appelé après saveAllResults() — les historiques sont déjà mis à jour.
 *
 * @returns {Array<{ type: string, label: string, text: string }>}
 */
function buildRecapSuggestions() {
  const suggestions = [];

  // ── 1. Reps : analyse par exercice ──────────────────────
  exercises.forEach(({ block, exo }) => {
    if (exo.groupe === 'Cardio') return; // pas de progression stricte pour le cardio
    const freshExo    = DB.getExercice(exo.id) || exo;
    const isBodyweight = exo.materiel === 'Poids du corps';
    const analysis    = analyzeRepsProgression(freshExo, block);
    if (!analysis) return;

    // Règle (charges seulement) : ne jamais ajuster poids ET reps dans le même sens.
    // Le poids a la priorité — si le poids est déjà ajusté dans la même direction,
    // on supprime la suggestion reps pour éviter une double réduction (ou double hausse).
    // En poids du corps, il n'y a pas de progression de charge → la suggestion reps
    // est l'unique levier mécanique, on ne la déduplique pas.
    if (!isBodyweight) {
      const sessionsAvecPoids = getHistByDate(freshExo).filter(s => s.some(e => e.poids > 0));
      if (sessionsAvecPoids.length) {
        const lastPoids           = sessionsAvecPoids[0].find(e => e.poids > 0)?.poids || 0;
        const { poids: newPoids } = calculerSuggestionPoids(freshExo, block);
        if (analysis.type === 'decrease' && newPoids < lastPoids) return; // poids baisse déjà → priorité poids
        if (analysis.type === 'increase' && newPoids > lastPoids) return; // poids monte déjà → priorité poids
      }
    }

    if (analysis.type === 'increase') {
      suggestions.push({
        type:      'reps-up',
        exoId:     exo.id,
        suggested: analysis.suggested,
        label:     exo.nom,
        text:      `Tu atteins facilement ${analysis.target} reps. Essaie ${analysis.suggested} la prochaine fois.`,
      });
    } else {
      suggestions.push({
        type:      'reps-down',
        exoId:     exo.id,
        suggested: analysis.suggested,
        label:     exo.nom,
        text:      `Tu rates l'objectif de ${analysis.target} reps. Essaie ${analysis.suggested} pour consolider.`,
      });
    }
  });

  // ── 2. Volume hebdomadaire par groupe musculaire ─────────
  const weeklyVol      = calculateWeeklyVolume();
  const groupesTrained = [...new Set(exercises.map(({ exo }) => exo.groupe))];

  groupesTrained.forEach(groupe => {
    if (groupe === 'Cardio') return; // volume cardio non mesuré en séries
    const count = weeklyVol[groupe] || 0;
    if (count < VOL_OPTIMAL_MIN) {
      suggestions.push({
        type:  'volume-low',
        label: groupe,
        text:  `${count} sér./sem. sur les ${groupe} (optimal : ${VOL_OPTIMAL_MIN}–${VOL_OPTIMAL_MAX}). Ajoute des séances ou des séries — les progressions poids/reps sont suspendues.`,
      });
    } else if (count > VOL_OPTIMAL_MAX) {
      suggestions.push({
        type:  'volume-high',
        label: groupe,
        text:  `${count} sér./sem. sur les ${groupe} — volume élevé. Les progressions sont suspendues. Réduis le volume pour mieux récupérer.`,
      });
    } else {
      suggestions.push({
        type:  'volume-ok',
        label: groupe,
        text:  `${count}/${VOL_OPTIMAL_MAX} sér./sem. sur les ${groupe} — volume optimal, progression autorisée.`,
      });
    }
  });

  return suggestions;
}

/* ═══════════════════════════════════════════════════════════
   CARDIO — MACHINE À ÉTATS
═══════════════════════════════════════════════════════════ */

function showCardioScreen() {
  const { block, exo } = exercises[currentExoIdx];
  currentState = 'cardio-run';
  updateHeader();

  setMuscleTag('cardio-muscle-tag', exo.groupe, exo.couleur);
  document.getElementById('cardio-exo-name').textContent = exo.nom;
  const plannedMin = block.duree || 30;
  document.getElementById('cardio-planned-val').textContent = `${plannedMin} min`;

  // Lancer le chrono
  clearInterval(cardioTimer);
  cardioStopwatchStart = Date.now();
  updateCardioStopwatch();
  cardioTimer = setInterval(updateCardioStopwatch, 1000);

  // Phase run visible, confirm caché
  document.getElementById('cardio-phase-run').hidden    = false;
  document.getElementById('cardio-phase-confirm').hidden = true;

  showScreen('screen-cardio');
}

function stopCardio() {
  clearInterval(cardioTimer);
  currentState = 'cardio-confirm';

  // Pré-remplir avec le temps réel arrondi à la minute (min 1 min)
  const elapsedSecs = Math.floor((Date.now() - cardioStopwatchStart) / 1000);
  const elapsedMins = Math.max(1, Math.round(elapsedSecs / 60));
  const dureeInput  = document.getElementById('cardio-duree-input');
  if (dureeInput) dureeInput.value = elapsedMins;

  cardioDistanceVal  = 0;
  cardioIntensiteVal = '';
  const distInput = document.getElementById('cardio-distance-input');
  if (distInput) distInput.value = '';
  document.querySelectorAll('#cardio-intensite-chips .cardio-intensite-chip').forEach(c => {
    c.classList.remove('cardio-intensite-chip--selected');
  });

  document.getElementById('cardio-phase-run').hidden    = true;
  document.getElementById('cardio-phase-confirm').hidden = false;

  // Sync état de l'input distance
  document.getElementById('cardio-distance-input')?.addEventListener('input', e => {
    cardioDistanceVal = parseFloat(e.target.value) || 0;
  }, { once: true });
}

function changeCardioValue(field, delta) {
  if (field === 'duree') {
    const input = document.getElementById('cardio-duree-input');
    const val   = Math.max(1, (parseInt(input?.value) || 1) + delta);
    if (input) input.value = val;
  } else if (field === 'distance') {
    cardioDistanceVal = Math.max(0, Math.round((cardioDistanceVal + delta) * 2) / 2);
    const input = document.getElementById('cardio-distance-input');
    if (input) input.value = cardioDistanceVal || '';
  }
}

function confirmCardio() {
  const dureeInput = document.getElementById('cardio-duree-input');
  const duree      = parseInt(dureeInput?.value) || 1;
  const distRaw    = parseFloat(document.getElementById('cardio-distance-input')?.value) || 0;
  const distance   = distRaw > 0 ? distRaw : null;
  const intensite  = cardioIntensiteVal || null;

  results[currentExoIdx].cardio = { duree, distance, intensite };

  const isLastExo = currentExoIdx >= exercises.length - 1;
  if (isLastExo) {
    saveAllResults();
    showRecap();
  } else {
    saveSessionState();
    currentExoIdx++;
    currentSerie = 1;
    showReady();
  }
}

function updateCardioStopwatch() {
  const el = document.getElementById('cardio-stopwatch');
  if (el) el.textContent = formatTime(Math.floor((Date.now() - cardioStopwatchStart) / 1000));
}

/* ═══════════════════════════════════════════════════════════
   SAUVEGARDE AUTOMATIQUE — REPRISE APRÈS INTERRUPTION
═══════════════════════════════════════════════════════════ */

/**
 * Persiste l'état courant de la séance dans localStorage.
 * Appelée après chaque série validée + lors de la navigation/fermeture.
 * Ne fait rien si la séance est terminée (état RECAP).
 */
function saveSessionState() {
  if (currentState === 'recap' || !session) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return;
  DB.setActiveSession({
    sessionId:     id,
    plannedId:     plannedId,
    sessionName:   session.nom,
    currentExoIdx: currentExoIdx,
    currentSerie:  currentSerie,
    results:       JSON.parse(JSON.stringify(results)),
    savedAt:       new Date().toISOString(),
  });
}

/* ═══════════════════════════════════════════════════════════
   SAUVEGARDE FINALE
═══════════════════════════════════════════════════════════ */
function saveAllResults() {
  results.forEach((r, i) => {
    const block    = (session.exercices || [])[i] || {};
    const exo      = exercises[i]?.exo;
    const isCardio = exo?.groupe === 'Cardio';

    if (isCardio) {
      const c = r.cardio;
      if (c && c.duree) {
        DB.addHistoriqueEntry(r.exoId, {
          titre:     session.nom,
          duree:     c.duree,
          distance:  c.distance ?? null,
          intensite: c.intensite ?? null,
        });
      }
      return;
    }

    if (!r.series.length) return;

    // Sauvegarder chaque série individuellement pour un 1RM précis
    r.series.forEach((s, idx) => {
      DB.addHistoriqueEntry(r.exoId, {
        titre:       session.nom,
        series:      idx + 1,
        reps:        s.actual,
        repos:       block.repos || '',
        poids:       s.poids ?? null,
        ressenti:    s.ressenti || null,
        repsObjectif: parseInt(block.reps) || null,
      });
    });
  });
  // Marquer la séance planifiée comme terminée (si démarrée depuis le planning)
  if (plannedId) {
    DB.completePlanned(plannedId);
  }
  DB.clearActiveSession();
}

/* ═══════════════════════════════════════════════════════════
   QUITTER
═══════════════════════════════════════════════════════════ */
function confirmQuit() {
  if (currentState === 'recap') {
    location.href = 'musculation.html';
    return;
  }
  if (confirm('Quitter la séance en cours ?\nTa progression ne sera pas sauvegardée.')) {
    clearInterval(stopwatchTimer);
    clearInterval(restTimer);
    clearInterval(cardioTimer);
    DB.clearActiveSession();
    location.href = 'musculation.html';
  }
}

/* ═══════════════════════════════════════════════════════════
   UTILITAIRES
═══════════════════════════════════════════════════════════ */
function updateHeader() {
  const counterEl = document.getElementById('ws-exo-counter');
  const dotsEl    = document.getElementById('ws-dots');
  if (!counterEl || !dotsEl) return;

  if (currentState === 'recap') {
    counterEl.textContent = '✓';
    dotsEl.innerHTML = '';
    return;
  }

  counterEl.textContent = `${currentExoIdx + 1}/${exercises.length}`;

  const { block, exo } = exercises[currentExoIdx];

  if (exo.groupe === 'Cardio') {
    dotsEl.innerHTML = '<span class="ws-dot ws-dot--current"></span>';
    return;
  }

  const n = parseInt(block.series) || 1;
  dotsEl.innerHTML = Array.from({ length: n }, (_, i) => {
    if (i + 1 < currentSerie)   return '<span class="ws-dot ws-dot--done"></span>';
    if (i + 1 === currentSerie) return '<span class="ws-dot ws-dot--current"></span>';
    return '<span class="ws-dot"></span>';
  }).join('');
}

function setMuscleTag(elementId, groupe, couleur) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = groupe || '—';
  el.className   = `ws-muscle-tag ws-muscle-tag--${couleur || 'pecto'}`;
}

function updateStopwatch() {
  const el = document.getElementById('ws-stopwatch');
  if (el) el.textContent = formatTime(Math.floor((Date.now() - stopwatchStart) / 1000));
}

function updateRestDisplay() {
  const remaining = Math.max(0, Math.ceil((restEndTime - Date.now()) / 1000));
  const timeEl    = document.getElementById('rest-time');
  const arc       = document.getElementById('rest-arc');
  if (timeEl) timeEl.textContent = formatTime(remaining);
  if (arc) {
    const fraction = restTotal > 0 ? remaining / restTotal : 1;
    arc.style.strokeDashoffset = CIRC * (1 - fraction);
  }
}

function formatTime(secs) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Parse le champ repos en secondes.
 * Accepte : "90 s", "90", "1 min 30", "2 min", "1min30s", "2:00", etc.
 */
function parseRepos(str) {
  if (!str) return 90;
  const s = String(str).toLowerCase().trim();

  // "1:30" ou "2:00"
  const colonFmt = s.match(/^(\d+):(\d{2})$/);
  if (colonFmt) return parseInt(colonFmt[1]) * 60 + parseInt(colonFmt[2]);

  // "1 min 30" ou "1min30s"
  const minSec = s.match(/(\d+)\s*min\s*(\d+)/);
  if (minSec)  return parseInt(minSec[1]) * 60 + parseInt(minSec[2]);

  // "2 min"
  const minOnly = s.match(/(\d+)\s*min/);
  if (minOnly) return parseInt(minOnly[1]) * 60;

  // "90 s" ou "90"
  const secOnly = s.match(/(\d+)/);
  return secOnly ? parseInt(secOnly[1]) : 90;
}
