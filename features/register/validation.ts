export const STUDENT_ID_RE = /^P\d{6}$/;
export const PHONE_RE = /^(70|71|75|76|77|78)\d{7}$/;
// Letters (incl. French accents), single spaces or hyphens between words.
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ -][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

export const PHONE_PREFIX = '+221';

export const normalizeStudentId = (value: string) => value.toUpperCase().replace(/\s/g, '').slice(0, 7);

/** Digits only, max 9 (Senegalese mobile number without the country code). */
export const phoneDigits = (value: string) => value.replace(/\D/g, '').slice(0, 9);

/** "777902880" → "77 790 28 80" */
export const formatPhone = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');

export const validateStudentId = (v: string) => (STUDENT_ID_RE.test(v) ? null : 'Format invalide. Exemple : P232055');

export const validatePhone = (v: string) =>
  PHONE_RE.test(v) ? null : 'Numéro invalide. Il doit commencer par 70, 71, 75, 76, 77 ou 78';

export function validateName(value: string, field: 'prénom' | 'nom') {
  const v = value.trim();
  if (!v) return field === 'prénom' ? 'Le prénom est requis' : 'Le nom est requis';
  return NAME_RE.test(v) ? null : 'Utilise uniquement des lettres, des espaces ou des tirets';
}

export const passwordRules = [
  { label: 'Au moins 8 caractères', test: (p: string) => p.length >= 8 },
  { label: 'Au moins 1 chiffre', test: (p: string) => /\d/.test(p) },
];

export const validatePassword = (p: string) =>
  passwordRules.every((r) => r.test(p.trim())) ? null : 'Le mot de passe ne respecte pas les critères';

export const validateConfirm = (password: string, confirm: string) =>
  confirm.trim() && confirm.trim() === password.trim() ? null : 'Les mots de passe ne correspondent pas';

// Same lists as the backend (GET /reference/student), kept here so sign-up works on a weak connection.
export const CAMPUSES = [
  { key: 'campus1', label: 'Campus 1', detail: 'Villages A à G, M, P, Q' },
  { key: 'campus2', label: 'Campus 2', detail: 'Villages H à L, N, O' },
] as const;

export type CampusKey = (typeof CAMPUSES)[number]['key'];

/** UGB's villages: Campus 1 (mostly undergraduates) and Campus 2 (mostly postgraduates). */
export const VILLAGES: Record<CampusKey, string[]> = {
  campus1: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'M', 'P', 'Q'].map((v) => `Village ${v}`),
  campus2: ['H', 'I', 'J', 'K', 'L', 'N', 'O'].map((v) => `Village ${v}`),
};

/** UGB's UFRs. The code is what the server stores; announcements can target one or several. */
export const UFRS = [
  { code: 'SAT', name: 'Sciences appliquées et technologie' },
  { code: 'LSH', name: 'Lettres et sciences humaines' },
  { code: 'SJP', name: 'Sciences juridiques et politiques' },
  { code: 'SEG', name: 'Sciences économiques et de gestion' },
  { code: 'S2ATA', name: 'Sciences agronomiques, aquaculture et technologies alimentaires' },
  { code: '2S', name: 'Santé' },
  { code: 'SEFS', name: 'Sciences de l’éducation, de la formation et du sport' },
  { code: 'CRAC', name: 'Civilisations, religions, arts et communication' },
] as const;
export type UfrCode = (typeof UFRS)[number]['code'];
/** "UFR SAT · Sciences appliquées et technologie", as listed in pickers. */
export const ufrLabel = (code: string) => {
  const u = UFRS.find((x) => x.code === code);
  return u ? `UFR ${u.code} · ${u.name}` : `UFR ${code}`;
};

/** Where the student comes from: Senegal's 14 regions, or abroad. */
export const REGIONS = [
  'Dakar', 'Diourbel', 'Fatick', 'Kaffrine', 'Kaolack', 'Kédougou', 'Kolda', 'Louga', 'Matam', 'Saint-Louis', 'Sédhiou', 'Tambacounda', 'Thiès', 'Ziguinchor',
  'Hors Sénégal',
] as const;
export type Region = (typeof REGIONS)[number];

/** Room number as written on the door: "214", "C12", "12B". */
export const normalizeRoom = (value: string) => value.toUpperCase().replace(/\s/g, '').slice(0, 6);

export const validateRoom = (v: string) =>
  /^[A-Z]?\d{1,4}[A-Z]?$/.test(v) ? null : v ? 'Format invalide. Exemple : 214 ou C12' : 'Indique ton numéro de chambre';
