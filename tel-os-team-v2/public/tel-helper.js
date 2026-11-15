import {helperDestinations, normaliseRequest, resolveHelperRequest} from './tel-helper-intents.js';

let root, owner, lastMessage = '', busy = false;
const botIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3m-2-3h4M5 8h14v12H5zM2 12v4m20-4v4M9 12h.01M15 12h.01M9 16h6"/></svg>';
const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
const targets = () => helperDestinations({role: user?.role, department: user?.department, channels});

function fitViewport() {
  if (!root) return;
  const viewport = window.visualViewport;
  const open = !root.querySelector('.tel-helper-panel').hidden;
  const height = viewport?.height || window.innerHeight;
  const covered = open ? Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0)) : 0;
  root.style.setProperty('--tel-helper-viewport-height', `${height}px`);
  root.style.setProperty('--tel-helper-keyboard-inset', `${covered}px`);
}

function say(message) {
  lastMessage = message;
  if (root) root.querySelector('[data-helper-status]').textContent = message;
}

function setOpen(open, restoreFocus = false) {
  if (!root) return;
  const panel = root.querySelector('.tel-helper-panel');
  if (open) document.querySelectorAll('#toasts .tel-helper-toast').forEach(item => item.remove());
  panel.hidden = !open;
  root.querySelector('.tel-helper-launcher').setAttribute('aria-expanded', String(open));
  fitViewport();
  if (open) root.querySelector('input').focus();
  else if (restoreFocus) root.querySelector('.tel-helper-launcher').focus();
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

function mount() {
  if (!user || user.must_change_password || !document.querySelector('.workspace')) {
    root?.remove(); root = null; owner = null; lastMessage = ''; return;
  }
  if (root && owner === user.id) return;
  root?.remove();
  owner = user.id;
  lastMessage = '';
  busy = false;
  root = document.createElement('aside');
  root.className = 'tel-helper';
  root.setAttribute('aria-label', 'TEL navigation helper');
  root.innerHTML = `<section id="tel-helper-panel" class="tel-helper-panel" role="dialog" aria-labelledby="tel-helper-title" hidden>
    <header class="tel-helper-head"><div class="tel-helper-heading">${botIcon}<div><h2 id="tel-helper-title">Ask TEL</h2><p>Your workspace shortcut</p></div></div><button class="tel-helper-close" type="button" aria-label="Close TEL helper">${closeIcon}</button></header>
    <div class="tel-helper-body"><p class="tel-helper-intro">Tell me what you want to open. I’ll take you there.</p><p class="tel-helper-example"></p><div class="tel-helper-choices" data-helper-choices aria-label="Suggested sections"></div>
    <form><label for="tel-helper-request">What would you like to open?</label><div class="tel-helper-input-row"><input id="tel-helper-request" name="request" type="text" maxlength="240" autocomplete="off" required><button type="submit" aria-label="Open requested TEL OS section">Go <span aria-hidden="true">→</span></button></div></form>
    <p class="tel-helper-status" data-helper-status role="status" aria-live="polite" aria-atomic="true"></p><p class="tel-helper-privacy">Opens sections you can access. Your request stays in this browser.</p></div>
    </section><button class="tel-helper-launcher" type="button" aria-label="Open TEL helper" aria-expanded="false" aria-controls="tel-helper-panel">${botIcon}<span>Ask TEL</span></button>`;
  document.body.append(root);
  fitViewport();
  const founder = user.role === 'founder';
  root.querySelector('input').placeholder = founder ? 'e.g. Show the last heartbeat' : 'e.g. Open my attendance';
  root.querySelector('.tel-helper-example').textContent = founder ? 'Try “last heartbeat”, “email setup” or “HR tickets”.' : 'Try “my tasks”, “clock in” or “email setup”.';
  choices(targets().filter(item => item.available && (founder ? ['monitor', 'tasks', 'grievances', 'connections'] : ['tasks', 'attendance', 'grievances', 'connections']).includes(item.route)));
  root.querySelector('.tel-helper-launcher').addEventListener('click', () => setOpen(root.querySelector('.tel-helper-panel').hidden));
  root.querySelector('.tel-helper-close').addEventListener('click', () => setOpen(false, true));
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); } });
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

new MutationObserver(mount).observe(document.getElementById('app'), {childList: true});
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport);
document.addEventListener('pointerdown', event => { if (root && !root.contains(event.target)) setOpen(false); });
mount();
