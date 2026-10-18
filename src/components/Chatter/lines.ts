import type { BuddyState } from '../Buddy/BuddyStates'

/** Something to say: a fixed line, or one that uses the buddy's own name. */
type Line = string | ((name: string) => string)

/** Now and then when you click it, something that fits how it's feeling. Idle gets the everyday lines. */
const CLICK: Record<BuddyState, Line[]> = {
  idle: [
    'Hi! Just keeping an eye on things.',
    'Hehe, do that again.',
    'I like it here.',
    "You're doing great, by the way.",
    "Don't mind me, I'm just hanging around.",
    'Boop.',
    "I've been practising my blinking.",
    "Best desktop I've ever lived on.",
    'What are we working on?',
    "I'm not up to anything. Promise.",
    (name) => `${name}, reporting for duty!`,
    'Oh! You found me.',
    'Psst. Hi.',
    "I've been guarding this corner all day.",
    'Click me again, I dare you.',
    (name) => `Yep, still ${name}. Still here.`,
  ],
  happy: [
    "Today's a good day.",
    "Hehe, I'm in a great mood.",
    'Everything is better with you around.',
    'I could bounce around all day.',
    'Best. Day. Ever.',
    'You make this desktop a happy place.',
  ],
  sleepy: [
    'Five more minutes…',
    "Mm? I'm awake. Mostly.",
    'Huh? Oh, hi. I was resting my eyes.',
    'Is it bedtime yet?',
    'Too comfy to move.',
    "Wake me up when something's happening.",
  ],
  stressed: [
    'Is it just me, or is everything a lot right now?',
    'Deep breaths. In, out. Okay.',
    'So much going on!',
    "We've got this. Probably.",
    "Don't panic. I'm not panicking. Are you panicking?",
    'One thing at a time, right?',
  ],
  angry: [
    'Hmph.',
    "Not now, I'm fuming.",
    'Grr. Okay, that was a nice click, though.',
    "I'm not mad. Fine, I'm a little mad.",
    'Give me a minute to cool off.',
  ],
  bored: [
    'Finally, something to do!',
    "I've counted every pixel. Twice.",
    'Entertain me?',
    'Ooh, a click. The highlight of my day.',
    'Got any games on here?',
    'Nothing happens around here. Except you.',
  ],
  surprised: [
    'Whoa! You startled me.',
    "Oh! Didn't see you there.",
    'Ah! Warn me next time.',
    "Eek! Okay. I'm okay.",
  ],
  sad: [
    "I'm okay. Just a bit blue.",
    'Thanks for checking on me.',
    'A pat helps, honestly.',
    'Some days are like that, huh?',
    'Stay a minute?',
  ],
  curious: [
    "Ooh, what's that you're doing?",
    'What does that button do?',
    'I have questions. So many questions.',
    'Tell me everything.',
    'What are you up to over there?',
  ],
  confused: [
    "Wait, what's going on?",
    "I'm lost. Where are we?",
    'Huh? Say that again?',
    "That doesn't add up.",
    "I'll pretend I understood that.",
  ],
  love: ["You're the best, you know that?", "My heart's doing a little dance.", 'I like you a lot.', 'More, please!'],
  wink: ["You didn't see anything.", 'Our little secret.', 'Heh, nice one.', "I know something you don't."],
  focused: ["Shh, I'm concentrating.", 'In the zone right now.', "Let's get this done.", 'Nearly there, keep going.'],
  smug: ["I'm kind of a big deal.", 'Told you so.', "Not to brag, but I'm adorable.", "I knew you'd come back."],
  dizzy: [
    "The room won't stop spinning.",
    'Which one of you is the real you?',
    "Whoa. Everything's wobbly.",
    'Is the desktop meant to tilt like that?',
  ],
  watching: [
    "Shh, it's getting good.",
    'Want some popcorn?',
    'Best seat in the house.',
    "I'm not sharing. Okay, maybe one.",
    "Don't spoil it for me!",
  ],
}

/** What the buddy says on its own, a few ways each, so it doesn't sound like a recording. */
const LINES = {
  /** Clicked: the pool depends on its mood (see CLICK). */
  click: CLICK.idle,
  /** Falling in love after a run of pets. */
  love: ["Okay, you're my favourite.", "Stop it, I'm blushing.", 'More pats, please!', 'I could get used to this.'],
  /** A belly rub getting going. */
  rub: ['Ooh, right there.', "Mmm, that's the spot.", "I'm melting…", "Don't stop!"],
  /** Dizzy from watching the cursor whip around. */
  whip: ['Whoa, slow down!', "I can't keep up with you!", "Everything's spinning…", "Where'd you go? Oh, there."],
  /** Dizzy after a shake. */
  shaken: ["The room's still spinning.", 'Whoa. Give me a sec.', 'Again! Actually, maybe not.'],
  /** Just tucked in behind a screen edge. */
  peek: ['Peekaboo!', "I'll just hang out here.", 'Nobody can see me, right?', "Hiding! Don't tell anyone."],
  /** Hello for the time of day, when the app starts. */
  morning: ['Morning! Ready for today?', 'Good morning! I kept your desktop warm.', "Morning. Let's make it a good one."],
  afternoon: ['Good afternoon!', "Afternoon! How's the day going?", 'Hey! Hope the day is treating you well.'],
  evening: ['Evening! Winding down?', 'Good evening. Still at it?', "Hey, it's evening already!"],
  night: ['Hi, night owl.', 'Burning the midnight oil?', "It's late! Don't stay up too long."],
  /** Back after a proper break. */
  back: ["Oh! You're back.", 'There you are!', 'Welcome back!', "I wasn't asleep. Okay, maybe a little."],
  /** Now and then when clicked after midnight. */
  late: ["It's really late, you know.", "Bed soon? I'll keep watch.", 'Maybe one more thing, then sleep?'],
  /** A laptop battery running low, then very low, and being plugged in. */
  battery: ['Your battery is getting low.', 'Running low over here. Got a charger handy?', 'Feeling a bit drained. Literally.'],
  batteryVeryLow: ['Really low on battery now. Plug in soon?', "Battery's nearly flat! Charger, please."],
  charging: ['Ahh, power. Much better.', "Ooh, that's the good stuff.", 'Charging up!'],
  /** Just given one of the secret names. */
  secret: ['Wait, how did you know my secret name?', 'Ooh, a special name. I feel sparkly.', 'You found a secret! Shh.'],
  /** Music started playing. */
  music: [
    'Ooh, I like this one.',
    "Music! Okay, I'm bopping.",
    'Is this your playlist? Nice taste.',
    "Can't help it, I have to dance.",
    "Tunes! Let's go.",
    "Turn it up! Just kidding, it's perfect.",
  ],
  /** Now and then while it bops along. */
  musicVibe: [
    "This one's a bop.",
    "I'm feeling this.",
    "Okay, I'm officially vibing.",
    'Do you take requests?',
    "I've got rhythm. Mostly.",
    "Don't mind me, just grooving.",
  ],
  /** A video started playing. */
  video: [
    'Ooh, what are we watching?',
    "Movie time? I'll be quiet.",
    "Shh, it's starting.",
    "Don't mind me, I'll watch too.",
    'I brought popcorn!',
  ],
  /** Now and then while it watches along. */
  videoReact: [
    'Ooh, what happens next?',
    'Wait, go back!',
    'Did you see that?',
    "I'm invested now.",
    'This popcorn is really good, by the way.',
    'No way.',
    'Okay, just one more.',
  ],
  /** Back after stepping aside for something full screen. */
  returned: [
    'Back! What did I miss?',
    'That looked fun.',
    'Oh, hi again!',
    "All done? I'm back.",
    "I stepped out so I wouldn't get in the way.",
  ],
} satisfies Record<string, Line[]>

export type Topic = keyof typeof LINES

/** Things it only says once, the first time they happen. */
export const MILESTONES = {
  'pets-100': "That's 100 pets! Not that I'm counting.",
  'pets-500': "500 pets. I'm the luckiest buddy around.",
  'pets-1000': "A thousand pets! I'd frame that if I had hands.",
  'first-rub': 'Belly rubs? Where have these been all my life?',
  week: "We've been hanging out for a whole week!",
  month: 'A month together already. Time flies on a desktop.',
  'days-100': '100 days on your desktop. Thanks for keeping me around.',
  year: 'A whole year together! Happy anniversary.',
} as const

export type Milestone = keyof typeof MILESTONES

/** The hello for the time of day: morning from 5am, afternoon from noon, evening from 5pm, night from 10pm. */
export function greetingAt(date = new Date()): Topic {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

/** Past midnight and before 5am. */
export const isLate = (date = new Date()) => date.getHours() < 5

/**
 * Each pool is dealt like a shuffled deck: every line comes up once before any comes round again, and
 * a fresh deck never starts with the line it just said.
 */
const decks: Record<string, number[]> = {}
const lastLine: Record<string, number> = {}

function deal(pool: string, size: number): number {
  let deck = decks[pool]
  if (!deck?.length) {
    deck = Array.from({ length: size }, (_, i) => i)
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    // Lines are taken from the end.
    if (size > 1 && deck[size - 1] === lastLine[pool]) [deck[0], deck[size - 1]] = [deck[size - 1], deck[0]]
    decks[pool] = deck
  }
  const i = deck.pop() as number
  lastLine[pool] = i
  return i
}

/** A line on a topic. Clicks pick from the pool for `mood`. */
export function lineFor(topic: Topic, name: string, mood: BuddyState = 'idle'): string {
  const pool = topic === 'click' ? `click:${mood}` : topic
  const options: Line[] = topic === 'click' ? CLICK[mood] : LINES[topic]
  const line = options[deal(pool, options.length)]
  return typeof line === 'function' ? line(name) : line
}
