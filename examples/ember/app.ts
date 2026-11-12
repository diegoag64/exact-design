import type { Answer, Result, Sources, Storage } from './app.contract.d.ts';

// Ember keeps one JSON file: the profile, every logged food, water, workouts and weigh-ins.
// The first read seeds a lived-in week that ends on the day the app asks for, so a fresh
// install, a test and the design editor all open on a believable dashboard.
export const grants = 'fs.read app:/data/ember.json\nfs.write app:/data/ember.json';

type Board = Result<'loadBoard'>;
type Profile = Board['profile'];
type Food = Result<'searchFoods'>[number];
type Logged = { id: string; day: string; meal: string; food: string };
type Moves = { steps: number; active: number; exercise: number };
type Session = { id: string; day: string; kind: string; minutes: number; kcal: number; when: string; km: number };
type Data = {
  v: 1;
  seeded: string;
  profile: Profile;
  entries: Logged[];
  water: Record<string, number>;
  moves: Record<string, Moves>;
  sessions: Session[];
  weights: { day: string; kg: number }[];
};

const FILE = 'app:/data/ember.json';
const MEALS = [
  { id: 'breakfast', title: 'Breakfast' },
  { id: 'lunch', title: 'Lunch' },
  { id: 'dinner', title: 'Dinner' },
  { id: 'snacks', title: 'Snacks' },
];

const FOODS: Food[] = [
  { id: 'yogurt', name: 'Greek yogurt & berries', portion: '1 bowl · 250 g', kcal: 290, protein: 20, carbs: 38, fat: 7, kind: 'bowl' },
  { id: 'avotoast', name: 'Avocado toast with egg', portion: '2 slices', kcal: 410, protein: 17, carbs: 36, fat: 22, kind: 'avocado' },
  { id: 'flatwhite', name: 'Oat flat white', portion: '1 cup · 350 ml', kcal: 140, protein: 3, carbs: 18, fat: 6, kind: 'coffee' },
  { id: 'oats', name: 'Overnight oats', portion: '1 jar · 300 g', kcal: 360, protein: 14, carbs: 52, fat: 10, kind: 'grains' },
  { id: 'eggs', name: 'Scrambled eggs', portion: '3 eggs', kcal: 270, protein: 19, carbs: 2, fat: 20, kind: 'egg' },
  { id: 'banana', name: 'Banana', portion: '1 medium', kcal: 105, protein: 1, carbs: 27, fat: 0, kind: 'fruit' },
  { id: 'poke', name: 'Salmon poke bowl', portion: '1 bowl · 420 g', kcal: 560, protein: 34, carbs: 62, fat: 18, kind: 'fish' },
  { id: 'caesar', name: 'Chicken Caesar salad', portion: '1 plate', kcal: 470, protein: 38, carbs: 16, fat: 28, kind: 'leaf' },
  { id: 'chicken', name: 'Grilled chicken breast', portion: '150 g', kcal: 248, protein: 46, carbs: 0, fat: 5, kind: 'pot' },
  { id: 'rice', name: 'Brown rice', portion: '1 cup cooked', kcal: 216, protein: 5, carbs: 45, fat: 2, kind: 'grains' },
  { id: 'lentil', name: 'Red lentil soup', portion: '1 bowl · 350 ml', kcal: 230, protein: 18, carbs: 34, fat: 3, kind: 'soup' },
  { id: 'pizza', name: 'Margherita pizza', portion: '2 slices', kcal: 540, protein: 22, carbs: 66, fat: 20, kind: 'pizza' },
  { id: 'burger', name: 'Smash burger', portion: '1 burger', kcal: 720, protein: 38, carbs: 42, fat: 44, kind: 'burger' },
  { id: 'sourdough', name: 'Sourdough bread', portion: '1 slice', kcal: 120, protein: 4, carbs: 23, fat: 1, kind: 'bread' },
  { id: 'almonds', name: 'Almonds', portion: '30 g', kcal: 174, protein: 6, carbs: 6, fat: 15, kind: 'leaf' },
  { id: 'chocolate', name: 'Dark chocolate', portion: '2 squares · 20 g', kcal: 120, protein: 2, carbs: 9, fat: 9, kind: 'cookie' },
  { id: 'apple', name: 'Honeycrisp apple', portion: '1 medium', kcal: 95, protein: 0, carbs: 25, fat: 0, kind: 'fruit' },
  { id: 'shake', name: 'Protein shake', portion: '1 bottle · 330 ml', kcal: 180, protein: 30, carbs: 8, fat: 3, kind: 'drink' },
  { id: 'hummus', name: 'Carrots & hummus', portion: '1 pack', kcal: 160, protein: 5, carbs: 17, fat: 9, kind: 'carrot' },
  { id: 'pasta', name: 'Pasta pomodoro', portion: '1 plate', kcal: 520, protein: 17, carbs: 86, fat: 12, kind: 'soup' },
  { id: 'sushi', name: 'Sushi set', portion: '8 pieces', kcal: 420, protein: 20, carbs: 70, fat: 6, kind: 'fish' },
  { id: 'cottage', name: 'Cottage cheese', portion: '1 cup', kcal: 206, protein: 28, carbs: 8, fat: 9, kind: 'bowl' },
  { id: 'granola', name: 'Granola bar', portion: '1 bar', kcal: 190, protein: 4, carbs: 29, fat: 7, kind: 'grains' },
  { id: 'juice', name: 'Fresh orange juice', portion: '1 glass · 250 ml', kcal: 112, protein: 2, carbs: 26, fat: 0, kind: 'drink' },
  { id: 'tofu', name: 'Tofu stir-fry', portion: '1 plate', kcal: 380, protein: 22, carbs: 32, fat: 18, kind: 'pot' },
  { id: 'quinoa', name: 'Quinoa salad', portion: '1 bowl', kcal: 340, protein: 12, carbs: 44, fat: 13, kind: 'leaf' },
];
const food = (id: string) => FOODS.find((f) => f.id === id);

const KINDS: Record<string, { title: string; perMinute: number; stepsPerMinute: number; kmPerMinute: number }> = {
  run: { title: 'Outdoor run', perMinute: 10.7, stepsPerMinute: 165, kmPerMinute: 0.17 },
  walk: { title: 'Brisk walk', perMinute: 5, stepsPerMinute: 115, kmPerMinute: 0.09 },
  strength: { title: 'Strength training', perMinute: 6, stepsPerMinute: 0, kmPerMinute: 0 },
  cycle: { title: 'Cycling', perMinute: 8, stepsPerMinute: 0, kmPerMinute: 0.36 },
  yoga: { title: 'Yoga flow', perMinute: 4, stepsPerMinute: 0, kmPerMinute: 0 },
  swim: { title: 'Pool swim', perMinute: 9, stepsPerMinute: 0, kmPerMinute: 0.04 },
};

// Days are ISO dates compared as text; arithmetic happens at UTC noon so no offset moves them.
const toMs = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);
const shift = (day: string, by: number) => new Date(toMs(day) + by * 86400000).toISOString().slice(0, 10);
const fmt = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(toMs(day)));
const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

const SEED_PROFILE: Profile = {
  name: 'Sam', goal: 'lose', weight: 74.2, target: 70, height: 178, age: 31, activity: 'moderate',
  calories: 2060, protein: 148, carbs: 223, fat: 64, steps: 10000, water: 8, onboarded: true,
};

// A week of believable eating: today stops before dinner, so the dashboard has something to do.
const PLAN: [string, string[]][][] = [
  [['breakfast', ['flatwhite', 'yogurt']], ['lunch', ['poke']], ['snacks', ['apple', 'almonds']]],
  [['breakfast', ['eggs', 'sourdough', 'flatwhite']], ['lunch', ['caesar']], ['dinner', ['tofu', 'rice']], ['snacks', ['chocolate']]],
  [['breakfast', ['oats', 'banana']], ['lunch', ['lentil', 'sourdough']], ['dinner', ['pasta']], ['snacks', ['shake']]],
  [['breakfast', ['avotoast', 'juice']], ['lunch', ['quinoa']], ['dinner', ['chicken', 'rice']], ['snacks', ['granola', 'apple']]],
  [['breakfast', ['yogurt', 'flatwhite']], ['lunch', ['sushi']], ['dinner', ['pizza']], ['snacks', ['hummus']]],
  [['breakfast', ['eggs', 'juice']], ['lunch', ['poke']], ['dinner', ['burger']], ['snacks', ['almonds']]],
  [['breakfast', ['oats']], ['lunch', ['caesar', 'sourdough']], ['dinner', ['tofu']], ['snacks', ['cottage', 'banana']]],
];
const STEPS = [7842, 9120, 11240, 6480, 10380, 12010, 8650];
const ACTIVE = [486, 512, 640, 380, 590, 702, 455];
const EXERCISE = [38, 41, 55, 24, 48, 62, 33];
const WATER = [5, 8, 7, 6, 8, 5, 7];
const WEIGHTS = [74.2, 74.8, 75.1, 75.6, 76.2, 76.5, 77.1, 77.4, 78];

function seed(today: string): Data {
  const entries: Logged[] = [];
  const water: Record<string, number> = {};
  const moves: Record<string, Moves> = {};
  PLAN.forEach((meals, back) => {
    const day = shift(today, -back);
    for (const [meal, ids] of meals) for (const id of ids) entries.push({ id: `${day}-${meal}-${id}`, day, meal, food: id });
    water[day] = WATER[back];
    moves[day] = { steps: STEPS[back], active: ACTIVE[back], exercise: EXERCISE[back] };
  });
  const sessions: Session[] = [
    { id: 's1', day: today, kind: 'run', minutes: 32, kcal: 342, when: '7:05 AM', km: 5.4 },
    { id: 's2', day: shift(today, -1), kind: 'strength', minutes: 45, kcal: 260, when: '6:30 PM', km: 0 },
    { id: 's3', day: shift(today, -2), kind: 'yoga', minutes: 30, kcal: 120, when: '7:15 AM', km: 0 },
    { id: 's4', day: shift(today, -3), kind: 'cycle', minutes: 52, kcal: 410, when: '5:40 PM', km: 18.6 },
    { id: 's5', day: shift(today, -5), kind: 'run', minutes: 58, kcal: 610, when: '8:00 AM', km: 9.8 },
  ];
  const weights = WEIGHTS.map((kg, i) => ({ day: shift(today, -7 * i), kg })).reverse();
  return { v: 1, seeded: today, profile: { ...SEED_PROFILE }, entries, water, moves, sessions, weights };
}

let cache: Data | undefined;
async function load(storage: Storage, today: string): Promise<Data> {
  if (cache) return cache;
  try {
    const saved = JSON.parse(new TextDecoder().decode(await storage.fs.readFile(FILE))) as Data;
    if (saved?.v !== 1 || !saved.profile || !Array.isArray(saved.entries)) return (cache = seed(today));
    cache = saved;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'bake') return seed(today); // the build reads ahead of any storage
    if (code !== 'ENOENT') throw e;
    cache = seed(today);
  }
  return cache;
}
async function save(storage: Storage, next: Data) {
  await storage.fs.atomicWriteFile(FILE, new TextEncoder().encode(JSON.stringify(next)));
  cache = next;
  return { ok: true, error: '' };
}
const refuse = (error: string) => ({ ok: false, error });

// A day the seed never covered still moves a little, steadily, so an old day is not a blank chart.
const movesOf = (data: Data, day: string): Moves =>
  data.moves[day] ?? (day > data.seeded ? { steps: 0, active: 0, exercise: 0 } : { steps: 5200 + (hash(day) % 6000), active: 280 + (hash(day + 'a') % 360), exercise: 15 + (hash(day + 'e') % 45) });

function dayOf(data: Data, today: string, day: string) {
  const meals = MEALS.map((m) => {
    const entries = data.entries.filter((e) => e.day === day && e.meal === m.id).flatMap((e) => {
      const f = food(e.food);
      return f ? [{ id: e.id, name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, kind: f.kind }] : [];
    });
    return { id: m.id, title: m.title, kcal: entries.reduce((s, e) => s + e.kcal, 0), entries };
  });
  const all = meals.flatMap((m) => m.entries);
  const total = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => all.reduce((s, e) => s + e[k], 0);
  const label = day === today ? 'Today' : day === shift(today, -1) ? 'Yesterday' : fmt(day, { weekday: 'long', month: 'short', day: 'numeric' });
  return { day, label, kcal: total('kcal'), protein: total('protein'), carbs: total('carbs'), fat: total('fat'), water: data.water[day] ?? 0, burned: movesOf(data, day).active, meals };
}

// The hour-by-hour step curve: a morning run, a walk at lunch, a quiet evening.
const SHAPE = [0, 0, 0, 0, 0, 0, 2, 30, 8, 4, 5, 3, 11, 7, 3, 5, 3, 6, 4, 2, 1, 0, 0, 0];
function hourly(steps: number) {
  const whole = SHAPE.reduce((a, b) => a + b, 0);
  const bars = SHAPE.map((w) => Math.floor((steps * w) / whole));
  bars[7] += steps - bars.reduce((a, b) => a + b, 0);
  return bars;
}

const dayName = (today: string, day: string) => (day === today ? 'Today' : day === shift(today, -1) ? 'Yesterday' : fmt(day, { weekday: 'long' }));

function board(data: Data, today: string): Board {
  const now = dayOf(data, today, today);
  const moves = movesOf(data, today);
  const week = Array.from({ length: 7 }, (_, i) => shift(today, i - 6)).map((day) => {
    const d = dayOf(data, today, day), m = movesOf(data, day);
    return { day, weekday: fmt(day, { weekday: 'short' }), date: fmt(day, { day: 'numeric' }), kcal: d.kcal, steps: m.steps, active: m.active };
  });
  let streak = 0;
  while (streak < 365 && data.entries.some((e) => e.day === shift(today, -streak))) streak++;
  const workouts = data.sessions
    .filter((s) => s.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day) || data.sessions.indexOf(b) - data.sessions.indexOf(a))
    .slice(0, 8)
    .map((s) => ({
      id: s.id, kind: s.kind, title: KINDS[s.kind]?.title ?? 'Workout', minutes: s.minutes, kcal: s.kcal,
      detail: [s.km > 0 ? `${s.km.toFixed(1)} km` : '', `${s.minutes} min`, `${s.kcal} kcal`].filter(Boolean).join(' · '),
      when: `${dayName(today, s.day)}, ${s.when}`,
    }));
  return {
    profile: data.profile,
    label: fmt(today, { weekday: 'long', month: 'long', day: 'numeric' }),
    eaten: now.kcal, protein: now.protein, carbs: now.carbs, fat: now.fat,
    water: now.water, steps: moves.steps, distance: Math.round(moves.steps * 0.0072) / 10,
    active: moves.active, exercise: moves.exercise, resting: 58,
    hourly: hourly(moves.steps), week,
    meals: now.meals.map((m) => ({ id: m.id, title: m.title, kcal: m.kcal, count: m.entries.length, detail: m.entries.map((e) => e.name).join(', ') })),
    workouts, streak,
    weights: data.weights.map((w) => ({ day: w.day, label: fmt(w.day, { month: 'short', day: 'numeric' }), kg: w.kg })),
  };
}

const sources: Sources = {
  loadBoard: async ([today], _store, storage) => {
    if (!valid(today)) throw new Error('Waiting for the date');
    return board(await load(storage, today), today);
  },
  loadDay: async ([today, day], _store, storage) => {
    if (!valid(today) || !valid(day)) throw new Error('Waiting for the date');
    return dayOf(await load(storage, today), today, day);
  },
  searchFoods: async ([query]) => {
    const q = query.trim().toLowerCase();
    return q ? FOODS.filter((f) => f.name.toLowerCase().includes(q) || f.kind.includes(q)) : FOODS;
  },
  addFood: async ([today, day, meal, id], _store, storage) => {
    const data = await load(storage, today);
    if (!food(id)) return refuse('That food is no longer in the library.');
    if (!MEALS.some((m) => m.id === meal)) return refuse('Choose a meal.');
    if (data.entries.length >= 5000) return refuse('Your diary is full.');
    let n = 1;
    while (data.entries.some((e) => e.id === `${day}-${meal}-${id}-${n}`)) n++;
    return save(storage, { ...data, entries: [...data.entries, { id: `${day}-${meal}-${id}-${n}`, day, meal, food: id }] });
  },
  removeEntry: async ([today, id], _store, storage) => {
    const data = await load(storage, today);
    return save(storage, { ...data, entries: data.entries.filter((e) => e.id !== id) });
  },
  setWater: async ([today, day, glasses], _store, storage) => {
    const data = await load(storage, today);
    return save(storage, { ...data, water: { ...data.water, [day]: Math.max(0, Math.min(16, Math.round(glasses))) } });
  },
  logWorkout: async ([today, kind, minutes, when], _store, storage) => {
    const data = await load(storage, today);
    const k = KINDS[kind];
    if (!k) return refuse('Choose a workout.');
    if (!(minutes >= 5 && minutes <= 240)) return refuse('A workout lasts 5 to 240 minutes.');
    const kcal = Math.round(minutes * k.perMinute), base = movesOf(data, today);
    let n = data.sessions.length + 1;
    while (data.sessions.some((s) => s.id === `s${n}`)) n++;
    const session: Session = { id: `s${n}`, day: today, kind, minutes, kcal, when, km: Math.round(minutes * k.kmPerMinute * 10) / 10 };
    return save(storage, {
      ...data,
      sessions: [...data.sessions, session],
      moves: { ...data.moves, [today]: { steps: base.steps + Math.round(minutes * k.stepsPerMinute), active: base.active + kcal, exercise: base.exercise + minutes } },
    });
  },
  saveProfile: async ([today, name, goal, weight, target, height, age, activity, calories, protein, carbs, fat], _store, storage) => {
    const data = await load(storage, today);
    if (!['lose', 'maintain', 'gain'].includes(goal)) return refuse('Choose a goal.');
    if (!(calories >= 1200 && calories <= 4500)) return refuse('That plan is outside a safe range.');
    const weights = data.weights.filter((w) => w.day !== today).concat([{ day: today, kg: weight }]).sort((a, b) => a.day.localeCompare(b.day));
    return save(storage, {
      ...data,
      weights,
      profile: { ...data.profile, name: name.trim().slice(0, 40) || 'Friend', goal, weight, target, height, age, activity, calories, protein, carbs, fat, onboarded: true },
    });
  },
  resetDemo: async ([today], _store, storage) => save(storage, seed(today)),
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
