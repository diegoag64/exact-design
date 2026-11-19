// The Contract owns menu content, actions and popover placement. This hatch
// adds the desktop menu keyboard model to the browser's popover dismissal:
// the canvas context menu and the project menu.
export function installMenus(root) {
  const removers = [installMenu(root, '#studio-menu', true), installMenu(root, '#project-menu', false)];
  return () => removers.forEach(remove => remove());
}
function installMenu(root, selector, contextual) {
  const menu = root.querySelector(selector);
  if (!menu) return () => {};
  let origin = null, search = '', searchedAt = 0;
  const items = () => [...menu.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')].filter(el => !el.disabled && el.checkVisibility());
  // Focus never scrolls the canvas; a long project list scrolls only itself to the focused row.
  const focus = el => { el?.focus({preventScroll:true}); if (!contextual && el && menu.contains(el)) el.scrollIntoView({block:'nearest',inline:'nearest'}); };
  const fallback = () => contextual ? root.querySelector('#canvas-stage') : null;
  // A context menu returns focus to what was right-clicked; a menu opened from a button returns it to that button.
  const remember = e => { if (e.target.closest?.('[contextpopover]')) origin = e.target.closest('button') || root.querySelector('#canvas-stage'); };
  const opener = e => { const button = e.target.closest?.(`[popovertarget="${menu.id}"]`); if (button) origin = button; };
  const toggle = e => {
    search = '';
    if (e.newState === 'open') focus(items().find(el => el.getAttribute('aria-checked') === 'true') ?? items()[0]);
    else if (menu.contains(document.activeElement) || document.activeElement === document.body) focus(origin?.isConnected ? origin : fallback());
  };
  const key = e => {
    const all=items(),i=all.indexOf(document.activeElement);
    if (!all.length) return;
    if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault();e.stopPropagation();
      focus(all[e.key==='Home'?0:e.key==='End'?all.length-1:(i+(e.key==='ArrowDown'?1:-1)+all.length)%all.length]);
    } else if (e.key==='Tab') {
      menu.hidePopover();
    } else if (e.key==='Escape') {
      e.preventDefault();e.stopPropagation();menu.hidePopover();focus(origin?.isConnected ? origin : fallback());
    } else if (e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key!==' ') {
      e.preventDefault();search=(performance.now()-searchedAt>600?'':search)+e.key.toLowerCase();searchedAt=performance.now();
      focus(all.find(el=>el.textContent.trim().toLowerCase().startsWith(search)));
    }
  };
  if (contextual) root.addEventListener('contextmenu',remember,true);
  else root.addEventListener('pointerdown',opener,true),root.addEventListener('keydown',opener,true);
  menu.addEventListener('toggle',toggle);menu.addEventListener('keydown',key);
  return () => {root.removeEventListener('contextmenu',remember,true);root.removeEventListener('pointerdown',opener,true);root.removeEventListener('keydown',opener,true);menu.removeEventListener('toggle',toggle);menu.removeEventListener('keydown',key);};
}
