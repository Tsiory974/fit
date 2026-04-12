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
     BIND EVENTS
  ════════════════════════════════════════════════ */

  function init() {
    // Sauvegarde rapide
    _refreshQuickSaveUI();
    document.getElementById('btn-quick-save')?.addEventListener('click', quickSave);
    document.getElementById('btn-quick-restore')?.addEventListener('click', quickRestore);

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
