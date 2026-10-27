/**
 * @name Glissade
 * @author glitschyy
 * @description Smooth, direction-aware, GPU-accelerated animations for almost everything in Discord. Content swipes in from the side that matches where you navigated, menus grow out of your cursor, and everything uses spring easing.
 * @version 3.0.0
 */

/*
 * ============================================================
 *  GLISSADE - smooth, logical animations for Discord (BetterDiscord)
 *  Created by glitschyy
 * ============================================================
 *
 * INSTALLATION
 *   1. Make sure BetterDiscord is installed (this plugin does NOT work with Vencord/Vesktop).
 *   2. Put this file (Glissade.plugin.js) into your BetterDiscord plugins folder:
 *      Discord Settings -> Plugins -> "Open Plugins Folder".
 *      The file name must stay "Glissade.plugin.js".
 *   3. Enable "Glissade" in the Plugins list.
 *   4. Click the cog icon next to the plugin to open its settings.
 *
 * HOW THE "LOGICAL" DIRECTIONS WORK
 *   - Switching channel or server: the chat area enters from the side that matches the
 *     order of your list. Go to a channel/server further DOWN the list and the content
 *     comes in from the "next" side (right with Swipe, bottom with Slide). Go UP and it
 *     comes from the opposite side. After a server switch the channel and member lists
 *     cascade in one entry after another.
 *   - Switching tabs in the user settings: same rule, based on the order of the tabs.
 *   - Context menus, popouts and tooltips: they grow out of the point where your cursor
 *     was and drift slightly away from it while appearing.
 *   - New messages: come in from the message side (Swipe) or from below (Slide).
 *   - Modals: scale/rise from the centre of the window.
 *   Turn "Smart direction" off if you prefer one fixed direction.
 *
 * PERFORMANCE NOTES
 *   - Messages, chat switches and list cascades use the Web Animations API. Only
 *     transform and opacity are animated, so the work runs on the GPU compositor.
 *   - No timers, no leftover CSS classes, no permanent will-change.
 *   - Nothing is animated while the Discord window is hidden.
 *   - The blur option is never applied to the large chat area.
 *
 * TROUBLESHOOTING
 *   - If one area looks wrong after a Discord update, turn that area off in the settings.
 *   - Discord renames internal classes from time to time. Glissade only uses stable
 *     attributes and partial class matches. If a selector stops matching, nothing breaks,
 *     that area simply is not animated (or loses its smart direction).
 *   - Use the "Custom selectors" setting to animate additional elements yourself.
 *   - Open the console (Ctrl+Shift+I) and look for "[Glissade]" if you need to report a bug.
 */

const STYLE_ID = "styles";
const BASE_ID = "base";

/*
 * Presets. All distances are in pixels at "Normal" distance.
 *   axis          - axis used for channel/server/tab switches ("x", "y" or null = no movement)
 *   switchDist    - travel distance when switching channel/server
 *   settingsDist  - travel distance when switching settings tabs
 *   shift         - how far menus/popouts drift away from the cursor while appearing
 *   overlayScale  - start scale of menus/popouts/tooltips
 *   switchScale   - start scale of the chat area when switching
 *   message       - start offset/scale of a new message
 *   modal         - start offset/scale of a modal
 */
const PRESETS = {
    swipe: {
        axis: "x",
        switchDist: 40,
        settingsDist: 28,
        shift: 14,
        overlayScale: 0.96,
        switchScale: 1,
        message: { x: -26, y: 0, s: 1 },
        modal: { x: 0, y: 16, s: 0.95 },
    },
    slide: {
        axis: "y",
        switchDist: 26,
        settingsDist: 18,
        shift: 12,
        overlayScale: 0.96,
        switchScale: 1,
        message: { x: 0, y: 18, s: 1 },
        modal: { x: 0, y: 30, s: 0.97 },
    },
    pop: {
        axis: null,
        switchDist: 0,
        settingsDist: 0,
        shift: 0,
        overlayScale: 0.88,
        switchScale: 0.96,
        message: { x: 0, y: 6, s: 0.92 },
        modal: { x: 0, y: 0, s: 0.86 },
    },
    fade: {
        axis: null,
        switchDist: 0,
        settingsDist: 0,
        shift: 0,
        overlayScale: 1,
        switchScale: 1,
        message: { x: 0, y: 0, s: 1 },
        modal: { x: 0, y: 0, s: 1 },
    },
};

// Base duration in milliseconds.
const SPEEDS = { fast: 160, normal: 260, smooth: 380, slow: 540 };

// Multiplier for all travel distances.
const DISTANCES = { subtle: 0.6, normal: 1, strong: 1.5 };

const DEFAULTS = {
    preset: "swipe",
    speed: "normal",
    distance: "normal",
    smartDirection: true,
    softBlur: false,
    messages: true,
    channelSwitch: true,
    overlays: true,
    sidebars: true,
    microInteractions: true,
    extras: true,
    settingsPages: true,
    respectReducedMotion: false,
    customSelectors: "",
};

const OVERLAY_SELECTOR = '[role="menu"], [role="tooltip"], [class*="popout_"]';
const LIST_SELECTOR =
    '[data-list-item-id^="channels___"], [data-list-item-id^="members-"], [data-list-item-id^="private-channels"]';

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const SPRING_FALLBACK = "cubic-bezier(0.34, 1.35, 0.64, 1)";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/*
 * Builds a CSS linear() easing that follows a damped spring.
 * damping < 1 gives a slight, natural overshoot; omega controls how quickly it settles.
 */
function springEasing({ damping = 0.7, omega = 10, samples = 48 } = {}) {
    const wd = omega * Math.sqrt(1 - damping * damping);
    const points = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const decay = Math.exp(-damping * omega * t);
        const value = 1 - decay * (Math.cos(wd * t) + ((damping * omega) / wd) * Math.sin(wd * t));
        points.push(i === samples ? 1 : Number(value.toFixed(4)));
    }
    return `linear(${points.join(", ")})`;
}

module.exports = class Glissade {
    constructor(meta) {
        this.meta = meta;
        this.api = new BdApi(meta.name);
        this.settings = { ...DEFAULTS, ...(this.api.Data.load("settings") ?? {}) };

        this.observer = null;
        this.lastPath = "";
        this.lastSwitch = 0;
        this.route = { guild: null, channel: null };
        this.pointer = { x: 0, y: 0 };
        this.running = new Set();
        this.spring = SPRING_FALLBACK;

        this.onPointer = (event) => {
            this.pointer.x = event.clientX;
            this.pointer.y = event.clientY;
        };
        this.onClick = (event) => this.handleClick(event);
    }

    start() {
        // Use a real spring curve when the browser supports CSS linear(), otherwise a bouncy bezier.
        try {
            if (CSS.supports("animation-timing-function", "linear(0, 1)")) this.spring = springEasing();
        } catch (err) {
            console.warn("[Glissade] Could not check linear() support, using fallback easing.", err);
        }

        this.api.DOM.addStyle(BASE_ID, this.buildBaseCss());
        this.applyStyle();

        this.lastPath = location.pathname;
        this.route = this.parsePath();

        window.addEventListener("pointermove", this.onPointer, { capture: true, passive: true });
        window.addEventListener("pointerdown", this.onPointer, { capture: true, passive: true });
        window.addEventListener("click", this.onClick, true);

        this.observer = new MutationObserver((mutations) => this.onMutations(mutations));
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;

        window.removeEventListener("pointermove", this.onPointer, { capture: true });
        window.removeEventListener("pointerdown", this.onPointer, { capture: true });
        window.removeEventListener("click", this.onClick, true);

        this.running.forEach((animation) => animation.cancel());
        this.running.clear();

        this.api.DOM.removeStyle(STYLE_ID);
        this.api.DOM.removeStyle(BASE_ID);
        document.documentElement.style.removeProperty("--gl-sx");
        document.documentElement.style.removeProperty("--gl-sy");
    }

    // ------------------------------------------------------------------ Helpers

    get preset() {
        return PRESETS[this.settings.preset] ?? PRESETS.swipe;
    }

    get duration() {
        return SPEEDS[this.settings.speed] ?? SPEEDS.normal;
    }

    get factor() {
        return DISTANCES[this.settings.distance] ?? 1;
    }

    // Offset the element starts from. dir = +1 means "from the next side", -1 = "from the previous side".
    vector(dir, dist, preset) {
        const d = dir * dist * this.factor;
        return {
            x: preset.axis === "x" ? d : 0,
            y: preset.axis === "y" ? d : 0,
            s: preset.switchScale ?? 1,
        };
    }

    /*
     * Animate an element FROM an offset/scale/opacity towards whatever style it currently has.
     * Uses the Web Animations API: no class toggling, no forced reflow, no cleanup timers.
     */
    animateFrom(el, vec, { duration, easing, delay = 0, blur = false } = {}) {
        if (!el || typeof el.animate !== "function" || document.hidden) return;

        const frame = {
            opacity: 0,
            transform: `translate3d(${vec.x}px, ${vec.y}px, 0) scale(${vec.s})`,
        };
        if (blur && this.settings.softBlur) frame.filter = "blur(6px)";

        const animation = el.animate([frame], { duration, easing, delay, fill: "backwards" });
        this.running.add(animation);
        const done = () => this.running.delete(animation);
        animation.onfinish = done;
        animation.oncancel = done;
    }

    // ------------------------------------------------------------------ Styles

    applyStyle() {
        this.api.DOM.removeStyle(STYLE_ID);

        // Optionally stay silent when the OS asks for reduced motion.
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (this.settings.respectReducedMotion && reduced) return;

        this.api.DOM.addStyle(STYLE_ID, this.buildCss());
    }

    buildBaseCss() {
        return `
[role="menu"],
[role="tooltip"] { border-radius: 8px; }

[role="dialog"][aria-modal="true"] { border-radius: 10px; overflow: hidden; }
[class*="popout_"] { border-radius: 10px; }

[class*="embedWrapper_"],
[class*="messageAttachment_"],
[class*="channelTextArea_"],
[class*="searchBar_"],
pre { border-radius: 8px; }

[class*="lookFilled_"],
[data-list-item-id^="channels___"],
[data-list-item-id^="members-"],
[data-list-item-id^="private-channels"] { border-radius: 6px; }
`;
    }

    buildCss() {
        const s = this.settings;
        const p = this.preset;
        const f = this.factor;
        const px = (n) => `${Math.round(n * f)}px`;
        const blurLine = s.softBlur ? "filter: blur(var(--gl-blur));" : "";
        const css = [];

        // Shared variables and keyframes for the CSS-driven animations.
        // The keyframes have no "to" step on purpose: every element animates towards whatever
        // style Discord gave it, so nothing is permanently overridden.
        css.push(`
:root {
    --gl-duration: ${this.duration}ms;
    --gl-ease: ${EASE_OUT};
    --gl-spring: ${this.spring};
    --gl-blur: 6px;
}
@keyframes gl-move {
    from {
        opacity: 0;
        transform: translate3d(var(--gl-x, 0px), var(--gl-y, 0px), 0) scale(var(--gl-scale, 1));
        ${blurLine}
    }
}
@keyframes gl-pop  { from { opacity: 0; transform: scale(0.6); } }
@keyframes gl-rise { from { opacity: 0; transform: translateY(8px); } }
`);

        // Context menus, tooltips, popouts and modals.
        // (JS refines menus/popouts per cursor position, see enhanceLayer.)
        if (s.overlays) {
            const custom = String(s.customSelectors ?? "").replace(/[{};]/g, "").trim();
            const overlaySelectors = ['[role="menu"]', '[role="tooltip"]', '[class*="popout_"]'];
            if (custom) overlaySelectors.push(custom);

            css.push(`
${overlaySelectors.join(",\n")} {
    --gl-x: 0px;
    --gl-y: 0px;
    --gl-scale: ${p.overlayScale};
    animation: gl-move var(--gl-duration) var(--gl-spring) backwards;
}
[role="dialog"][aria-modal="true"] {
    --gl-x: ${px(p.modal.x)};
    --gl-y: ${px(p.modal.y)};
    --gl-scale: ${p.modal.s};
    animation: gl-move calc(var(--gl-duration) * 1.3) var(--gl-spring) backwards;
}
`);
        }

        // Server icons, channels, DMs and member list: smooth hover motion.
        if (s.sidebars) {
            css.push(`
[data-list-item-id^="guildsnav___"] {
    transition: transform var(--gl-duration) var(--gl-spring),
                border-radius var(--gl-duration) var(--gl-ease),
                background-color 0.15s ease-out;
}
[data-list-item-id^="guildsnav___"]:hover { transform: scale(1.08); }

[data-list-item-id^="channels___"],
[data-list-item-id^="members-"],
[data-list-item-id^="private-channels"] {
    transition: transform var(--gl-duration) var(--gl-ease),
                background-color 0.1s ease-out;
}
[data-list-item-id^="channels___"]:hover,
[data-list-item-id^="members-"]:hover,
[data-list-item-id^="private-channels"]:hover { transform: translateX(4px); }
`);
        }

        // Button press feedback, reaction hover, avatar hover.
        if (s.microInteractions) {
            css.push(`
button:not(:disabled):active { transform: scale(0.96); }

[class*="reaction_"] {
    transition: transform var(--gl-duration) var(--gl-spring),
                background-color 0.1s ease-out,
                border-color 0.1s ease-out;
}
[class*="reaction_"]:hover { transform: translateY(-2px) scale(1.06); }

img[class*="avatar_"] { transition: transform var(--gl-duration) var(--gl-spring); }
img[class*="avatar_"]:hover { transform: scale(1.08); }
`);
        }

        // Extra animations: badges, reactions, embeds, attachments, toolbar icons.
        if (s.extras) {
            css.push(`
[class*="numberBadge_"],
[class*="lowerBadge_"],
[class*="reaction_"] { animation: gl-pop calc(var(--gl-duration) * 1.1) var(--gl-spring) backwards; }

[class*="embedWrapper_"],
[class*="messageAttachment_"] { animation: gl-rise calc(var(--gl-duration) * 1.2) var(--gl-ease) backwards; }

[class*="toolbar_"] [role="button"] {
    transition: transform var(--gl-duration) var(--gl-spring),
                color 0.15s ease-out,
                background-color 0.15s ease-out;
}
[class*="toolbar_"] [role="button"]:hover { transform: scale(1.12); }
`);
        }

        // User settings pages. Direction comes from --gl-sx / --gl-sy, set when you click a tab.
        if (s.settingsPages) {
            css.push(`
[class*="contentColumn_"] {
    --gl-x: var(--gl-sx, 0px);
    --gl-y: var(--gl-sy, 0px);
    --gl-scale: 1;
    animation: gl-move calc(var(--gl-duration) * 1.1) var(--gl-ease) backwards;
}
`);
        }

        return css.join("\n");
    }

    // ------------------------------------------------------------------ Routing

    parsePath() {
        const match = location.pathname.match(/^\/channels\/([^/]+)(?:\/([^/]+))?/);
        return match ? { guild: match[1], channel: match[2] ?? null } : { guild: null, channel: null };
    }

    // Decide from which side the new content should enter, based on the order of your lists.
    switchDirection(prev, next) {
        const serverSwitch = prev.guild !== next.guild;
        if (!this.settings.smartDirection) return { dir: 1, serverSwitch };

        let from = null;
        let to = null;

        if (serverSwitch) {
            // Order of the server icons. The Home / DM button counts as the top entry.
            const items = [...document.querySelectorAll('[data-list-item-id^="guildsnav___"]')].map((el) =>
                el.getAttribute("data-list-item-id")
            );
            const indexOf = (guild) => {
                if (guild === "@me") return -1;
                const index = items.indexOf(`guildsnav___${guild}`);
                return index < 0 ? null : index;
            };
            from = indexOf(prev.guild);
            to = indexOf(next.guild);
        } else {
            // Order of the channel list (server channels or DMs).
            const rows = [...document.querySelectorAll(LIST_SELECTOR)].map((el) => el.getAttribute("data-list-item-id"));
            const indexOf = (channel) => {
                if (!channel) return -1;
                const index = rows.findIndex((id) => id.endsWith(`___${channel}`));
                return index < 0 ? null : index;
            };
            from = indexOf(prev.channel);
            to = indexOf(next.channel);
        }

        if (from === null || to === null || from === to) return { dir: 1, serverSwitch };
        return { dir: to > from ? 1 : -1, serverSwitch };
    }

    checkRoute() {
        if (location.pathname === this.lastPath) return;

        const prev = this.route;
        const next = this.parsePath();
        this.lastPath = location.pathname;
        this.route = next;
        this.lastSwitch = Date.now();

        if (!this.settings.channelSwitch && !this.settings.sidebars) return;

        const { dir, serverSwitch } = this.switchDirection(prev, next);
        const preset = this.preset;
        const distance = preset.switchDist * (serverSwitch ? 1.5 : 1);

        requestAnimationFrame(() => {
            if (this.settings.channelSwitch) {
                const chat = document.querySelector('[class*="chatContent_"]');
                // Never blur the large chat area, it is expensive.
                this.animateFrom(chat, this.vector(dir, distance, preset), {
                    duration: this.duration * 1.15,
                    easing: EASE_OUT,
                });
            }

            // After a server switch, let the channel and member lists cascade in.
            if (serverSwitch && this.settings.sidebars) {
                requestAnimationFrame(() => this.cascadeLists());
            }
        });
    }

    // Channel / member / DM entries fade in one after another.
    cascadeLists() {
        const p = this.preset;
        const f = this.factor;
        const vec = {
            x: p.axis === "x" ? -14 * f : 0,
            y: p.axis === "y" ? 10 * f : 0,
            s: p.axis ? 1 : Math.max(p.overlayScale, 0.94),
        };

        const items = document.querySelectorAll(LIST_SELECTOR);
        const count = Math.min(items.length, 30);
        for (let i = 0; i < count; i++) {
            this.animateFrom(items[i], vec, {
                duration: this.duration,
                easing: EASE_OUT,
                delay: Math.min(i, 14) * 16,
            });
        }
    }

    // Settings tabs: remember in which direction the user is moving through the tab list.
    handleClick(event) {
        if (!this.settings.settingsPages) return;

        const tab = event.target?.closest?.('[role="tab"]');
        const list = tab?.closest?.('[role="tablist"]');
        if (!tab || !list) return;

        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
        const target = tabs.indexOf(tab);
        if (current < 0 || target < 0 || target === current) return;

        const dir = this.settings.smartDirection ? (target > current ? 1 : -1) : 1;
        const preset = this.preset;
        const d = dir * preset.settingsDist * this.factor;
        const root = document.documentElement.style;
        root.setProperty("--gl-sx", preset.axis === "x" ? `${d}px` : "0px");
        root.setProperty("--gl-sy", preset.axis === "y" ? `${d}px` : "0px");
    }

    // ------------------------------------------------------------------ Observer

    onMutations(mutations) {
        const s = this.settings;

        this.checkRoute();

        let messages = null;

        for (const mutation of mutations) {
            const added = mutation.addedNodes;
            if (added.length === 0) continue;

            for (const node of added) {
                if (node.nodeType !== 1) continue;

                // Chat messages.
                if (s.messages && typeof node.id === "string" && node.id.startsWith("chat-messages-")) {
                    (messages ??= []).push(node);
                    continue;
                }

                // Layers (menus, popouts, tooltips) are added straight into a layer container.
                if (s.overlays) {
                    const parent = node.parentElement;
                    if (parent && typeof parent.className === "string" && parent.className.includes("layerContainer")) {
                        this.enhanceLayer(node);
                    }
                }
            }
        }

        // More than 2 at once = history/bulk load, which we intentionally do not animate.
        // Also ignore the message burst right after switching channels.
        if (messages && messages.length <= 2 && Date.now() - this.lastSwitch > 1200) {
            const p = this.preset;
            const f = this.factor;
            const m = p.message;
            for (const node of messages) {
                this.animateFrom(node, { x: m.x * f, y: m.y * f, s: m.s }, {
                    duration: this.duration,
                    easing: p.axis ? EASE_OUT : this.spring,
                    blur: true,
                });
            }
        }
    }

    // Make menus/popouts/tooltips grow out of the cursor and drift slightly away from it.
    enhanceLayer(layer) {
        const target = layer.matches(OVERLAY_SELECTOR) ? layer : layer.querySelector(OVERLAY_SELECTOR);
        if (!target) return;

        try {
            // Measure without the running animation so the scale does not distort the rectangle.
            target.style.animation = "none";
            const rect = target.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
                const { x: px, y: py } = this.pointer;

                // Transform origin = the point of the element that is closest to the cursor.
                const ox = clamp(px - rect.left, 0, rect.width);
                const oy = clamp(py - rect.top, 0, rect.height);
                target.style.transformOrigin = `${ox}px ${oy}px`;

                // Start slightly shifted towards the cursor, then settle into place.
                const dx = px - (rect.left + rect.width / 2);
                const dy = py - (rect.top + rect.height / 2);
                const length = Math.hypot(dx, dy) || 1;
                const shift = this.preset.shift * this.factor;
                target.style.setProperty("--gl-x", `${(dx / length) * shift}px`);
                target.style.setProperty("--gl-y", `${(dy / length) * shift}px`);
            }

            void target.offsetWidth; // force a reflow, then restart the animation
            target.style.animation = "";
        } catch (err) {
            console.error("[Glissade] Could not enhance layer:", err);
            target.style.animation = "";
        }
    }

    // ------------------------------------------------------------------ Settings

    getSettingsPanel() {
        return this.api.UI.buildSettingsPanel({
            settings: [
                {
                    type: "dropdown",
                    id: "preset",
                    name: "Animation style",
                    note: "Swipe = horizontal, Slide = vertical, Pop = zoom, Fade = fade only. Direction follows your navigation.",
                    value: this.settings.preset,
                    options: [
                        { label: "Swipe (horizontal)", value: "swipe" },
                        { label: "Slide (vertical)", value: "slide" },
                        { label: "Pop (zoom)", value: "pop" },
                        { label: "Fade (fade only)", value: "fade" },
                    ],
                },
                {
                    type: "dropdown",
                    id: "speed",
                    name: "Speed",
                    value: this.settings.speed,
                    options: [
                        { label: "Fast (160 ms)", value: "fast" },
                        { label: "Normal (260 ms)", value: "normal" },
                        { label: "Smooth (380 ms)", value: "smooth" },
                        { label: "Slow (540 ms)", value: "slow" },
                    ],
                },
                {
                    type: "dropdown",
                    id: "distance",
                    name: "Distance",
                    note: "How far elements travel while animating.",
                    value: this.settings.distance,
                    options: [
                        { label: "Subtle", value: "subtle" },
                        { label: "Normal", value: "normal" },
                        { label: "Strong", value: "strong" },
                    ],
                },
                {
                    type: "switch",
                    id: "smartDirection",
                    name: "Smart direction",
                    note: "Content enters from the side that matches the order of your channels, servers and settings tabs. Off = always the same direction.",
                    value: this.settings.smartDirection,
                },
                {
                    type: "switch",
                    id: "softBlur",
                    name: "Soft blur on enter",
                    note: "Adds a subtle blur-to-sharp effect to messages, menus and modals. Uses a bit more GPU.",
                    value: this.settings.softBlur,
                },
                {
                    type: "switch",
                    id: "messages",
                    name: "New messages",
                    note: "Newly received messages animate in.",
                    value: this.settings.messages,
                },
                {
                    type: "switch",
                    id: "channelSwitch",
                    name: "Channel / server switch",
                    note: "The chat area swipes in when you change channel or server.",
                    value: this.settings.channelSwitch,
                },
                {
                    type: "switch",
                    id: "overlays",
                    name: "Menus, popouts, tooltips and modals",
                    note: "Menus and popouts grow out of your cursor, modals rise in from the centre.",
                    value: this.settings.overlays,
                },
                {
                    type: "switch",
                    id: "sidebars",
                    name: "Sidebars",
                    note: "Hover motion for server icons, channels, DMs and members. Lists cascade in after a server switch.",
                    value: this.settings.sidebars,
                },
                {
                    type: "switch",
                    id: "microInteractions",
                    name: "Buttons, reactions and avatars",
                    note: "Press feedback on buttons, hover motion on reactions and avatars.",
                    value: this.settings.microInteractions,
                },
                {
                    type: "switch",
                    id: "extras",
                    name: "Extra animations",
                    note: "Pop-in for badges and reactions, rise-in for embeds and attachments, hover motion for toolbar icons.",
                    value: this.settings.extras,
                },
                {
                    type: "switch",
                    id: "settingsPages",
                    name: "Settings pages",
                    note: "User settings pages animate in, in the direction of the tab you clicked.",
                    value: this.settings.settingsPages,
                },
                {
                    type: "switch",
                    id: "respectReducedMotion",
                    name: "Respect system reduced-motion setting",
                    note: "If your operating system asks for reduced motion, Glissade stays off.",
                    value: this.settings.respectReducedMotion,
                },
                {
                    type: "text",
                    id: "customSelectors",
                    name: "Custom selectors (advanced)",
                    note: "Comma-separated CSS selectors that should also animate in like menus, e.g. [class*=\"emojiPicker_\"]",
                    value: this.settings.customSelectors,
                    placeholder: '[class*="emojiPicker_"], [class*="searchBar_"]',
                },
            ],
            onChange: (category, id, value) => {
                this.settings[id] = value;
                this.api.Data.save("settings", this.settings);
                this.applyStyle();
            },
        });
    }
};
