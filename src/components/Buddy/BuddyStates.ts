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
  | 'excited'
  | 'shy'
  | 'proud'
  | 'scared'
  | 'content'
  | 'thinking'
  // Only while a video plays, and while the memory is nearly full, so these aren't in the list below
  // that the panel and gallery offer.
  | 'watching'
  | 'stuffed';

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
  'excited',
  'shy',
  'proud',
  'scared',
  'content',
  'thinking',
];
