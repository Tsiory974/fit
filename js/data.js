/**
 * FitTrack — Couche données (localStorage)
 * ==========================================
 * Point d'entrée unique pour lire/écrire toutes les données.
 * Chaque page importe ce fichier AVANT son propre script.
 *
 * Clés localStorage :
 *   ft_exercises          → string[] — IDs des exercices
 *   ft_exo_<id>           → Exercice
 *   ft_templates          → string[] — IDs des modèles de séance
 *   ft_template_<id>      → SessionTemplate
 *   ft_planned            → string[] — IDs des séances planifiées
 *   ft_planned_<id>       → PlannedSession
 *   ft_active_session     → string|null — ID de la séance active (legacy)
 *
 * Types :
 *   Exercice        { id, nom, groupe, couleur, sousGroupe, type, materiel, rm, rmDate, historique[] }
 *   SessionTemplate { id, nom, exercices: ExoBlock[], createdAt }
 *   PlannedSession  { id, templateId, date: 'YYYY-MM-DD', completed, completedAt, createdAt }
 *   ExoBlock        { exoId, series, reps, repos, poids }
 *   HistEntry       { titre, series, reps, repos, poids, date }
 *
 * Jours (0 = lundi … 6 = dimanche, semaine FR)
 */

/**
 * Retourne la date locale au format 'YYYY-MM-DD'.
 * Évite le décalage UTC de toISOString() (bug timezone iOS/Safari).
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function localDateStr(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
window.localDateStr = localDateStr;

const KEYS = {
  EXO_LIST:        'ft_exercises',
  EXO_PREFIX:      'ft_exo_',
  TEMPLATE_LIST:   'ft_templates',
  TEMPLATE_PREFIX: 'ft_template_',
  PLANNED_LIST:    'ft_planned',
  PLANNED_PREFIX:  'ft_planned_',
  ACTIVE_SESSION:  'ft_active_session',
  DB_VERSION:      'ft_db_version',
};

// Incrémenter force la migration au rechargement
const DB_VERSION_CURRENT = 7;

const DEFAULT_EXERCISES = [
  // ── Pectoraux ──
  { id: 'developpe-couche',         nom: 'Développé couché',                       groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'milieu',     type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'developpe-incline',        nom: 'Développé incliné',                      groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'haut',       type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'developpe-decline',        nom: 'Développé décliné',                      groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'bas',        type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'ecarte-halteres',          nom: 'Écarté haltères',                        groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'milieu',     type: 'isolation',       materiel: 'Haltères'      },
  { id: 'ecarte-machine',           nom: 'Écarté à la machine',                    groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'milieu',     type: 'isolation',       materiel: 'Machine'       },
  { id: 'pompes',                   nom: 'Pompes',                                 groupe: 'Pectoraux', couleur: 'pecto',   sousGroupe: 'milieu',     type: 'polyarticulaire', materiel: 'Poids du corps' },
  // ── Dos ──
  { id: 'tractions',                nom: 'Tractions',                              groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'largeur',    type: 'polyarticulaire', materiel: 'Poids du corps' },
  { id: 'tirage-vertical',          nom: 'Tirage vertical',                        groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'largeur',    type: 'polyarticulaire', materiel: 'Machine'       },
  { id: 'tirage-horizontal',        nom: 'Tirage horizontal',                      groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'épaisseur',  type: 'polyarticulaire', materiel: 'Machine'       },
  { id: 'rowing-barre',             nom: 'Rowing barre',                           groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'épaisseur',  type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'rowing-haltere',           nom: 'Rowing haltère',                         groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'épaisseur',  type: 'polyarticulaire', materiel: 'Haltères'      },
  { id: 'souleve-de-terre',         nom: 'Soulevé de terre',                       groupe: 'Dos',       couleur: 'dos',     sousGroupe: 'épaisseur',  type: 'polyarticulaire', materiel: 'Barre'         },
  // ── Jambes ──
  { id: 'squat',                    nom: 'Squat',                                  groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'quadriceps', type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'presse-cuisses',           nom: 'Presse à cuisses',                       groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'quadriceps', type: 'polyarticulaire', materiel: 'Machine'       },
  { id: 'fentes',                   nom: 'Fentes',                                 groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'quadriceps', type: 'polyarticulaire', materiel: 'Poids du corps' },
  { id: 'leg-extension',            nom: 'Leg extension',                          groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'quadriceps', type: 'isolation',       materiel: 'Machine'       },
  { id: 'leg-curl',                 nom: 'Leg curl',                               groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'ischios',    type: 'isolation',       materiel: 'Machine'       },
  { id: 'mollets-debout',           nom: 'Mollets debout',                         groupe: 'Jambes',    couleur: 'jambes',  sousGroupe: 'mollets',    type: 'isolation',       materiel: 'Machine'       },
  // ── Épaules ──
  { id: 'developpe-militaire',      nom: 'Développé militaire',                    groupe: 'Épaules',   couleur: 'epaules', sousGroupe: '',           type: 'polyarticulaire', materiel: 'Barre'         },
  { id: 'elevations-laterales',     nom: 'Élévations latérales',                   groupe: 'Épaules',   couleur: 'epaules', sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'elevations-frontales',     nom: 'Élévations frontales',                   groupe: 'Épaules',   couleur: 'epaules', sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'oiseau-reverse-fly',       nom: 'Oiseau (reverse fly)',                   groupe: 'Épaules',   couleur: 'epaules', sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'shrugs',                   nom: 'Shrugs',                                 groupe: 'Épaules',   couleur: 'epaules', sousGroupe: '',           type: 'isolation',       materiel: 'Barre'         },
  // ── Biceps ──
  { id: 'curl-barre',               nom: 'Curl barre',                             groupe: 'Biceps',    couleur: 'biceps',  sousGroupe: '',           type: 'isolation',       materiel: 'Barre'         },
  { id: 'curl-halteres',            nom: 'Curl haltères',                          groupe: 'Biceps',    couleur: 'biceps',  sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'curl-incline',             nom: 'Curl incliné',                           groupe: 'Biceps',    couleur: 'biceps',  sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'curl-marteau',             nom: 'Curl marteau',                           groupe: 'Biceps',    couleur: 'biceps',  sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  // ── Triceps ──
  { id: 'dips',                     nom: 'Dips',                                   groupe: 'Triceps',   couleur: 'triceps', sousGroupe: '',           type: 'polyarticulaire', materiel: 'Poids du corps' },
  { id: 'extension-triceps-poulie', nom: 'Extension triceps poulie',               groupe: 'Triceps',   couleur: 'triceps', sousGroupe: '',           type: 'isolation',       materiel: 'Machine'       },
  { id: 'extension-haltere-tete',   nom: 'Extension haltère au-dessus de la tête', groupe: 'Triceps',   couleur: 'triceps', sousGroupe: '',           type: 'isolation',       materiel: 'Haltères'      },
  { id: 'barre-au-front',           nom: 'Barre au front',                         groupe: 'Triceps',   couleur: 'triceps', sousGroupe: '',           type: 'isolation',       materiel: 'Barre'         },
  // ── Abdos ──
  { id: 'crunch',                   nom: 'Crunch',                                 groupe: 'Abdos',     couleur: 'abdos',   sousGroupe: '',           type: 'isolation',       materiel: 'Poids du corps' },
  { id: 'releves-jambes',           nom: 'Relevés de jambes',                      groupe: 'Abdos',     couleur: 'abdos',   sousGroupe: '',           type: 'isolation',       materiel: 'Poids du corps' },
  { id: 'gainage',                  nom: 'Gainage',                                groupe: 'Abdos',     couleur: 'abdos',   sousGroupe: '',           type: 'isolation',       materiel: 'Poids du corps' },
  { id: 'russian-twist',            nom: 'Russian twist',                          groupe: 'Abdos',     couleur: 'abdos',   sousGroupe: '',           type: 'isolation',       materiel: 'Poids du corps' },
  { id: 'mountain-climbers',        nom: 'Mountain climbers',                      groupe: 'Abdos',     couleur: 'abdos',   sousGroupe: '',           type: 'isolation',       materiel: 'Poids du corps' },
  // ── Cardio ──
  { id: 'course-pied',              nom: 'Course à pied',                          groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'velo',                     nom: 'Vélo',                                   groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'natation',                 nom: 'Natation',                               groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'elliptique',               nom: 'Elliptique',                             groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'rameur',                   nom: 'Rameur',                                 groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'corde-a-sauter',           nom: 'Corde à sauter',                         groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'marche-rapide',            nom: 'Marche rapide',                          groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
  { id: 'hiit',                     nom: 'HIIT',                                   groupe: 'Cardio',    couleur: 'cardio',  sousGroupe: '',           type: 'cardio',          materiel: ''              },
];

const DB = {

  /* ─────────────────────────────────────────────────────────────
     INITIALISATION & MIGRATION
  ───────────────────────────────────────────────────────────── */

  init() {
    const storedVersion = parseInt(localStorage.getItem(KEYS.DB_VERSION) || '0', 10);

    if (storedVersion < DB_VERSION_CURRENT) {

      // ── Exercices : écrase les defaults, préserve historique ──
      const oldEids    = JSON.parse(localStorage.getItem(KEYS.EXO_LIST) || '[]');
      const defaultIds = DEFAULT_EXERCISES.map(e => e.id);
      oldEids.forEach(id => {
        if (!defaultIds.includes(id)) localStorage.removeItem(KEYS.EXO_PREFIX + id);
      });
      localStorage.setItem(KEYS.EXO_LIST, JSON.stringify(defaultIds));
      DEFAULT_EXERCISES.forEach(e => {
        const raw      = localStorage.getItem(KEYS.EXO_PREFIX + e.id);
        const existing = raw ? JSON.parse(raw) : null;
        localStorage.setItem(KEYS.EXO_PREFIX + e.id, JSON.stringify({
          rm: null, rmDate: null, historique: [],
          ...(existing || {}),
          id: e.id, nom: e.nom, groupe: e.groupe, couleur: e.couleur,
          sousGroupe: e.sousGroupe, type: e.type, materiel: e.materiel,
        }));
      });

      // ── Migration v5→v6 : Sessions → Modèles ──
      // Les anciennes séances (ft_sessions / ft_session_<id>) deviennent
      // des modèles (ft_templates / ft_template_<id>). Les jours planifiés
      // sont abandonnés (on repart d'un planning vide).
      const legacyIds = JSON.parse(localStorage.getItem('ft_sessions') || '[]');
      const migratedTemplateIds = [];
      legacyIds.forEach(oldId => {
        const raw = localStorage.getItem('ft_session_' + oldId);
        if (!raw) return;
        const old = JSON.parse(raw);
        const tpl = {
          id:        old.id,
          nom:       old.nom,
          exercices: old.exercices || [],
          createdAt: old.createdAt || new Date().toISOString(),
        };
        localStorage.setItem(KEYS.TEMPLATE_PREFIX + tpl.id, JSON.stringify(tpl));
        migratedTemplateIds.push(tpl.id);
        localStorage.removeItem('ft_session_' + oldId);
      });
      // Écrire la liste des modèles (seulement si elle n'existait pas déjà)
      if (!localStorage.getItem(KEYS.TEMPLATE_LIST)) {
        localStorage.setItem(KEYS.TEMPLATE_LIST, JSON.stringify(migratedTemplateIds));
      }
      localStorage.removeItem('ft_sessions');

      localStorage.setItem(KEYS.DB_VERSION, String(DB_VERSION_CURRENT));
    }

    // Garantir l'existence des listes
    if (!localStorage.getItem(KEYS.TEMPLATE_LIST)) {
      localStorage.setItem(KEYS.TEMPLATE_LIST, JSON.stringify([]));
    }
    if (!localStorage.getItem(KEYS.PLANNED_LIST)) {
      localStorage.setItem(KEYS.PLANNED_LIST, JSON.stringify([]));
    }
  },

  /* ─────────────────────────────────────────────────────────────
     EXERCICES
  ───────────────────────────────────────────────────────────── */

  getExoIds()       { return JSON.parse(localStorage.getItem(KEYS.EXO_LIST) || '[]'); },
  getExercice(id)   { const r = localStorage.getItem(KEYS.EXO_PREFIX + id); return r ? JSON.parse(r) : null; },
  getAllExercices()  { return this.getExoIds().map(id => this.getExercice(id)).filter(Boolean); },
  saveExercice(exo) { localStorage.setItem(KEYS.EXO_PREFIX + exo.id, JSON.stringify(exo)); },

  addExercice({ nom, groupe, couleur, sousGroupe = '', type = '', materiel = '' }) {
    const id = nom.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ids = this.getExoIds();
    if (ids.includes(id)) return null;
    ids.push(id);
    localStorage.setItem(KEYS.EXO_LIST, JSON.stringify(ids));
    const exo = { id, nom, groupe, couleur, sousGroupe, type, materiel, rm: null, rmDate: null, historique: [] };
    this.saveExercice(exo);
    return exo;
  },

  deleteExercice(id) {
    const ids = this.getExoIds().filter(i => i !== id);
    localStorage.setItem(KEYS.EXO_LIST, JSON.stringify(ids));
    localStorage.removeItem(KEYS.EXO_PREFIX + id);
  },

  setRM(id, value) {
    const exo = this.getExercice(id);
    if (!exo) return null;
    exo.rm     = parseFloat(value);
    exo.rmDate = new Date().toISOString();
    this.saveExercice(exo);
    return exo;
  },

  addHistoriqueEntry(id, entry) {
    const exo = this.getExercice(id);
    if (!exo) return;
    exo.historique.unshift({ ...entry, date: new Date().toISOString() });
    this.saveExercice(exo);
  },

  deleteHistoriqueEntry(id, index) {
    const exo = this.getExercice(id);
    if (!exo) return;
    exo.historique.splice(index, 1);
    this.saveExercice(exo);
  },

  deleteHistoriqueSession(id, dateKey) {
    const exo = this.getExercice(id);
    if (!exo) return;
    exo.historique = exo.historique.filter(e => (e.date || '').slice(0, 10) !== dateKey);
    this.saveExercice(exo);
  },

  /* Notes et photos d'un exercice — stockées séparément pour ne pas
     alourdir l'objet exercice (qui est chargé souvent).
     Structure : { notes: string, images: string[] }            */
  getExoInfo(id) {
    const r = localStorage.getItem('ft_exo_info_' + id);
    return r ? JSON.parse(r) : { notes: '', images: [] };
  },
  saveExoInfo(id, info) {
    localStorage.setItem('ft_exo_info_' + id, JSON.stringify(info));
  },

  /* ─────────────────────────────────────────────────────────────
     MODÈLES DE SÉANCE (SessionTemplate)
     Un modèle = blueprint réutilisable sans date ni jours.
     Modifier un modèle n'affecte pas l'historique déjà enregistré.
  ───────────────────────────────────────────────────────────── */

  getTemplateIds()    { return JSON.parse(localStorage.getItem(KEYS.TEMPLATE_LIST) || '[]'); },
  getTemplate(id)     { const r = localStorage.getItem(KEYS.TEMPLATE_PREFIX + id); return r ? JSON.parse(r) : null; },
  getAllTemplates()    { return this.getTemplateIds().map(id => this.getTemplate(id)).filter(Boolean); },
  /** Modèles actifs — un modèle sans champ `archived` (ancien) est considéré actif. */
  getActiveTemplates()   { return this.getAllTemplates().filter(t => !t.archived); },
  getArchivedTemplates() { return this.getAllTemplates().filter(t =>  t.archived); },
  saveTemplate(t)     { localStorage.setItem(KEYS.TEMPLATE_PREFIX + t.id, JSON.stringify(t)); },

  addTemplate({ nom, exercices = [] }) {
    const id  = 'tpl-' + Date.now();
    const ids = this.getTemplateIds();
    ids.push(id);
    localStorage.setItem(KEYS.TEMPLATE_LIST, JSON.stringify(ids));
    const tpl = { id, nom, exercices, archived: false, createdAt: new Date().toISOString() };
    this.saveTemplate(tpl);
    return tpl;
  },

  updateTemplate(tpl) {
    if (!this.getTemplateIds().includes(tpl.id)) return null;
    this.saveTemplate(tpl);
    return tpl;
  },

  archiveTemplate(id) {
    const tpl = this.getTemplate(id);
    if (!tpl) return null;
    tpl.archived   = true;
    tpl.archivedAt = new Date().toISOString();
    this.saveTemplate(tpl);
    return tpl;
  },

  unarchiveTemplate(id) {
    const tpl = this.getTemplate(id);
    if (!tpl) return null;
    tpl.archived = false;
    delete tpl.archivedAt;
    this.saveTemplate(tpl);
    return tpl;
  },

  deleteTemplate(id) {
    const ids = this.getTemplateIds().filter(i => i !== id);
    localStorage.setItem(KEYS.TEMPLATE_LIST, JSON.stringify(ids));
    localStorage.removeItem(KEYS.TEMPLATE_PREFIX + id);
    // Supprimer les instances futures non complétées liées à ce modèle
    this.getAllPlanned()
      .filter(p => p.templateId === id && !p.completed)
      .forEach(p => this.deletePlanned(p.id));
  },

  // Compatibilité descendante pour seance.js (getSession → getTemplate)
  getSession(id)    { return this.getTemplate(id); },
  getAllSessions()   { return this.getAllTemplates(); },

  /* ─────────────────────────────────────────────────────────────
     SÉANCES PLANIFIÉES (PlannedSession)
     Une instance = modèle + date concrète (YYYY-MM-DD).
     Figée une fois completed = true.
  ───────────────────────────────────────────────────────────── */

  getPlannedIds()     { return JSON.parse(localStorage.getItem(KEYS.PLANNED_LIST) || '[]'); },
  getPlanned(id)      { const r = localStorage.getItem(KEYS.PLANNED_PREFIX + id); return r ? JSON.parse(r) : null; },
  getAllPlanned()      { return this.getPlannedIds().map(id => this.getPlanned(id)).filter(Boolean); },
  savePlanned(p)      { localStorage.setItem(KEYS.PLANNED_PREFIX + p.id, JSON.stringify(p)); },

  addPlanned({ templateId, date }) {
    const id  = 'plan-' + Date.now();
    const ids = this.getPlannedIds();
    ids.push(id);
    localStorage.setItem(KEYS.PLANNED_LIST, JSON.stringify(ids));
    // Copie défensive des exercices du modèle → le planning est indépendant
    const tpl = this.getTemplate(templateId);
    const planned = {
      id, templateId, date,
      exercices: tpl ? tpl.exercices.map(b => ({ ...b })) : [],
      completed: false, completedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.savePlanned(planned);
    return planned;
  },

  /** Sauvegarde la liste d'exercices modifiée d'une séance planifiée. */
  updatePlannedExercices(id, exercices) {
    const p = this.getPlanned(id);
    if (!p) return null;
    p.exercices = exercices;
    this.savePlanned(p);
    return p;
  },

  deletePlanned(id) {
    const ids = this.getPlannedIds().filter(i => i !== id);
    localStorage.setItem(KEYS.PLANNED_LIST, JSON.stringify(ids));
    localStorage.removeItem(KEYS.PLANNED_PREFIX + id);
  },

  /**
   * Marque une séance planifiée comme terminée.
   * Appelé par seance.js à la fin de saveAllResults().
   */
  completePlanned(id) {
    const p = this.getPlanned(id);
    if (!p) return null;
    p.completed   = true;
    p.completedAt = new Date().toISOString();
    this.savePlanned(p);
    return p;
  },

  /**
   * Retourne les séances planifiées pour aujourd'hui (toutes, y compris terminées).
   */
  getTodayPlanned() {
    const today = localDateStr();
    return this.getAllPlanned().filter(p => p.date === today);
  },

  /**
   * Retourne les séances planifiées dans un intervalle de dates (inclus).
   * @param {string} startDate — 'YYYY-MM-DD'
   * @param {string} endDate   — 'YYYY-MM-DD'
   */
  getPlannedForRange(startDate, endDate) {
    return this.getAllPlanned().filter(p => p.date >= startDate && p.date <= endDate);
  },

  /**
   * Retourne les N modèles les plus récemment utilisés (d'après completedAt).
   * @param {number} n
   * @returns {{ template: SessionTemplate, completedAt: string }[]}
   */
  getRecentTemplates(n = 3) {
    const completed = this.getAllPlanned()
      .filter(p => p.completed && p.completedAt)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

    const seen   = new Set();
    const recent = [];
    for (const p of completed) {
      if (!seen.has(p.templateId)) {
        seen.add(p.templateId);
        const tpl = this.getTemplate(p.templateId);
        if (tpl && !tpl.archived) recent.push({ template: tpl, completedAt: p.completedAt });
        if (recent.length >= n) break;
      }
    }
    return recent;
  },

  /* ─────────────────────────────────────────────────────────────
     SÉANCE ACTIVE — snapshot complet pour reprise après quitter
  ───────────────────────────────────────────────────────────── */

  /**
   * Retourne le snapshot de la séance active, ou null si aucune.
   * Gère le cas legacy où la valeur stockée était un ID string.
   */
  getActiveSession() {
    const raw = localStorage.getItem(KEYS.ACTIVE_SESSION);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null; // ancien format
      return parsed;
    } catch { return null; }
  },

  /** Sauvegarde le snapshot complet de la séance en cours. */
  setActiveSession(state) { localStorage.setItem(KEYS.ACTIVE_SESSION, JSON.stringify(state)); },

  clearActiveSession()    { localStorage.removeItem(KEYS.ACTIVE_SESSION); },
};

window.DB = DB;

/* ============================================================
   ALIMENTATION — données statiques partagées
   Utilisées par alimentation.js et aliment.js
   ============================================================ */

window.CAT_SLUG = {
  'Viandes':          'viandes',
  'Poissons':         'poissons',
  'Fruits':           'fruits',
  'Légumes':          'legumes',
  'Féculents':        'feculents',
  'Produits laitiers':'laitiers',
  'Boissons':         'boissons',
  'Compléments':      'complements',
  'Autres':           'autres',
};

// m = macros pour 100g : { k:kcal, p:protéines, g:glucides, l:lipides }
window.ALIMENTS_DATA = [
  // Viandes
  { id: 'poulet-blanc',    nom: 'Poulet (blanc)',     categorie: 'Viandes',          detail: '31g protéines · 165 kcal / 100g',  m: { k: 165, p: 31.0, g: 0.0, l: 3.6 } },
  { id: 'boeuf-hache',     nom: 'Bœuf haché 5%',      categorie: 'Viandes',          detail: '20g protéines · 137 kcal / 100g',  m: { k: 137, p: 20.0, g: 0.0, l: 6.0 } },
  { id: 'dinde-emincee',   nom: 'Dinde émincée',      categorie: 'Viandes',          detail: '29g protéines · 135 kcal / 100g',  m: { k: 135, p: 29.0, g: 0.0, l: 2.0 } },
  { id: 'porc-filet',      nom: 'Porc filet',         categorie: 'Viandes',          detail: '22g protéines · 143 kcal / 100g',  m: { k: 143, p: 22.0, g: 0.0, l: 5.0 } },
  // Poissons
  { id: 'saumon',          nom: 'Saumon',             categorie: 'Poissons',         detail: '25g protéines · 208 kcal / 100g',  m: { k: 208, p: 25.0, g: 0.0, l: 12.0 } },
  { id: 'thon-boite',      nom: 'Thon en boîte',      categorie: 'Poissons',         detail: '25g protéines · 116 kcal / 100g',  m: { k: 116, p: 25.0, g: 0.0, l: 1.0 } },
  { id: 'cabillaud',       nom: 'Cabillaud',          categorie: 'Poissons',         detail: '18g protéines · 82 kcal / 100g',   m: { k: 82,  p: 18.0, g: 0.0, l: 0.7 } },
  { id: 'sardines',        nom: 'Sardines',           categorie: 'Poissons',         detail: '21g protéines · 208 kcal / 100g',  m: { k: 208, p: 21.0, g: 0.0, l: 11.0 } },
  // Fruits
  { id: 'pomme',           nom: 'Pomme',              categorie: 'Fruits',           detail: '14g glucides · 52 kcal / 100g',    m: { k: 52,  p: 0.3,  g: 14.0, l: 0.2 }, type: 'unite', unitWeight: 150 },
  { id: 'banane',          nom: 'Banane',             categorie: 'Fruits',           detail: '23g glucides · 89 kcal / 100g',    m: { k: 89,  p: 1.1,  g: 23.0, l: 0.3 }, type: 'unite', unitWeight: 120 },
  { id: 'myrtilles',       nom: 'Myrtilles',          categorie: 'Fruits',           detail: '14g glucides · 57 kcal / 100g',    m: { k: 57,  p: 0.7,  g: 14.0, l: 0.3 } },
  { id: 'orange',          nom: 'Orange',             categorie: 'Fruits',           detail: '12g glucides · 47 kcal / 100g',    m: { k: 47,  p: 0.9,  g: 12.0, l: 0.1 }, type: 'unite', unitWeight: 130 },
  // Légumes
  { id: 'brocoli',         nom: 'Brocoli',            categorie: 'Légumes',          detail: '4g glucides · 35 kcal / 100g',     m: { k: 35,  p: 2.4,  g: 4.0,  l: 0.4 } },
  { id: 'epinards',        nom: 'Épinards',           categorie: 'Légumes',          detail: '1g glucides · 23 kcal / 100g',     m: { k: 23,  p: 2.9,  g: 1.0,  l: 0.4 } },
  { id: 'courgette',       nom: 'Courgette',          categorie: 'Légumes',          detail: '3g glucides · 17 kcal / 100g',     m: { k: 17,  p: 1.2,  g: 3.0,  l: 0.2 } },
  { id: 'tomate',          nom: 'Tomate',             categorie: 'Légumes',          detail: '4g glucides · 18 kcal / 100g',     m: { k: 18,  p: 0.9,  g: 4.0,  l: 0.2 } },
  // Féculents
  { id: 'riz-blanc',       nom: 'Riz blanc cuit',     categorie: 'Féculents',        detail: '28g glucides · 130 kcal / 100g',   m: { k: 130, p: 2.7,  g: 28.0, l: 0.3 } },
  { id: 'pates-completes', nom: 'Pâtes complètes',    categorie: 'Féculents',        detail: '31g glucides · 158 kcal / 100g',   m: { k: 158, p: 5.5,  g: 31.0, l: 1.1 } },
  { id: 'patate-douce',    nom: 'Patate douce',       categorie: 'Féculents',        detail: '20g glucides · 86 kcal / 100g',    m: { k: 86,  p: 1.6,  g: 20.0, l: 0.1 } },
  { id: 'pain-complet',    nom: 'Pain complet',       categorie: 'Féculents',        detail: '41g glucides · 247 kcal / 100g',   m: { k: 247, p: 8.5,  g: 41.0, l: 3.4 } },
  // Produits laitiers
  { id: 'fromage-blanc',   nom: 'Fromage blanc 0%',   categorie: 'Produits laitiers',detail: '8g protéines · 45 kcal / 100g',    m: { k: 45,  p: 8.0,  g: 4.0,  l: 0.2 } },
  { id: 'yaourt-nature',   nom: 'Yaourt nature',      categorie: 'Produits laitiers',detail: '5g protéines · 61 kcal / 100g',    m: { k: 61,  p: 5.0,  g: 5.0,  l: 2.0 } },
  { id: 'lait',            nom: 'Lait demi-écrémé',   categorie: 'Produits laitiers',detail: '3g protéines · 46 kcal / 100g',    m: { k: 46,  p: 3.2,  g: 5.0,  l: 1.5 } },
  { id: 'oeufs',           nom: 'Œufs entiers',       categorie: 'Produits laitiers',detail: '13g protéines · 155 kcal / 100g',  m: { k: 155, p: 13.0, g: 1.1,  l: 11.0 }, type: 'unite', unitWeight: 60 },
  // Boissons
  { id: 'eau',             nom: 'Eau plate',          categorie: 'Boissons',         detail: '0 kcal / 100ml',                   m: { k: 0,   p: 0.0,  g: 0.0,  l: 0.0 } },
  { id: 'cafe',            nom: 'Café noir',          categorie: 'Boissons',         detail: '2 kcal / 100ml',                   m: { k: 2,   p: 0.3,  g: 0.0,  l: 0.0 } },
  { id: 'jus-orange',      nom: "Jus d'orange",       categorie: 'Boissons',         detail: '10g glucides · 45 kcal / 100ml',   m: { k: 45,  p: 0.7,  g: 10.0, l: 0.2 } },
  // Autres
  { id: 'avocat',          nom: 'Avocat',             categorie: 'Autres',           detail: '15g lipides · 160 kcal / 100g',    m: { k: 160, p: 2.0,  g: 9.0,  l: 15.0 } },
  { id: 'amandes',         nom: 'Amandes',            categorie: 'Autres',           detail: '50g lipides · 579 kcal / 100g',    m: { k: 579, p: 21.0, g: 20.0, l: 50.0 } },
  { id: 'huile-olive',     nom: "Huile d'olive",      categorie: 'Autres',           detail: '100g lipides · 884 kcal / 100g',   m: { k: 884, p: 0.0,  g: 0.0,  l: 100.0 } },
];

/* ============================================================
   PROFIL_DB — objectif nutritionnel utilisateur
   Clé localStorage : ft_profile
   Structure :
     { poids, taille, sexe, activite, objectif, savedAt }
   objectif : 'perte' (défaut) | 'maintien'
   ============================================================ */
window.PROFIL_DB = {
  KEY: 'ft_profile',

  get() {
    const raw = localStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },

  save(data) {
    const toStore = Object.assign({}, data, { savedAt: new Date().toISOString() });
    localStorage.setItem(this.KEY, JSON.stringify(toStore));
    // DAILY_GOALS est un getter dynamique — il se recalcule automatiquement depuis localStorage.
    // Aucune mise à jour manuelle nécessaire ici.
  },

  /**
   * Calcule les objectifs journaliers selon l'objectif de l'utilisateur.
   * - 'perte'   : basé sur poidsRef (IMC 24), crée un déficit implicite
   * - 'maintien': basé sur le poids actuel, équilibre calorique
   * Retourne les valeurs par défaut si le profil est absent ou incomplet.
   * @returns {{ kcal, p, g, l, water, imc, poidsRef }}
   */
  calcGoals() {
    const prof = this.get();
    const defaults = { kcal: 2000, p: 130, g: 200, l: 65, water: 2500, imc: null, poidsRef: null };
    if (!prof || !prof.poids || !prof.taille) return defaults;

    const poids    = prof.poids;
    const tailleM  = prof.taille / 100;            // cm → m
    const sexe     = prof.sexe     || 'homme';
    const activite = parseFloat(prof.activite) || 1.55;
    const objectif = prof.objectif || 'perte';

    // IMC et poids de référence (IMC cible = 24)
    const imc      = Math.round((poids / (tailleM * tailleM)) * 10) / 10;
    const poidsRef = Math.round(24 * tailleM * tailleM * 10) / 10;

    let kcal, p, l, g;

    if (objectif === 'maintien') {
      // Maintien : calories basées sur le poids actuel, équilibre calorique
      const caloriesBase = sexe === 'femme' ? poids * 22.5 : poids * 24;
      kcal = Math.round(caloriesBase * activite);
      p = Math.round(poids * 1.6);               // 1,6 g/kg poids actuel
      l = Math.round(poids * 0.9);               // 0,9 g/kg poids actuel
      g = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
    } else {
      // Perte de gras (défaut) : basé sur poidsRef, déficit implicite
      const caloriesBase = sexe === 'femme' ? poidsRef * 22.5 : poidsRef * 24;
      kcal = Math.round(caloriesBase * activite);
      p = Math.round(poidsRef * 1.8);            // 1,8 g/kg poidsRef
      l = Math.round(poidsRef * 0.9);            // 0,9 g/kg poidsRef
      g = Math.max(0, Math.round((kcal - p * 4 - l * 9) / 4));
    }

    return { kcal, p, g, l, water: 2500, imc, poidsRef };
  },
};

/* ============================================================
   WEIGHT_DB — historique des pesées
   Clé localStorage : ft_weight_log
   Structure : [{ date: 'YYYY-MM-DD', poids: number }, …]
                Un seul enregistrement par date (la dernière saisie).
   ============================================================ */
window.WEIGHT_DB = {
  KEY: 'ft_weight_log',

  getAll() {
    const raw = localStorage.getItem(this.KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  },

  /** Ajoute ou remplace la pesée du jour donné, puis trie par date. */
  add(dateStr, poids) {
    const entries = this.getAll();
    const idx = entries.findIndex(e => e.date === dateStr);
    if (idx >= 0) {
      entries[idx].poids = poids;
    } else {
      entries.push({ date: dateStr, poids });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(this.KEY, JSON.stringify(entries));
  },

  /** Retourne la pesée la plus récente, ou null. */
  getLast() {
    const e = this.getAll();
    return e.length > 0 ? e[e.length - 1] : null;
  },

  /**
   * Calcule la tendance sur l'ensemble des pesées enregistrées.
   * Requiert ≥ 3 pesées réparties sur au moins 7 jours.
   * Méthode : compare la moyenne des premières moitié vs seconde moitié,
   * puis ramène en kg/semaine — évite la comparaison jour à jour.
   * @returns {{ perWeek, diff, totalDays, count } | null}
   */
  getTrend() {
    const entries = this.getAll();
    if (entries.length < 3) return null;

    const msDay    = 86400000;
    const d0       = new Date(entries[0].date + 'T00:00:00').getTime();
    const dN       = new Date(entries[entries.length - 1].date + 'T00:00:00').getTime();
    const totalDays = Math.round((dN - d0) / msDay);
    if (totalDays < 7) return null;

    const mid      = Math.floor(entries.length / 2);
    const avgEarly = entries.slice(0, mid).reduce((s, e) => s + e.poids, 0) / mid;
    const avgLate  = entries.slice(mid).reduce((s, e) => s + e.poids, 0) / (entries.length - mid);

    const diff    = Math.round((avgLate - avgEarly) * 100) / 100;
    const weeks   = totalDays / 7;
    const perWeek = Math.round((diff / weeks) * 10) / 10;

    return { perWeek, diff, totalDays, count: entries.length };
  },
};

/* ============================================================
   ALIMENTATION — objectifs journaliers
   Getter dynamique : recalcule depuis localStorage à chaque accès.
   Garantit que tous les modules lisent toujours des valeurs fraîches,
   y compris après restauration depuis le bfcache navigateur.
   ============================================================ */
Object.defineProperty(window, 'DAILY_GOALS', {
  get()         { return window.PROFIL_DB.calcGoals(); },
  configurable: true,
  enumerable:   true,
});

/* ============================================================
   ALIM_DB — lecture/écriture du journal alimentaire
   Clé localStorage : ft_alim_day_YYYY-MM-DD
   Structure jour :
     { date, water, meals: { [mealKey]: { validated, items[] } } }
   Item :
     { alimId, nom, qty, k, p, g, l }   ← macros déjà calculées pour qty
   ============================================================ */
const MEAL_KEYS = ['petit-dejeuner', 'dejeuner', 'diner', 'collations', 'supplements'];

function emptyDay(date) {
  const meals = {};
  MEAL_KEYS.forEach(k => { meals[k] = { validated: false, items: [] }; });
  return { date, water: 0, meals };
}

window.ALIM_DB = {
  _key(date) { return 'ft_alim_day_' + date; },

  getDay(date) {
    const raw = localStorage.getItem(this._key(date));
    return raw ? JSON.parse(raw) : emptyDay(date);
  },

  saveDay(day) {
    localStorage.setItem(this._key(day.date), JSON.stringify(day));
  },

  /** Ajoute un aliment à un repas et recalcule ses macros pour qty. */
  addItem(date, mealKey, alimId, qty) {
    const day  = this.getDay(date);
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === alimId);
    if (!alim) return;
    const r = qty / 100;
    day.meals[mealKey].items.push({
      alimId,
      nom:  alim.nom,
      qty:  qty,
      k:    Math.round(alim.m.k * r * 10) / 10,
      p:    Math.round(alim.m.p * r * 10) / 10,
      g:    Math.round(alim.m.g * r * 10) / 10,
      l:    Math.round(alim.m.l * r * 10) / 10,
    });
    this.saveDay(day);
    return day;
  },

  /** Supprime un aliment (par index) d'un repas. */
  removeItem(date, mealKey, index) {
    const day = this.getDay(date);
    day.meals[mealKey].items.splice(index, 1);
    this.saveDay(day);
    return day;
  },

  toggleValidated(date, mealKey) {
    const day = this.getDay(date);
    day.meals[mealKey].validated = !day.meals[mealKey].validated;
    this.saveDay(day);
    return day;
  },

  setWater(date, ml) {
    const day = this.getDay(date);
    day.water = Math.max(0, ml);
    this.saveDay(day);
    return day;
  },

  /** Totaux kcal/macros de la journée (tous repas). */
  calcTotals(day) {
    let k = 0, p = 0, g = 0, l = 0;
    MEAL_KEYS.forEach(mk => {
      (day.meals[mk].items || []).forEach(it => { k += it.k; p += it.p; g += it.g; l += it.l; });
    });
    return { k: Math.round(k), p: Math.round(p * 10) / 10, g: Math.round(g * 10) / 10, l: Math.round(l * 10) / 10 };
  },

  /** Totaux d'un seul repas. */
  calcMealTotals(day, mealKey) {
    let k = 0, p = 0, g = 0, l = 0;
    (day.meals[mealKey].items || []).forEach(it => { k += it.k; p += it.p; g += it.g; l += it.l; });
    return { k: Math.round(k), p: Math.round(p * 10) / 10, g: Math.round(g * 10) / 10, l: Math.round(l * 10) / 10 };
  },
};
window.MEAL_KEYS = MEAL_KEYS;

/* ──────────────────────────────────────────────────────────────
   Helper partagé : convertit item.quantite (compte ou grammes)
   en facteur macros = grammesRéels / 100.
   Utilisé par RECETTES_DB et MEAL_PLAN_DB pour unifier le calcul.
   ────────────────────────────────────────────────────────────── */
function _alimItemFactor(alim, item) {
  const mode = alim.modeConsommation;
  let grams;
  if (mode === 'piece' || item.type === 'unite') {
    grams = item.quantite * (alim.unitWeight || alim.portionReference || 100);
  } else if (mode === 'portion') {
    grams = item.quantite * (alim.portionReference || 100);
  } else {
    grams = item.quantite; // poids (g) ou volume (ml)
  }
  return grams / 100;
}

/* ============================================================
   RECETTES_DB — gestion des recettes enregistrées
   Clés localStorage :
     ft_recettes      → string[] — IDs des recettes
     ft_recette_<id>  → Recette
   Structure recette :
     { id, nom, aliments: [{ alimId, nom, type, quantite }] }
   ============================================================ */
window.RECETTES_DB = {
  _listKey: 'ft_recettes',
  _prefix:  'ft_recette_',

  getIds()  { return JSON.parse(localStorage.getItem(this._listKey) || '[]'); },
  get(id)   { const r = localStorage.getItem(this._prefix + id); return r ? JSON.parse(r) : null; },
  getAll()  { return this.getIds().map(id => this.get(id)).filter(Boolean); },
  save(rec) { localStorage.setItem(this._prefix + rec.id, JSON.stringify(rec)); },

  add(nom) {
    const id  = 'rec-' + Date.now();
    const ids = this.getIds();
    ids.push(id);
    localStorage.setItem(this._listKey, JSON.stringify(ids));
    const rec = { id, nom: nom || 'Nouvelle recette', aliments: [] };
    this.save(rec);
    return rec;
  },

  delete(id) {
    const ids = this.getIds().filter(i => i !== id);
    localStorage.setItem(this._listKey, JSON.stringify(ids));
    localStorage.removeItem(this._prefix + id);
  },

  addAliment(recId, alimId, quantite) {
    const rec  = this.get(recId);
    if (!rec) return null;
    const alim = (window.ALIMENTS_DATA || []).find(a => a.id === alimId);
    if (!alim) return null;
    rec.aliments.push({
      alimId,
      nom:      alim.nom,
      type:     alim.type || 'gramme',
      quantite: Math.max(1, Math.round(quantite)),
    });
    this.save(rec);
    return rec;
  },

  removeAliment(recId, idx) {
    const rec = this.get(recId);
    if (!rec) return null;
    rec.aliments.splice(idx, 1);
    this.save(rec);
    return rec;
  },

  updateQty(recId, idx, quantite) {
    const rec = this.get(recId);
    if (!rec || !rec.aliments[idx]) return null;
    rec.aliments[idx].quantite = Math.max(1, Math.round(quantite));
    this.save(rec);
    return rec;
  },

  updateNom(recId, nom) {
    const rec = this.get(recId);
    if (!rec) return null;
    rec.nom = (nom || '').trim() || 'Nouvelle recette';
    this.save(rec);
    return rec;
  },

  /** Totaux nutritionnels de la recette entière. */
  calcTotals(rec) {
    let k = 0, p = 0, g = 0, l = 0;
    (rec.aliments || []).forEach(item => {
      const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
      if (!alim) return;
      const r = _alimItemFactor(alim, item);
      k += alim.m.k * r;
      p += alim.m.p * r;
      g += alim.m.g * r;
      l += alim.m.l * r;
    });
    return {
      k: Math.round(k),
      p: Math.round(p * 10) / 10,
      g: Math.round(g * 10) / 10,
      l: Math.round(l * 10) / 10,
    };
  },
};

/* ============================================================
   MEAL_PLAN_DB — planning alimentaire hebdomadaire
   Clé localStorage : ft_meal_plan_<YYYY-MM-DD>
   Structure :
     { date, entries: [{ id, mealKey, recetteId, recetteNom, totalKcal }] }
   ============================================================ */
window.MEAL_PLAN_DB = {
  _key(date) { return 'ft_meal_plan_' + date; },

  getDay(date) {
    const raw = localStorage.getItem(this._key(date));
    return raw ? JSON.parse(raw) : { date, entries: [] };
  },

  saveDay(plan) {
    localStorage.setItem(this._key(plan.date), JSON.stringify(plan));
  },

  addEntry(date, mealKey, recetteId, recetteNom, totalKcal) {
    const plan = this.getDay(date);
    // Copie défensive des aliments de la recette → le planning est indépendant
    const rec  = window.RECETTES_DB ? window.RECETTES_DB.get(recetteId) : null;
    const entry = {
      id:         'mpe-' + Date.now(),
      mealKey,
      recetteId,
      recetteNom,
      totalKcal:  totalKcal || 0,
      aliments:   rec ? rec.aliments.map(a => ({ ...a })) : [],
    };
    plan.entries.push(entry);
    this.saveDay(plan);
    return entry;
  },

  /** Ajoute un aliment à une entrée du planning (sans toucher à la recette). */
  addAlimentToEntry(date, entryId, alimId, quantite) {
    const plan  = this.getDay(date);
    const entry = plan.entries.find(e => e.id === entryId);
    if (!entry) return null;
    const alim  = (window.ALIMENTS_DATA || []).find(a => a.id === alimId);
    if (!alim) return null;
    if (!entry.aliments) entry.aliments = [];
    entry.aliments.push({
      alimId,
      nom:      alim.nom,
      type:     alim.type || 'gramme',
      quantite: Math.max(1, Math.round(quantite)),
    });
    entry.totalKcal = this._calcEntryKcal(entry);
    this.saveDay(plan);
    return entry;
  },

  /** Supprime un aliment (par index) d'une entrée du planning. */
  removeAlimentFromEntry(date, entryId, idx) {
    const plan  = this.getDay(date);
    const entry = plan.entries.find(e => e.id === entryId);
    if (!entry || !entry.aliments) return null;
    entry.aliments.splice(idx, 1);
    entry.totalKcal = this._calcEntryKcal(entry);
    this.saveDay(plan);
    return entry;
  },

  /** Met à jour les quantités d'une entrée du planning. */
  updateEntryAliments(date, entryId, aliments) {
    const plan  = this.getDay(date);
    const entry = plan.entries.find(e => e.id === entryId);
    if (!entry) return null;
    entry.aliments  = aliments;
    entry.totalKcal = this._calcEntryKcal(entry);
    this.saveDay(plan);
    return entry;
  },

  _calcEntryKcal(entry) {
    let k = 0;
    (entry.aliments || []).forEach(item => {
      const alim = (window.ALIMENTS_DATA || []).find(a => a.id === item.alimId);
      if (!alim) return;
      k += alim.m.k * _alimItemFactor(alim, item);
    });
    return Math.round(k);
  },

  removeEntry(date, entryId) {
    const plan = this.getDay(date);
    plan.entries = plan.entries.filter(e => e.id !== entryId);
    this.saveDay(plan);
  },

  /** Met à jour le statut d'une entrée : 'planifie' | 'consomme' | 'saute' */
  setStatus(date, entryId, status) {
    const plan  = this.getDay(date);
    const entry = plan.entries.find(e => e.id === entryId);
    if (entry) { entry.status = status; this.saveDay(plan); }
  },

  /** Duplique une entrée vers d'autres jours. */
  duplicateEntry(fromDate, entryId, toDates) {
    const from  = this.getDay(fromDate);
    const entry = from.entries.find(e => e.id === entryId);
    if (!entry) return;
    toDates.forEach(d => {
      const to = this.getDay(d);
      to.entries.push({
        id:         'mpe-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
        mealKey:    entry.mealKey,
        recetteId:  entry.recetteId,
        recetteNom: entry.recetteNom,
        totalKcal:  entry.totalKcal,
        aliments:   (entry.aliments || []).map(a => ({ ...a })),
      });
      this.saveDay(to);
    });
  },

  /** Copie tous les repas d'un jour vers d'autres jours. */
  copyDay(fromDate, toDates) {
    const from = this.getDay(fromDate);
    if (from.entries.length === 0) return;
    toDates.forEach(d => {
      if (d === fromDate) return;
      const to = this.getDay(d);
      from.entries.forEach(e => {
        to.entries.push({
          id:         'mpe-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
          mealKey:    e.mealKey,
          recetteId:  e.recetteId,
          recetteNom: e.recetteNom,
          totalKcal:  e.totalKcal,
          aliments:   (e.aliments || []).map(a => ({ ...a })),
        });
      });
      this.saveDay(to);
    });
  },
};

/* ============================================================
   CUSTOM_ALIM_DB — gestion des aliments personnalisés
   Permet d'archiver (masquer), désarchiver et supprimer.
   Clés localStorage :
     ft_custom_aliments         → Aliment[] (custom: true, archived?: boolean)
     ft_hidden_static_aliments  → string[]  (IDs d'aliments statiques masqués)
   ============================================================ */
window.CUSTOM_ALIM_DB = {
  CUSTOM_KEY: 'ft_custom_aliments',
  HIDDEN_KEY: 'ft_hidden_static_aliments',

  _getList() {
    try { return JSON.parse(localStorage.getItem(this.CUSTOM_KEY) || '[]'); }
    catch { return []; }
  },
  _saveList(list) { localStorage.setItem(this.CUSTOM_KEY, JSON.stringify(list)); },

  getAll()     { return this._getList(); },
  getActive()  { return this._getList().filter(a => !a.archived); },
  getArchived(){ return this._getList().filter(a =>  a.archived); },

  getHiddenStaticIds() {
    try { return JSON.parse(localStorage.getItem(this.HIDDEN_KEY) || '[]'); }
    catch { return []; }
  },

  /** Retourne true si l'aliment apparaît dans au moins un journal alimentaire. */
  isUsedAnywhere(id) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('ft_alim_day_')) continue;
      try {
        const day = JSON.parse(localStorage.getItem(key));
        for (const mk of Object.keys(day.meals || {})) {
          if ((day.meals[mk].items || []).some(it => it.alimId === id)) return true;
        }
      } catch {}
    }
    return false;
  },

  archive(id) {
    const list = this._getList();
    const idx  = list.findIndex(a => a.id === id);
    if (idx < 0) return false;
    list[idx].archived   = true;
    list[idx].archivedAt = new Date().toISOString();
    this._saveList(list);
    return true;
  },

  unarchive(id) {
    const list = this._getList();
    const idx  = list.findIndex(a => a.id === id);
    if (idx < 0) return false;
    list[idx].archived = false;
    delete list[idx].archivedAt;
    this._saveList(list);
    return true;
  },

  delete(id) {
    this._saveList(this._getList().filter(a => a.id !== id));
  },

  hideStatic(id) {
    const ids = this.getHiddenStaticIds();
    if (!ids.includes(id)) ids.push(id);
    localStorage.setItem(this.HIDDEN_KEY, JSON.stringify(ids));
  },

  showStatic(id) {
    const ids = this.getHiddenStaticIds().filter(i => i !== id);
    localStorage.setItem(this.HIDDEN_KEY, JSON.stringify(ids));
  },
};

/* ============================================================
   PROGRAMME_DB — programme d'entraînement long terme
   Clé localStorage : ft_programme
   Structure :
     { id, nom, startDate: 'YYYY-MM-DD', phases: [{
         nom, orientation, durationWeeks, repsMin, repsMax
     }] }
   ============================================================ */
window.PROGRAMME_DB = {
  KEY: 'ft_programme',

  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
  },

  save(prog) {
    localStorage.setItem(this.KEY, JSON.stringify(prog));
  },

  remove() {
    localStorage.removeItem(this.KEY);
  },

  getTotalWeeks(prog) {
    return (prog.phases || []).reduce((s, p) => s + (p.durationWeeks || 0), 0);
  },

  getCurrentWeek(prog) {
    const start    = new Date(prog.startDate + 'T00:00:00');
    const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000);
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  },

  getActivePhase(prog) {
    const week       = this.getCurrentWeek(prog);
    const totalWeeks = this.getTotalWeeks(prog);
    let cumWeeks = 0;
    for (let i = 0; i < prog.phases.length; i++) {
      const phase          = prog.phases[i];
      const phaseStartWeek = cumWeeks + 1;
      cumWeeks            += phase.durationWeeks;
      if (week <= cumWeeks) {
        return {
          phase,
          phaseIndex:        i,
          weekInPhase:       week - phaseStartWeek + 1,
          totalWeeksInPhase: phase.durationWeeks,
          weekOverall:       week,
          totalWeeks,
        };
      }
    }
    return null; // programme terminé
  },

  /**
   * Retourne le micro-cycle interne de la phase active :
   *   - 'mecanique'     (début de phase, ~3/8 du temps)
   *   - 'metabolique'   (milieu de phase, ~3/8 du temps)
   *   - 'overreaching'  (fin de phase, ~2/8 du temps)
   * L'utilisateur voit 'début / milieu / fin de phase', pas les termes techniques.
   */
  getMicroCycle(prog) {
    const info = this.getActivePhase(prog);
    if (!info) return null;
    const { weekInPhase, totalWeeksInPhase: N } = info;
    const mecEnd = Math.ceil(N * 3 / 8);
    const metEnd = Math.ceil(N * 6 / 8);
    if (weekInPhase <= mecEnd) return { type: 'mecanique',    label: 'début de phase' };
    if (weekInPhase <= metEnd) return { type: 'metabolique',  label: 'milieu de phase' };
    return                             { type: 'overreaching', label: 'fin de phase' };
  },
};
