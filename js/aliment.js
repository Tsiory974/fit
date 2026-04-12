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

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const alimId = params.get('id');

  const aliment = (window.ALIMENTS_DATA || []).find(a => a.id === alimId);

  if (!aliment) {
    // ID inconnu → retour à la liste
    location.replace('alimentation.html');
    return;
  }

  populatePage(aliment);
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

  // Macros — valeurs ajoutées plus tard, on laisse "—" par défaut
  // (structure prête : #macro-proteines, #macro-glucides, #macro-lipides, #macro-calories)
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
