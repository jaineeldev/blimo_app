/**
 * What changed in each version, in the buddy's own words, newest first. Shown in the what's new card
 * after an update and from the tray. Add an entry with every release; a version without one simply
 * doesn't offer the card after updating.
 */
export const WHATS_NEW: { version: string; notes: string[] }[] = [
  {
    version: '1.1.0',
    notes: [
      'Play some music and I bop along, with little notes floating up.',
      "Put a video on and I'll grab some popcorn and watch it with you. I might gasp at the good bits.",
      "When a game or video goes full screen, I step out of the way and come back when you're done.",
      "I've got lots more to say, and what I say when you click me depends on how I'm feeling.",
      "I only know that something's playing, never what. You can switch all of this off in my panel.",
    ],
  },
  {
    version: '1.0.1',
    notes: [
      "I stay on top properly now: over games and videos, through Show desktop, and on every virtual desktop you've got.",
      'Right-click me for new buttons at the bottom: check for updates, hide me, or quit.',
      "You can set me to start with Windows from there too, and there's a quiet mode if you'd like me to keep my thoughts to myself.",
      "My panel doesn't cover what I'm saying any more, and my speech bubbles are centred.",
      'I have a new app icon. Look familiar?',
    ],
  },
  {
    version: '1.0.0',
    notes: [
      'My first proper release! Thanks for keeping me around while I was brand new.',
      "Push me past the edge of your screen and I'll tuck in and peek out at you.",
      'Stroke your cursor back and forth over me for a belly rub and I melt. Whip it around fast and I get dizzy just watching.',
      'I say hello for the time of day, and now and then I have something to say when you click me.',
      "On a laptop I can feel the battery: a bit droopy when it's low, perky when you plug in.",
      'I remember little milestones with you. There are also a few secret names to find.',
    ],
  },
  {
    version: '0.3.0',
    notes: [
      "I remember where you left me now. If a screen disappears, I'll hop back onto one you've still got.",
      "Typing counts as being around now, so I won't doze off while you're writing.",
      "I get bored after 2 minutes on my own and nod off after 5, with little z's floating up.",
      "Press Ctrl+Alt+B to hide me or bring me back. Handy when you're sharing your screen.",
    ],
  },
  {
    version: '0.2.0',
    notes: [
      'I keep myself up to date now. Watch for the little ring over my head when a new version is on its way.',
      'Press me and I squish. Let go and I wobble. Carry me around and I swing along behind you.',
      'My eyes follow you up and down properly now, and my body leans in to look.',
      'I sway a little while I sit, and I mix up my blinks.',
      'Visor eyes are one smooth line, and I can look left properly from the right side of your screen.',
      "I'm about 50 MB smaller to install.",
    ],
  },
]

/** The notes for a version, if it has any. */
export function notesFor(version: string) {
  return WHATS_NEW.find((entry) => entry.version === version)
}
