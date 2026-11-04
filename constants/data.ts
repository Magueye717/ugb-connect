import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { HeldBooking } from '@/features/caravans/api';

import { colors } from './theme';

type Ionicon = ComponentProps<typeof Ionicons>['name'];

export const user = {
  firstName: 'Awa',
  lastName: 'Diop',
  initials: 'AD',
  campus: 'UGB · Campus social',
  /** Null when living off campus. */
  village: 'Village E' as string | null,
  room: '214' as string | null,
  studentId: '2023 0456 789',
  phone: '+221 77 123 45 67',
  ufr: 'UFR SAT',
  filiere: 'Informatique',
  niveau: 'L3',
};

export const services: {
  key: string;
  label: string;
  icon: Ionicon;
  bg: string;
  tint: string;
  href: string;
}[] = [
  { key: 'resto', label: 'Resto', icon: 'restaurant-outline', bg: colors.primarySoft, tint: colors.primary, href: '/(tabs)/resto' },
  { key: 'caravanes', label: 'Caravanes', icon: 'bus-outline', bg: '#FFE8D4', tint: colors.orange, href: '/(tabs)/caravanes' },
  { key: 'taxi', label: 'Sunu Taxi', icon: 'car-outline', bg: '#EEE8FF', tint: colors.purple, href: '/services/taxi' },
  { key: 'objets', label: 'Objets perdus', icon: 'cube-outline', bg: '#FFE4DC', tint: '#E86A3A', href: '/services/objets' },
  { key: 'bourses', label: 'Bourses', icon: 'school-outline', bg: '#E5F8EC', tint: colors.green, href: '/services/bourses' },
  { key: 'lieux', label: 'Lieux', icon: 'location-outline', bg: '#FFE8D4', tint: colors.orange, href: '/(tabs)/lieux' },
];

export type CaravanDirection = 'aller' | 'retour';

/**
 * Verification level, earned trip after trip:
 * - nouveau: documents checked, paid only after arrival
 * - verifie: 3+ trips rated 4/5 or more
 * - confirme: 10+ trips without serious incident
 */
export type OrganizerLevel = 'nouveau' | 'verifie' | 'confirme';

export type CaravanOrganizer = {
  /** The organization's id on the backend. */
  id: string;
  name: string;
  kind: 'Entreprise' | 'Amicale' | 'Transporteur';
  level: OrganizerLevel;
  /** Average rating out of 5, null before the first rated trip. */
  rating: number | null;
  trips: number;
};

/** A pickup or drop-off point and the bus's time there. */
export type CaravanStop = {
  /** "p1", "d2"…: what a booking refers to. */
  stopId: string;
  place: string;
  /** "06h15" */
  time: string;
  /** Same moment, in milliseconds. */
  at: number;
};

/** A departure, as the screens use it (built from the API by features/caravans/api.ts). */
export type Caravan = {
  id: string;
  code: string;
  status: string;
  organizer: CaravanOrganizer;
  /** Checked vehicle: its registered capacity is the most ever sold. The plate is shown to ticket holders. */
  vehicle: { label: string; plate: string | null };
  direction: CaravanDirection;
  from: string;
  to: string;
  /** "Mer. 03 sept" */
  date: string;
  /** Leaves the first pickup point at this time: "14h50". */
  time: string;
  /** Where students can get on, in route order. The first one is the departure. */
  pickups: CaravanStop[];
  /** Where students can get off, in route order. Times are estimates: traffic decides. */
  dropoffs: CaravanStop[];
  departureAt: number;
  /** Free seats. */
  seats: number;
  /** Seats sold on this vehicle. */
  totalSeats: number;
  /** Paid seats: what the minimum is measured on. */
  booked: number;
  /** Bookings needed for the trip to go ahead; below that everyone is refunded. */
  minPassengers: number;
  /** Last moment to reach `minPassengers`. */
  confirmBy: number;
  confirmed: boolean;
  bookingOpen: boolean;
  price: number;
  /** Seats one student can buy: their own + companions. */
  maxSeatsPerStudent: number;
  /** Providers accepted for this trip (the organizer's choice). */
  paymentMethods: ('wave' | 'orange_money')[];
  /** The ticket I travel on for this departure, if any. */
  myTicketId: string | null;
  /** I bought here and gave my own ticket to a friend. */
  purchasedHere: boolean;
  /** Seats I can still buy here (the limit counts purchases, even given away). */
  mySeatsLeft: number;
  /** Seats I took and haven't paid yet (held 10 min). */
  myBooking: HeldBooking | null;
};

export function caravanState(c: Pick<Caravan, 'booked' | 'minPassengers' | 'confirmed'>) {
  return { booked: c.booked, confirmed: c.confirmed, missing: Math.max(0, c.minPassengers - c.booked) };
}

// Manual grouping: Hermes' Intl support for fr-FR varies by platform.
export const formatFcfa = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** "mar. 2 sept. à 18h05", built by hand for the same reason. */
export function formatDateTime(ts: number) {
  const d = new Date(ts);
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} à ${d.getHours()}h${min}`;
}

export type PaymentMethod = {
  id: string;
  name: string;
  detail: string;
  /** Initials on the brand-color badge, shown while there's no logo file. */
  short: string;
  bg: string;
  /**
   * Official logo from the provider's merchant / brand kit, e.g.
   * require('@/assets/images/payments/wave.png'). Use only files they provide, per their brand rules.
   */
  logo?: number;
};

export const paymentMethods: PaymentMethod[] = [
  { id: 'wave', name: 'Wave', detail: 'Compte lié · 77 ••• •• 28', short: 'W', bg: '#1DC8F2', logo: require('@/assets/images/payments/wave.jpg') },
  { id: 'om', name: 'Orange Money', detail: 'Paiement mobile instantané', short: 'OM', bg: '#FF7900', logo: require('@/assets/images/payments/orange-money.png') },
];

// Usual service hours of the public restaurants (24h clock), for the local meal reminders. The menus' own hours come from the API.
export const mealTimes = {
  lunch: { label: 'Déjeuner', start: 12, end: 15 },
  dinner: { label: 'Dîner', start: 19, end: 21 },
};

export type LostStatus = 'found' | 'lost';

/**
 * Cards are never photographed (name, face and number would be public):
 * a student card is scanned to warn its owner, an ID card only shows a first name and initial.
 */
export type LostKind = 'student-card' | 'id-card' | 'object';

/** What the item is. Hints adapt the form to the type of object. */
export type LostCategory = {
  id: string;
  label: string;
  icon: Ionicon;
  kind: LostKind;
  /** Placeholder for the public description. */
  hint?: string;
  /** Placeholder for the private detail the finder uses to check the owner. */
  secretHint?: string;
};

export const lostCategories: LostCategory[] = [
  { id: 'student-card', label: 'Carte étudiant', icon: 'card-outline', kind: 'student-card' },
  { id: 'id-card', label: 'Carte d’identité', icon: 'id-card-outline', kind: 'id-card' },
  { id: 'bank-card', label: 'Carte bancaire', icon: 'card', kind: 'id-card' },
  { id: 'phone', label: 'Téléphone', icon: 'phone-portrait-outline', kind: 'object', hint: 'Marque, couleur, coque…', secretHint: 'Fond d’écran, autocollant au dos…' },
  { id: 'keys', label: 'Clés', icon: 'key-outline', kind: 'object', hint: 'Nombre de clés, porte-clé…', secretHint: 'Forme ou inscription du porte-clé…' },
  { id: 'bag', label: 'Sac', icon: 'bag-handle-outline', kind: 'object', hint: 'Type, couleur, marque…', secretHint: 'Ce qu’il y a dedans…' },
  { id: 'wallet', label: 'Portefeuille', icon: 'wallet-outline', kind: 'object', hint: 'Couleur, matière…', secretHint: 'Contenu, nom sur une carte…' },
  { id: 'earphones', label: 'Écouteurs', icon: 'headset-outline', kind: 'object', hint: 'Marque, couleur, boîtier…', secretHint: 'Marque ou rayure sur le boîtier…' },
  { id: 'glasses', label: 'Lunettes', icon: 'glasses-outline', kind: 'object', hint: 'Monture, couleur, étui…', secretHint: 'Étui, inscription sur la branche…' },
  { id: 'clothes', label: 'Vêtement', icon: 'shirt-outline', kind: 'object', hint: 'Type, couleur, taille…', secretHint: 'Taille, étiquette, objet dans la poche…' },
  { id: 'calculator', label: 'Calculatrice', icon: 'calculator-outline', kind: 'object', hint: 'Marque, modèle…', secretHint: 'Nom gravé, autocollant…' },
  { id: 'other', label: 'Autre', icon: 'cube-outline', kind: 'object', hint: 'Couleur, marque, signes distinctifs…', secretHint: 'Un détail qui ne se voit pas sur la photo…' },
];

export const lostCategory = (id: string) => lostCategories.find((c) => c.id === id) ?? lostCategories[lostCategories.length - 1];

const LOST_TONES = [
  { tint: colors.primary, bg: colors.primarySoft },
  { tint: colors.orange, bg: '#FFE8D4' },
  { tint: colors.green, bg: '#E5F8EC' },
  { tint: colors.purple, bg: '#EEE8FF' },
];
/** A colour per category, for the icon tiles of items without a photo. */
export const lostTone = (id: string) => LOST_TONES[Math.max(0, lostCategories.findIndex((c) => c.id === id)) % LOST_TONES.length]!;

/** Lost and found office: where found items can be dropped and collected. Details to confirm with the university. */
export const lostOffice = {
  name: 'Bureau des objets trouvés',
  area: 'Rectorat · rez-de-chaussée',
  hours: '8h-16h · lun.-ven.',
  coords: { lat: 16.0596, lng: -16.4221 },
};

/** Shown on found items kept by a student, and in every conversation. */
export const lostSafetyTip = 'Retrouvez-vous dans un lieu public du campus (BU, Resto 1). Ne partage pas ton numéro.';

export const lostQuickReplies = ['Je suis disponible maintenant', 'On se retrouve à la BU ?', 'Devant le Resto 1 ?', 'Merci beaucoup !'];


export const weekDays = [
  { id: 'mon', short: 'LUN', day: '27' },
  { id: 'tue', short: 'MAR', day: '28' },
  { id: 'wed', short: 'MER', day: '29' },
  { id: 'thu', short: 'JEU', day: '30' },
  { id: 'fri', short: 'VEN', day: '31' },
  { id: 'sat', short: 'SAM', day: '01' },
];

export type CourseKind = 'CM' | 'TD' | 'TP';

export const schedule: Record<
  string,
  { id: string; start: string; end: string; title: string; room: string; teacher: string; kind: CourseKind; movedFrom?: string }[]
> = {
  mon: [
    { id: 's1', start: '08:00', end: '10:00', title: 'Analyse 2', room: 'Amphi B', teacher: 'Pr. Diop', kind: 'CM' },
    { id: 's2', start: '11:00', end: '13:00', title: 'Algorithmique', room: 'Salle 12', teacher: 'Dr. Ba', kind: 'TD', movedFrom: '10h' },
    { id: 's3', start: '14:30', end: '17:30', title: 'TP Réseaux', room: 'Labo Info 3', teacher: 'M. Fall', kind: 'TP' },
  ],
  tue: [
    { id: 's4', start: '08:00', end: '10:00', title: 'Bases de données', room: 'Amphi A', teacher: 'Dr. Sow', kind: 'CM' },
    { id: 's5', start: '10:30', end: '12:30', title: 'Anglais', room: 'Salle 4', teacher: 'Mme Ndiaye', kind: 'TD' },
  ],
  wed: [{ id: 's6', start: '09:00', end: '12:00', title: 'Programmation web', room: 'Labo Info 1', teacher: 'M. Gueye', kind: 'TP' }],
  thu: [
    { id: 's7', start: '08:00', end: '10:00', title: 'Analyse 2', room: 'Amphi B', teacher: 'Pr. Diop', kind: 'TD' },
    { id: 's8', start: '15:00', end: '17:00', title: 'Systèmes', room: 'Amphi C', teacher: 'Dr. Kane', kind: 'CM' },
  ],
  fri: [{ id: 's9', start: '10:00', end: '12:00', title: 'Algorithmique', room: 'Amphi A', teacher: 'Dr. Ba', kind: 'CM' }],
  sat: [],
};

export const notificationFilters = ['Tout', 'Social', 'Cours', 'Paiements'] as const;
export type NotificationCategory = Exclude<(typeof notificationFilters)[number], 'Tout'>;

export const ufrs = ['UFR SAT', 'UFR LSH', 'UFR SES', 'UFR 2S', 'UFR CRAC'];
export const niveaux = ['L1', 'L2', 'L3', 'M1', 'M2'];

// Sunu Taxi: a student proposes a trip, others join and split the fare. Trips come from the backend (context/TaxiContext).

/** Trip chat stays open this long after departure, then becomes read-only. */
export const TAXI_CHAT_HOURS = 2;

export const taxiQuickReplies = [
  'J’arrive dans 5 min',
  'Je suis au point de rendez-vous',
  'Je suis en retard',
  'Je ne trouve pas le taxi',
];

/** Seats are locked this many minutes before departure (half-way for trips proposed less than an hour ahead). */
export const TAXI_LOCK_MIN = 30;
/** Late cancellations (30 days) before Sunu Taxi is suspended for 7 days. */
export const TAXI_STRIKES_LIMIT = 3;

/**
 * Fixed price per seat, paid when joining: the fare split as if the taxi were full. The organizer covers empty
 * seats, so passengers always know what they pay. Preview only: the server computes the real price.
 */
export const taxiSeatPrice = (t: { fare: number; seats: number }) => Math.ceil(t.fare / t.seats / 50) * 50;
