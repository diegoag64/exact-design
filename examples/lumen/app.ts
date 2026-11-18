import type { Answer, Result, Sources, Storage } from './app.contract.d.ts';

// Lumen keeps one JSON file: balances, cards, goals and the payments the person made.
// Card spending and income are generated from the day the data was seeded, so a fresh
// install, a test and the design editor all open on the same believable quarter.
export const grants = 'fs.read app:/data/lumen.json\nfs.write app:/data/lumen.json';

type Board = Result<'loadBoard'>;
type Tx = Result<'loadTx'>;
type Raw = { id: string; day: string; when: string; merchant: string; category: string; amount: number; account: string; card: string; note: string };
type CardState = { id: string; frozen: boolean };
type GoalState = { id: string; saved: number };
type Data = {
  v: 1;
  seeded: string;
  checking: number;
  savings: number;
  invest: number;
  cards: CardState[];
  goals: GoalState[];
  made: Raw[];
};

const FILE = 'app:/data/lumen.json';
const PROFILE = { name: 'Alex Morgan', first: 'Alex', email: 'alex@example.com', plan: 'Lumen Plus', since: 'Member since 2021' };

const CARDS = [
  { id: 'metal', name: 'Lumen Metal', number: '3312', network: 'VISA', kind: 'Credit', style: 'midnight', limit: 800000, expires: '09/29' },
  { id: 'everyday', name: 'Everyday', number: '4821', network: 'MASTERCARD', kind: 'Debit', style: 'iris', limit: 250000, expires: '04/28' },
  { id: 'online', name: 'Online', number: '7754', network: 'VISA', kind: 'Virtual', style: 'lagoon', limit: 50000, expires: '12/26' },
];

const GOALS = [
  { id: 'japan', name: 'Japan in spring', icon: 'travel', tint: 'tide', target: 600000, saved: 394000, due: '2027-04' },
  { id: 'rainy', name: 'Rainy-day fund', icon: 'umbrella', tint: 'mint', target: 1500000, saved: 1125000, due: '2027-09' },
  { id: 'laptop', name: 'New laptop', icon: 'laptop', tint: 'grape', target: 240000, saved: 86000, due: '2027-02' },
  { id: 'home', name: 'First home', icon: 'home', tint: 'amber', target: 6000000, saved: 1830000, due: '2029-06' },
];

const CONTACTS = [
  { id: 'maya', name: 'Maya Chen', handle: '@maya', tint: 'grape' },
  { id: 'leo', name: 'Leo Park', handle: '@leopark', tint: 'tide' },
  { id: 'ava', name: 'Ava Ruiz', handle: '@avaruiz', tint: 'rose' },
  { id: 'noah', name: 'Noah Kim', handle: '@noahk', tint: 'amber' },
  { id: 'zoe', name: 'Zoe Patel', handle: '@zoe.p', tint: 'sky' },
];

// Monthly limits in cents, in the order the budgets screen lists them.
const BUDGETS: [string, number][] = [
  ['dining', 45000], ['groceries', 60000], ['shopping', 40000], ['transport', 25000],
  ['bills', 30000], ['fun', 12000], ['health', 25000],
];

// Card spending that comes and goes: a shop appears on a day when its hash lands on `every`.
const SHOPS = [
  { merchant: 'Blue Bottle Coffee', category: 'dining', lo: 450, hi: 780, every: 2, when: '8:14 AM', card: 'everyday' },
  { merchant: 'Sweetgreen', category: 'dining', lo: 1295, hi: 1695, every: 3, when: '12:40 PM', card: 'metal' },
  { merchant: 'Whole Foods Market', category: 'groceries', lo: 4200, hi: 11800, every: 4, when: '6:22 PM', card: 'everyday' },
  { merchant: 'Trader Joe’s', category: 'groceries', lo: 2400, hi: 6800, every: 6, when: '5:48 PM', card: 'everyday' },
  { merchant: 'Uber', category: 'transport', lo: 1240, hi: 3260, every: 4, when: '9:05 PM', card: 'metal' },
  { merchant: 'Shell', category: 'transport', lo: 4200, hi: 6400, every: 9, when: '7:30 AM', card: 'everyday' },
  { merchant: 'Apple Store', category: 'shopping', lo: 2900, hi: 12900, every: 14, when: '3:10 PM', card: 'online' },
  { merchant: 'Uniqlo', category: 'shopping', lo: 3900, hi: 8900, every: 12, when: '2:25 PM', card: 'metal' },
  { merchant: 'Amazon', category: 'shopping', lo: 1599, hi: 6499, every: 6, when: '10:12 AM', card: 'online' },
  { merchant: 'Nobu', category: 'dining', lo: 8600, hi: 16400, every: 11, when: '8:45 PM', card: 'metal' },
  { merchant: 'AMC Theatres', category: 'fun', lo: 1800, hi: 3600, every: 10, when: '7:15 PM', card: 'metal' },
  { merchant: 'CVS Pharmacy', category: 'health', lo: 900, hi: 3400, every: 12, when: '11:30 AM', card: 'everyday' },
];
// What arrives on the same day each month.
const MONTHLY: Record<number, Omit<Raw, 'id' | 'day'>[]> = {
  1: [{ when: '9:00 AM', merchant: 'Northwind Studio payroll', category: 'income', amount: 425000, account: 'checking', card: '', note: 'Salary' }],
  3: [{ when: '6:00 AM', merchant: 'PG&E', category: 'bills', amount: -8640, account: 'checking', card: '', note: 'Electricity and gas' }],
  7: [{ when: '6:30 AM', merchant: 'Equinox', category: 'health', amount: -18500, account: 'credit', card: 'metal', note: 'Membership' }],
  12: [{ when: '4:00 AM', merchant: 'Netflix', category: 'fun', amount: -1549, account: 'credit', card: 'online', note: 'Subscription' }],
  15: [{ when: '9:00 AM', merchant: 'Northwind Studio payroll', category: 'income', amount: 425000, account: 'checking', card: '', note: 'Salary' }],
  18: [{ when: '4:00 AM', merchant: 'Spotify', category: 'fun', amount: -1199, account: 'credit', card: 'online', note: 'Family plan' }],
  20: [{ when: '10:30 AM', merchant: 'Vanguard dividend', category: 'income', amount: 4218, account: 'invest', card: '', note: 'VTI quarterly' }],
  24: [{ when: '5:00 AM', merchant: 'Verizon', category: 'bills', amount: -8500, account: 'checking', card: '', note: 'Phone plan' }],
};

const ACCOUNT_NAMES: Record<string, string> = { checking: 'Everyday', savings: 'Savings', invest: 'Investments', credit: 'Lumen Metal' };
const HISTORY = 75;
const ACTIVITY_LIMIT = 8;

// Days are ISO dates compared as text; arithmetic happens at UTC noon so no offset moves them.
const toMs = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);
const shift = (day: string, by: number) => new Date(toMs(day) + by * 86400000).toISOString().slice(0, 10);
const fmt = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(toMs(day)));
const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);
const minutes = (when: string) => {
  const m = /^(\d+):(\d+)\s*(AM|PM)$/.exec(when.trim());
  return m ? ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2] : 0;
};
const newestFirst = (a: Raw, b: Raw) => b.day.localeCompare(a.day) || minutes(b.when) - minutes(a.when) || b.id.localeCompare(a.id);

function seed(today: string): Data {
  return {
    v: 1, seeded: today, checking: 628642, savings: 3682000, invest: 2351877,
    cards: CARDS.map((c) => ({ id: c.id, frozen: false })),
    goals: GOALS.map((g) => ({ id: g.id, saved: g.saved })),
    made: [],
  };
}

// The generated history ends on the seed day, so it stays put as days pass.
function generated(seeded: string): Raw[] {
  const out: Raw[] = [];
  for (let back = 0; back < HISTORY; back++) {
    const day = shift(seeded, -back);
    for (const r of MONTHLY[+day.slice(8, 10)] ?? []) out.push({ ...r, id: `${day}-${r.merchant.toLowerCase().replace(/[^a-z]+/g, '-')}`, day });
    for (const s of SHOPS) {
      // The seed day holds only its morning coffee; the rest of that day has not happened yet.
      if (back === 0 ? s.merchant !== 'Blue Bottle Coffee' : hash(day + s.merchant) % s.every !== 0) continue;
      const amount = -(s.lo + (hash(`${day}${s.merchant}a`) % (s.hi - s.lo)));
      out.push({ id: `${day}-${s.merchant.toLowerCase().replace(/[^a-z]+/g, '-')}`, day, when: s.when, merchant: s.merchant, category: s.category, amount, account: s.card === 'metal' || s.card === 'online' ? 'credit' : 'checking', card: s.card, note: '' });
    }
  }
  return out;
}

const all = (data: Data, today: string) => generated(data.seeded).concat(data.made).filter((t) => t.day <= today).sort(newestFirst);

let cache: Data | undefined;
async function load(storage: Storage, today: string): Promise<Data> {
  if (cache) return cache;
  try {
    const saved = JSON.parse(new TextDecoder().decode(await storage.fs.readFile(FILE))) as Data;
    if (saved?.v !== 1 || !Array.isArray(saved.made) || !Array.isArray(saved.goals)) return (cache = seed(today));
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

const cardLabel = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  return c ? `${c.name} ·· ${c.number}` : '';
};
const dayLabel = (today: string, day: string) =>
  day === today ? 'Today' : day === shift(today, -1) ? 'Yesterday' : fmt(day, { weekday: 'long', month: 'short', day: 'numeric' });

function shape(t: Raw, today: string): Tx {
  return {
    id: t.id, day: t.day, date: `${dayLabel(today, t.day)}, ${t.when}`, when: t.when, merchant: t.merchant,
    category: t.category, amount: t.amount, account: ACCOUNT_NAMES[t.account] ?? 'Everyday',
    card: cardLabel(t.card), note: t.note, status: t.day === today && t.category !== 'income' && t.card !== '' ? 'Pending' : 'Completed',
  };
}

const spends = (t: Raw) => t.amount < 0 && t.category !== 'transfer';
const monthOf = (day: string) => day.slice(0, 7);

// A smooth line through the points, as a path in a 300 × 96 box with 8 units of air above and below.
function line(values: number[]) {
  const top = Math.max(...values), low = Math.min(...values), span = top - low || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 300, 88 - ((v - low) / span) * 80]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i];
    d += ` C${(px + (x - px) / 2).toFixed(1)} ${py.toFixed(1)} ${(px + (x - px) / 2).toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return { d, area: `${d} L300 96 L0 96 Z`, end: pts[pts.length - 1][1] };
}

function board(data: Data, today: string): Board {
  const txs = all(data, today);
  const month = txs.filter((t) => monthOf(t.day) === monthOf(today));
  const spentOn = (card: string) => month.filter((t) => t.card === card && spends(t)).reduce((s, t) => s - t.amount, 0);
  const credit = -spentOn('metal') - spentOn('online');
  const accounts = [
    { id: 'checking', name: 'Everyday', kind: 'Checking', number: '·· 4821', balance: data.checking, tint: 'accent', icon: 'wallet' },
    { id: 'savings', name: 'Savings', kind: '4.10% APY', number: '·· 1907', balance: data.savings, tint: 'mint', icon: 'piggy' },
    { id: 'invest', name: 'Investments', kind: 'Index funds', number: '·· 6630', balance: data.invest, tint: 'grape', icon: 'growth' },
    { id: 'credit', name: 'Lumen Metal', kind: 'Credit card', number: '·· 3312', balance: credit, tint: 'flame', icon: 'card' },
  ];
  const net = accounts.reduce((s, a) => s + a.balance, 0);

  // Net worth a day at a time, walked back from today: each day's flows undone, plus the market's drift.
  const trend = [net];
  for (let back = 0; back < 29; back++) {
    const day = shift(today, -back);
    const flow = txs.filter((t) => t.day === day && t.category !== 'transfer').reduce((s, t) => s + t.amount, 0);
    const drift = (hash(`${day}m`) % 24000) - 9000;
    trend.unshift(trend[0] - flow - drift);
  }
  // A short moving average keeps paydays from drawing cliffs; the last point stays today's total.
  const path = line(trend.map((v, i) => (i === trend.length - 1 ? v : trend.slice(Math.max(0, i - 3), i + 1).reduce((s, x) => s + x, 0) / (i + 1 - Math.max(0, i - 3)))));

  const spent = month.filter(spends).reduce((s, t) => s - t.amount, 0);
  const income = month.filter((t) => t.category === 'income').reduce((s, t) => s + t.amount, 0);
  const budget = BUDGETS.reduce((s, [, limit]) => s + limit, 0);
  let start = 0;
  const categories = BUDGETS.map(([id, limit]) => {
    const own = month.filter((t) => t.category === id && spends(t));
    const total = own.reduce((s, t) => s - t.amount, 0);
    const share = spent > 0 ? (total / spent) * 100 : 0;
    const c = { id, spent: total, limit, count: own.length, share, start };
    start += share;
    return c;
  });
  const days = Array.from({ length: 7 }, (_, i) => shift(today, i - 6));
  const week = days.map((d) => ({ day: d, label: fmt(d, { weekday: 'narrow' }), spent: txs.filter((t) => t.day === d && spends(t)).reduce((s, t) => s - t.amount, 0) }));
  const goals = GOALS.map((g) => {
    const saved = data.goals.find((x) => x.id === g.id)?.saved ?? g.saved;
    const left = Math.max(1, (+g.due.slice(0, 4) - +today.slice(0, 4)) * 12 + (+g.due.slice(5, 7) - +today.slice(5, 7)));
    const due = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+g.due.slice(0, 4), +g.due.slice(5, 7) - 1, 15)));
    return { id: g.id, name: g.name, icon: g.icon, tint: g.tint, target: g.target, saved, due, monthly: Math.ceil(Math.max(0, g.target - saved) / left / 100) * 100 };
  });
  const first = new Date(toMs(today));
  const length = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  return {
    profile: PROFILE,
    label: fmt(today, { weekday: 'long', month: 'long', day: 'numeric' }),
    month: new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(first),
    net, change: net - trend[0], spark: path.d, area: path.area, sparkEnd: path.end,
    accounts, income, spent, budget, categories, daysLeft: length - +today.slice(8, 10) + 1, dayOfMonth: +today.slice(8, 10),
    week, weekTop: Math.max(0, ...week.map((d) => d.spent)),
    recent: txs.slice(0, 6).map((t) => shape(t, today)),
    cards: CARDS.map((c) => ({ ...c, spent: spentOn(c.id), frozen: data.cards.find((x) => x.id === c.id)?.frozen ?? false, holder: PROFILE.name.toUpperCase() })),
    goals, saved: goals.reduce((s, g) => s + g.saved, 0),
    contacts: CONTACTS,
  };
}

function activity(data: Data, today: string, query: string, filter: string) {
  const q = query.trim().toLowerCase();
  const picked = all(data, today).filter((t) =>
    (filter === 'spending' ? spends(t) : filter === 'income' ? t.category === 'income' : filter === 'transfers' ? t.category === 'transfer' : true) &&
    (q === '' || t.merchant.toLowerCase().includes(q) || t.category.includes(q) || t.note.toLowerCase().includes(q)));
  const groups: { day: string; label: string; total: number; items: Tx[] }[] = [];
  // A short sample keeps the screen at a readable length in Studio.
  for (const t of picked.slice(0, ACTIVITY_LIMIT)) {
    let g = groups.at(-1);
    if (!g || g.day !== t.day) groups.push((g = { day: t.day, label: dayLabel(today, t.day), total: 0, items: [] }));
    g.total += t.amount;
    g.items.push(shape(t, today));
  }
  return groups;
}

const sources: Sources = {
  loadBoard: async ([today], _store, storage) => {
    if (!valid(today)) throw new Error('Waiting for the date');
    return board(await load(storage, today), today);
  },
  loadActivity: async ([today, query, filter], _store, storage) => {
    if (!valid(today)) throw new Error('Waiting for the date');
    return activity(await load(storage, today), today, query, filter);
  },
  loadTx: async ([today, id], _store, storage) => {
    if (!valid(today)) throw new Error('Waiting for the date');
    const data = await load(storage, today);
    const t = all(data, today).find((x) => x.id === id) ?? all(data, today)[0];
    if (!t) throw new Error('No payments yet');
    return shape(t, today);
  },
  sendMoney: async ([today, contact, cents, note, when], _store, storage) => {
    const data = await load(storage, today);
    const who = CONTACTS.find((c) => c.id === contact);
    if (!who) return refuse('Choose who to pay.');
    if (!(cents >= 100)) return refuse('Send at least $1.00.');
    if (cents > 500000) return refuse('Transfers stop at $5,000 a payment.');
    if (cents > data.checking) return refuse('That is more than Everyday holds.');
    const id = `sent-${data.made.length + 1}`;
    const made: Raw = { id, day: today, when, merchant: who.name, category: 'transfer', amount: -Math.round(cents), account: 'checking', card: '', note: note.trim().slice(0, 80) || `To ${who.handle}` };
    return save(storage, { ...data, checking: data.checking - Math.round(cents), made: [...data.made, made] });
  },
  moveToGoal: async ([today, goal, cents, when], _store, storage) => {
    const data = await load(storage, today);
    const g = GOALS.find((x) => x.id === goal);
    if (!g) return refuse('Choose a goal.');
    if (!(cents >= 100)) return refuse('Add at least $1.00.');
    if (cents > data.checking) return refuse('That is more than Everyday holds.');
    const id = `goal-${data.made.length + 1}`;
    const made: Raw = { id, day: today, when, merchant: g.name, category: 'transfer', amount: -Math.round(cents), account: 'checking', card: '', note: 'Moved to Savings' };
    return save(storage, {
      ...data,
      checking: data.checking - Math.round(cents),
      savings: data.savings + Math.round(cents),
      goals: data.goals.map((x) => (x.id === goal ? { ...x, saved: x.saved + Math.round(cents) } : x)),
      made: [...data.made, made],
    });
  },
  setFrozen: async ([today, card, frozen], _store, storage) => {
    const data = await load(storage, today);
    if (!CARDS.some((c) => c.id === card)) return refuse('That card is gone.');
    return save(storage, { ...data, cards: data.cards.map((c) => (c.id === card ? { ...c, frozen } : c)) });
  },
  resetDemo: async ([today], _store, storage) => save(storage, seed(today)),
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
