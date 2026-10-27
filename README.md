# Glissade

Smooth swipe, slide, pop and fade animations for almost everything in Discord.

Glissade is a [BetterDiscord](https://betterdiscord.app/) plugin that makes Discord feel fluid: messages glide in, channels swipe when you switch, menus and dialogs animate open, and hovering over sidebars and buttons feels alive.

**Created by glitschyy**

---

## Features

- **Four animation styles:** Swipe, Slide, Pop and Fade
- **Four speeds:** Fast (160 ms), Normal (260 ms), Smooth (380 ms), Slow (560 ms)
- **Animates a lot of the UI:**
  - New incoming messages
  - Channel and server switches (the chat area swipes in)
  - Context menus, popouts, tooltips and modals
  - Server icons, channels, DMs and member list (hover motion)
  - Button press feedback, reaction and avatar hover
  - User settings pages
- **Every area can be switched on or off individually**
- **Custom selectors:** add your own CSS selectors to animate extra elements
- **Optional reduced-motion support:** stay off if your OS asks for reduced motion
- Changes apply instantly, no restart needed
- Pure CSS animations plus a tiny observer: lightweight, no external libraries

## Requirements

- Discord desktop app
- [BetterDiscord](https://betterdiscord.app/) (a current version)

> Glissade is **not** compatible with Vencord or Vesktop, because it uses the BetterDiscord API (`BdApi`).

## Installation

1. Install BetterDiscord if you have not already.
2. Download `Glissade.plugin.js` from this repository.
3. In Discord, open **Settings → Plugins → Open Plugins Folder** and move the file into that folder. Keep the file name `Glissade.plugin.js`.
4. Enable **Glissade** in the Plugins list.

## Usage

Click the cog icon next to Glissade in the Plugins list to open the settings.

| Setting | Description |
| --- | --- |
| Animation style | Swipe, Slide, Pop or Fade |
| Speed | Fast, Normal, Smooth or Slow |
| New messages | Animate newly received messages |
| Channel / server switch | Swipe the chat area in when you change channel or server |
| Menus, popouts, tooltips and modals | Animate context menus, user popouts, tooltips and dialogs |
| Sidebars | Hover motion for server icons, channels, DMs and members |
| Buttons, reactions and avatars | Press and hover feedback |
| Settings pages | Animate user settings pages when switching tabs |
| Respect system reduced-motion setting | Glissade stays off if your OS requests reduced motion |
| Custom selectors | Comma-separated CSS selectors that should also animate in |

### Custom selectors example

To animate the emoji picker and a search bar as well, enter this in **Custom selectors**:

```
[class*="emojiPicker_"], [class*="searchBar_"]
```

Glissade strips `{`, `}` and `;` from this field, so it only accepts selectors.

## How it works

- Glissade injects a small stylesheet with CSS keyframe animations. Elements are matched with stable attributes (such as `role="menu"` or `data-list-item-id`) and partial class-name matches, because Discord's class names contain changing hash suffixes.
- A lightweight `MutationObserver` detects new chat messages and channel changes and briefly adds an animation class to the right element. The class is removed again when the animation is finished.
- Animations use no "end" keyframe, so elements always animate towards whatever style Discord gave them and nothing is permanently overridden.
- Bulk-loaded history and the message burst right after switching channels are intentionally not animated, to avoid visual noise.

## Troubleshooting

**Something looks wrong or jumps.**
Turn off the affected area in the settings (for example "Menus, popouts, tooltips and modals"). Each area works independently.

**An element is not animated.**
Discord renames internal classes from time to time. Nothing breaks when a selector stops matching, that element just is not animated. Add the element with **Custom selectors**, or open an issue.

**Nothing animates at all.**
- Make sure the plugin is enabled and BetterDiscord is up to date.
- If **Respect system reduced-motion setting** is on and your operating system has animations disabled, Glissade stays off by design.

**Reporting a bug.**
Press `Ctrl+Shift+I`, open the console, and include any lines that contain `[Glissade]` in your report.

## Contributing

Issues and pull requests are welcome. If a Discord update breaks a selector, please include the new class name or attribute in your report.

## Credits

Created by **glitschyy**.
