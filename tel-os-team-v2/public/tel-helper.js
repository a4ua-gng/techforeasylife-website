import {helperDestinations, normaliseRequest, resolveHelperRequest} from './tel-helper-intents.js';

let root, launcher, owner, busy = false;
const hiddenFallback = new Map();
const preferenceKey = id => 'tel-os:helper-hidden:' + id;
function helperHidden(id) {
  if (!id) return true;
  if (hiddenFallback.has(id)) return hiddenFallback.get(id);
  try { return localStorage.getItem(preferenceKey(id)) === '1'; }
  catch { return hiddenFallback.get(id) === true; }
}
function clearHelper() { root?.remove(); launcher?.remove(); root = null; launcher = null; }
function setHelperEnabled(enabled) {
  if (!user?.id) return;
  hiddenFallback.set(user.id, !enabled);
  try { localStorage.setItem(preferenceKey(user.id), enabled ? '0' : '1'); } catch {}
  if (!enabled) { clearHelper(); document.querySelector('.top-actions .help-link')?.focus(); }
  mount();
}
const botIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3m-2-3h4M5 8h14v12H5zM2 12v4m20-4v4M9 12h.01M15 12h.01M9 16h6"/></svg>';
const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
const targets = () => helperDestinations({role: user?.role, department: user?.department, channels});

function fitViewport() {
  if (!root || !launcher?.isConnected) return;
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const width = viewport?.width || window.innerWidth;
  const visualTop = viewport?.offsetTop || 0;
  const visualLeft = viewport?.offsetLeft || 0;
  const anchor = launcher.getBoundingClientRect();
  const panelWidth = Math.min(370, Math.max(0, width - 24));
  const top = height < 260 ? visualTop + 8 : Math.max(visualTop + 8, Math.min(anchor.bottom + 10, visualTop + height - 180));
  const left = Math.max(visualLeft + 12, Math.min(anchor.right - panelWidth, visualLeft + width - panelWidth - 12));
  root.style.setProperty('--tel-helper-left', `${left}px`);
  root.style.setProperty('--tel-helper-top', `${top}px`);
  root.style.setProperty('--tel-helper-width', `${panelWidth}px`);
  root.style.setProperty('--tel-helper-height', `${Math.max(88, visualTop + height - top - 12)}px`);
  if (!root.querySelector('.tel-helper-panel').hidden && document.activeElement === root.querySelector('input')) {
    requestAnimationFrame(() => {
      const panel = root?.querySelector('.tel-helper-panel'), input = root?.querySelector('input');
      if (!panel || panel.hidden || !input) return;
      const field = input.getBoundingClientRect();
      if (field.bottom > visualTop + height - 12) panel.scrollTop += field.bottom - (visualTop + height - 12);
      else if (field.top < top + 8) panel.scrollTop -= top + 8 - field.top;
    });
  }
}

function say(message) {
  if (root) root.querySelector('[data-helper-status]').textContent = message;
}

function setOpen(open, restoreFocus = false) {
  if (!root || !launcher) return;
  const panel = root.querySelector('.tel-helper-panel');
  if (open) document.querySelectorAll('#toasts .tel-helper-toast').forEach(item => item.remove());
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  fitViewport();
  if (open) root.querySelector('input').focus();
  else if (restoreFocus) launcher.focus();
}

function choices(items) {
  const region = root.querySelector('[data-helper-choices]');
  region.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tel-helper-choice';
    button.textContent = item.label;
    button.title = item.description;
    button.addEventListener('click', () => openTarget(item));
    region.append(button);
  }
}

function heartbeatTarget(query) {
  const all = records.monitor?.people || [];
  const text = normaliseRequest(query);
  const includesName = name => name && (` ${text} `).includes(` ${normaliseRequest(name)} `);
  if (/(^| )my( |$)/.test(text)) return {person: all.find(p => p.id === user.id), named: true};
  const named = people.filter(p => [p.username, p.name, p.full_name].some(includesName))
    .sort((a, b) => String(b.full_name || b.name).length - String(a.full_name || a.name).length)[0];
  if (named) return {person: all.find(p => p.id === named.id), named: true};
  return {person: all.filter(p => p.last_seen && Number.isFinite(Date.parse(p.last_seen)))
    .sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen))[0], named: false};
}

async function openTarget(target, focus, query = '') {
  if (busy || !root) return;
  const current = targets().find(item => item.route === target.route && item.available);
  if (!current) { say('Your access has changed. Choose an available section.'); return; }
  if (dialog.open) { say('Finish or close the open form first, then ask me again.'); return; }
  busy = true;
  const requester = user.id;
  const form = root.querySelector('form');
  form.setAttribute('aria-busy', 'true');
  root.querySelector('[type=submit]').disabled = true;
  say(`Opening ${current.label}…`);
  try {
    if (location.hash !== '#' + current.route) history.pushState(null, '', '#' + current.route);
    await navigate();
    if (!user || user.id !== requester || !root) return;
    if (route !== current.route || document.querySelector('.error-page')) throw new Error('This section could not be opened. Try again or use the menu.');
    let destination = document.querySelector('#main h1');
    let message = `Opened ${current.label}.`;
    if (focus === 'heartbeat') {
      const result = heartbeatTarget(query);
      const entry = result.person;
      const row = entry ? document.querySelector(`[data-heartbeat-user="${CSS.escape(entry.id)}"]`) : null;
      if (entry?.last_seen) {
        const stamp = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit'}).format(new Date(entry.last_seen));
        message = `${result.named ? '' : 'Latest recorded heartbeat: '}${entry.name} · ${stamp} IST.`;
      } else message = result.named ? `No heartbeat has been recorded for ${entry?.name || 'this member'} yet.` : 'No team heartbeat has been recorded yet.';
      row?.classList.add('tel-helper-highlight');
      const section = document.querySelector('#team-presence');
      if (section) {
        const summary = document.createElement('p');
        summary.id = 'tel-helper-heartbeat';
        summary.className = 'tel-helper-heartbeat-summary';
        summary.textContent = message;
        section.querySelector('.panel-header').insertAdjacentElement('afterend', summary);
        destination = summary;
      }
    }
    setOpen(false);
    say(message);
    if (destination) {
      destination.tabIndex = -1;
      destination.focus({preventScroll: true});
      destination.scrollIntoView({block: 'center', behavior: 'auto'});
      if (focus === 'heartbeat') {
        destination.classList.add('tel-helper-highlight');
        setTimeout(() => destination.classList.remove('tel-helper-highlight'), 8000);
      }
    }
    document.querySelectorAll('#toasts .tel-helper-toast').forEach(item => item.remove());
    toast(message);
    document.querySelector('#toasts')?.lastElementChild?.classList.add('tel-helper-toast');
  } catch (error) { say(error.message || 'Please try again.'); }
  finally {
    busy = false;
    if (root && owner === requester) {
      root.querySelector('form').removeAttribute('aria-busy');
      root.querySelector('[type=submit]').disabled = false;
    }
  }
}

function ensurePreference() {
  const main = document.querySelector('.workspace #main');
  if (route !== 'account' || !main?.querySelector('h1') || main.querySelector('.loading-message')) return;
  let preference = main.querySelector('#tel-helper-preference');
  if (!preference) {
    preference = document.createElement('section');
    preference.id = 'tel-helper-preference';
    preference.className = 'panel panel-pad tel-helper-preference';
    preference.innerHTML = '<h2>Ask TEL helper</h2><p>Optional shortcuts to find your way around the workspace.</p><label class="checkline"><input id="tel-helper-enabled" type="checkbox">Show Ask TEL in the header</label><p class="hint">This setting applies to your account in this browser. You can change it here anytime.</p><p class="small muted" data-helper-preference-status role="status"></p>';
    preference.querySelector('input').addEventListener('change', event => setHelperEnabled(event.target.checked));
    main.append(preference);
  }
  const enabled = !helperHidden(user.id);
  preference.querySelector('input').checked = enabled;
  const message = enabled ? 'Ask TEL is available in the header.' : 'Ask TEL is hidden.';
  const status = preference.querySelector('[data-helper-preference-status]');
  if (status.textContent !== message) status.textContent = message;
}

function ensureLauncher() {
  const actions = document.querySelector('.top-actions');
  if (!actions) return;
  if (launcher?.isConnected && actions.contains(launcher)) return;
  launcher?.remove();
  launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'tel-helper-launcher';
  launcher.setAttribute('aria-label', 'Open TEL helper');
  launcher.setAttribute('aria-expanded', String(root ? !root.querySelector('.tel-helper-panel').hidden : false));
  launcher.setAttribute('aria-controls', 'tel-helper-panel');
  launcher.innerHTML = botIcon + '<span>Ask TEL</span>';
  launcher.addEventListener('click', () => setOpen(root.querySelector('.tel-helper-panel').hidden));
  actions.prepend(launcher);
}

function mount() {
  if (!user || user.must_change_password || !document.querySelector('.workspace')) {
    clearHelper(); owner = null; return;
  }
  if (owner !== user.id) { clearHelper(); owner = user.id; busy = false; }
  ensurePreference();
  if (helperHidden(user.id)) { clearHelper(); return; }
  ensureLauncher();
  if (root) { fitViewport(); return; }
  root = document.createElement('aside');
  root.className = 'tel-helper';
  root.setAttribute('aria-label', 'TEL navigation helper');
  root.innerHTML = `<section id="tel-helper-panel" class="tel-helper-panel" role="dialog" aria-labelledby="tel-helper-title" hidden>
    <header class="tel-helper-head"><div class="tel-helper-heading">${botIcon}<div><h2 id="tel-helper-title">Ask TEL</h2><p>Your workspace shortcut</p></div></div><button class="tel-helper-close" type="button" aria-label="Close TEL helper">${closeIcon}</button></header>
    <div class="tel-helper-body"><p class="tel-helper-intro">Tell me what you want to open. I’ll take you there.</p><p class="tel-helper-example"></p><div class="tel-helper-choices" data-helper-choices aria-label="Suggested sections"></div>
    <form><label for="tel-helper-request">What would you like to open?</label><div class="tel-helper-input-row"><input id="tel-helper-request" name="request" type="text" maxlength="240" autocomplete="off" required><button type="submit" aria-label="Open requested TEL OS section">Go <span aria-hidden="true">→</span></button></div></form>
    <p class="tel-helper-status" data-helper-status role="status" aria-live="polite" aria-atomic="true"></p><p class="tel-helper-privacy">Opens sections you can access. Your request stays in this browser.</p><div class="tel-helper-settings"><button class="tel-helper-hide" type="button">Hide Ask TEL</button><p>Restore it anytime in <a href="#account">My account</a>.</p></div></div>
    </section>`;
  document.body.append(root);
  fitViewport();
  const founder = user.role === 'founder';
  root.querySelector('input').placeholder = founder ? 'e.g. Last heartbeat' : 'e.g. Open attendance';
  root.querySelector('.tel-helper-example').textContent = founder ? 'Try “last heartbeat”, “email setup” or “HR tickets”.' : 'Try “my tasks”, “clock in” or “email setup”.';
  choices(targets().filter(item => item.available && (founder ? ['monitor', 'tasks', 'grievances', 'connections'] : ['tasks', 'attendance', 'grievances', 'connections']).includes(item.route)));
  root.querySelector('.tel-helper-close').addEventListener('click', () => setOpen(false, true));
  root.querySelector('.tel-helper-hide').addEventListener('click', () => {
    setHelperEnabled(false);
    toast('Ask TEL hidden. Restore it in My account.');
  });
  root.querySelector('.tel-helper-settings a').addEventListener('click', () => setOpen(false));
  root.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const query = root.querySelector('input').value.trim();
    const result = resolveHelperRequest(query, targets());
    if (result.type === 'open') { openTarget(result.target, result.focus, query); return; }
    say(result.type === 'choose' ? 'Which section did you mean?' : result.type === 'unknown' ? 'I couldn’t match that request. Try one of these sections or use a name from the menu.' : result.message || 'Enter the section you want to open.');
    if (result.choices?.length) choices(result.choices);
  });
}

new MutationObserver(mount).observe(document.getElementById('app'), {childList: true, subtree: true});
new MutationObserver(() => { if (dialog.open) setOpen(false); }).observe(dialog, {attributes: true, attributeFilter: ['open']});
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport);
window.addEventListener('scroll', fitViewport, {passive: true});
window.addEventListener('storage', event => { if (user && event.key === preferenceKey(user.id)) { hiddenFallback.delete(user.id); mount(); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && root && !root.querySelector('.tel-helper-panel').hidden && !dialog.open) {
    event.preventDefault(); setOpen(false, true);
  }
});
document.addEventListener('pointerdown', event => {
  if (root && !root.contains(event.target) && !launcher?.contains(event.target)) setOpen(false);
});
mount();
