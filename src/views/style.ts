// The whole stylesheet, served at /estilo.css. Retro 1994 desktop for the
// fiction; a plain modern card for the out-of-fiction (meta) pages.
export const CSS = `
:root {
  --desk: #7b7b7b; --face: #c0c0c0; --hi: #ffffff; --lo: #808080; --dark: #000000;
  --title: #000080; --title2: #1084d0; --paper: #fffef4; --ink: #111111; --alert: #a00000;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body.fiction {
  background: var(--desk); color: var(--ink); min-height: 100vh;
  font: 14px/1.4 "MS Sans Serif", "Geneva", "Tahoma", system-ui, sans-serif;
  padding: 16px;
}
.taskbar {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  background: var(--face); padding: 4px 8px; margin: -16px -16px 16px;
  border-bottom: 2px solid var(--dark); box-shadow: inset 0 1px 0 var(--hi);
}
.taskbar a { color: var(--ink); }
.window {
  background: var(--face); max-width: 760px; margin: 0 auto 16px;
  border: 2px solid; border-color: var(--hi) var(--dark) var(--dark) var(--hi);
  box-shadow: inset -1px -1px 0 var(--lo), inset 1px 1px 0 #dfdfdf;
}
.titlebar {
  background: linear-gradient(90deg, var(--title), var(--title2)); color: #fff;
  font-weight: bold; padding: 3px 6px; display: flex; justify-content: space-between;
}
.titlebar a { color: #fff; text-decoration: none; border: 1px outset #fff; background: var(--face); color: var(--ink); padding: 0 6px; }
.content { padding: 12px; overflow-wrap: anywhere; }
/* Windows on the left, the "Histórico" panel on the right; stacked below on narrow screens. */
.desk { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: start; }
.desk > .main { min-width: 0; }
.window.history { margin: 0; max-width: none; }
.history .content { padding: 8px; }
.history .src { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #303030; }
.history a[aria-current] { font-weight: bold; }
@media (max-width: 699px) { .desk { grid-template-columns: minmax(0, 1fr); } }
.paper {
  background: var(--paper); border: 2px inset var(--face); padding: 12px;
  font-family: "Courier New", Courier, monospace; white-space: pre-wrap;
}
.paper p, .paper blockquote, .paper table, .paper hr { margin: 0 0 1em; }
.paper > :last-child { margin-bottom: 0; }
.paper h1, .paper h2, .paper h3 { font-size: 1em; font-weight: bold; text-transform: uppercase; margin: 0 0 1em; }
.paper h1 { text-align: center; }
.paper blockquote { padding-left: 12px; border-left: 3px solid var(--lo); }
.paper hr { border: 0; border-top: 1px dashed var(--ink); }
.paper table { width: auto; max-width: 100%; background: transparent; display: block; overflow-x: auto; }
.paper th, .paper td { border: 1px solid var(--ink); padding: 2px 8px; white-space: pre-wrap; vertical-align: top; overflow-wrap: normal; }
.paper th { font-weight: bold; border-bottom-width: 2px; }
.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px; max-width: 760px; margin: 24px auto; }
.icon { text-align: center; color: #fff; text-decoration: none; padding: 8px; }
.icon .glyph {
  display: block; width: 48px; height: 48px; margin: 0 auto 6px; background: var(--face);
  border: 2px solid; border-color: var(--hi) var(--dark) var(--dark) var(--hi);
  font: bold 22px/44px "Courier New", monospace; color: var(--title);
}
.icon span.label { background: var(--desk); padding: 0 2px; }
.icon:focus span.label, .icon:hover span.label { background: var(--title); }
input, select, button { font: inherit; }
input[type=text], input[type=password], input[type=search], select {
  background: #fff; border: 2px inset var(--face); padding: 3px 4px; max-width: 100%;
}
button, .button {
  background: var(--face); border: 2px solid; border-color: var(--hi) var(--dark) var(--dark) var(--hi);
  padding: 3px 14px; cursor: pointer; color: var(--ink); text-decoration: none; display: inline-block;
}
button:active { border-color: var(--dark) var(--hi) var(--hi) var(--dark); }
table { border-collapse: collapse; width: 100%; background: #fff; }
th, td { text-align: left; padding: 3px 6px; border: 1px solid var(--lo); }
.error { color: var(--alert); font-weight: bold; font-family: "Courier New", monospace; }
.letter { margin: 0 0 1em; }
.letter summary { cursor: pointer; font-weight: bold; margin-bottom: 0.5em; }
.letter .paper { max-height: 40vh; overflow-y: auto; }
.notice { font-family: "Courier New", monospace; }
/* Waiting dots fill in one by one, like a slow modem; static for reduced motion. */
.dots span { animation: 2s steps(1, end) infinite; }
.dots span:nth-child(1) { animation-name: dot1; }
.dots span:nth-child(2) { animation-name: dot2; }
.dots span:nth-child(3) { animation-name: dot3; }
@keyframes dot1 { 0% { opacity: 0; } 25% { opacity: 1; } }
@keyframes dot2 { 0% { opacity: 0; } 50% { opacity: 1; } }
@keyframes dot3 { 0% { opacity: 0; } 75% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dots span { animation: none; } }
.req { color: var(--alert); font-weight: bold; }
.unread { font-weight: bold; }
fieldset { border: 2px groove var(--face); margin: 0 0 12px; }
.ask { margin: 0 0 8px; font-weight: bold; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
.row input, .row select { flex: 1; }
ul.plain { list-style: none; padding: 0; margin: 0; }
ul.plain li { padding: 4px 0; border-bottom: 1px dotted var(--lo); }

body.meta {
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #f4f4f5; color: #18181b;
  display: grid; place-items: center; min-height: 100vh; padding: 16px;
}
.card { background: #fff; border-radius: 12px; padding: 28px; width: 100%; max-width: 420px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.card h1 { font-size: 1.4rem; margin-top: 0; }
.card input[type=email] { width: 100%; padding: 10px; border: 1px solid #d4d4d8; border-radius: 8px; font: inherit; }
.card button { width: 100%; padding: 10px; border-radius: 8px; border: 0; background: #18181b; color: #fff; font: inherit; cursor: pointer; margin-top: 12px; }
.card button.secondary { background: #fff; color: #18181b; border: 1px solid #d4d4d8; }
.card .muted { color: #71717a; font-size: .9rem; }
.card .error { color: #b91c1c; font-family: inherit; }
`;
