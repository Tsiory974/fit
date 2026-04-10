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
const DB_VERSION_CURRENT = 6;

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
  saveTemplate(t)     { localStorage.setItem(KEYS.TEMPLATE_PREFIX + t.id, JSON.stringify(t)); },

  addTemplate({ nom, exercices = [] }) {
    const id  = 'tpl-' + Date.now();
    const ids = this.getTemplateIds();
    ids.push(id);
    localStorage.setItem(KEYS.TEMPLATE_LIST, JSON.stringify(ids));
    const tpl = { id, nom, exercices, createdAt: new Date().toISOString() };
    this.saveTemplate(tpl);
    return tpl;
  },

  updateTemplate(tpl) {
    if (!this.getTemplateIds().includes(tpl.id)) return null;
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
    const planned = {
      id, templateId, date,
      completed: false, completedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.savePlanned(planned);
    return planned;
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
        if (tpl) recent.push({ template: tpl, completedAt: p.completedAt });
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
