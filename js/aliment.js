/**
 * FitTrack — Page Aliment
 * ========================
 * Charge un aliment depuis l'URL (?id=...) et peuple la page.
 * Structure miroir de exercice.js.
 *
 * Clé localStorage :
 *   ft_alim_notes_<id>  → string — notes libres de l'aliment
 */

const NOTES_PREFIX = 'ft_alim_notes_';

function _loadCustomAliments() {
  try {
    const stored = JSON.parse(localStorage.getItem('ft_custom_aliments') || '[]');
    stored.forEach(a => {
      if (!(window.ALIMENTS_DATA || []).find(x => x.id === a.id)) {
        (window.ALIMENTS_DATA = window.ALIMENTS_DATA || []).push(a);
      }
    });
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  _loadCustomAliments();

  const params = new URLSearchParams(location.search);
  const alimId = params.get('id');

  const aliment = (window.ALIMENTS_DATA || []).find(a => a.id === alimId);

  if (!aliment) {
    // ID inconnu → retour à la liste
    location.replace('alimentation.html');
    return;
  }

  populatePage(aliment);
  renderModeBlock(aliment);
  bindNotes(aliment.id);
});

/* ─────────────────────────────────────────────────────────────
   PEUPLEMENT DE LA PAGE
───────────────────────────────────────────────────────────── */

function populatePage(aliment) {
  // Titre de l'onglet navigateur
  document.title = `FitTrack — ${aliment.nom}`;

  // Header : nom
  const nameEl = document.querySelector('[data-alim-name]');
  if (nameEl) nameEl.textContent = aliment.nom;

  // Header : badge catégorie
  const catEl = document.querySelector('[data-alim-cat]');
  if (catEl) {
    catEl.textContent = aliment.categorie;
    const slug = (window.CAT_SLUG || {})[aliment.categorie] || '';
    catEl.classList.add('aliment-header__cat--' + slug);
  }

  // Panneau Info — catégorie + détail
  const infoCategorie = document.getElementById('info-categorie');
  if (infoCategorie) infoCategorie.textContent = aliment.categorie;

  const infoDetail = document.getElementById('info-detail');
  if (infoDetail) infoDetail.textContent = aliment.detail;

  // Macros
  const m = aliment.m || {};
  const fmt = v => (v !== undefined && v !== null && !isNaN(v)) ? v + (Number.isInteger(v) ? '' : '') + 'g' : '—';

  const macroP = document.getElementById('macro-proteines');
  const macroG = document.getElementById('macro-glucides');
  const macroL = document.getElementById('macro-lipides');
  const macroK = document.getElementById('macro-calories');

  if (macroP) macroP.textContent = m.p !== undefined ? m.p + 'g' : '—';
  if (macroG) macroG.textContent = m.g !== undefined ? m.g + 'g' : '—';
  if (macroL) macroL.textContent = m.l !== undefined ? m.l + 'g' : '—';
  if (macroK) macroK.textContent = m.k !== undefined ? m.k + ' kcal' : '—';

  // Unité de la section valeurs nutritionnelles
  const unitEl = document.querySelector('.alim-section-title__unit');
  if (unitEl) {
    const unitLabel = { gramme: '/ 100g', ml: '/ 100ml', unite: '/ unité' };
    unitEl.textContent = unitLabel[aliment.type] || '/ 100g';
  }

  // Marque (produits emballés)
  if (aliment.marque) {
    const infoBlock = document.querySelector('.alim-info-block');
    if (infoBlock && !document.getElementById('info-marque')) {
      const row = document.createElement('div');
      row.className = 'alim-info-row';
      row.innerHTML = `<span class="alim-info-label">Marque</span>
                       <span class="alim-info-value" id="info-marque">${aliment.marque}</span>`;
      infoBlock.insertBefore(row, infoBlock.firstChild);
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   MODE DE CONSOMMATION
   N'est affiché que pour les aliments custom (modeConsommation défini).
───────────────────────────────────────────────────────────── */

function renderModeBlock(aliment) {
  const block = document.getElementById('alim-mode-block');
  const badge = document.getElementById('alim-mode-badge');
  const equiv = document.getElementById('alim-mode-equiv');
  if (!block || !badge || !equiv) return;

  const mode = aliment.modeConsommation;
  if (!mode) return; // aliment statique sans mode défini → bloc caché

  const ref = aliment.portionReference;
  const uw  = aliment.unitWeight;

  if (mode === 'piece') {
    badge.textContent = 'Par pièce';
    equiv.textContent = `1 pièce = ${uw || ref || '?'} g`;
  } else if (mode === 'portion') {
    badge.textContent = 'Par portion';
    equiv.textContent = `1 portion = ${ref || '?'} g`;
  } else if (mode === 'volume') {
    badge.textContent = 'En volume';
    equiv.textContent = `1 unité = ${ref || '?'} ml`;
  } else {
    badge.textContent = 'Au poids';
    equiv.textContent = 'Quantité saisie directement en grammes';
  }

  block.hidden = false;
}

/* ─────────────────────────────────────────────────────────────
   NOTES — sauvegarde / chargement (localStorage)
───────────────────────────────────────────────────────────── */

function bindNotes(alimId) {
  const textarea  = document.getElementById('alim-notes');
  const btnSave   = document.getElementById('btn-save-notes');
  const statusEl  = document.getElementById('notes-save-status');

  if (!textarea || !btnSave) return;

  // Charger les notes existantes
  const saved = localStorage.getItem(NOTES_PREFIX + alimId);
  if (saved) textarea.value = saved;

  btnSave.addEventListener('click', () => {
    localStorage.setItem(NOTES_PREFIX + alimId, textarea.value);
    if (statusEl) {
      statusEl.textContent = 'Enregistré ✓';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    }
  });
}
