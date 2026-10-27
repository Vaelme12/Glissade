# Glissade

Smooth, direction-aware, GPU-accelerated animations for almost everything in Discord.

Glissade is a [BetterDiscord](https://betterdiscord.app/) plugin that makes Discord feel fluid *and* logical: content swipes in from the side that matches where you navigated, menus grow out of your cursor, lists cascade in, and every motion uses natural spring easing.

**Created by glitschyy**

---

## Features

- **Logical directions (Smart direction):**
  - Switch to a channel or server further down your list and the chat area enters from the "next" side. Go up and it enters from the opposite side.
  - After a server switch, the channel list and member list cascade in one entry after another.
  - Switching tabs in the user settings follows the same rule.
  - Context menus, popouts and tooltips grow out of the point where your cursor was and drift slightly away from it while appearing.
  - New messages enter from the message side (Swipe) or from below (Slide).
  - Modals scale and rise from the centre of the window.
- **Natural motion:** spring easing (CSS `linear()`), smooth ease-out curves, optional soft blur-to-sharp effect
- **Four animation styles:** Swipe (horizontal), Slide (vertical), Pop (zoom), Fade
- **Four speeds:** Fast (160 ms), Normal (260 ms), Smooth (380 ms), Slow (540 ms)
- **Adjustable distance:** Subtle, Normal, Strong
- **Animates a lot of the UI:**
  - New incoming messages
  - Channel and server switches
  - Channel, DM and member lists (cascade after server switch, hover motion)
  - Context menus, popouts, tooltips and modals
  - Server icons (hover motion)
  - Button press feedback, reaction and avatar hover
  - Extras: pop-in for badges and reactions, rise-in for embeds and attachments, hover motion for toolbar icons
  - User settings pages
- **Every area can be switched on or off individually**
- **Custom selectors:** add your own CSS selectors to animate extra elements
- **Optional reduced-motion support:** stay off if your OS asks for reduced motion
- Changes apply instantly, no restart needed
- No external libraries

## Performance

Glissade is built to stay out of the way:

- Messages, chat switches and list cascades use the **Web Animations API**. Only `transform` and `opacity` are animated, so the work runs on the GPU compositor.
- No cleanup timers, no leftover CSS classes, no permanent `will-change`.
- Nothing is animated while the Discord window is hidden.
- The optional blur is never applied to the large chat area.
- The `MutationObserver` only does cheap checks on newly added nodes.
- Startup is instant: one stylesheet, one observer, three event listeners.

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
| Animation style | Swipe (horizontal), Slide (vertical), Pop (zoom) or Fade |
| Speed | Fast, Normal, Smooth or Slow |
| Distance | How far elements travel: Subtle, Normal or Strong |
| Smart direction | Content enters from the side that matches your navigation. Off = always the same direction |
| Soft blur on enter | Adds a blur-to-sharp effect to messages, menus and modals (uses a bit more GPU) |
| New messages | Animate newly received messages |
| Channel / server switch | Animate the chat area when you change channel or server |
| Menus, popouts, tooltips and modals | Menus and popouts grow out of the cursor, modals rise in from the centre |
| Sidebars | Hover motion for server icons, channels, DMs and members. Lists cascade in after a server switch |
| Buttons, reactions and avatars | Press and hover feedback |
| Extra animations | Pop-in for badges and reactions, rise-in for embeds and attachments, toolbar icon hover |
| Settings pages | Animate user settings pages in the direction of the tab you clicked |
| Respect system reduced-motion setting | Glissade stays off if your OS requests reduced motion |
| Custom selectors | Comma-separated CSS selectors that should also animate in like menus |

### How the direction is chosen

| Action | Swipe | Slide |
| --- | --- | --- |
| Go to a channel / server **lower** in the list | content enters from the **right** | content enters from the **bottom** |
| Go to a channel / server **higher** in the list | content enters from the **left** | content enters from the **top** |
| Home / DM button | counts as the top entry of the server list | counts as the top entry of the server list |

Switching servers uses a slightly larger distance than switching channels. If Glissade cannot determine the order (for example a server inside a collapsed folder), it falls back to the "next" direction.

### Custom selectors example

To animate the emoji picker and a search bar like a popout, enter this in **Custom selectors**:

```
[class*="emojiPicker_"], [class*="searchBar_"]
```

Glissade strips `{`, `}` and `;` from this field, so it only accepts selectors.

## How it works

- **Messages, chat switches and list cascades** are animated from JavaScript with the Web Animations API: the element animates *from* an offset towards whatever style Discord gave it, so nothing is permanently overridden.
- **Menus, popouts, tooltips, modals, settings pages and extras** use one shared CSS keyframe animation. Direction, distance and scale are passed in through CSS custom properties (`--gl-x`, `--gl-y`, `--gl-scale`).
- Elements are matched with stable attributes (such as `role="menu"`, `role="tab"` or `data-list-item-id`) and partial class-name matches, because Discord's class names contain changing hash suffixes.
- A lightweight `MutationObserver` detects new messages, new layers and URL changes. For channel and server switches it compares the position of the old and new entry in your lists to pick the direction. For menus and popouts it uses the last pointer position to set the transform origin and the starting offset.
- Bulk-loaded message history and the message burst right after switching channels are intentionally not animated, to avoid visual noise.

## Limitations

- Only elements **appearing** are animated. Elements that disappear (closing menus or modals) are removed by Discord immediately.
- Smart direction relies on Discord's list markup. If it changes, Glissade falls back to a fixed direction instead of breaking.

## Troubleshooting

**Something looks wrong or jumps.**
Turn off the affected area in the settings (for example "Menus, popouts, tooltips and modals"), or turn off **Soft blur on enter**. Each area works independently.

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
