/**
 * What changed in each version, in the buddy's own words, newest first. Shown in the what's new card
 * after an update and from the tray. Add an entry with every release; a version without one simply
 * doesn't offer the card after updating.
 */
export const WHATS_NEW: { version: string; notes: string[] }[] = [
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
