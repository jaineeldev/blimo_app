/** Something to say: a fixed line, or one that uses the buddy's own name. */
type Line = string | ((name: string) => string)

/** What the buddy says on its own, a few ways each, so it doesn't sound like a recording. */
const LINES = {
  /** Now and then when you click it. */
  click: [
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
  ],
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

const lastLine: Partial<Record<Topic, number>> = {}

/** One of the lines on a topic, at random, never the same one twice in a row. */
export function lineFor(topic: Topic, name: string): string {
  const options: Line[] = LINES[topic]
  let i = Math.floor(Math.random() * options.length)
  if (options.length > 1 && i === lastLine[topic]) i = (i + 1) % options.length
  lastLine[topic] = i
  const line = options[i]
  return typeof line === 'function' ? line(name) : line
}
