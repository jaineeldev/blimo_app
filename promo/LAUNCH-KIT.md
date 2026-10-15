# DesktopBuddy launch kit

Everything for telling people about DesktopBuddy: post drafts in your voice, the itch.io page, and other places worth trying. Edit freely; it's written to sound like you, not a press release.

**Links to use everywhere**

- Website: https://jaineel.dev/desktopbuddy (short link: jaineel.dev/buddy)
- Code: https://github.com/jaineeldev/desktop_buddy

**Media** (in this repo)

- `promo/itch-cover.png`: itch.io cover (1260x1000, the 630x500 shape at 2x)
- `docs/dark/*.gif` and `docs/light/*.gif`: the README GIFs. The dark ones stand out more in most feeds.
  - `reactions.gif`: petting, belly rub, carrying, shaking. Best single GIF for a post.
  - `peek.gif`: edge peeking. Good second.
  - `customise.gif`: the settings panel, renaming and restyling.
  - `buddies.gif`: nine buddies. Good for a banner.
  - `moods.gif`: all fifteen moods.

---

## Reddit

**Before posting**

- Read each community's rules first. Some only allow self-promotion on certain days, or want you to take part in the community too, not just post your own things.
- Post the GIF as the post itself (an image post), then put the links in a comment or the text. Image posts get far more attention than link posts.
- Space them out: one community a day, not all at once, or it looks like spam and the filters may catch it.
- Stay for the first two hours and reply to everyone. That's when a post either takes off or doesn't.
- Weekday mornings in the US do best, which is late night or very early morning in Brisbane. Reddit lets you schedule posts.

### r/SideProject

**Title:** I made a tiny desktop pet for Windows whose face is generated from its name

**Post:** `reactions.gif`, then this as the text (or the first comment):

> DesktopBuddy is a little creature that sits on top of your windows. You give it a name and the name decides its face: its shape, colour and eyes, even how fast it breathes. The same name always makes the same buddy.
>
> It follows your cursor with its eyes and has fifteen moods. It squishes when you pet it, melts if you give it a belly rub, gets dizzy if you shake it, and tucks in behind the edge of your screen to peek at you if you push it there. Leave your PC alone and it gets bored, then dozes off.
>
> It's free and open source (MIT), for Windows 10 and 11. I built it with Electron, React and TypeScript, with help from AI (Claude).
>
> Download: jaineel.dev/desktopbuddy
> Code: github.com/jaineeldev/desktop_buddy
>
> Next on my list is having it bop along to your music. What would you want it to do?

### r/opensource

**Title:** DesktopBuddy: an open-source desktop pet for Windows (Electron + React, MIT)

**Post:** `buddies.gif` or `reactions.gif`, then:

> I've just open-sourced DesktopBuddy under the MIT License. It's a small creature that lives on your desktop, with a face generated entirely from its name: the name is hashed, and each trait (shape, eye style, colour, blink rate) comes from it, so there are no images or sprites anywhere.
>
> It's Electron, React, TypeScript, Framer Motion and Zustand. It updates itself from GitHub Releases, and it never sees what you type or touches your files.
>
> Code: github.com/jaineeldev/desktop_buddy
> Download: jaineel.dev/desktopbuddy
>
> I built it with help from AI (Claude). Issues and ideas are very welcome.

### r/electronjs

Developers like a post that teaches them something more than one that just announces a thing, so this one leads with what you learned.

**Title:** Things I learned making a transparent, always-on-top desktop pet in Electron

**Post:** `peek.gif`, then:

> I've been building DesktopBuddy, a desktop pet for Windows, and a few Electron things took a while to get right:
>
> - **Clicks through empty space.** The window is much bigger than the buddy, so `setIgnoreMouseEvents(true, { forward: true })` keeps it click-through, and the renderer turns that off only while the cursor is over the buddy itself.
> - **Always on top that actually stays on top.** The default level for `alwaysOnTop` on Windows sits just under the taskbar, and other always-on-top windows (games, video players) cover it. Using the `'screen-saver'` level, and putting it back above everything every second, fixed it.
> - **Every virtual desktop.** Making it a tool window (`type: 'toolbar'`) takes it out of the taskbar and Alt+Tab, and Windows stops tying it to one virtual desktop, so it's on all of them.
> - **No sprites.** Every face is generated in SVG from a hash of the buddy's name.
>
> Code (MIT): github.com/jaineeldev/desktop_buddy
>
> Happy to go into any of it. Built with help from AI (Claude).

### r/desktops

People there share their setups, so this needs a real screenshot of your desktop with your buddy on it, ideally peeking out from an edge. A plain announcement won't land there.

**Title:** My desktop has a resident now

**Post:** your screenshot, then a comment:

> It's DesktopBuddy, a little desktop pet I made. Its face comes from its name, and it reacts when you pet it, carry it or leave it alone too long. Free and open source: jaineel.dev/desktopbuddy

### r/Windows11

Check the rules first: Windows communities are strict about self-promotion. If it's allowed, reuse the r/SideProject post, trimmed to the first two paragraphs and the links.

---

## itch.io

itch.io is where desktop pets like Desktop Goose found their audience, and pages there get found through tags and browsing.

**Create the page:** Dashboard → Create new project.

| Field | What to put |
|---|---|
| Title | DesktopBuddy |
| Project URL | jaineeldev.itch.io/desktopbuddy |
| Short description | A tiny creature that lives on your desktop. Give it a name and it grows a face of its own. |
| Classification | Tools |
| Kind of project | Downloadable |
| Release status | Released |
| Pricing | No payments (or "Donate" if you'd like an optional tip jar; it stays free either way) |
| Uploads | `DesktopBuddy-Windows-1.0.1-Setup.exe`, tick Windows |
| Cover image | `promo/itch-cover.png` |
| Screenshots | `docs/dark/reactions.gif`, `peek.gif`, `customise.gif`, `moods.gif` |
| Tags | desktop-pet, virtual-pet, cute, windows, open-source, desktop, mascot, cozy |
| Links | Website: jaineel.dev/desktopbuddy, Source code: github.com/jaineeldev/desktop_buddy |
| Community | Comments on |

**Description** (paste into the description box):

> DesktopBuddy is a little creature that sits on top of your windows and keeps you company.
>
> **Give it a name and it grows a face.** The name decides everything: its shape, its colour, its eyes, even how fast it breathes. The same name always makes the same buddy, so yours is yours.
>
> **It reacts to you.** Its eyes follow your cursor. Pet it and it squishes. Give it a belly rub and it melts. Pick it up and it swings along behind your cursor; shake it and it gets dizzy. Push it past the edge of your screen and it tucks in to peek at you. Leave your computer alone and it gets bored, then dozes off.
>
> **It has fifteen moods,** from happy and sleepy to smug and dizzy, and now and then it has something to say.
>
> **Make it yours.** Right-click it to change its name, shape, eyes, colour and size.
>
> **It stays out of the way.** Only the buddy itself catches your mouse; the space around it lets clicks straight through. Press Ctrl+Alt+B to hide it.
>
> Free and open source, for Windows 10 and 11. It keeps itself up to date.
>
> **Installing:** Windows may show "Windows protected your PC" because the app isn't code-signed yet. Click More info, then Run anyway.
>
> Made by Jaineel, with help from AI.

The app updates itself from GitHub, so people who download it from itch.io still get every new version. When you release a new version, upload the new Setup.exe to itch.io as well, so new downloads start on the latest.

---

## More places worth trying

Ranked by how much I think they'd help, with the catch for each.

1. **Microsoft Store.** It's free for individual developers now. Microsoft signs the app, so the "Windows protected your PC" warning disappears, and people can find it by searching the Store. *Catch:* it needs packaging for the Store (I can set that up) and a review that takes a few days. This is the biggest one: that warning puts a lot of people off.
2. **winget.** Free. Lets anyone install it by typing `winget install DesktopBuddy`. Developers love it, and it's one small file submitted to Microsoft's list on GitHub. *Catch:* only reaches people who use the command line.
3. **AlternativeTo.** Free. List it as an alternative to Desktop Goose, Shimeji and BonziBuddy, and people searching for those find it, for years. *Catch:* slow and steady, not a spike.
4. **Product Hunt.** Free. One big day of attention from tech-curious people. *Catch:* it rewards a planned launch day (a Tuesday to Thursday, posted at midnight US Pacific time, which is the early evening in Brisbane), and it helps to have a few friends ready to try it.
5. **Hacker News, "Show HN".** Free. Can bring a lot of developers at once. *Catch:* it's hit or miss, and comments can be blunt. A technical angle (the face generator, the Electron tricks) suits it better than "a cute pet".
6. **Short videos (TikTok, Reels, Shorts).** The Instagram story clip already works well. Short loops of Sora reacting are exactly what does well there. *Catch:* needs posting regularly to build up.
