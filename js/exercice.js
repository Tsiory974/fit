/**
 * FitTrack — Page Exercice
 * ========================
 * 1. Lit l'ID de l'exercice depuis l'URL (?id=slug)
 * 2. Charge les données depuis localStorage via DB
 * 3. Affiche l'écran onboarding (saisie 1RM) ou la page principale
 * 4. Met à jour toutes les valeurs dynamiques : zones, graphique, historique
 */

/**
 * Table des préconisations par objectif et type d'exercice.
 * Pour ajouter un objectif (force, endurance…) : ajouter une entrée ici.
 *
 * Chaque preset contient :
 *   reps       : plage de répétitions recommandée
 *   intensite  : plage % du 1RM
 *   repos      : temps de récupération entre séries
 *   series     : nombre de séries recommandé
 */
const OBJECTIF_PRESETS = {
  hypertrophie: {
    label: 'Hypertrophie',
    types: {
      polyarticulaire: {
        reps:      '6–10 reps',
        intensite: '70–85 % du 1RM',
        repos:     '2–3 min',
        series:    '3–5 séries',
        note:      'Exercice polyarticulaire — charge lourde, recrutement musculaire maximal.',
      },
      isolation: {
        reps:      '10–20 reps',
        intensite: '50–70 % du 1RM',
        repos:     '45–90 s',
        series:    '3–4 séries',
        note:      'Exercice d\'isolation — volume élevé, tension musculaire prolongée.',
      },
    },
    fallback: {
      reps:      '8–15 reps',
      intensite: '60–80 % du 1RM',
      repos:     '60–120 s',
      series:    '3–4 séries',
      note:      'Valeurs générales — définis le type d\'exercice pour affiner.',
    },
  },

  // Extensible : force, endurance, etc.
  // force: {
  //   label: 'Force',
  //   types: {
  //     polyarticulaire: { reps: '1–5 reps', intensite: '85–100 %', repos: '3–5 min', series: '3–5 séries', note: '...' },
  //     isolation:       { reps: '4–6 reps', intensite: '80–90 %', repos: '2–3 min', series: '3–4 séries', note: '...' },
  //   },
  //   fallback: { ... },
  // },
};

/**
 * Calcule le 1RM estimé à partir de l'historique via la formule d'Epley :
 *   1RM ≈ poids × (1 + reps / 30)
 *
 * Utilise la moyenne du poids et la moyenne des reps sur toutes les entrées.
 * Retourne null si l'exercice est au poids du corps ou si l'historique est vide.
 * La formule est isolée ici pour pouvoir l'échanger facilement plus tard.
 *
 * @param {object} exo
 * @returns {number|null}
 */
/**
 * Calcule le 1RM estimé via la formule d'Epley : poids × (1 + reps / 30)
 * Utilise la MEILLEURE série (max Epley) pour être le plus représentatif.
 * Retourne null si poids du corps ou aucune donnée utilisable.
 * Pour changer la formule : modifier uniquement cette fonction.
 */
function calculateRM(exo) {
  if (exo.materiel === 'Poids du corps') return null;

  const entries = (exo.historique || []).filter(
    e => e.poids > 0 && typeof e.reps === 'number' && e.reps > 0
  );
  if (entries.length === 0) return null;

  // Meilleure série = celle qui donne l'estimé 1RM le plus élevé
  const best = Math.max(...entries.map(e => e.poids * (1 + e.reps / 30)));
  return Math.round(best * 2) / 2;  // arrondi au 0,5 kg
}

document.addEventListener('DOMContentLoaded', () => {
  DB.init();

  /* ── 1. Identifier l'exercice ────────────────────────────── */
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');

  if (!id) { location.href = 'musculation.html'; return; }

  const exo = DB.getExercice(id);
  if (!exo) { location.href = 'musculation.html'; return; }

  /* ── 2. Peupler les champs statiques ────────────────────── */
  document.querySelectorAll('[data-exo-name]')
    .forEach(el => el.textContent = exo.nom);

  const muscleEl = document.querySelector('[data-exo-muscle]');
  if (muscleEl) {
    muscleEl.textContent = exo.groupe;
    muscleEl.className   = muscleEl.className
      .replace(/exercise-header__muscle--\S+/g, '').trim();
    if (exo.couleur) muscleEl.classList.add('exercise-header__muscle--' + exo.couleur);
  }

  /* ── 3. Afficher directement la page principale ─────────── */
  const pageEl = document.getElementById('exercise-page');
  pageEl.style.display = 'flex';
  showPage(exo);

  /* ── 4. Fonctions d'affichage ────────────────────────────── */

  function showPage(exo) {
    const rm = calculateRM(exo);
    const isPoidsDuCorps = exo.materiel === 'Poids du corps';

    /* RM dans le header */
    document.querySelectorAll('[data-exo-rm]').forEach(el => {
      el.style.display = (!isPoidsDuCorps) ? '' : 'none';
    });
    document.querySelectorAll('[data-exo-rm] .rm-value')
      .forEach(el => el.textContent = rm ?? '—');

    /* Bloc stat-hero */
    const heroBlock = document.querySelector('.stat-hero');
    if (heroBlock) heroBlock.style.display = isPoidsDuCorps ? 'none' : '';

    const rmStatEl = document.querySelector('.stat-hero .rm-value');
    if (rmStatEl) rmStatEl.textContent = rm ?? '—';

    const rmDateEl = document.querySelector('[data-rm-date]');
    if (rmDateEl) {
      rmDateEl.textContent = rm
        ? `Estimé sur ${(exo.historique || []).filter(e => e.poids > 0).length} séance(s)`
        : 'Aucune donnée — réalise des séances pour estimer ton 1RM';
    }

    /* Zone d'entraînement — masquée si pas de 1RM */
    const zoneBlock = document.querySelector('.zone-selector-wrapper');
    if (zoneBlock) zoneBlock.style.display = rm ? '' : 'none';
    if (rm) updateZones(rm);

    renderRecommandations(exo);
    renderChart(exo);
    renderHistorique(exo);
    renderInfo(exo);
  }

  /**
   * Affiche les recommandations hypertrophie adaptées au type de l'exercice.
   * Extensible via OBJECTIF_PRESETS pour d'autres objectifs.
   */
  function renderRecommandations(exo) {
    const block   = document.getElementById('reco-block');
    const gridEl  = document.getElementById('reco-grid');
    const labelEl = document.getElementById('reco-type-label');
    if (!block || !gridEl) return;

    const preset = OBJECTIF_PRESETS.hypertrophie;
    const data   = preset.types[exo.type] || preset.fallback;

    labelEl.textContent = data.note;

    const items = [
      { icon: '🔁', label: 'Répétitions', value: data.reps      },
      { icon: '📊', label: 'Intensité',   value: data.intensite },
      { icon: '⏱',  label: 'Repos',       value: data.repos     },
      { icon: '📦', label: 'Séries',      value: data.series    },
    ];

    gridEl.innerHTML = items.map(item => `
      <div class="reco-card">
        <span class="reco-card__icon" aria-hidden="true">${item.icon}</span>
        <span class="reco-card__label">${item.label}</span>
        <span class="reco-card__value">${item.value}</span>
      </div>`).join('');

    // Badge type sur le titre
    const typeBadge = exo.type
      ? `<span class="reco-badge reco-badge--${exo.type}">${exo.type}</span>`
      : '';
    block.querySelector('.section-title').innerHTML = `Recommandations Hypertrophie ${typeBadge}`;

    block.style.display = 'block';
  }

  /**
   * Met à jour les poids affichés dans chaque carte de zone.
   * Arrondit au 2,5 kg le plus proche (pratique en salle).
   */
  function updateZones(rm) {
    [50, 60, 70, 75, 80, 85, 90, 100].forEach(pct => {
      const raw    = rm * pct / 100;
      const weight = Math.round(raw / 2.5) * 2.5;
      const el     = document.querySelector(`[data-zone-weight="${pct}"]`);
      if (el) el.innerHTML = `${weight} <small>kg</small>`;
    });
  }

  /**
   * Construit le graphique d'évolution du 1RM estimé.
   * Un point par jour d'entraînement = meilleur estimé Epley de ce jour.
   * Source unique : l'historique réel — jamais exo.rm (deprecated).
   */
  function renderChart(exo) {
    const barsEl   = document.querySelector('.chart-bars');
    const labelsEl = document.querySelector('.chart-labels');
    const gridEl   = document.querySelector('.chart-grid');
    if (!barsEl || !labelsEl) return;

    // 1. Grouper par date — meilleur estimé 1RM Epley du jour
    const byDate = {};
    (exo.historique || []).forEach(e => {
      if (!(e.poids > 0) || typeof e.reps !== 'number' || !(e.reps > 0)) return;
      const dateKey = (e.date || '').slice(0, 10);
      if (!dateKey) return;
      const estRM = e.poids * (1 + e.reps / 30);
      if (!byDate[dateKey] || estRM > byDate[dateKey].estRM) {
        byDate[dateKey] = { dateKey, estRM };
      }
    });

    const points = Object.values(byDate)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(d => ({
        date:  new Date(d.dateKey),
        poids: Math.round(d.estRM * 2) / 2,  // arrondi 0,5 kg (identique à calculateRM)
      }));

    // 2. Marquer le record historique (préférence au plus récent en cas d'égalité)
    if (points.length > 0) {
      const maxPoids = Math.max(...points.map(p => p.poids));
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].poids === maxPoids) { points[i].isPeak = true; break; }
      }
    }

    if (points.length === 0) {
      barsEl.innerHTML   = '<p class="chart-empty">Aucune donnée pour l\'instant.</p>';
      labelsEl.innerHTML = '';
      if (gridEl) gridEl.innerHTML = '';
      return;
    }

    const maxPoids = Math.max(...points.map(p => p.poids));

    // Grille Y
    if (gridEl) {
      const step = Math.ceil(maxPoids / 4 / 5) * 5;
      gridEl.innerHTML = [4, 3, 2, 1].map(i => {
        const val = i * step;
        const pos = Math.round(val / maxPoids * 100);
        return `<span class="chart-grid__line" style="--pos:${pos}%"><em>${val} kg</em></span>`;
      }).join('');
    }

    barsEl.innerHTML   = '';
    labelsEl.innerHTML = '';

    points.forEach(p => {
      const h = Math.round(p.poids / maxPoids * 100);

      const bar = document.createElement('div');
      bar.className  = 'chart-bar' + (p.isPeak ? ' chart-bar--peak' : '');
      bar.style.setProperty('--h', h + '%');
      bar.dataset.weight = p.poids;
      bar.innerHTML  = `<span class="chart-bar__tip">${p.poids}</span>`;
      barsEl.appendChild(bar);

      const lbl = document.createElement('span');
      lbl.textContent = p.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      labelsEl.appendChild(lbl);
    });

    // Tendance premier → dernier point
    if (points.length >= 2) {
      const diff    = points[points.length - 1].poids - points[0].poids;
      const trendEl = document.querySelector('.rm-chart-block__trend');
      if (trendEl) {
        const up = diff >= 0;
        const abs = Math.abs(diff);
        trendEl.className   = 'rm-chart-block__trend rm-chart-block__trend--' + (up ? 'up' : 'down');
        trendEl.textContent = (up ? '↑ +' : '↓ ') + (Number.isInteger(abs) ? abs : abs.toFixed(1)) + ' kg';
      }
    }
  }

  /**
   * Rend la liste des entrées d'historique.
   */
  function renderHistorique(exo) {
    const listEl  = document.querySelector('.history-list');
    const countEl = document.querySelector('.history-header__count');
    if (!listEl) return;

    const rm      = calculateRM(exo);  // source unique — jamais exo.rm (deprecated)
    const entries = exo.historique;
    if (countEl) {
      countEl.textContent = entries.length + ' séance' + (entries.length !== 1 ? 's' : '');
    }

    if (entries.length === 0) {
      listEl.innerHTML = `
        <li class="history-empty">
          Aucune séance enregistrée pour cet exercice.
        </li>`;
      return;
    }

    listEl.innerHTML = entries.map((entry, idx) => {
      const d      = new Date(entry.date);
      const day    = d.toLocaleDateString('fr-FR', { day: '2-digit' });
      const month  = d.toLocaleDateString('fr-FR', { month: 'short' });
      const year   = d.getFullYear();

      // Couleur du badge poids — basée sur le 1RM calculé (pas exo.rm)
      let badgeClass = '';
      if (rm) {
        if (entry.poids >= rm * 0.9) badgeClass = 'history-entry__weight-badge--max';
        else if (entry.poids >= rm * 0.8) badgeClass = 'history-entry__weight-badge--heavy';
      }

      return `
        <li>
          <article class="history-entry">
            <div class="history-entry__date-col">
              <span class="history-entry__day">${day}</span>
              <span class="history-entry__month">${month}</span>
              <span class="history-entry__year">${year}</span>
            </div>
            <div class="history-entry__body">
              <div class="history-entry__title">${entry.titre || 'Séance'}</div>
              <div class="history-entry__stats">
                <span class="history-entry__stat">
                  <span class="history-entry__stat-icon">📋</span>Série ${entry.series}
                </span>
                <span class="history-entry__stat">
                  <span class="history-entry__stat-icon">↩</span>${entry.reps} reps
                </span>
                ${entry.poids ? `
                <span class="history-entry__stat history-entry__stat--poids">
                  <span class="history-entry__stat-icon">🏋️</span>${entry.poids} kg
                </span>` : ''}
                ${entry.repos ? `
                <span class="history-entry__stat">
                  <span class="history-entry__stat-icon">⏱</span>${entry.repos}
                </span>` : ''}
              </div>
              ${entry.poids
                ? `<div class="history-entry__weight-badge ${badgeClass}">${entry.poids} kg</div>`
                : ''}
            </div>
            <button class="history-entry__delete" data-index="${idx}"
                    aria-label="Supprimer cette entrée" title="Supprimer">✕</button>
          </article>
        </li>`;
    }).join('');

    // Boutons de suppression individuels
    listEl.querySelectorAll('.history-entry__delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Supprimer cette entrée ?')) {
          DB.deleteHistoriqueEntry(id, parseInt(btn.dataset.index));
          showPage(DB.getExercice(id));
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     ONGLET INFO — photos + notes
  ───────────────────────────────────────────────────────────── */

  /**
   * Redimensionne une image via canvas et retourne un data URL JPEG.
   * Limite : max 800 px sur le plus grand côté, qualité 0.72.
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
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Lecture image échouée')); };
      img.src = url;
    });
  }

  /** Rend la grille de photos dans le panneau Info. */
  function renderInfoImages(images) {
    const gridEl   = document.getElementById('info-images-grid');
    const hintEl   = document.getElementById('info-images-hint');
    const addBtn   = document.getElementById('btn-add-photo');
    if (!gridEl) return;

    const MAX_PHOTOS = 3;

    gridEl.innerHTML = images.map((src, idx) => `
      <div class="info-image-wrap">
        <img src="${src}" alt="Photo ${idx + 1} de l'exercice" loading="lazy">
        <button class="info-image-del" data-img-idx="${idx}"
                aria-label="Supprimer cette photo" title="Supprimer">✕</button>
      </div>`).join('');

    // Boutons suppression
    gridEl.querySelectorAll('.info-image-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const info = DB.getExoInfo(id);
        info.images.splice(parseInt(btn.dataset.imgIdx), 1);
        DB.saveExoInfo(id, info);
        renderInfoImages(info.images);
      });
    });

    // Désactiver "Ajouter" si max atteint
    if (addBtn) addBtn.disabled = images.length >= MAX_PHOTOS;
    if (hintEl) hintEl.textContent = images.length >= MAX_PHOTOS
      ? 'Limite de 3 photos atteinte'
      : `${images.length}/3 photo${images.length !== 1 ? 's' : ''} · stockées sur cet appareil`;
  }

  /** Initialise l'onglet Info : images + notes + listeners. */
  function renderInfo(exo) {
    const info  = DB.getExoInfo(exo.id);
    const notes = info.notes  || '';
    const imgs  = info.images || [];

    renderInfoImages(imgs);

    // Notes
    const notesEl = document.getElementById('info-notes');
    if (notesEl) notesEl.value = notes;

    // Bouton enregistrer notes
    const saveBtn  = document.getElementById('btn-save-notes');
    const statusEl = document.getElementById('notes-save-status');
    if (saveBtn) {
      // Cloner pour réinitialiser les listeners à chaque appel de showPage
      const fresh = saveBtn.cloneNode(true);
      saveBtn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        const infoNow = DB.getExoInfo(exo.id);
        infoNow.notes = (document.getElementById('info-notes') || {}).value || '';
        try {
          DB.saveExoInfo(exo.id, infoNow);
          if (statusEl) {
            statusEl.textContent = '✓ Enregistré';
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
          }
        } catch (e) {
          alert('Erreur de sauvegarde : stockage insuffisant.');
        }
      });
    }

    // Bouton ajouter photo
    const addBtn    = document.getElementById('btn-add-photo');
    const photoInput = document.getElementById('photo-input');
    if (addBtn && photoInput) {
      const freshAdd = addBtn.cloneNode(true);
      addBtn.replaceWith(freshAdd);

      const freshInput = photoInput.cloneNode(false);
      photoInput.replaceWith(freshInput);
      freshAdd.addEventListener('click', () => freshInput.click());
      freshInput.addEventListener('change', async () => {
        const files = Array.from(freshInput.files || []);
        if (!files.length) return;
        const infoNow = DB.getExoInfo(exo.id);
        const MAX = 3;
        const slots = MAX - (infoNow.images || []).length;
        if (slots <= 0) return;
        try {
          const resized = await Promise.all(files.slice(0, slots).map(resizeImage));
          infoNow.images = [...(infoNow.images || []), ...resized];
          DB.saveExoInfo(exo.id, infoNow);
          renderInfoImages(infoNow.images);
        } catch (e) {
          alert('Impossible de lire une ou plusieurs images.');
        }
        freshInput.value = '';
      });
    }
  }

});

