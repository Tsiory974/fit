/**
 * FitTrack — Page Profil
 * ======================
 * Export / Import localStorage (sauvegarde des données)
 */

(function () {
  'use strict';

  const QUICK_SAVE_KEY = 'ft_quick_save';

  /* ════════════════════════════════════════════════
     SAUVEGARDE RAPIDE (localStorage interne)
  ════════════════════════════════════════════════ */

  function _collectData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === QUICK_SAVE_KEY) continue; // ne pas inclure la sauvegarde elle-même
      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch (e) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  }

  function quickSave() {
    const data = _collectData();
    const snapshot = { savedAt: new Date().toISOString(), data };
    localStorage.setItem(QUICK_SAVE_KEY, JSON.stringify(snapshot));
    _refreshQuickSaveUI();
    showToast('Sauvegarde enregistrée ✓');
  }

  function quickRestore() {
    const raw = localStorage.getItem(QUICK_SAVE_KEY);
    if (!raw) return;

    let snapshot;
    try { snapshot = JSON.parse(raw); } catch (e) { return; }

    const confirmed = window.confirm(
      'Cela remplacera vos données actuelles par la sauvegarde du ' +
      _formatDate(snapshot.savedAt) + '.\n\nContinuer ?'
    );
    if (!confirmed) return;

    // Supprimer toutes les clés sauf la sauvegarde
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== QUICK_SAVE_KEY) keysToDelete.push(k);
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));

    // Réécrire les données sauvegardées
    for (const [key, value] of Object.entries(snapshot.data || {})) {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch (e) {
        console.warn('[Profil] Restauration — clé:', key, e);
      }
    }

    showToast('Données restaurées ✓ Rechargement…');
    setTimeout(() => location.reload(), 1200);
  }

  function _refreshQuickSaveUI() {
    const raw = localStorage.getItem(QUICK_SAVE_KEY);
    const hintEl   = document.getElementById('quick-save-hint');
    const restoreBtn = document.getElementById('btn-quick-restore');

    if (!raw) {
      if (hintEl) hintEl.textContent = 'Enregistre un point de restauration dans l\'application';
      if (restoreBtn) restoreBtn.hidden = true;
      return;
    }

    try {
      const snapshot = JSON.parse(raw);
      if (hintEl) hintEl.textContent = 'Dernière sauvegarde : ' + _formatDate(snapshot.savedAt);
      if (restoreBtn) restoreBtn.hidden = false;
    } catch (e) {}
  }

  function _formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
           ' à ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ════════════════════════════════════════════════
     EXPORT
  ════════════════════════════════════════════════ */

  function exportData() {
    const data = _collectData();

    if (Object.keys(data).length === 0) {
      showToast('Aucune donnée à exporter', true);
      return;
    }

    const json    = JSON.stringify(data, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href     = url;
    anchor.download = 'fitness-backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showToast('Sauvegarde exportée ✓');
  }

  /* ════════════════════════════════════════════════
     IMPORT
  ════════════════════════════════════════════════ */

  function importData(file) {
    const reader = new FileReader();

    reader.onload = function (e) {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch (err) {
        showImportError('Fichier invalide. Assurez-vous que c\'est un fichier JSON FitTrack.');
        return;
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        showImportError('Format de fichier non reconnu.');
        return;
      }

      const confirmed = window.confirm(
        'Cela remplacera TOUTES vos données actuelles par celles du fichier importé.\n\nContinuer ?'
      );
      if (!confirmed) return;

      // Remplacer le localStorage
      localStorage.clear();
      for (const [key, value] of Object.entries(parsed)) {
        try {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch (e) {
          console.warn('[Profil] Import — impossible d\'écrire la clé:', key, e);
        }
      }

      showToast('Import réussi ✓ Rechargement…');

      setTimeout(() => {
        location.reload();
      }, 1200);
    };

    reader.onerror = function () {
      showImportError('Impossible de lire le fichier.');
    };

    reader.readAsText(file);
  }

  /* ════════════════════════════════════════════════
     UI — TOAST
  ════════════════════════════════════════════════ */

  let _toastTimer = null;

  function showToast(msg, isError) {
    const toast = document.getElementById('profil-toast');
    if (!toast) return;

    if (_toastTimer) clearTimeout(_toastTimer);

    toast.textContent = msg;
    toast.classList.toggle('profil-toast--error', !!isError);
    toast.hidden = false;
    // forcer reflow
    toast.offsetHeight; // eslint-disable-line no-unused-expressions
    toast.classList.add('profil-toast--show');

    _toastTimer = setTimeout(() => {
      toast.classList.remove('profil-toast--show');
      setTimeout(() => { toast.hidden = true; }, 280);
    }, 2800);
  }

  function showImportError(msg) {
    const el = document.getElementById('import-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearImportError() {
    const el = document.getElementById('import-error');
    if (el) el.hidden = true;
  }

  /* ════════════════════════════════════════════════
     OBJECTIF NUTRITIONNEL
  ════════════════════════════════════════════════ */

  /** Lit le formulaire et retourne un objet profil partiel (peut être incomplet) */
  function _readForm() {
    return {
      poids:    parseFloat(document.getElementById('p-poids')?.value)   || null,
      taille:   parseFloat(document.getElementById('p-taille')?.value)  || null,
      sexe:     document.querySelector('input[name="p-sexe"]:checked')?.value || 'homme',
      activite: parseFloat(document.getElementById('p-activite')?.value) || 1.55,
      objectif: document.querySelector('input[name="p-objectif"]:checked')?.value || 'perte',
    };
  }

  /** Met à jour l'affichage du bloc résumé depuis les valeurs courantes du formulaire */
  function _updateSummary() {
    const form = _readForm();
    const summaryEl = document.getElementById('p-summary');
    if (!summaryEl) return;

    if (!form.poids || !form.taille) {
      summaryEl.hidden = true;
      return;
    }

    // Calcul inline (même formule que PROFIL_DB.calcGoals)
    const tailleM  = form.taille / 100;
    const poidsRef = Math.round(24 * tailleM * tailleM * 10) / 10;
    const activite = form.activite || 1.55;

    let kcal, p, l, g;
    if (form.objectif === 'maintien') {
      const caloriesBase = form.sexe === 'femme' ? form.poids * 22.5 : form.poids * 24;
      kcal = Math.round(caloriesBase * activite);
      p    = Math.round(form.poids * 1.6);
      l    = Math.round(form.poids * 0.9);
      g    = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
    } else {
      const caloriesBase = form.sexe === 'femme' ? poidsRef * 22.5 : poidsRef * 24;
      kcal = Math.round(caloriesBase * activite);
      p    = Math.round(poidsRef * 1.8);
      l    = Math.round(poidsRef * 0.9);
      g    = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
    }

    document.getElementById('p-summary-kcal').textContent = kcal;
    document.getElementById('p-summary-p').textContent    = p;
    document.getElementById('p-summary-g').textContent    = g;
    document.getElementById('p-summary-l').textContent    = l;

    // Projection temporelle
    const projEl = document.getElementById('p-summary-projection');
    if (projEl) {
      if (form.objectif === 'maintien') {
        projEl.textContent = 'Objectif : équilibre calorique';
        projEl.hidden = false;
      } else {
        // Déficit = TDEE du poids actuel − kcal cible (poidsRef)
        const tdeeActuel = Math.round(
          (form.sexe === 'femme' ? form.poids * 22.5 : form.poids * 24) * activite
        );
        const deficit = tdeeActuel - kcal;
        if (deficit > 150) {
          const perteHebdo = (deficit * 7) / 7700;
          // Arrondi à 0,5 le plus proche pour un affichage lisible
          const perteArr = Math.round(perteHebdo * 2) / 2;
          projEl.textContent = 'Rythme estimé : ~' + perteArr.toFixed(1).replace('.', ',') + ' kg / semaine';
          projEl.hidden = false;
        } else {
          projEl.hidden = true;
        }
      }
    }

    summaryEl.hidden = false;
  }

  /** Remplit le panel Avancé avec les détails du calcul (depuis le profil sauvegardé) */
  function _renderAvance() {
    const block = document.getElementById('profil-avance-block');
    if (!block) return;

    const prof = window.PROFIL_DB?.get();
    if (!prof || !prof.poids || !prof.taille) {
      block.innerHTML = '<p class="profil-avance-empty">Configure et enregistre ton profil dans l\'onglet Objectif pour voir les détails.</p>';
      return;
    }

    const tailleM  = prof.taille / 100;
    const activite = parseFloat(prof.activite) || 1.55;
    const objectif = prof.objectif || 'perte';
    const imc      = Math.round((prof.poids / (tailleM * tailleM)) * 10) / 10;
    const poidsRef = Math.round(24 * tailleM * tailleM * 10) / 10;

    let caloriesBase, kcal, p, l, g, baseLabel;

    if (objectif === 'maintien') {
      caloriesBase = Math.round(prof.sexe === 'femme' ? prof.poids * 22.5 : prof.poids * 24);
      kcal         = Math.round(caloriesBase * activite);
      p            = Math.round(prof.poids * 1.6);
      l            = Math.round(prof.poids * 0.9);
      g            = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
      baseLabel    = 'Calories de base (poids actuel)';
    } else {
      caloriesBase = Math.round(prof.sexe === 'femme' ? poidsRef * 22.5 : poidsRef * 24);
      kcal         = Math.round(caloriesBase * activite);
      p            = Math.round(poidsRef * 1.8);
      l            = Math.round(poidsRef * 0.9);
      g            = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
      baseLabel    = 'Calories de base (poids de référence)';
    }

    function _row(label, val) {
      return '<div class="profil-avance-row">' +
        '<span class="profil-avance-row__label">' + label + '</span>' +
        '<span class="profil-avance-row__val">' + val + '</span>' +
        '</div>';
    }

    const objectifLabel = objectif === 'maintien' ? 'Maintien' : 'Perte de gras';

    block.innerHTML =
      _row('Objectif', objectifLabel) +
      _row('IMC actuel', imc) +
      _row('Poids de référence (IMC 24)', poidsRef + ' kg') +
      _row(baseLabel, caloriesBase + ' kcal') +
      _row('Calories journalières (× activité)', kcal + ' kcal') +
      '<div class="profil-avance-separator"></div>' +
      _row('Protéines cibles', p + ' g / jour') +
      _row('Lipides cibles', l + ' g / jour') +
      _row('Glucides cibles', g + ' g / jour');
  }

  /** Affiche la dernière pesée enregistrée dans le profil */
  function _renderPoidsInfo() {
    const block  = document.getElementById('p-poids-info');
    const valEl  = document.getElementById('p-poids-info-val');
    if (!block || !valEl) return;

    const prof = window.PROFIL_DB?.get();
    if (!prof || !prof.poids) {
      block.hidden = true;
      return;
    }

    let txt = prof.poids + ' kg';
    if (prof.savedAt) {
      const d = new Date(prof.savedAt);
      if (!isNaN(d)) {
        txt += ' · ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      }
    }
    valEl.textContent = txt;
    block.hidden = false;
  }

  /** Charge le profil sauvegardé dans le formulaire */
  function _loadObjectif() {
    const prof = window.PROFIL_DB?.get();
    if (!prof) return;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    const setRadio = (name, val) => {
      const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (el) el.checked = true;
    };
    const setSelect = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null) {
        const opt = el.querySelector(`option[value="${val}"]`);
        if (opt) el.value = val;
      }
    };

    setVal('p-poids',        prof.poids);
    setVal('p-taille',       prof.taille);
    setRadio('p-sexe',       prof.sexe || 'homme');
    setSelect('p-activite',  prof.activite);
    setRadio('p-objectif',   prof.objectif || 'perte');

    _updateSummary();
    _renderPoidsInfo();
  }

  /** Soumission du formulaire profil */
  function _saveObjectif(e) {
    e.preventDefault();
    const form = _readForm();

    if (!form.poids || !form.taille) {
      showToast('Remplis le poids et la taille.', true);
      return;
    }

    window.PROFIL_DB.save(form);
    showToast('Profil enregistré ✓');
    _updateSummary();
    _renderPoidsInfo();
    _renderAvance();
  }

  /* ════════════════════════════════════════════════
     SUIVI DU POIDS
  ════════════════════════════════════════════════ */

  function _renderWeightSection() {
    const trendBlock   = document.getElementById('weight-trend-block');
    const historyBlock = document.getElementById('weight-history-block');
    if (!trendBlock || !historyBlock) return;

    const trend   = window.WEIGHT_DB?.getTrend();
    const entries = window.WEIGHT_DB?.getAll() || [];

    // ── Tendance ──
    if (!trend) {
      const msg = entries.length === 0
        ? 'Enregistre ta première pesée ci-dessous.'
        : 'Enregistre encore quelques pesées sur 7 jours pour voir ta tendance.';
      trendBlock.innerHTML = '<p class="weight-trend-empty">' + msg + '</p>';
    } else {
      const signe    = trend.perWeek > 0 ? '+' : '';
      const val      = signe + trend.perWeek.toFixed(1).replace('.', ',') + ' kg / sem';
      const cls      = trend.perWeek < -0.05 ? 'weight-trend--down'
                     : trend.perWeek > 0.05  ? 'weight-trend--up'
                     : 'weight-trend--stable';
      const lbl      = trend.perWeek < -0.05 ? 'En baisse'
                     : trend.perWeek > 0.05  ? 'En hausse'
                     : 'Stable';
      const period   = 'sur ' + trend.totalDays + ' jours · ' + trend.count + ' pesées';
      trendBlock.innerHTML =
        '<div class="weight-trend ' + cls + '">' +
          '<div class="weight-trend__main">' +
            '<span class="weight-trend__val">' + val + '</span>' +
            '<span class="weight-trend__lbl">' + lbl + '</span>' +
          '</div>' +
          '<p class="weight-trend__period">' + period + '</p>' +
        '</div>';
    }

    // ── Historique (5 dernières, ordre chronologique inversé) ──
    if (entries.length === 0) {
      historyBlock.innerHTML = '';
      return;
    }
    const recent = entries.slice(-5).reverse();
    historyBlock.innerHTML =
      '<div class="weight-history">' +
      recent.map((e, i) => {
        const d       = new Date(e.date + 'T00:00:00');
        const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        const prev    = i < recent.length - 1 ? recent[i + 1] : null;
        let diffHtml  = '';
        if (prev) {
          const d = Math.round((e.poids - prev.poids) * 10) / 10;
          if (d !== 0) {
            const dStr = (d > 0 ? '+' : '') + d.toFixed(1).replace('.', ',');
            const dCls = d < 0 ? 'weight-history-diff--down' : 'weight-history-diff--up';
            diffHtml = '<span class="weight-history-diff ' + dCls + '">' + dStr + '</span>';
          }
        }
        return '<div class="weight-history-row">' +
          '<span class="weight-history-row__date">' + dateStr + '</span>' +
          '<span class="weight-history-row__right">' +
            '<span class="weight-history-row__poids">' + e.poids + ' kg</span>' +
            diffHtml +
          '</span>' +
        '</div>';
      }).join('') +
      '</div>';
  }

  function _initWeightForm() {
    // Pré-remplir la date avec aujourd'hui
    const dateInput = document.getElementById('w-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = window.localDateStr ? window.localDateStr() : new Date().toISOString().slice(0, 10);
    }

    document.getElementById('btn-add-weight')?.addEventListener('click', () => {
      const poidsVal = parseFloat(document.getElementById('w-poids')?.value);
      const dateVal  = document.getElementById('w-date')?.value;
      if (!poidsVal || poidsVal < 20 || poidsVal > 400) {
        showToast('Saisis un poids valide.', true);
        return;
      }
      if (!dateVal) {
        showToast('Sélectionne une date.', true);
        return;
      }
      window.WEIGHT_DB.add(dateVal, poidsVal);
      document.getElementById('w-poids').value = '';
      _renderWeightSection();
      showToast('Pesée enregistrée ✓');
    });
  }

  /* ════════════════════════════════════════════════
     PROGRAMME
  ════════════════════════════════════════════════ */

  const DEFAULT_PHASES = [
    { nom: 'Phase 1 – Base hypertrophie',  orientation: 'Base hypertrophie',  durationWeeks: 8, repsMin: 8,  repsMax: 12,
      objectif: 'Hypertrophie – base et progression',
      regles: ['Garder 1–2 reps en réserve', 'Pas d\'échec forcé', 'Compatible cardio élevé'] },
    { nom: 'Phase 2 – Tension progressive', orientation: 'Tension progressive', durationWeeks: 8, repsMin: 6,  repsMax: 10,
      objectif: 'Charge progressive – tension musculaire',
      regles: ['Garder 1–2 reps en réserve', 'Progression hebdomadaire visée'] },
    { nom: 'Phase 3 – Congestion',          orientation: 'Congestion',          durationWeeks: 8, repsMin: 10, repsMax: 15,
      objectif: 'Volume et pump – finition du cycle',
      regles: ['Volume élevé', 'Repos courts', '1–2 reps en réserve'] },
  ];

  function _renderPhasesForm(phases) {
    const list = document.getElementById('prog-phases-list');
    if (!list) return;
    list.innerHTML = phases.map((ph, i) => `
      <div class="prog-phase-card" data-idx="${i}">
        <div class="prog-phase-card__header">
          <span class="prog-phase-card__num">Phase ${i + 1}</span>
          <button type="button" class="prog-phase-card__remove" data-idx="${i}"
                  aria-label="Supprimer cette phase" ${phases.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
        <div class="profil-form-row">
          <div class="profil-form-field">
            <label class="profil-form-label" for="ph-nom-${i}">Nom</label>
            <input type="text" id="ph-nom-${i}" class="profil-input ph-nom"
                   value="${_esc(ph.nom)}" placeholder="Phase ${i + 1}" data-idx="${i}">
          </div>
          <div class="profil-form-field">
            <label class="profil-form-label" for="ph-weeks-${i}">Durée (sem.)</label>
            <input type="number" id="ph-weeks-${i}" class="profil-input ph-weeks"
                   value="${ph.durationWeeks}" min="1" max="52" step="1" data-idx="${i}">
          </div>
        </div>
        <div class="profil-form-row">
          <div class="profil-form-field">
            <label class="profil-form-label" for="ph-rmin-${i}">Reps min</label>
            <input type="number" id="ph-rmin-${i}" class="profil-input ph-rmin"
                   value="${ph.repsMin}" min="1" max="50" step="1" data-idx="${i}">
          </div>
          <div class="profil-form-field">
            <label class="profil-form-label" for="ph-rmax-${i}">Reps max</label>
            <input type="number" id="ph-rmax-${i}" class="profil-input ph-rmax"
                   value="${ph.repsMax}" min="1" max="50" step="1" data-idx="${i}">
          </div>
        </div>
        <div class="profil-form-field">
          <label class="profil-form-label" for="ph-obj-${i}">Objectif de la phase</label>
          <input type="text" id="ph-obj-${i}" class="profil-input ph-obj"
                 value="${_esc(ph.objectif || '')}"
                 placeholder="ex : Hypertrophie – base et progression" maxlength="80" data-idx="${i}">
        </div>
        <div class="profil-form-field">
          <label class="profil-form-label" for="ph-regles-${i}">Règles clés <span class="profil-form-label--hint">(une par ligne, optionnel)</span></label>
          <textarea id="ph-regles-${i}" class="profil-input ph-regles"
                    rows="2" placeholder="ex : Garder 1–2 reps en réserve" data-idx="${i}">${_esc((ph.regles || []).join('\n'))}</textarea>
        </div>
      </div>`).join('');

    list.querySelectorAll('.prog-phase-card__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const cur = _readPhasesFromForm();
        cur.splice(idx, 1);
        _renderPhasesForm(cur);
        _updateTotalWeeks();
      });
    });

    list.querySelectorAll('.ph-weeks, .ph-rmin, .ph-rmax').forEach(inp => {
      inp.addEventListener('input', _updateTotalWeeks);
    });
  }

  function _readPhasesFromForm() {
    const list = document.getElementById('prog-phases-list');
    if (!list) return [];
    const cards = list.querySelectorAll('.prog-phase-card');
    return Array.from(cards).map((_, i) => {
      const reglesRaw = (document.getElementById('ph-regles-' + i)?.value || '').trim();
      return {
        nom:           (document.getElementById('ph-nom-' + i)?.value   || '').trim() || ('Phase ' + (i + 1)),
        orientation:   '',
        durationWeeks: parseInt(document.getElementById('ph-weeks-' + i)?.value) || 8,
        repsMin:       parseInt(document.getElementById('ph-rmin-' + i)?.value)  || 8,
        repsMax:       parseInt(document.getElementById('ph-rmax-' + i)?.value)  || 12,
        objectif:      (document.getElementById('ph-obj-' + i)?.value    || '').trim(),
        regles:        reglesRaw ? reglesRaw.split('\n').map(l => l.trim()).filter(Boolean) : [],
      };
    });
  }

  function _updateTotalWeeks() {
    const phases = _readPhasesFromForm();
    const total  = phases.reduce((s, p) => s + p.durationWeeks, 0);
    const el     = document.getElementById('prog-total-weeks');
    if (el) el.textContent = 'Durée totale : ' + total + ' semaines';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _renderProgSummary() {
    const block = document.getElementById('prog-summary-block');
    if (!block || !window.PROGRAMME_DB) return;

    const prog = window.PROGRAMME_DB.get();
    if (!prog) { block.hidden = true; return; }

    const info       = window.PROGRAMME_DB.getActivePhase(prog);
    const totalWeeks = window.PROGRAMME_DB.getTotalWeeks(prog);
    const weekNow    = window.PROGRAMME_DB.getCurrentWeek(prog);

    const phaseText = info
      ? (info.phase.nom || ('Phase ' + (info.phaseIndex + 1))) +
        ' · ' + info.phase.repsMin + '–' + info.phase.repsMax + ' reps' +
        ' · Sem. ' + info.weekInPhase + '/' + info.totalWeeksInPhase
      : 'Programme terminé';

    block.innerHTML =
      '<div class="profil-section__header">' +
        '<span class="prog-summary-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
          ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
          '<polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '</span>' +
        '<div>' +
          '<h2 class="profil-section__title">' + _esc(prog.nom) + '</h2>' +
          '<p class="profil-section__desc">' + phaseText + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="prog-summary-bar-wrap">' +
        '<div class="prog-summary-bar" style="width:' + Math.min(100, Math.round(weekNow / totalWeeks * 100)) + '%"></div>' +
      '</div>' +
      '<p class="prog-summary-weeks">Semaine ' + Math.min(weekNow, totalWeeks) + ' / ' + totalWeeks + '</p>' +
      (info ? '<button type="button" class="prog-phase-detail-btn" data-idx="' + info.phaseIndex + '">Détail de la phase →</button>' : '');

    block.hidden = false;

    block.querySelector('.prog-phase-detail-btn')?.addEventListener('click', function () {
      if (window.PhaseDetail) window.PhaseDetail.open(prog, parseInt(this.dataset.idx, 10));
    });
  }

  function _loadProgForm() {
    const prog     = window.PROGRAMME_DB?.get();
    const titleEl  = document.getElementById('prog-form-title');
    const deleteBtn = document.getElementById('btn-delete-prog');

    if (prog) {
      if (titleEl) titleEl.textContent = 'Modifier le programme';
      if (deleteBtn) deleteBtn.hidden = false;
      const nomEl   = document.getElementById('prog-nom');
      const startEl = document.getElementById('prog-start');
      if (nomEl)   nomEl.value   = prog.nom || '';
      if (startEl) startEl.value = prog.startDate || '';
      _renderPhasesForm(prog.phases || DEFAULT_PHASES);
    } else {
      if (titleEl) titleEl.textContent = 'Créer un programme';
      if (deleteBtn) deleteBtn.hidden = true;
      const startEl = document.getElementById('prog-start');
      if (startEl) startEl.value = window.localDateStr ? window.localDateStr() : new Date().toISOString().slice(0, 10);
      _renderPhasesForm(DEFAULT_PHASES);
    }
    _updateTotalWeeks();
  }

  function _bindProgramme() {
    if (!window.PROGRAMME_DB) return;

    _renderProgSummary();
    _loadProgForm();

    document.getElementById('btn-add-phase')?.addEventListener('click', () => {
      const cur = _readPhasesFromForm();
      cur.push({ nom: 'Phase ' + (cur.length + 1), orientation: '', durationWeeks: 8, repsMin: 8, repsMax: 12 });
      _renderPhasesForm(cur);
      _updateTotalWeeks();
    });

    document.getElementById('prog-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const nom    = document.getElementById('prog-nom')?.value.trim();
      const start  = document.getElementById('prog-start')?.value;
      const phases = _readPhasesFromForm();

      if (!nom)   { showToast('Saisis un nom de programme.', true); return; }
      if (!start) { showToast('Sélectionne une date de début.', true); return; }
      if (phases.length === 0) { showToast('Ajoute au moins une phase.', true); return; }

      const existing = window.PROGRAMME_DB.get();
      const prog = {
        id:         existing?.id || ('prog-' + Date.now()),
        nom,
        startDate:  start,
        phases,
      };
      window.PROGRAMME_DB.save(prog);
      _renderProgSummary();
      document.getElementById('prog-form-title').textContent = 'Modifier le programme';
      document.getElementById('btn-delete-prog').hidden = false;
      showToast('Programme enregistré ✓');
    });

    document.getElementById('btn-delete-prog')?.addEventListener('click', () => {
      if (!confirm('Supprimer le programme ? Cette action est irréversible.')) return;
      window.PROGRAMME_DB.remove();
      _loadProgForm();
      _renderProgSummary();
      showToast('Programme supprimé.');
    });
  }

  /* ════════════════════════════════════════════════
     BIND EVENTS
  ════════════════════════════════════════════════ */

  function init() {
    // ── Formulaire objectif ──
    _loadObjectif();
    _renderAvance();

    // ── Suivi du poids ──
    _renderWeightSection();
    _initWeightForm();

    const form = document.getElementById('profil-objectif-form');
    if (form) {
      form.addEventListener('submit', _saveObjectif);
      form.addEventListener('input', _updateSummary);
      form.addEventListener('change', _updateSummary);
    }

    // ── Sauvegarde rapide ──
    _refreshQuickSaveUI();
    document.getElementById('btn-quick-save')?.addEventListener('click', quickSave);
    document.getElementById('btn-quick-restore')?.addEventListener('click', quickRestore);

    // Programme
    _bindProgramme();

    // Export
    document.getElementById('btn-export')?.addEventListener('click', exportData);

    // Sélection de fichier
    const fileInput  = document.getElementById('import-file-input');
    const fileLabel  = document.getElementById('import-file-label');
    const fileNameEl = document.getElementById('import-file-name');
    const btnImport  = document.getElementById('btn-import');

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files[0];
      clearImportError();

      if (file) {
        fileNameEl.textContent = file.name;
        fileLabel.classList.add('has-file');
        btnImport.disabled = false;
      } else {
        fileNameEl.textContent = 'Choisir un fichier .json';
        fileLabel.classList.remove('has-file');
        btnImport.disabled = true;
      }
    });

    // Import
    btnImport?.addEventListener('click', () => {
      const file = fileInput?.files[0];
      if (!file) return;
      clearImportError();
      importData(file);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
