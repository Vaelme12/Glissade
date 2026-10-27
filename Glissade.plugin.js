/**
 * @name Glissade
 * @author glitschyy
 * @description Smooth, direction-aware animations for Discord. Menus grow from your cursor, chat swipes in, etc.
 * @version 3.0.0
 */

const STYLE_ID = "glissade-styles";
const BASE_ID = "glissade-base";

const PRESETS = {
    swipe: { axis: "x", switchDist: 40, settingsDist: 28, shift: 14, overlayScale: 0.96, switchScale: 1, message: { x: -26, y: 0, s: 1 }, modal: { x: 0, y: 16, s: 0.95 } },
    slide: { axis: "y", switchDist: 26, settingsDist: 18, shift: 12, overlayScale: 0.96, switchScale: 1, message: { x: 0, y: 18, s: 1 }, modal: { x: 0, y: 30, s: 0.97 } },
    pop: { axis: null, switchDist: 0, settingsDist: 0, shift: 0, overlayScale: 0.88, switchScale: 0.96, message: { x: 0, y: 6, s: 0.92 }, modal: { x: 0, y: 0, s: 0.86 } },
    fade: { axis: null, switchDist: 0, settingsDist: 0, shift: 0, overlayScale: 1, switchScale: 1, message: { x: 0, y: 0, s: 1 }, modal: { x: 0, y: 0, s: 1 } },
};

const SPEEDS = { fast: 160, normal: 260, smooth: 380, slow: 540 };
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
const LIST_SELECTOR = '[data-list-item-id^="channels___"], [data-list-item-id^="members-"], [data-list-item-id^="private-channels"]';

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const SPRING_FALLBACK = "cubic-bezier(0.34, 1.35, 0.64, 1)";

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// native css spring easing generator
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

        this.onPointer = (e) => {
            this.pointer.x = e.clientX;
            this.pointer.y = e.clientY;
        };
        this.onClick = (e) => this.handleClick(e);
    }

    start() {
        try {
            if (CSS.supports("animation-timing-function", "linear(0, 1)")) {
                this.spring = springEasing();
            }
        } catch (err) {
            console.warn("[Glissade] linear() not supported, using bezier fallback");
        }

        this.api.DOM.addStyle(BASE_ID, this.buildBaseCss());
        this.applyStyle();

        this.lastPath = location.pathname;
        this.route = this.parsePath();

        window.addEventListener("pointermove", this.onPointer, { capture: true, passive: true });
        window.addEventListener("pointerdown", this.onPointer, { capture: true, passive: true });
        window.addEventListener("click", this.onClick, true);

        this.observer = new MutationObserver((m) => this.onMutations(m));
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;

        window.removeEventListener("pointermove", this.onPointer, { capture: true });
        window.removeEventListener("pointerdown", this.onPointer, { capture: true });
        window.removeEventListener("click", this.onClick, true);

        this.running.forEach((anim) => anim.cancel());
        this.running.clear();

        this.api.DOM.removeStyle(STYLE_ID);
        this.api.DOM.removeStyle(BASE_ID);
        document.documentElement.style.removeProperty("--gl-sx");
        document.documentElement.style.removeProperty("--gl-sy");
    }

    // --- Helpers ---

    get preset() { return PRESETS[this.settings.preset] ?? PRESETS.swipe; }
    get duration() { return SPEEDS[this.settings.speed] ?? SPEEDS.normal; }
    get factor() { return DISTANCES[this.settings.distance] ?? 1; }

    vector(dir, dist, preset) {
        const d = dir * dist * this.factor;
        return {
            x: preset.axis === "x" ? d : 0,
            y: preset.axis === "y" ? d : 0,
            s: preset.switchScale ?? 1,
        };
    }

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

    // --- Styles ---

    applyStyle() {
        this.api.DOM.removeStyle(STYLE_ID);
        if (this.settings.respectReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        this.api.DOM.addStyle(STYLE_ID, this.buildCss());
    }

    buildBaseCss() {
        return `
            [role="menu"], [role="tooltip"] { border-radius: 8px; }
            [role="dialog"][aria-modal="true"] { border-radius: 10px; overflow: hidden; }
            [class*="popout_"] { border-radius: 10px; }
            [class*="embedWrapper_"], [class*="messageAttachment_"],
            [class*="channelTextArea_"], [class*="searchBar_"], pre { border-radius: 8px; }
            [class*="lookFilled_"], [data-list-item-id^="channels___"],
            [data-list-item-id^="members-"], [data-list-item-id^="private-channels"] { border-radius: 6px; }
        `;
    }

    buildCss() {
        const { softBlur, overlays, sidebars, microInteractions, extras, settingsPages, customSelectors } = this.settings;
        const p = this.preset;
        const px = (n) => `${Math.round(n * this.factor)}px`;
        const blurLine = softBlur ? "filter: blur(var(--gl-blur));" : "";
        
        let css = `
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
            @keyframes gl-pop { from { opacity: 0; transform: scale(0.6); } }
            @keyframes gl-rise { from { opacity: 0; transform: translateY(8px); } }
        `;

        if (overlays) {
            const custom = String(customSelectors ?? "").replace(/[{};]/g, "").trim();
            const selectors = ['[role="menu"]', '[role="tooltip"]', '[class*="popout_"]'];
            if (custom) selectors.push(custom);

            css += `
                ${selectors.join(",\n")} {
                    --gl-x: 0px; --gl-y: 0px; --gl-scale: ${p.overlayScale};
                    animation: gl-move var(--gl-duration) var(--gl-spring) backwards;
                }
                [role="dialog"][aria-modal="true"] {
                    --gl-x: ${px(p.modal.x)}; --gl-y: ${px(p.modal.y)}; --gl-scale: ${p.modal.s};
                    animation: gl-move calc(var(--gl-duration) * 1.3) var(--gl-spring) backwards;
                }
            `;
        }

        if (sidebars) {
            css += `
                [data-list-item-id^="guildsnav___"] {
                    transition: transform var(--gl-duration) var(--gl-spring), border-radius var(--gl-duration) var(--gl-ease), background-color 0.15s ease-out;
                }
                [data-list-item-id^="guildsnav___"]:hover { transform: scale(1.08); }
                [data-list-item-id^="channels___"], [data-list-item-id^="members-"], [data-list-item-id^="private-channels"] {
                    transition: transform var(--gl-duration) var(--gl-ease), background-color 0.1s ease-out;
                }
                [data-list-item-id^="channels___"]:hover, [data-list-item-id^="members-"]:hover, [data-list-item-id^="private-channels"]:hover { 
                    transform: translateX(4px); 
                }
            `;
        }

        if (microInteractions) {
            css += `
                button:not(:disabled):active { transform: scale(0.96); }
                [class*="reaction_"] {
                    transition: transform var(--gl-duration) var(--gl-spring), background-color 0.1s ease-out, border-color 0.1s ease-out;
                }
                [class*="reaction_"]:hover { transform: translateY(-2px) scale(1.06); }
                img[class*="avatar_"] { transition: transform var(--gl-duration) var(--gl-spring); }
                img[class*="avatar_"]:hover { transform: scale(1.08); }
            `;
        }

        if (extras) {
            css += `
                [class*="numberBadge_"], [class*="lowerBadge_"], [class*="reaction_"] { 
                    animation: gl-pop calc(var(--gl-duration) * 1.1) var(--gl-spring) backwards; 
                }
                [class*="embedWrapper_"], [class*="messageAttachment_"] { 
                    animation: gl-rise calc(var(--gl-duration) * 1.2) var(--gl-ease) backwards; 
                }
                [class*="toolbar_"] [role="button"] {
                    transition: transform var(--gl-duration) var(--gl-spring), color 0.15s ease-out, background-color 0.15s ease-out;
                }
                [class*="toolbar_"] [role="button"]:hover { transform: scale(1.12); }
            `;
        }

        if (settingsPages) {
            css += `
                [class*="contentColumn_"] {
                    --gl-x: var(--gl-sx, 0px); --gl-y: var(--gl-sy, 0px); --gl-scale: 1;
                    animation: gl-move calc(var(--gl-duration) * 1.1) var(--gl-ease) backwards;
                }
            `;
        }

        return css;
    }

    // --- Routing ---

    parsePath() {
        const match = location.pathname.match(/^\/channels\/([^/]+)(?:\/([^/]+))?/);
        return match ? { guild: match[1], channel: match[2] ?? null } : { guild: null, channel: null };
    }

    switchDirection(prev, next) {
        const serverSwitch = prev.guild !== next.guild;
        if (!this.settings.smartDirection) return { dir: 1, serverSwitch };

        let from = null, to = null;

        if (serverSwitch) {
            const items = [...document.querySelectorAll('[data-list-item-id^="guildsnav___"]')].map((el) => el.getAttribute("data-list-item-id"));
            const indexOf = (guild) => {
                if (guild === "@me") return -1;
                const index = items.indexOf(`guildsnav___${guild}`);
                return index < 0 ? null : index;
            };
            from = indexOf(prev.guild);
            to = indexOf(next.guild);
        } else {
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
        const distance = this.preset.switchDist * (serverSwitch ? 1.5 : 1);

        requestAnimationFrame(() => {
            if (this.settings.channelSwitch) {
                const chat = document.querySelector('[class*="chatContent_"]');
                this.animateFrom(chat, this.vector(dir, distance, this.preset), {
                    duration: this.duration * 1.15,
                    easing: EASE_OUT,
                });
            }

            if (serverSwitch && this.settings.sidebars) {
                requestAnimationFrame(() => this.cascadeLists());
            }
        });
    }

    cascadeLists() {
        const { axis, overlayScale } = this.preset;
        const f = this.factor;
        const vec = {
            x: axis === "x" ? -14 * f : 0,
            y: axis === "y" ? 10 * f : 0,
            s: axis ? 1 : Math.max(overlayScale, 0.94),
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

    handleClick(e) {
        if (!this.settings.settingsPages) return;

        const tab = e.target?.closest?.('[role="tab"]');
        const list = tab?.closest?.('[role="tablist"]');
        if (!tab || !list) return;

        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
        const target = tabs.indexOf(tab);
        if (current < 0 || target < 0 || target === current) return;

        const dir = this.settings.smartDirection ? (target > current ? 1 : -1) : 1;
        const d = dir * this.preset.settingsDist * this.factor;
        
        const root = document.documentElement.style;
        root.setProperty("--gl-sx", this.preset.axis === "x" ? `${d}px` : "0px");
        root.setProperty("--gl-sy", this.preset.axis === "y" ? `${d}px` : "0px");
    }

    // --- DOM Observer ---

    onMutations(mutations) {
        this.checkRoute();
        let messages = null;

        for (const m of mutations) {
            if (m.addedNodes.length === 0) continue;

            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;

                if (this.settings.messages && typeof node.id === "string" && node.id.startsWith("chat-messages-")) {
                    (messages ??= []).push(node);
                    continue;
                }

                if (this.settings.overlays) {
                    const parent = node.parentElement;
                    if (parent && typeof parent.className === "string" && parent.className.includes("layerContainer")) {
                        this.enhanceLayer(node);
                    }
                }
            }
        }

        // skip history/bulk load or initial burst after switch
        if (messages && messages.length <= 2 && Date.now() - this.lastSwitch > 1200) {
            const m = this.preset.message;
            for (const node of messages) {
                this.animateFrom(node, { x: m.x * this.factor, y: m.y * this.factor, s: m.s }, {
                    duration: this.duration,
                    easing: this.preset.axis ? EASE_OUT : this.spring,
                    blur: true,
                });
            }
        }
    }

    enhanceLayer(layer) {
        const target = layer.matches(OVERLAY_SELECTOR) ? layer : layer.querySelector(OVERLAY_SELECTOR);
        if (!target) return;

        try {
            target.style.animation = "none";
            const rect = target.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
                const { x: px, y: py } = this.pointer;
                const ox = clamp(px - rect.left, 0, rect.width);
                const oy = clamp(py - rect.top, 0, rect.height);
                target.style.transformOrigin = `${ox}px ${oy}px`;

                const dx = px - (rect.left + rect.width / 2);
                const dy = py - (rect.top + rect.height / 2);
                const length = Math.hypot(dx, dy) || 1;
                const shift = this.preset.shift * this.factor;
                
                target.style.setProperty("--gl-x", `${(dx / length) * shift}px`);
                target.style.setProperty("--gl-y", `${(dy / length) * shift}px`);
            }

            void target.offsetWidth; 
            target.style.animation = "";
        } catch (err) {
            console.error("[Glissade] Error enhancing layer:", err);
            target.style.animation = "";
        }
    }

    // --- Settings UI ---

    getSettingsPanel() {
        return this.api.UI.buildSettingsPanel({
            settings: [
                {
                    type: "dropdown", id: "preset", name: "Animation style",
                    note: "Direction follows your navigation.",
                    value: this.settings.preset,
                    options: [
                        { label: "Swipe (horizontal)", value: "swipe" },
                        { label: "Slide (vertical)", value: "slide" },
                        { label: "Pop (zoom)", value: "pop" },
                        { label: "Fade (fade only)", value: "fade" },
                    ],
                },
                {
                    type: "dropdown", id: "speed", name: "Speed",
                    value: this.settings.speed,
                    options: [
                        { label: "Fast (160 ms)", value: "fast" },
                        { label: "Normal (260 ms)", value: "normal" },
                        { label: "Smooth (380 ms)", value: "smooth" },
                        { label: "Slow (540 ms)", value: "slow" },
                    ],
                },
                {
                    type: "dropdown", id: "distance", name: "Distance",
                    note: "Travel distance during animations.",
                    value: this.settings.distance,
                    options: [
                        { label: "Subtle", value: "subtle" },
                        { label: "Normal", value: "normal" },
                        { label: "Strong", value: "strong" },
                    ],
                },
                {
                    type: "switch", id: "smartDirection", name: "Smart direction",
                    note: "Content enters matching your list order. Off = fixed direction.",
                    value: this.settings.smartDirection,
                },
                {
                    type: "switch", id: "softBlur", name: "Soft blur on enter",
                    note: "Adds blur-to-sharp effect. Uses slightly more GPU.",
                    value: this.settings.softBlur,
                },
                { type: "switch", id: "messages", name: "New messages", value: this.settings.messages },
                { type: "switch", id: "channelSwitch", name: "Channel / server switch", value: this.settings.channelSwitch },
                { type: "switch", id: "overlays", name: "Menus & modals", value: this.settings.overlays },
                { type: "switch", id: "sidebars", name: "Sidebars (Hover & Cascades)", value: this.settings.sidebars },
                { type: "switch", id: "microInteractions", name: "Micro-interactions", value: this.settings.microInteractions },
                { type: "switch", id: "extras", name: "Extra animations (Badges/Embeds)", value: this.settings.extras },
                { type: "switch", id: "settingsPages", name: "Settings pages", value: this.settings.settingsPages },
                { type: "switch", id: "respectReducedMotion", name: "Respect OS reduced-motion", value: this.settings.respectReducedMotion },
                {
                    type: "text", id: "customSelectors", name: "Custom selectors (advanced)",
                    note: "Comma-separated CSS selectors to animate like menus.",
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
