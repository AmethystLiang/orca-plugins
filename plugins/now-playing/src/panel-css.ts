export const PANEL_CSS = `
:root, html.light {
  --sp-ok: #1a7f37; --sp-hover: rgba(0,0,0,0.05); --sp-chip: rgba(0,0,0,0.06); --sp-track: rgba(0,0,0,0.12);
  --sp-pop: #ffffff; --sp-pop-shadow: 0 8px 24px rgba(0,0,0,0.16); --sp-tint-alpha: 0.22;
}
html.dark {
  --sp-ok: #5fbf7f; --sp-hover: rgba(255,255,255,0.06); --sp-chip: rgba(255,255,255,0.08); --sp-track: rgba(255,255,255,0.14);
  --sp-pop: #2a2a2e; --sp-pop-shadow: 0 8px 24px rgba(0,0,0,0.5); --sp-tint-alpha: 0.38;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--orca-background, transparent); color: var(--orca-foreground, inherit); }
body { font: 13px/1.35 system-ui, -apple-system, sans-serif; overflow: hidden; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: left; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--orca-ring, var(--sp-ok)); outline-offset: 1px; border-radius: 4px; }
.app { display: flex; flex-direction: column; height: 100vh; position: relative; }
.m { color: var(--orca-muted-foreground, #8a8a8a); }
.sm { font-size: 11.5px; } .b { font-weight: 600; }
.clip { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
.ic { width: 16px; height: 16px; flex: none; display: inline-block; background: currentColor; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-size: contain; mask-size: contain; }
.player { padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 8px; background: linear-gradient(180deg, var(--tint, transparent), transparent 100%); transition: background .6s; }
.head { display: flex; gap: 10px; align-items: center; }
.bigcover { width: 100%; aspect-ratio: 1; border-radius: 6px; object-fit: cover; background: var(--sp-chip); display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }
.bigcover .ic { width: 40px; height: 40px; }
.titlerow { display: flex; gap: 8px; align-items: flex-start; margin-top: 2px; }
.title { font-size: 15px; font-weight: 600; }
.chiprow { display: flex; }
.chiprow .dev { margin-top: 0; }
.cover { width: 64px; height: 64px; border-radius: 4px; flex: none; object-fit: cover; background: var(--sp-chip); display: flex; align-items: center; justify-content: center; }
.meta { min-width: 0; flex: 1; }
.btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; flex: none; }
.btn:hover { background: var(--sp-hover); }
.btn.on { color: var(--sp-ok); }
.btn.dot { position: relative; }
.btn.dot::after { content: ''; position: absolute; bottom: 2px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--sp-ok); }
.btn.play { width: 34px; height: 34px; border-radius: 50%; background: var(--orca-foreground, #e6e6e6); color: var(--orca-background, #1c1c1f); }
.btn.play:hover { opacity: .9; background: var(--orca-foreground, #e6e6e6); }
.btn.play .ic { width: 14px; height: 14px; }
.ctrls { display: flex; align-items: center; justify-content: center; gap: 6px; position: relative; }
.devbtn { position: absolute; right: 0; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--sp-ok); }
button.devbtn:hover { background: var(--sp-hover); }
.chiprow .devbtn { position: static; }
.bar { height: 4px; border-radius: 2px; background: var(--sp-track); position: relative; cursor: pointer; }
.bar::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; }
.bar i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; background: var(--orca-foreground, #e6e6e6); }
.bar:hover i { background: var(--sp-ok); }
.times { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; margin-top: 3px; }
.times .elapsed, .times > span:last-child { min-width: 34px; }
.times > span:last-child { text-align: right; }
.where { display: flex; justify-content: center; min-width: 0; flex: 1; }
.where .dev { margin-top: 0; padding: 1px 6px; background: none; font-size: 10.5px; gap: 3px; }
.where button.dev:hover { background: color-mix(in srgb, var(--sp-ok) 12%, transparent); }
.where .dev .ic { width: 11px; height: 11px; }
.dev { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sp-ok); padding: 3px 7px; border-radius: 10px; background: color-mix(in srgb, var(--sp-ok) 16%, transparent); margin-top: 5px; max-width: 100%; }
.dev .ic { width: 12px; height: 12px; }
.tabs { display: flex; gap: 2px; background: var(--sp-chip); border-radius: 6px; padding: 2px; margin: 0 12px; }
.tabs button { flex: 1; text-align: center; padding: 4px 0; font-size: 11.5px; border-radius: 4px; color: var(--orca-muted-foreground, #8a8a8a); }
.tabs button.on { background: var(--sp-track); color: var(--orca-foreground, inherit); }
.searchbox { margin: 8px 12px 0; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; background: var(--sp-chip); }
.searchbox .clear { width: 20px; height: 20px; border-radius: 50%; }
.searchbox .clear .ic { width: 12px; height: 12px; }
.searchbox .clear[hidden] { display: none; }
.searchbox input { flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 12.5px; outline: none; }
.list { padding: 6px 12px 12px; display: flex; flex-direction: column; gap: 2px; flex: 1; min-height: 0; overflow-y: auto; }
.item { display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 5px; width: 100%; }
.item:hover { background: var(--sp-hover); }
.item .art { width: 32px; height: 32px; border-radius: 4px; flex: none; object-fit: cover; background: var(--sp-chip); }
.item .art.round { border-radius: 50%; }
.art.special { display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.art.special .ic { width: 15px; height: 15px; }
.art.liked { background: linear-gradient(135deg, #4c1d95, #a5b4fc); }
.art.special.playlist, .app[data-app="music"] .art.liked { background: linear-gradient(135deg, #fb5c74, #fa233b); }
.art.dj { background: linear-gradient(135deg, #1d4ed8, #22d3ee); }
.art.daylist { background: radial-gradient(circle at 50% 55%, #facc15, #60a5fa 75%); }
.more { margin: 2px 4px 4px; align-self: flex-start; }
.item .t { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.item .act { opacity: 0; } .item:hover .act, .item:focus-within .act { opacity: 1; }
.item.now .t > span:first-child { color: var(--sp-ok); }
.sec { font-size: 10.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--orca-muted-foreground, #8a8a8a); margin: 8px 2px 2px; }
.note { padding: 8px 4px; }
.pop { position: absolute; top: 112px; left: 84px; width: 230px; max-width: calc(100vw - 24px); background: var(--sp-pop); border-radius: 8px; box-shadow: var(--sp-pop-shadow); padding: 4px; z-index: 5; }
.pop .item { padding: 6px 8px; }
.pop .item.on { color: var(--sp-ok); }
.vol { display: flex; align-items: center; gap: 6px; padding: 8px 8px 4px; border-top: 1px solid var(--sp-chip); margin-top: 2px; }
.vol input { flex: 1; accent-color: var(--sp-ok); }
.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 24px; }
.cta { background: #1db954; color: #000; font-weight: 600; border-radius: 16px; padding: 8px 16px; }
.cta:hover { background: #1ed760; }
.steps { text-align: left; margin: 0; padding-left: 18px; max-width: 260px; display: flex; flex-direction: column; gap: 4px; }
.field { width: 100%; max-width: 260px; padding: 7px 8px; border-radius: 6px; border: 1px solid var(--sp-track); background: var(--sp-chip); color: inherit; font: inherit; font-size: 12px; }
.card { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; text-align: left; padding: 12px; border-radius: 8px; background: var(--sp-chip); margin-top: 8px; max-width: 280px; }
.center .card { align-items: center; text-align: center; margin-top: 16px; }
.cta.small { padding: 6px 12px; font-size: 12px; margin-top: 4px; }
.connect { gap: 4px; }
.connect .card { max-width: none; align-self: stretch; }
.connect .card.bottom { margin-top: auto; }
.app > .searchbox { margin-top: 2px; }
.toast { position: absolute; left: 12px; right: 12px; bottom: 10px; padding: 8px 10px; border-radius: 6px; background: var(--sp-pop); box-shadow: var(--sp-pop-shadow); font-size: 12px; z-index: 6; }
.foot { padding: 7px 12px 8px; display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--sp-track); font-size: 11px; }
.footrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.apiline { font-size: 11px; text-align: center; padding: 14px 0 4px; }
.apiline[hidden] { display: none; }
.appname { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 11px; }
.appdot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #1db954; }
.appdot.music { background: #fa2d48; }
.openbtn { position: absolute; left: 0; color: var(--sp-ok); }
.app[data-app="music"] .openbtn, .app[data-app="music"] .devbtn, .app[data-app="music"] .pop .item.on { color: #fa2d48; }
.app[data-app="music"] .vol input { accent-color: #fa2d48; }
.card.wide { max-width: none; align-self: stretch; margin: 8px 0 0; }
.center.choose { justify-content: flex-start; padding-top: 20px; gap: 6px; }
.choose .big { font-size: 16px; }
.choose .tiles { margin: 8px 0 4px; }
.tiles { display: flex; gap: 10px; align-self: stretch; }
.tile { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 10px 6px; border-radius: 10px; }
.tile:hover { background: var(--sp-hover); }
.tile .logo { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: #fff; background: #1db954; margin-bottom: 4px; }
.tile.music .logo { background: linear-gradient(135deg, #fb5c74, #fa233b); }
.tile .logo .ic { width: 22px; height: 22px; }
.link { font-size: 11px; color: var(--orca-muted-foreground, #8a8a8a); }
.link:hover { text-decoration: underline; }
`
