/**
 * FitTrack — Scanner code-barres
 * Utilise ZXing (@zxing/library 0.21) + OpenFoodFacts API
 * Compatible iPhone Safari / Android / PWA
 */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════
     ÉTAT
  ════════════════════════════════════════════════ */
  let _reader    = null;   // BrowserMultiFormatReader
  let _controls  = null;   // IScannerControls (stop/pause)
  let _scanning  = false;
  let _torchTrack = null;
  let _torchOn    = false;

  const OFF_BASE = 'https://world.openfoodfacts.org/api/v0/product/';

  /* ════════════════════════════════════════════════
     MAPPING CATÉGORIES OpenFoodFacts → app
  ════════════════════════════════════════════════ */
  const OFF_CAT_MAP = {
    'en:beverages':              'Boissons',
    'en:waters':                 'Boissons',
    'en:sodas':                  'Boissons',
    'en:juices':                 'Boissons',
    'en:milks':                  'Produits laitiers',
    'en:dairy':                  'Produits laitiers',
    'en:yogurts':                'Produits laitiers',
    'en:cheeses':                'Produits laitiers',
    'en:meats':                  'Viandes',
    'en:chicken':                'Viandes',
    'en:beef':                   'Viandes',
    'en:poultry':                'Viandes',
    'en:fish':                   'Poissons',
    'en:seafood':                'Poissons',
    'en:fishes':                 'Poissons',
    'en:cereals':                'Féculents',
    'en:breads':                 'Féculents',
    'en:pasta':                  'Féculents',
    'en:rice':                   'Féculents',
    'en:fruits':                 'Fruits',
    'en:fresh-fruits':           'Fruits',
    'en:vegetables':             'Légumes',
    'en:fresh-vegetables':       'Légumes',
    'en:dietary-supplements':    'Compléments',
    'en:food-supplements':       'Compléments',
    'en:vitamins':               'Compléments',
    'en:minerals':               'Compléments',
    'en:protein-powders':        'Compléments',
    'en:sports-nutrition':       'Compléments',
    'en:meal-replacement':       'Compléments',
  };

  function _mapCategory(tags) {
    if (!Array.isArray(tags)) return 'Autres';
    for (const tag of tags) {
      const mapped = OFF_CAT_MAP[tag.toLowerCase()];
      if (mapped) return mapped;
    }
    return 'Autres';
  }

  /* ════════════════════════════════════════════════
     OUVRIR / FERMER L'OVERLAY
  ════════════════════════════════════════════════ */

  function openScanner() {
    const overlay = document.getElementById('scan-overlay');
    if (!overlay) return;

    // Réinitialiser l'UI
    _setScanStatus('Accès à la caméra…');
    _setHint('Compatible EAN-13 · EAN-8 · UPC');
    const actionsEl = document.getElementById('scan-actions');
    if (actionsEl) actionsEl.innerHTML = '';

    overlay.hidden = false;
    // Forcer un reflow pour que la transition fonctionne
    overlay.offsetHeight; // eslint-disable-line no-unused-expressions
    overlay.classList.add('scan-overlay--open');

    _startCamera();
  }

  function closeScanner() {
    _stopCamera();
    const overlay = document.getElementById('scan-overlay');
    if (!overlay) return;
    overlay.classList.remove('scan-overlay--open');
    setTimeout(() => { overlay.hidden = true; }, 320);
  }

  /* ════════════════════════════════════════════════
     CAMÉRA
  ════════════════════════════════════════════════ */

  async function _startCamera() {
    if (!window.ZXing) {
      _setScanStatus('Erreur : bibliothèque ZXing non chargée.');
      return;
    }

    _scanning = true;

    try {
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.CODE_128,
      ]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

      _reader = new ZXing.BrowserMultiFormatReader(hints);

      _controls = await _reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        'scan-video',
        (result, err) => {
          if (!_scanning) return;
          if (result) {
            _onBarcode(result.getText());
          }
          // ZXing.NotFoundException est normal (pas de code visible) — on l'ignore
        }
      );

      _setScanStatus('Pointez le code-barres du produit');

      // Activer le bouton flash si supporté
      _initTorch();

    } catch (e) {
      console.error('[Scanner] Erreur caméra :', e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        _setScanStatus('Permission caméra refusée.\nVérifiez les réglages de votre appareil.');
      } else if (e.name === 'NotFoundError') {
        _setScanStatus('Aucune caméra détectée.');
      } else {
        _setScanStatus('Impossible d\'accéder à la caméra.');
      }
    }
  }

  function _stopCamera() {
    _scanning = false;

    if (_controls) {
      try { _controls.stop(); } catch (e) {}
      _controls = null;
    }
    if (_reader) {
      try { _reader.reset(); } catch (e) {}
      _reader = null;
    }

    _torchTrack = null;
    _torchOn    = false;

    const flashBtn = document.getElementById('scan-flash-btn');
    if (flashBtn) {
      flashBtn.hidden = true;
      flashBtn.classList.remove('scan-flash-btn--on');
    }

    // Stopper le stream vidéo manuellement (nécessaire sur iOS)
    const video = document.getElementById('scan-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  }

  /* ════════════════════════════════════════════════
     FLASH / TORCHE
  ════════════════════════════════════════════════ */

  function _initTorch() {
    const video = document.getElementById('scan-video');
    if (!video || !video.srcObject) return;
    const tracks = video.srcObject.getVideoTracks();
    if (!tracks.length) return;
    const track = tracks[0];
    const caps  = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      _torchTrack = track;
      const flashBtn = document.getElementById('scan-flash-btn');
      if (flashBtn) flashBtn.hidden = false;
    }
  }

  function _toggleFlash() {
    if (!_torchTrack) return;
    _torchOn = !_torchOn;
    _torchTrack.applyConstraints({ advanced: [{ torch: _torchOn }] })
      .catch(e => console.warn('[Scanner] Torch error:', e));
    const btn = document.getElementById('scan-flash-btn');
    if (btn) btn.classList.toggle('scan-flash-btn--on', _torchOn);
  }

  /* ════════════════════════════════════════════════
     REQUÊTE OPENFOODFACTS
  ════════════════════════════════════════════════ */

  async function _fetchProduct(barcode) {
    const resp = await fetch(`${OFF_BASE}${encodeURIComponent(barcode)}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 1 || !data.product) return null;
    return data.product;
  }

  /* ════════════════════════════════════════════════
     TRAITEMENT CODE-BARRES (scan caméra)
  ════════════════════════════════════════════════ */

  async function _onBarcode(barcode) {
    if (!_scanning) return;
    _scanning = false;
    _stopCamera();

    _setScanStatus(`Code détecté : ${barcode}`);
    _setHint('Recherche dans la base OpenFoodFacts…');

    try {
      const product = await _fetchProduct(barcode);
      if (!product) { _showError(barcode); return; }
      _fillForm(product);
      closeScanner();
    } catch (e) {
      console.error('[Scanner] OFF API error:', e);
      _showError(barcode);
    }
  }

  /* ════════════════════════════════════════════════
     REMPLISSAGE DU FORMULAIRE
  ════════════════════════════════════════════════ */

  function _fillForm(product) {
    // Ouvrir la modale en mode "produit"
    if (typeof openAlimNewModal === 'function') openAlimNewModal();
    if (typeof _applyAlimKind  === 'function') _applyAlimKind('produit');

    const nom    = (product.product_name_fr || product.product_name || '').trim();
    const marque = (product.brands || '').split(',')[0].trim();

    const n    = product.nutriments || {};
    const kcal = _num(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? n['energy_100g'] / 4.184);
    const prot = _num(n['proteins_100g']      ?? n['proteins']);
    const gluc = _num(n['carbohydrates_100g'] ?? n['carbohydrates']);
    const lip  = _num(n['fat_100g']           ?? n['fat']);

    // Catégorie
    const cat = _mapCategory(product.categories_tags);

    // Portion
    let portionVal = 100;
    const serving  = _parseServing(product.serving_size);
    if (serving) portionVal = serving.value;

    // Mode de consommation :
    //   liquide (ml) → "en volume"
    //   portion définie → "par portion"
    //   aucune donnée    → "par portion" (défaut produit)
    const isLiquid = serving && serving.unit === 'ml';
    const mode     = isLiquid ? 'volume' : 'portion';

    // Remplir les champs texte
    _setVal('alim-new-nom',    nom);
    _setVal('alim-new-marque', marque);
    _setVal('alim-new-kcal',   kcal > 0 ? kcal : '');
    _setVal('alim-new-prot',   prot > 0 ? prot : '');
    _setVal('alim-new-gluc',   gluc > 0 ? gluc : '');
    _setVal('alim-new-lip',    lip  > 0 ? lip  : '');

    // Mettre à jour les chips catégorie
    window._alimNewCat = cat;
    const catChips = document.getElementById('alim-new-cat-chips');
    if (catChips) {
      catChips.querySelectorAll('[data-alim-cat]').forEach(c => {
        c.classList.toggle('alim-new__cat-chip--active', c.dataset.alimCat === cat);
      });
    }

    // Appliquer le mode de consommation (écrase le 'portion' par défaut de _applyAlimKind)
    if (typeof _applyAlimMode === 'function') _applyAlimMode(mode);
    window._alimNewMode = mode;

    // Portion de référence (visible si mode 'portion', masquée si 'volume')
    if (!isLiquid) _setVal('alim-new-portion', portionVal);

    // Activer le bouton "Créer"
    const saveBtn = document.getElementById('alim-new-save');
    if (saveBtn) saveBtn.disabled = !nom;
  }

  /* ════════════════════════════════════════════════
     ERREUR PRODUIT NON TROUVÉ
  ════════════════════════════════════════════════ */

  function _showError(barcode) {
    _setScanStatus('Produit introuvable');
    _setHint(`Code scanné : ${barcode}`);

    const actionsEl = document.getElementById('scan-actions');
    if (!actionsEl) return;

    actionsEl.innerHTML = `
      <button type="button" class="scan-action-btn scan-action-btn--primary" id="scan-retry-btn">
        🔄 Scanner à nouveau
      </button>
      <button type="button" class="scan-action-btn" id="scan-manual-btn">
        ✏️ Saisie manuelle
      </button>
    `;

    document.getElementById('scan-retry-btn')?.addEventListener('click', () => {
      actionsEl.innerHTML = '';
      _setHint('Compatible EAN-13 · EAN-8 · UPC');
      _scanning = true;
      _startCamera();
    });

    document.getElementById('scan-manual-btn')?.addEventListener('click', () => {
      closeScanner();
      if (typeof openAlimNewModal === 'function') openAlimNewModal();
      if (typeof _applyAlimKind  === 'function') _applyAlimKind('produit');
    });
  }

  /* ════════════════════════════════════════════════
     UTILITAIRES
  ════════════════════════════════════════════════ */

  function _setScanStatus(msg) {
    const el = document.getElementById('scan-status');
    if (el) el.textContent = msg;
  }

  function _setHint(msg) {
    const el = document.getElementById('scan-hint');
    if (el) el.textContent = msg;
  }

  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el !== null) el.value = val;
  }

  function _num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : Math.round(n * 10) / 10;
  }

  function _parseServing(raw) {
    if (!raw) return null;
    const m = String(raw).match(/([\d.,]+)\s*(g|ml)/i);
    if (!m) return null;
    const value = parseFloat(m[1].replace(',', '.'));
    return isNaN(value) || value <= 0 ? null : { value, unit: m[2].toLowerCase() };
  }

  /* ════════════════════════════════════════════════
     SAISIE MANUELLE CODE-BARRES
  ════════════════════════════════════════════════ */

  function bindManualBarcodeEvents() {
    const input     = document.getElementById('alim-barcode-input');
    const searchBtn = document.getElementById('alim-barcode-search');
    const errorEl   = document.getElementById('alim-barcode-error');

    if (!input || !searchBtn) return;

    // Activer / désactiver le bouton selon la saisie
    input.addEventListener('input', () => {
      searchBtn.disabled = !input.value.trim();
      if (errorEl) errorEl.hidden = true;
    });

    // Recherche au clic
    searchBtn.addEventListener('click', async () => {
      const barcode = input.value.trim();
      if (!barcode) return;

      // État chargement
      searchBtn.disabled = true;
      searchBtn.classList.add('alim-barcode-search-btn--loading');
      const originalText = searchBtn.textContent;
      searchBtn.textContent = '…';
      if (errorEl) errorEl.hidden = true;

      let product = null;
      try {
        product = await _fetchProduct(barcode);
      } catch (e) {
        console.error('[Scanner] Saisie manuelle OFF error:', e);
      }

      // Réinitialiser le bouton
      searchBtn.textContent = originalText;
      searchBtn.classList.remove('alim-barcode-search-btn--loading');
      searchBtn.disabled = false;

      if (!product) {
        if (errorEl) {
          errorEl.textContent = 'Produit introuvable. Vérifiez le code ou remplissez manuellement.';
          errorEl.hidden = false;
        }
        return;
      }

      // Succès — vider le champ et remplir le formulaire
      input.value = '';
      searchBtn.disabled = true;
      if (errorEl) errorEl.hidden = true;
      _fillForm(product);
    });

    // Recherche à la touche Entrée
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !searchBtn.disabled) searchBtn.click();
    });
  }

  /* ════════════════════════════════════════════════
     BIND EVENTS
  ════════════════════════════════════════════════ */

  function bindScannerEvents() {
    document.getElementById('alim-scan-btn')?.addEventListener('click', openScanner);
    document.getElementById('scan-cancel-btn')?.addEventListener('click', closeScanner);
    document.getElementById('scan-flash-btn')?.addEventListener('click', _toggleFlash);
    bindManualBarcodeEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindScannerEvents);
  } else {
    bindScannerEvents();
  }

  // API publique
  window.FitScanner = { open: openScanner, close: closeScanner };

})();
