// The Contract owns menu content, actions and popover placement. This hatch
// adds the desktop menu keyboard model to the browser's popover dismissal.
export function installMenus(root) {
  const menu = root.querySelector('#studio-menu');
  if (!menu) return () => {};
  let origin = null, search = '', searchedAt = 0;
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')].filter(el => !el.disabled && el.checkVisibility());
  const focus = el => el?.focus({preventScroll:true});
  const remember = e => { if (e.target.closest?.('[contextpopover]')) origin = e.target.closest('button') || root.querySelector('#canvas-stage'); };
  const toggle = e => {
    search = '';
    if (e.newState === 'open') focus(items()[0]);
    else if (menu.contains(document.activeElement) || document.activeElement === document.body) focus(origin?.isConnected ? origin : root.querySelector('#canvas-stage'));
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
      e.preventDefault();e.stopPropagation();menu.hidePopover();focus(origin);
    } else if (e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key!==' ') {
      e.preventDefault();search=(performance.now()-searchedAt>600?'':search)+e.key.toLowerCase();searchedAt=performance.now();
      focus(all.find(el=>el.textContent.trim().toLowerCase().startsWith(search)));
    }
  };
  root.addEventListener('contextmenu',remember,true);menu.addEventListener('toggle',toggle);menu.addEventListener('keydown',key);
  return () => {root.removeEventListener('contextmenu',remember,true);menu.removeEventListener('toggle',toggle);menu.removeEventListener('keydown',key);};
}
