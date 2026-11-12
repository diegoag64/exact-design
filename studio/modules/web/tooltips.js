// The Contract writes each control's tooltip text as `data-tip`. This hatch only
// shows it: one popover in the top layer, positioned next to the hovered or
// keyboard-focused element. "Name (shortcut) · detail · detail" renders as a
// name with a shortcut chip, then one muted line per detail.
const SHOW_AFTER = 450, WARM_FOR = 400, GAP = 6, EDGE = 8;
const SHORTCUT = /^(.*?)\s*\(((?:[⌘⇧⌥⌃]*[A-Z0-9]|Esc|Space|[⌘⇧⌥⌃]+.))\)$/;

export function installTooltips(root) {
  const tip = document.createElement('div');
  tip.id = 'studio-tooltip';tip.setAttribute('role', 'tooltip');tip.popover = 'manual';
  const style = document.createElement('style');
  style.textContent = `#studio-tooltip{position:fixed;inset:auto;margin:0;max-width:240px;padding:6px 8px;border:1px solid #ffffff1f;border-radius:5px;background:#1e1e1e;color:#f5f5f5;font:12px/1.4 system-ui;box-shadow:0 4px 16px #00000040;pointer-events:none;overflow:visible}
#studio-tooltip .name{display:flex;align-items:center;gap:8px;font-weight:500}
#studio-tooltip kbd{font:11px/1.4 system-ui;color:#bfbfbf;padding:0 4px;border-radius:4px;background:#ffffff1a}
#studio-tooltip .detail{color:#a5a5a5;margin-top:2px}`;
  document.head.append(style);document.body.append(tip);
  let target = null, timer = 0, hiddenAt = -Infinity;

  const render = text => {
    const [name, ...details] = text.split(' · ');
    const match = name.match(SHORTCUT);
    const head = document.createElement('div');head.className = 'name';
    head.append(match ? match[1] : name);
    if (match) {const key = document.createElement('kbd');key.textContent = match[2];head.append(key);}
    tip.replaceChildren(head, ...details.map(line => {const el = document.createElement('div');el.className = 'detail';el.textContent = line;return el;}));
  };
  const place = () => {
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    // Prefer below; flip above when there is no room, as for the bottom toolbars.
    const below = r.bottom + GAP + t.height <= innerHeight - EDGE;
    const top = below ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - t.height);
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - t.width / 2), innerWidth - EDGE - t.width);
    tip.style.top = `${top}px`;tip.style.left = `${left}px`;
  };
  const show = () => {
    const text = target?.isConnected && target.dataset.tip;
    if (!text) return hide();
    render(text);
    if (!tip.matches(':popover-open')) tip.showPopover();
    place();
  };
  const hide = () => {
    clearTimeout(timer);
    if (tip.matches(':popover-open')) {tip.hidePopover();hiddenAt = performance.now();}
    target = null;
  };
  const enter = el => {
    if (el === target) return;
    clearTimeout(timer);target = el;
    // Moving between controls keeps tooltips warm, like native menus and toolbars.
    // Focus restoration can enter a control during a native popover operation.
    // Even a warm tooltip must wait until that operation has returned.
    const warm = tip.matches(':popover-open') || performance.now() - hiddenAt < WARM_FOR;
    timer = setTimeout(show, warm ? 0 : SHOW_AFTER);
  };
  const over = e => {
    const el = e.target.closest?.('[data-tip]');
    if (el && root.contains(el)) enter(el);
    else if (target) hide();
  };
  const focus = e => {
    const el = e.target.closest?.('[data-tip]');
    if (el && root.contains(el) && el.matches(':focus-visible')) enter(el);
  };
  const leave = e => {if (!e.relatedTarget) hide();};
  const dismiss = () => {if (target) hide();};
  const key = e => {if (e.key === 'Escape' && target) hide();};

  root.addEventListener('pointerover', over, true);
  root.addEventListener('focusin', focus, true);
  root.addEventListener('focusout', dismiss, true);
  document.addEventListener('pointerout', leave, true);
  for (const type of ['pointerdown', 'wheel', 'scroll']) addEventListener(type, dismiss, {capture: true, passive: true});
  addEventListener('keydown', key, true);addEventListener('blur', dismiss);
  return () => {
    hide();
    root.removeEventListener('pointerover', over, true);root.removeEventListener('focusin', focus, true);root.removeEventListener('focusout', dismiss, true);
    document.removeEventListener('pointerout', leave, true);
    for (const type of ['pointerdown', 'wheel', 'scroll']) removeEventListener(type, dismiss, {capture: true, passive: true});
    removeEventListener('keydown', key, true);removeEventListener('blur', dismiss);
    tip.remove();style.remove();
  };
}
