import { useShallow } from 'zustand/react/shallow'
import { BUDDY_STATES } from '../../Buddy/BuddyStates'
import { OPACITY_RANGE, SIZE_RANGE, useBuddyStore } from '../../../stores/buddyStore'
import { Chip, Section, Slider, Toggle } from '../controls'
import { HAS_HELPER, IS_MAC } from '../platform'

/** Let the buddy choose its mood from what's going on, or hold one of them. */
export function MoodPage() {
  const { name, state } = useBuddyStore(useShallow((s) => ({ name: s.name, state: s.state })))
  const { setState } = useBuddyStore.getState()
  const deciding = state === 'idle'
  return (
    <div className="panel-body">
      <button className="choice" aria-pressed={deciding} onClick={() => setState('idle')}>
        <span className="choice-dot" aria-hidden="true" />
        <span>
          <span className="choice-title">Let {name.trim() || 'it'} decide</span>
          <span className="choice-hint">Reacts to you and your computer: sleepy when you’re away, stuffed when memory is full.</span>
        </span>
      </button>
      <Section title="Or keep one mood">
        <div className="chips" role="group" aria-label="Mood">
          {BUDDY_STATES.filter((mood) => mood !== 'idle').map((mood) => (
            <Chip key={mood} selected={state === mood} onClick={() => setState(mood)}>
              {mood}
            </Chip>
          ))}
        </div>
        <p className="page-note">It stays in that mood until you pick another.</p>
      </Section>
    </div>
  )
}

export function SizePage() {
  const { size, opacity } = useBuddyStore(useShallow((s) => ({ size: s.size, opacity: s.opacity })))
  const { update } = useBuddyStore.getState()
  return (
    <div className="panel-body panel-body--padded">
      <Slider
        label="Size"
        value={size}
        min={SIZE_RANGE.min}
        max={SIZE_RANGE.max}
        step={1}
        format={(v) => `${v} px`}
        onChange={(v) => update({ size: v })}
      />
      <Slider
        label="Visibility"
        value={opacity}
        min={OPACITY_RANGE.min}
        max={OPACITY_RANGE.max}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ opacity: v })}
      />
      <p className="page-note">Turn visibility down to see through it to what’s behind.</p>
    </div>
  )
}

/** Only on Windows, where the helper notices what's playing. */
export function MediaPage() {
  const { reactToMedia, bopToBeat, showSong } = useBuddyStore(
    useShallow((s) => ({
      reactToMedia: s.reactToMedia,
      bopToBeat: s.bopToBeat,
      showSong: s.showSong,
    })),
  )
  const { update } = useBuddyStore.getState()
  return (
    <div className="panel-body">
      <div className="toggles">
        <Toggle
          label="React to music and videos"
          hint="Bops to music and watches videos with you. Noticed on your PC; nothing is kept or sent."
          checked={reactToMedia}
          onChange={(v) => update({ reactToMedia: v })}
        />
        {reactToMedia && (
          <>
            <Toggle
              nested
              label="Bop to the beat"
              hint="Listens to the music for its beat. The sound is never kept."
              checked={bopToBeat}
              onChange={(v) => update({ bopToBeat: v })}
            />
            <Toggle
              nested
              label="Show the song when you hover"
              hint="Reads the song’s name from Windows."
              checked={showSong}
              onChange={(v) => update({ showSong: v })}
            />
          </>
        )}
      </div>
    </div>
  )
}

export function BehaviourPage({ menu, setMenu }: { menu: MenuState | null; setMenu: (menu: MenuState) => void }) {
  const { followCursor, alwaysOnTop, stepAside, showStats, quiet } = useBuddyStore(
    useShallow((s) => ({
      followCursor: s.followCursor,
      alwaysOnTop: s.alwaysOnTop,
      stepAside: s.stepAside,
      showStats: s.showStats,
      quiet: s.quiet,
    })),
  )
  const { update } = useBuddyStore.getState()
  return (
    <div className="panel-body">
      <h3 className="group-label">On your screen</h3>
      <div className="toggles">
        <Toggle label="Eyes follow your cursor" checked={followCursor} onChange={(v) => update({ followCursor: v })} />
        <Toggle label="Stay on top of other windows" checked={alwaysOnTop} onChange={(v) => update({ alwaysOnTop: v })} />
        {/* Noticed by the Windows helper. A Mac keeps it off full-screen apps' own spaces anyway. */}
        {HAS_HELPER && (
          <Toggle
            label="Step aside for full screen"
            hint="Hides while a game or video is full screen."
            checked={stepAside}
            onChange={(v) => update({ stepAside: v })}
          />
        )}
        {menu && menu.startWithWindows !== null && (
          <Toggle
            label={IS_MAC ? 'Open at login' : 'Start with Windows'}
            checked={menu.startWithWindows}
            onChange={(v) => {
              window.buddy?.setStartWithWindows(v)
              setMenu({ ...menu, startWithWindows: v })
            }}
          />
        )}
      </div>
      <h3 className="group-label">Talking</h3>
      <div className="toggles">
        <Toggle
          label={HAS_HELPER ? 'Show CPU, RAM and GPU on hover' : 'Show CPU and RAM on hover'}
          checked={showStats}
          onChange={(v) => update({ showStats: v })}
        />
        <Toggle label="Quiet mode" hint="No chatter. Update news still shows." checked={quiet} onChange={(v) => update({ quiet: v })} />
      </div>
    </div>
  )
}
