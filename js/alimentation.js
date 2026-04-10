/**
 * FitTrack — Page Alimentation
 * ==============================
 * Gère 4 onglets :
 *   1. Aujourd'hui  — repas du jour
 *   2. Planning     — planning alimentaire de la semaine
 *   3. Recettes     — repas et recettes enregistrés
 *   4. Aliments     — base d'aliments
 */

document.addEventListener('DOMContentLoaded', () => {
  updateHeaderDate();

  renderAujourdhuiPanel();
  renderPlanningPanel();
  renderRecettesPanel();
  renderAlimentsPanel();
});

/* ═══════════════════════════════════════════════════════════════
   ONGLET 1 — AUJOURD'HUI
═══════════════════════════════════════════════════════════════ */

function renderAujourdhuiPanel() {
  // À implémenter
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 2 — PLANNING
═══════════════════════════════════════════════════════════════ */

function renderPlanningPanel() {
  // À implémenter
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 3 — RECETTES
═══════════════════════════════════════════════════════════════ */

function renderRecettesPanel() {
  // À implémenter
}

/* ═══════════════════════════════════════════════════════════════
   ONGLET 4 — ALIMENTS
═══════════════════════════════════════════════════════════════ */

function renderAlimentsPanel() {
  // À implémenter
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
