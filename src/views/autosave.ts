// Composer draft kept in the player's browser. Static script (no interpolation):
// the key comes from data attributes, which the JSX renderer escapes.
// - <form data-autosave="KEY">: restores saved values into empty fields, saves on input/change.
// - <element data-autosave-clear="KEY">: drops the draft (rendered after a successful send).
// Everything is wrapped in try/catch; the page works the same without it.

export const autosaveKey = (handle: string, questionId: string) => `jogo:composer:${handle}:${questionId}`;

export const AUTOSAVE_JS = `(function () {
  try {
    var store = window.localStorage;
    var clear = document.querySelector("[data-autosave-clear]");
    if (clear) store.removeItem(clear.getAttribute("data-autosave-clear"));
    var form = document.querySelector("form[data-autosave]");
    if (!form) return;
    var key = form.getAttribute("data-autosave");
    var saved = JSON.parse(store.getItem(key) || "{}");
    var fields = form.elements;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.name && f.value === "" && typeof saved[f.name] === "string") f.value = saved[f.name];
    }
    var save = function () {
      var out = {};
      for (var i = 0; i < fields.length; i++) if (fields[i].name) out[fields[i].name] = fields[i].value;
      try { store.setItem(key, JSON.stringify(out)); } catch (e) {}
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
  } catch (e) {}
})();`;
