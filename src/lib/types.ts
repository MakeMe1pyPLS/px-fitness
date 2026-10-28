// Core domain types. Every record here is something the user entered or did,
// except where a field is explicitly marked as derived.

export type Goal =
  | 'lose_fat' | 'build_muscle' | 'gain_weight' | 'lean_muscle' | 'recomp' | 'general'
  | 'endurance' | 'strength' | 'mobility' | 'maintain' | 'athletic';
export type Discipline =
  | 'bodybuilding' | 'powerlifting' | 'olympic' | 'calisthenics' | 'gymnastics'
  | 'general_strength' | 'functional' | 'running' | 'hybrid' | 'sport';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'bodyweight' | 'dumbbells' | 'barbell' | 'machines' | 'bands' | 'kettlebell';
export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'varies';
export type MetricType = 'weight_reps' | 'reps' | 'time';

export interface Profile {
  name: string;
  goal: Goal; // primary goal
  secondaryGoals: Goal[];
  disciplines: Discipline[];
  primaryDiscipline: Discipline | null;
  goalHistory: { date: string; goal: Goal; discipline: Discipline | null }[];
  experience: Experience;
  equipment: Equipment[];
  sessionMinutes: number; // what the user said they usually have
  trainingDays: number[]; // 0 = Sunday … 6 = Saturday
  preferredTime: TimeOfDay;
  unit: 'lb' | 'kg';
  checkinsEnabled: boolean;
  createdAt: string; // ISO
}

export interface Exercise {
  id: string;
  name: string;
  muscle: 'legs' | 'push' | 'pull' | 'core' | 'full' | 'conditioning';
  equipment: Equipment;
  metric: MetricType;
  cue: string; // one-line form cue
  substitutes: string[]; // exercise ids
  custom?: boolean;
}

export interface TemplateExercise {
  exerciseId: string;
  sets: number;
  target: string; // e.g. "8–10 reps", "30 s"
}

export interface Template {
  id: string;
  name: string;
  focus: string;
  exercises: TemplateExercise[];
}

export interface SetEntry {
  weight?: number;
  reps?: number;
  seconds?: number;
  done: boolean;
}

export interface SessionExercise {
  exerciseId: string;
  target: string;
  sets: SetEntry[];
  swappedFrom?: string;
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface Session {
  id: string;
  templateId: string | null;
  name: string;
  variant: 'full' | 'short';
  plannedFor: string; // YYYY-MM-DD the session counts toward
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  exercises: SessionExercise[];
  effort?: 1 | 2 | 3 | 4 | 5; // post-workout "how did it feel"
  note?: string;
}

export type SkipReason = 'time' | 'energy' | 'sore' | 'unwell' | 'motivation' | 'other';

export interface Skip {
  id: string;
  date: string; // YYYY-MM-DD
  reason: SkipReason;
  note?: string;
  createdAt: string;
}

export interface Checkin {
  date: string; // YYYY-MM-DD, one per day
  mood?: number; // 1–5
  energy?: number; // 1–5
  stress?: number; // 1–5
  sleepHours?: number;
  soreness?: number; // 1–5
  availableMinutes?: number;
  note?: string;
  updatedAt: string;
}

export type InsightRuleId =
  | 'duration_adherence'
  | 'energy_training'
  | 'sleep_training'
  | 'weekday_adherence'
  | 'skip_reason'
  | 'time_of_day_finish';

export interface RecommendationRecord {
  id: string;
  ruleId: InsightRuleId;
  createdAt: string;
  status: 'accepted' | 'dismissed' | 'not_accurate';
  summary: string;
  // Filled in later by the outcome tracker: planned vs done in the 14 days
  // before and after the decision.
  baselineRate?: number;
}

export interface Settings {
  disabledRules: InsightRuleId[];
  reducedMotion: 'system' | 'on';
  sampleData: boolean;
  suggestShortWhenLow: boolean;
}

export interface AppData {
  version: number;
  profile: Profile | null;
  templates: Template[];
  rotationIndex: number;
  customExercises: Exercise[];
  sessions: Session[];
  skips: Skip[];
  checkins: Checkin[];
  recommendations: RecommendationRecord[];
  settings: Settings;
  nutrition: NutritionData;
  coach: CoachData;
  milestones: Milestone[];
  checkinMemory: { date: string; text: string }[]; // short things the user told the check-in bot
}

// ── Coaching (PX business side) ─────────────────────────────────────────────
export interface CoachTier { id: string; perWeek: number; pricePerSession: number }
export interface CoachProfile { name: string; headline: string; bio: string; specialties: string; location: string }
export interface CoachClient { id: string; name: string; contact: string; goal: string; tierId?: string; status: 'active' | 'paused' | 'ended'; notes: string; week: Record<string, string>; createdAt: string }
export interface CoachSession { id: string; clientId?: string; name: string; date: string; time: string; minutes: number; kind: 'in_person' | 'video'; status: 'scheduled' | 'done' | 'cancelled' | 'no_show'; note?: string }
export interface Inquiry { id: string; name: string; contact: string; tierId?: string; preferred: string; message: string; createdAt: string; status: 'new' | 'contacted' | 'converted' | 'closed'; source: 'app' | 'manual' }
export interface Payment { id: string; clientId?: string; payer: string; amount: number; date: string; method: string; status: 'paid' | 'due'; note?: string }

export interface CoachData {
  viewAsCoach: boolean;
  profile: CoachProfile;
  hours: Record<string, string>; // 'Mon' → '6:00–12:00' or ''
  links: { calendly: string; meet: string; email: string };
  tiers: CoachTier[];
  tiersConfirmed: boolean;
  clients: CoachClient[];
  sessions: CoachSession[];
  inquiries: Inquiry[];
  payments: Payment[];
}

export interface Milestone { id: string; date: string; title: string; note?: string }
export interface ProgressPhoto { id: string; date: string; dataUrl: string; note?: string; bytes: number }

// ── Nutrition ───────────────────────────────────────────────────────────────
export type DietPattern = 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan';
export type Allergen = 'egg' | 'dairy' | 'gluten' | 'peanut' | 'tree_nut' | 'soy' | 'fish' | 'shellfish' | 'sesame';
export type Kitchen = 'stove' | 'oven' | 'microwave' | 'rice_cooker' | 'blender';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface NutritionPrefs {
  pattern: DietPattern;
  allergies: Allergen[];
  dislikes: string[]; // ingredient ids
  cuisines: string[];
  cookingSkill: 'basic' | 'comfortable' | 'confident';
  kitchen: Kitchen[];
  maxPrepMinutes: number; // per meal, active + cook
  people: number;
  mealsPerDay: number;
  showNumbers: boolean; // user can hide calorie/macro numbers entirely
  // Optional body data, only for estimates. Never required.
  sex?: 'male' | 'female' | 'unspecified';
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: 'light' | 'moderate' | 'high';
  updatedAt: string;
}

export interface Budget {
  amount: number;
  period: 'day' | 'week' | 'month';
  scope: 'groceries' | 'eating_out' | 'combined';
  eatingOutShare: number; // 0–1, only for combined
  perMeal?: number;
  currency: 'USD' | 'CAD' | 'GBP' | 'EUR';
}

export interface PriceOverride { price: number; pkgGrams: number; updatedAt: string }

export interface PlanItem {
  recipeId: string;
  servings: number;
  mealType: MealType;
  swaps: Record<string, string>; // original ingredient id → replacement id
}

export interface MealPlan {
  id: string;
  createdAt: string;
  days: number;
  people: number;
  mealTypes: MealType[];
  items: PlanItem[];
  status: 'active' | 'archived';
  prepped: boolean;
  eaten: Record<string, number>; // recipeId → servings eaten
}

export interface GroceryItem {
  id: string;
  ingredientId?: string;
  name: string;
  grams?: number;
  note?: string;
  category: string;
  checked: boolean;
  manual: boolean;
}

export interface MealLogEntry {
  id: string;
  date: string;
  recipeId?: string;
  name: string;
  where: 'home' | 'out';
  fullness?: number; // 1–5
  rating?: number; // 1–5
  cost?: number;
  createdAt: string;
}

export interface MealFeedback { recipeId: string; kind: 'accepted' | 'rejected' | 'shuffled'; at: string }

export interface Spend { id: string; date: string; amount: number; kind: 'grocery' | 'eating_out'; note?: string }

export interface SavedPlace { id: string; name: string; kind: string; lat: number; lon: number; address?: string; savedAt: string }

export interface NutritionData {
  prefs: NutritionPrefs | null;
  budget: Budget | null;
  prices: Record<string, PriceOverride>;
  plans: MealPlan[];
  grocery: GroceryItem[];
  groceryPlanId?: string;
  log: MealLogEntry[];
  feedback: MealFeedback[];
  saved: string[];
  ratings: Record<string, number>;
  spending: Spend[];
  // Coarse location only (rounded to ~1 km). No history is kept.
  location: { label: string; lat: number; lon: number } | null;
  places: SavedPlace[];
}
