import type { Answer, Result, Sources, Storage } from './app.contract.d.ts';

// Waymark keeps one small JSON file: the hero's name, the quests marked done and the rewards
// redeemed. Everything else is the companion's fixed sample of a play session in Aldermere.
export const grants = 'fs.read app:/data/waymark.json\nfs.write app:/data/waymark.json';

type Board = Result<'loadBoard'>;
type Data = { v: 1; name: string; done: string[]; owned: string[] };

const FILE = 'app:/data/waymark.json';
const SEED: Data = { v: 1, name: 'Wren', done: [], owned: [] };
const GAME = 'The Chronicles of Aldermere: Song of the Hollow Moon';
const GOAL = 300;

const TILES = [
  { id: 'map', title: 'Map', href: '/map', dot: false },
  { id: 'quests', title: 'Whisper Quests', href: '/quests', dot: false },
  { id: 'foes', title: 'Trophy Hall', href: '/trophy-hall', dot: false },
  { id: 'record', title: "Today's Record", href: '/record', dot: false },
  { id: 'me', title: 'My Play Data', href: '/me', dot: true },
  { id: 'global', title: 'Global Play Data', href: '/global', dot: false },
  { id: 'sketch', title: 'Sketchbook', href: '/feature?id=sketch', dot: true },
  { id: 'loom', title: 'Loom of Days', href: '/feature?id=loom', dot: true },
  { id: 'charms', title: 'Charms', href: '/feature?id=charms', dot: false },
  { id: 'flute', title: 'Play the Reed Flute', href: '/feature?id=flute', dot: false },
  { id: 'quiz', title: 'Aldermere Lore Quiz', href: '/feature?id=quiz', dot: false },
];

const QUESTS = [
  { id: 'chalk', title: 'The Chalk Sigils', hint: 'Someone drew four signs on a plank behind the mill.', points: 40, art: 'assets/art/quest-1.jpg' },
  { id: 'effigy', title: 'The Straw Sentinel', hint: 'Strike the target that watches the hollow.', points: 30, art: 'assets/art/quest-2.jpg' },
  { id: 'spiral', title: 'Stone of the Coiled Wind', hint: 'A whisper stone rests where moss never dries.', points: 20, art: 'assets/art/quest-3.jpg' },
  { id: 'sun', title: 'Stone of the First Light', hint: 'It faces east, and speaks only at dawn.', points: 20, art: 'assets/art/quest-4.jpg' },
  { id: 'bench', title: 'The Lantern Seat', hint: 'Rest between two lanterns under the old root.', points: 40, art: 'assets/art/quest-5.jpg' },
  { id: 'peak', title: 'Stone of the Three Peaks', hint: 'Hidden among ferns on the Highpass Trail.', points: 20, art: 'assets/art/quest-6.jpg' },
  { id: 'well', title: 'What the Well Remembers', hint: 'Lower the bucket when the moon is hollow.', points: 60, art: 'assets/art/quest-7.jpg' },
  { id: 'sign', title: 'The Turned Signpost', hint: 'One arm points somewhere no road goes.', points: 80, art: 'assets/art/quest-8.jpg' },
];

const REWARDS = ['Series Theme', 'Title Theme', 'Hearthside', 'Elderroot Glade', 'Market Ward', 'Millbrook', 'Whisperwood', 'Cinder Crown', 'Mirror Mere'].map((title, i) => ({ id: `song-${i + 1}`, title, cost: GOAL }));

const BADGES = [
  ['hourglass', 'Citizen of the Vale', 'silver', 0.18, 'Hours spent in Aldermere'],
  ['horned', "Monsters' Bane", 'gold', 0.13, 'Foes felled'],
  ['gem', 'Wealthy One', 'silver', 0.58, 'Gleams gathered'],
  ['steps', 'Far Walker', 'silver', 0.42, 'Leagues travelled on foot'],
  ['fish', 'River Friend', 'silver', 0.3, 'Fish caught'],
  ['arrow', 'True Aim', 'gold', 0.66, 'Targets struck'],
  ['flask', 'Brewmaster', 'gold', 0.24, 'Tonics mixed'],
  ['target', 'Sharp Eye', 'gold', 0.5, 'Secrets spotted'],
  ['sprout', 'Green Thumb', 'gold', 0.36, 'Herbs gathered'],
  ['pot', 'Pot Breaker', 'gold', 0.82, 'Jars smashed'],
  ['reed', 'Reed Singer', 'gold', 0.4, 'Songs played'],
  ['lattice', 'Keeper of Keys', 'silver', 0.25, 'Vaults opened'],
  ['keep', 'Friend of the Keep', 'silver', 0.5, 'Errands run for the Keep'],
  ['speech', 'Good Listener', 'silver', 0.7, 'Villagers heard out'],
  ['chest', 'Treasure Seeker', 'bronze', 0.33, 'Chests opened'],
  ['mask', 'Mask Collector', 'bronze', 0.2, 'Masks found'],
  ['compass', 'Pathfinder', 'bronze', 0.42, 'Places discovered'],
].map(([id, title, tier, progress, detail]) => ({ id: id as string, title: title as string, tier: tier as string, progress: progress as number, detail: detail as string, art: `assets/art/badge-${id}.png` }));

const STATS = [
  { id: 'felled', group: 'Combat', title: 'Enemies Defeated', value: '564', known: '', art: 'assets/art/banner-1.jpg', rows: [['Bog Lurkers', '212'], ['Thornbacks', '148'], ['Cinder Imps', '97'], ['Hollow Knights', '64'], ['Others', '43']] },
  { id: 'kinds', group: 'Combat', title: 'Types of Enemies Defeated', value: '43', known: 'Defeating Bog Lurkers', art: 'assets/art/banner-2.jpg', rows: [['Beasts', '17'], ['Spirits', '11'], ['Constructs', '9'], ['Wardens', '6']] },
  { id: 'falls', group: 'Defeats', title: 'Times Fallen', value: '4', known: '', art: 'assets/art/banner-3.jpg', rows: [['In the wilds', '2'], ['In a vault', '1'], ['To a warden', '1']] },
  { id: 'causes', group: 'Defeats', title: 'Ways You Have Fallen', value: '2', known: 'Losing to Cinder Imps', art: 'assets/art/banner-4.jpg', rows: [['Cinder Imps', '3'], ['A long drop', '1']] },
].map((s) => ({ ...s, rows: s.rows.map(([label, value]) => ({ label, value })) }));

// Positions are tenths of a percent of the map picture, which is 1000 by 1400.
const PLACES = [
  ['cinder', 'Cinder Crown', 500, 200, 'place', true],
  ['forge', 'Ashen Forge', 510, 528, 'vault', false],
  ['wyrm', 'Wyrm Hollow', 290, 562, 'vault', false],
  ['hold', 'Stonefolk Hold', 590, 716, 'place', false],
  ['trail', 'Highpass Trail', 310, 644, 'place', false],
  ['barrow', 'Gloam Barrow', 850, 680, 'vault', false],
  ['rest', 'Restfield', 760, 778, 'place', true],
  ['keep', 'Aldermere Keep', 110, 730, 'place', false],
  ['ward', 'Market Ward', 120, 926, 'place', true],
  ['mill', 'Millbrook', 470, 905, 'place', false],
  ['gullet', "Leviathan's Rest", 870, 905, 'vault', false],
  ['deep', 'Reedfolk Deep', 630, 954, 'place', false],
  ['run', 'Otter Run', 300, 1038, 'place', false],
  ['whisper', 'Whisperwood', 670, 1080, 'place', false],
  ['glade', 'Elderroot Glade', 460, 1178, 'place', false],
  ['grove', 'Moonwell Grove', 870, 1156, 'place', true],
  ['oak', 'Old Father Oak', 640, 1336, 'vault', false],
  ['mere', 'Mirror Mere', 130, 1262, 'place', true],
].map(([id, name, x, y, kind, marked]) => ({ id: id as string, name: name as string, x: x as number, y: y as number, kind: kind as string, marked: marked as boolean }));

const REGIONS = [['The Vale', 0.61], ['Cinder Range', 0.34], ['Whisperwood', 0.52], ['Mirror Mere', 0.2]].map(([name, fraction]) => ({ name: name as string, fraction: fraction as number }));

const CAPTURES = [
  { id: 'c1', time: '23:45', place: 'Millbrook, by the long house', art: 'assets/art/capture-day.jpg' },
  { id: 'c2', time: '23:35', place: 'Millbrook at dusk', art: 'assets/art/capture-dusk.jpg' },
  { id: 'c3', time: '23:25', place: 'Millbrook under the hollow moon', art: 'assets/art/capture-night.jpg' },
];

const FACTS = [['Time played', '2 h 14 min'], ['Distance travelled', '3.8 leagues'], ['Foes felled', '37'], ['Gleams gathered', '112'], ['Jars smashed', '19'], ['Songs played', '4']].map(([label, value]) => ({ label, value }));

const toMs = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);
const longDate = (day: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(toMs(day))) : '');

async function load(storage: Storage): Promise<Data> {
  try {
    const saved = JSON.parse(new TextDecoder().decode(await storage.fs.readFile(FILE))) as Data;
    return saved.v === 1 ? saved : SEED;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'bake' || code === 'ENOENT') return SEED; // the build reads ahead of any storage
    throw e;
  }
}

async function save(storage: Storage, next: Data) {
  await storage.fs.atomicWriteFile(FILE, new TextEncoder().encode(JSON.stringify(next)));
  return { ok: true, error: '' };
}
const refuse = (error: string) => ({ ok: false, error });

function board(data: Data, today: string): Board {
  const quests = QUESTS.map((q) => ({ ...q, done: data.done.includes(q.id) }));
  const rewards = REWARDS.map((r) => ({ ...r, owned: data.owned.includes(r.id) }));
  const earned = quests.filter((q) => q.done).reduce((sum, q) => sum + q.points, 0);
  const spent = rewards.filter((r) => r.owned).reduce((sum, r) => sum + r.cost, 0);
  return {
    game: GAME,
    hero: data.name,
    day: longDate(today),
    points: earned - spent,
    goal: GOAL,
    banked: 0,
    completion: 42,
    tiles: TILES,
    quests,
    rewards,
    badges: BADGES,
    stats: STATS,
    places: PLACES,
    regions: REGIONS,
    captures: CAPTURES,
    facts: FACTS,
  };
}

const sources: Sources = {
  loadBoard: async ([today], _store, storage) => board(await load(storage), today),
  toggleQuest: async ([id], _store, storage) => {
    const data = await load(storage);
    const quest = QUESTS.find((q) => q.id === id);
    if (!quest) return refuse('That quest is not on the list.');
    if (!data.done.includes(id)) return save(storage, { ...data, done: [...data.done, id] });
    const current = board(data, '').points;
    if (current < quest.points) return refuse('Those points are already spent on a reward.');
    return save(storage, { ...data, done: data.done.filter((d) => d !== id) });
  },
  redeem: async ([id], _store, storage) => {
    const data = await load(storage);
    const reward = REWARDS.find((r) => r.id === id);
    if (!reward) return refuse('That reward is not on the list.');
    if (data.owned.includes(id)) return refuse(`${reward.title} is already yours.`);
    const current = board(data, '').points;
    if (current < reward.cost) return refuse(`${reward.title} needs ${reward.cost - current} more points.`);
    return save(storage, { ...data, owned: [...data.owned, id] });
  },
  rename: async ([name], _store, storage) => {
    const trimmed = name.trim().slice(0, 16);
    if (trimmed === '') return refuse('Enter a name.');
    return save(storage, { ...(await load(storage)), name: trimmed });
  },
  resetDemo: async (_args, _store, storage) => save(storage, SEED),
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
