// Line icons for HUD chrome, statuses and items (100x100, currentColor, stroke based).
const wrap = (p, sw = 6) => `<svg class="ico" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

export const ICONS = {
  map: wrap('<path d="M12 22L36 12L64 24L88 14V78L64 88L36 76L12 86Z"/><path d="M36 12V76M64 24V88"/>'),
  bag: wrap('<path d="M24 36H76L82 88H18Z"/><path d="M36 36V28C36 14 64 14 64 28V36"/><path d="M40 56H60"/>'),
  gear: wrap('<circle cx="50" cy="50" r="13"/><path d="M50 10V22M50 78V90M10 50H22M78 50H90M22 22L30 30M70 70L78 78M78 22L70 30M30 70L22 78"/><circle cx="50" cy="50" r="28"/>'),
  chat: wrap('<path d="M14 20H86V66H44L26 82V66H14Z"/><path d="M30 38H70M30 50H58"/>'),
  quest: wrap('<path d="M26 12H70L80 22V88H26Z"/><path d="M38 34H66M38 48H66M38 62H56"/>'),
  close: wrap('<path d="M24 24L76 76M76 24L24 76"/>', 8),
  jump: wrap('<path d="M50 84V22M28 44L50 22L72 44"/><path d="M26 88H74"/>', 8),
  dodge: wrap('<path d="M18 62C30 30 62 26 80 44"/><path d="M66 30L82 44L66 58"/><path d="M14 80H54"/>', 7),
  target: wrap('<circle cx="50" cy="50" r="30"/><path d="M50 8V28M50 72V92M8 50H28M72 50H92"/><circle cx="50" cy="50" r="5" fill="currentColor"/>', 6),
  interact: wrap('<path d="M38 52V22C38 15 48 15 48 22V48"/><path d="M48 46V40C48 33 58 33 58 40V48M58 46C58 39 68 39 68 46V50M68 50C68 44 78 44 78 50V66C78 80 68 90 54 90C42 90 36 84 30 74L20 56C17 50 24 45 29 49L38 58"/>', 5),
  sprint: wrap('<path d="M20 70L44 50L36 30H62L74 48"/><circle cx="66" cy="18" r="7"/><path d="M44 50L58 64L52 88M30 88L40 68"/>', 6),
  menu: wrap('<path d="M18 28H82M18 50H82M18 72H82"/>', 7),
  compass: wrap('<circle cx="50" cy="50" r="38"/><path d="M50 18L60 50L50 82L40 50Z"/>', 5),
  plus: wrap('<path d="M50 20V80M20 50H80"/>', 8),
  minus: wrap('<path d="M20 50H80"/>', 8),
  locate: wrap('<circle cx="50" cy="50" r="18"/><path d="M50 8V24M50 76V92M8 50H24M76 50H92"/>', 6),
  install: wrap('<path d="M50 14V62M30 44L50 64L70 44"/><path d="M18 74V86H82V74"/>', 7),
  skull: wrap('<path d="M24 52C24 26 76 26 76 52V66H66V80H34V66H24Z"/><circle cx="40" cy="52" r="6" fill="currentColor"/><circle cx="60" cy="52" r="6" fill="currentColor"/>', 5),
  shrine: wrap('<path d="M50 10L66 34H34Z"/><path d="M38 34V80M62 34V80M26 80H74M30 90H70"/>', 5),
};

const STATUS = {
  burn: '<path d="M50 88C30 88 22 72 28 56C32 46 42 40 40 22C54 30 62 42 60 54C66 50 68 44 68 40C78 52 78 66 72 76C66 84 58 88 50 88Z"/>',
  chill: '<path d="M50 12V88M17 31L83 69M83 31L17 69"/><path d="M42 18L50 26L58 18M42 82L50 74L58 82"/>',
  freeze: '<path d="M50 12V88M17 31L83 69M83 31L17 69"/>',
  stun: '<path d="M50 14L58 40L86 40L62 56L72 84L50 66L28 84L38 56L14 40L42 40Z"/>',
  slow: '<circle cx="50" cy="54" r="32"/><path d="M50 54V34M50 54L64 64M40 12H60"/>',
  root: '<path d="M50 12V54M50 54L28 86M50 54L72 86M50 54V88M36 34L50 44L64 30"/>',
  poison: '<path d="M50 14C36 36 26 50 26 62C26 76 36 86 50 86C64 86 74 76 74 62C74 50 64 36 50 14Z"/><path d="M40 62C40 70 46 74 52 74"/>',
  bleed: '<path d="M50 14C36 36 26 50 26 62C26 76 36 86 50 86C64 86 74 76 74 62C74 50 64 36 50 14Z"/>',
  shield: '<path d="M50 12L82 24V48C82 68 68 82 50 90C32 82 18 68 18 48V24Z"/>',
  ward: '<path d="M50 12L82 24V48C82 68 68 82 50 90C32 82 18 68 18 48V24Z"/><path d="M50 30V70M32 48H68"/>',
  haste: '<path d="M18 30H58M10 50H50M18 70H58"/><path d="M60 22L84 50L60 78"/>',
  regen: '<path d="M50 20V80M20 50H80"/>',
  heal: '<path d="M50 20V80M20 50H80"/>',
  silence: '<path d="M22 40H38L58 22V78L38 60H22Z"/><path d="M70 38L88 62M88 38L70 62"/>',
  weaken: '<path d="M50 16V72M28 52L50 74L72 52"/><path d="M26 86H74"/>',
  empower: '<path d="M50 84V28M28 48L50 26L72 48"/><path d="M26 14H74"/>',
  shock: '<path d="M58 8L26 54H50L40 92L76 42H52Z"/>',
  daze: '<circle cx="50" cy="50" r="10"/><path d="M50 18A32 32 0 1 1 18 50"/>',
};
const statusKey = (s) => {
  const k = String(s || '').toLowerCase();
  for (const key of Object.keys(STATUS)) if (k.includes(key)) return key;
  if (/frost|ice|cold/.test(k)) return 'chill';
  if (/fire|ember|ignite|scorch/.test(k)) return 'burn';
  if (/barrier|guard|armor|aegis/.test(k)) return 'shield';
  if (/speed|swift|quick/.test(k)) return 'haste';
  if (/venom|toxin|acid/.test(k)) return 'poison';
  if (/lightning|static|storm/.test(k)) return 'shock';
  return null;
};
export const DEBUFFS = new Set(['burn', 'chill', 'freeze', 'stun', 'slow', 'root', 'poison', 'bleed', 'silence', 'weaken', 'shock', 'daze']);
export function statusIcon(status) {
  const k = statusKey(status);
  if (k) return { svg: wrap(STATUS[k], 6), debuff: DEBUFFS.has(k), key: k };
  const letter = String(status || '?').charAt(0).toUpperCase();
  return { svg: wrap(`<path d="M50 12L88 50L50 88L12 50Z"/><text x="50" y="62" text-anchor="middle" font-size="34" fill="currentColor" stroke="none" font-family="serif">${letter}</text>`, 5), debuff: false, key: 'other' };
}

const ITEMS = [
  [/sword|blade|sabre|saber|cleaver|rapier|katana|dagger|knife/, '<path d="M80 20L36 64M80 20L84 16M80 20V32L44 68M80 20H68L32 56"/><path d="M26 58L42 74M30 70L18 82"/>'],
  [/staff|rod|wand|scepter|focus/, '<path d="M30 90L66 30"/><circle cx="72" cy="22" r="10"/><path d="M60 16L84 30"/>'],
  [/bow/, '<path d="M30 12C70 24 70 76 30 88"/><path d="M30 12V88M30 50H80M70 42L80 50L70 58"/>'],
  [/helm|hood|mask|cowl|crown/, '<path d="M20 64C20 30 80 30 80 64V78H62V62H38V78H20Z"/>'],
  [/chest|robe|coat|vest|armor|armour|harness|mantle|tunic/, '<path d="M30 16L16 32L24 46L30 42V86H70V42L76 46L84 32L70 16L58 22H42Z"/>'],
  [/glove|gauntlet|hand/, '<path d="M30 88V48L26 28C25 22 33 20 35 26L40 44V16C40 10 48 10 48 16V44V12C48 6 56 6 56 12V44V18C56 12 64 12 64 18V50L72 40C76 35 82 39 79 45L66 70V88Z"/>'],
  [/boot|greave|shoe|sandal/, '<path d="M34 12H56V60L84 70V86H22V70L34 62Z"/>'],
  [/leg|pants|trouser|kilt/, '<path d="M28 12H72L76 88H56L50 40L44 88H24Z"/>'],
  [/ring|band|loop/, '<circle cx="50" cy="58" r="26"/><path d="M40 26L50 12L60 26Z"/>'],
  [/amulet|pendant|talisman|charm|trinket|token|sigil|seal/, '<path d="M24 12L50 50L76 12"/><path d="M50 50L66 66L50 88L34 66Z"/>'],
  [/potion|vial|flask|tonic|elixir|draught/, '<path d="M40 12H60M42 12V36L24 72C20 82 26 88 36 88H64C74 88 80 82 76 72L58 36V12"/><path d="M30 64H70"/>'],
  [/ore|stone|shard|crystal|gem|ingot/, '<path d="M50 10L76 30L68 84H32L24 30Z"/><path d="M24 30L50 42L76 30M50 42V84"/>'],
  [/herb|leaf|seed|root|flower|moss|bark|sap/, '<path d="M20 84C20 40 50 16 86 14C84 50 60 80 20 84Z"/><path d="M20 84L62 40"/>'],
  [/cloth|silk|linen|felt|hide|leather|pelt|fur/, '<path d="M16 24H84V40C70 34 60 46 50 40C40 34 30 46 16 40Z"/><path d="M16 40V76H84V40"/>'],
  [/coin|gold|silver|crown/, '<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="22"/>'],
  [/shield|ward/, '<path d="M50 12L82 24V48C82 68 68 82 50 90C32 82 18 68 18 48V24Z"/>'],
  [/scroll|tome|book|codex|page|ledger|map/, '<path d="M22 16H70C78 16 78 30 70 30H30V84H78"/><path d="M30 30C22 30 22 16 30 16M78 70V84"/>'],
  [/hammer|mace|maul|flail|gauntlet/, '<path d="M28 88L60 40"/><path d="M48 22L80 44L70 58L38 36Z"/>'],
];
export function itemIcon(name = '', type = '') {
  const k = `${type} ${name}`.toLowerCase();
  for (const [re, p] of ITEMS) if (re.test(k)) return wrap(p, 5);
  return wrap('<path d="M50 12L84 32V68L50 88L16 68V32Z"/><path d="M50 12V88M16 32L84 68M84 32L16 68" opacity=".4"/>', 5);
}

export const RARITY = {
  common: { label: 'Common', color: '#cfc8b8' },
  uncommon: { label: 'Uncommon', color: '#7fc06a' },
  rare: { label: 'Rare', color: '#5aa6e8' },
  epic: { label: 'Epic', color: '#b07ce8' },
  legendary: { label: 'Legendary', color: '#e89a40' },
  relic: { label: 'Relic', color: '#e8cf70' },
};
export const rarityOf = (r) => RARITY[String(r || 'common').toLowerCase()] || RARITY.common;
