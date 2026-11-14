// Number fields: arrow-key steps, drag-to-adjust prefixes, and simple math.
// The Contract owns every value. This hatch edits a field's text and raises the
// field's own input and change events, so Exact runs the actions it already has.
//
// `data-nudge="commit"` fields apply a change after the keys go quiet, as one edit.
// `data-nudge="live"` fields (the canvas spacing editor) only update their text;
// Enter still applies them. `data-nudge="off"` fields keep their text as typed.

const NUMBER = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i;
const COMMIT_AFTER = 450;

/** A field's value as a number and its unit, or null when it is not one length or number. */
export function parseNumber(text) {
  const match = NUMBER.exec(String(text).trim());
  return match ? {value: Number(match[1]), unit: match[2]} : null;
}

/** Formats a stepped value, keeping at most two decimals. */
export function formatNumber(value, unit) {
  return `${Math.round(value * 100) / 100}${unit}`;
}

/** Evaluates `16*2`, `(24 - 8) / 2` or `12px + 4`, or returns null. Units must agree. */
export function evaluate(text) {
  const source = String(text).trim();
  if (!/[-+*/()]/.test(source.replace(/^-/, '')) || source.length > 64) return null;
  const tokens = source.match(/\d*\.?\d+[a-z%]*|[-+*/()]|\S/gi) ?? [];
  let unit = '', at = 0;
  for (const token of tokens) {
    const match = /^(\d*\.?\d+)([a-z%]*)$/i.exec(token);
    if (match) {
      if (match[2] && unit && match[2] !== unit) return null;
      unit ||= match[2];
    } else if (!'+-*/()'.includes(token)) return null;
  }
  const peek = () => tokens[at], take = () => tokens[at++];
  function primary() {
    const token = take();
    if (token === '-') return -primary();
    if (token === '(') { const n = sum(); if (take() !== ')') throw Error('paren'); return n; }
    const n = parseFloat(token);
    if (!Number.isFinite(n)) throw Error('number');
    return n;
  }
  function product() {
    let n = primary();
    while (peek() === '*' || peek() === '/') n = take() === '*' ? n * primary() : n / primary();
    return n;
  }
  function sum() {
    let n = product();
    while (peek() === '+' || peek() === '-') n = take() === '+' ? n + product() : n - product();
    return n;
  }
  try {
    const n = sum();
    return at === tokens.length && Number.isFinite(n) ? formatNumber(n, unit) : null;
  } catch { return null; }
}

/** The step for a key or drag: Shift is ten, Alt a tenth. */
const step = e => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

export function clampNumber(value, minimum) {
  const min = minimum === undefined || minimum === '' ? NaN : Number(minimum);
  return Number.isFinite(min) ? Math.max(min, value) : value;
}

export function installNumberFields(root) {
  const pending = new Map();
  let refocus = null, scrub = null, swallowClick = false;

  const write = (input, text) => {
    if (input.value === text) return false;
    input.value = text;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    return true;
  };
  const commit = input => {
    clearTimeout(pending.get(input));
    pending.delete(input);
    if (input.dataset.nudge !== 'commit' || !input.isConnected) return;
    // A commit disables the inspector until the draft updates; keep the caret in this field afterwards.
    if (document.activeElement === input && input.dataset.testid) refocus = {id: input.dataset.testid, until: performance.now() + 3000};
    input.dispatchEvent(new Event('change', {bubbles: true}));
  };
  const schedule = input => {
    clearTimeout(pending.get(input));
    pending.set(input, setTimeout(() => commit(input), COMMIT_AFTER));
  };
  const field = target => target?.closest?.('input[data-nudge="commit"],input[data-nudge="live"]');

  const keydown = e => {
    const input = field(e.target);
    if (!input || input.disabled || input.readOnly || e.isComposing || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const parsed = parseNumber(input.value);
      if (!parsed) return;
      e.preventDefault();
      const next = formatNumber(clampNumber(parsed.value + (e.key === 'ArrowUp' ? 1 : -1) * step(e), input.dataset.nudgeMin), parsed.unit);
      if (write(input, next) && input.dataset.nudge === 'commit') schedule(input);
    } else if (e.key === 'Enter') {
      // Runs before Exact's own key and submit handlers, so they read the result.
      const result = evaluate(input.value);
      if (result !== null) write(input, result);
      if (pending.has(input)) { e.preventDefault(); commit(input); }
    }
  };
  // Typing an expression and leaving the field applies its result.
  const change = e => {
    const input = field(e.target);
    if (!input) return;
    const result = evaluate(input.value);
    if (result !== null) input.value = result;
  };
  const focusout = e => {
    const input = field(e.target);
    if (input && pending.has(input)) commit(input);
  };
  // Put the caret back once the draft update re-enables the field.
  const observer = new MutationObserver(() => {
    if (!refocus) return;
    if (performance.now() > refocus.until) { refocus = null; return; }
    const input = root.querySelector(`input[data-testid="${CSS.escape(refocus.id)}"]`);
    const free = document.activeElement === document.body || document.activeElement === null;
    if (input && !input.disabled && free) { input.focus({preventScroll: true}); refocus = null; }
  });
  observer.observe(root, {subtree: true, attributes: true, attributeFilter: ['disabled'], childList: true});

  // Drag a field's prefix (X, W, a glyph) sideways to change its value.
  const pointerdown = e => {
    if (e.button !== 0) return;
    const handle = e.target.closest?.('[data-scrub],[data-scrub-spacing]');
    if (!handle || !root.contains(handle)) return;
    const spacing = handle.hasAttribute('data-scrub-spacing');
    const input = spacing ? null : handle.parentElement?.querySelector('input[data-nudge="commit"]');
    if (!spacing && (!input || input.disabled || input.readOnly)) return;
    const parsed = spacing ? parseNumber(handle.textContent) : parseNumber(input.value);
    if (!parsed) return;
    // Spacing labels stay buttons: a click without movement still opens the editor.
    if (!spacing) e.preventDefault();
    scrub = {handle, input, spacing, start: parsed, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId};
    // Keep the drag's events while the pointer crosses a live preview iframe, which would otherwise take them.
    try { handle.setPointerCapture(e.pointerId); } catch {}
  };
  const pointermove = e => {
    if (!scrub || e.pointerId !== scrub.id) return;
    // A release the studio never saw (outside the window, or over a preview after capture ended) ends the drag.
    if (e.buttons === 0) { cancel(); return; }
    const dx = e.clientX - scrub.x, dy = scrub.y - e.clientY;
    if (!scrub.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      scrub.moved = true;
      document.documentElement.style.cursor = 'ew-resize';
      if (scrub.spacing) {
        // Open the canvas editor at this label, then drive its text while dragging.
        scrub.handle.click();
        scrub.input = root.querySelector('#spacing-value');
        if (!scrub.input) { end(); return; }
      }
    }
    e.preventDefault();
    const delta = Math.round((scrub.spacing ? dx + dy : dx) / 2) * step(e);
    let value = scrub.start.value + delta;
    value = clampNumber(value, scrub.input.dataset.nudgeMin);
    write(scrub.input, formatNumber(value, scrub.start.unit));
  };
  function end() {
    document.documentElement.style.cursor = '';
    scrub = null;
  }
  const pointerup = e => {
    if (!scrub || e.pointerId !== scrub.id) return;
    const {moved, spacing, input} = scrub;
    end();
    if (!moved || !input?.isConnected) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; });
    if (spacing) input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', bubbles: true, cancelable: true}));
    else input.dispatchEvent(new Event('change', {bubbles: true}));
  };
  const click = e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const cancel = () => {
    if (scrub?.spacing && scrub.moved && scrub.input?.isConnected) {
      scrub.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true}));
    } else if (scrub?.moved && scrub.input?.isConnected) {
      // An abandoned drag stages nothing: put back the value it started from.
      write(scrub.input, formatNumber(scrub.start.value, scrub.start.unit));
    }
    end();
  };

  root.addEventListener('keydown', keydown, true);
  root.addEventListener('change', change, true);
  root.addEventListener('focusout', focusout, true);
  root.addEventListener('pointerdown', pointerdown, true);
  addEventListener('pointermove', pointermove, true);
  addEventListener('pointerup', pointerup, true);
  addEventListener('pointercancel', cancel, true);
  root.addEventListener('click', click, true);
  return () => {
    for (const timer of pending.values()) clearTimeout(timer);
    observer.disconnect();
    root.removeEventListener('keydown', keydown, true);
    root.removeEventListener('change', change, true);
    root.removeEventListener('focusout', focusout, true);
    root.removeEventListener('pointerdown', pointerdown, true);
    removeEventListener('pointermove', pointermove, true);
    removeEventListener('pointerup', pointerup, true);
    removeEventListener('pointercancel', cancel, true);
    root.removeEventListener('click', click, true);
  };
}
