export type BuddyState =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'stressed'
  | 'angry'
  | 'bored'
  | 'surprised'
  | 'sad'
  | 'curious'
  | 'confused'
  | 'love'
  | 'wink'
  | 'focused'
  | 'smug'
  | 'dizzy'
  // Only while a video plays, so it isn't in the list below that the panel and gallery offer.
  | 'watching';

export const BUDDY_STATES: BuddyState[] = [
  'idle',
  'happy',
  'sleepy',
  'stressed',
  'angry',
  'bored',
  'surprised',
  'sad',
  'curious',
  'confused',
  'love',
  'wink',
  'focused',
  'smug',
  'dizzy',
];
