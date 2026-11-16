'use strict';

(() => {
  const previousHome = homePage, previousFounderUpdates = founderUpdatesPage, previousAccount = accountPage, previousAction = handleAction;
  const shortcutPreferences = new Map();
  const shortcutKey = id => 'tel-os:hr-shortcut-hidden:' + id;
  function shortcutHidden() {
    if (!user) return false;
    if (shortcutPreferences.has(user.id)) return shortcutPreferences.get(user.id);
    try { return localStorage.getItem(shortcutKey(user.id)) === '1'; }
    catch { return shortcutPreferences.get(user.id) === true; }
  }
  function setShortcutHidden(hidden) {
    if (!user) return;
    shortcutPreferences.set(user.id, hidden);
    try { localStorage.setItem(shortcutKey(user.id), hidden ? '1' : '0'); } catch {}
  }

  function assignmentLine(task, review = false) {
    const due = task.deadline === today() ? 'Due today' : task.deadline ? 'Due ' + date(task.deadline) : 'Deadline to be agreed';
    const state = review ? 'Ready for your review' : ({review: 'With your reviewer', working: 'In progress', revision: 'Revision requested', approved: 'Approved'})[task.status] || 'To do';
    return `<li><button type="button" class="flexible-task-link" data-action="task-details" data-id="${esc(task.id)}"><span><strong>${esc(task.title)}</strong><small>${esc(due)}${review ? ' · ' + esc(task.assignee_name || nameOf(task.assignee_id)) : ''}</small></span><span class="flexible-task-state">${esc(state)}${icon('chevron')}</span></button></li>`;
  }

  homePage = async function () {
    const template = document.createElement('template');
    template.innerHTML = await previousHome();
    const root = template.content, timeline = root.querySelector('.flexible-timeline');
    const shortcut = root.querySelector('.flexible-hr-shortcut');
    if (shortcut && user) {
      if (shortcutHidden()) shortcut.remove();
      else shortcut.insertAdjacentHTML('beforeend', `<button type="button" class="icon-btn interface-hide-hr-shortcut" data-action="hide-home-hr-shortcut" aria-label="Hide HR shortcut on Home" title="Hide HR shortcut on Home">${icon('close')}</button>`);
    }
    if (!timeline || !user) return template.innerHTML;
    timeline.classList.add('interface-today-tasks');
    const title = timeline.querySelector('#flexible-today-title');
    if (title) title.textContent = 'Today’s tasks for you';
    const eyebrow = timeline.querySelector('.flexible-timeline-heading .eyebrow');
    if (eyebrow) eyebrow.textContent = 'YOUR DAILY PLAN';
    const intro = timeline.querySelector('.flexible-timeline-heading p');
    if (intro) intro.textContent = 'Your assignments, active time and upcoming meetings.';
    const content = timeline.querySelector('.flexible-timeline-step:nth-child(2) .flexible-timeline-content');
    if (!content) return template.innerHTML;

    const open = (records.tasks || []).filter(task => task.status !== 'done');
    const urgency = task => task.deadline === today() ? 0 : task.deadline && task.deadline < today() ? 1 : 2;
    const statusOrder = {working: 0, revision: 1, todo: 2, assigned: 2, review: 3, approved: 4};
    const own = open.filter(task => task.assignee_id === user.id).sort((a, b) => urgency(a) - urgency(b) || (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.title.localeCompare(b.title));
    const reviews = open.filter(task => task.assignee_id !== user.id && task.status === 'review' && (isFounder() || task.leader_id === user.id)).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    const dueToday = own.filter(task => task.deadline === today()).length;
    const summary = own.length ? `${dueToday ? `${dueToday} ${dueToday === 1 ? 'assignment' : 'assignments'} due today. ` : ''}${own.length} open ${own.length === 1 ? 'assignment' : 'assignments'} for you.` : 'No open assignments for you. Your next brief will appear here.';
    content.innerHTML = `<div class="flexible-step-heading"><h3 class="interface-task-heading">Your assignments</h3><a class="link-btn" href="#tasks">My tasks ${icon('arrow')}</a></div><p class="interface-task-summary">${esc(summary)}</p>${own.length ? `<ul class="flexible-task-list">${own.slice(0, 3).map(task => assignmentLine(task)).join('')}</ul>${own.length > 3 ? `<p class="flexible-more-copy">${own.length - 3} more in My tasks.</p>` : ''}` : ''}${reviews.length ? `<div class="interface-review-list"><h4>Waiting for your review · ${reviews.length}</h4><ul class="flexible-task-list">${reviews.slice(0, 2).map(task => assignmentLine(task, true)).join('')}</ul>${reviews.length > 2 ? '<p class="flexible-more-copy">Open My tasks for all reviews.</p>' : ''}</div>` : ''}`;

    // Personal deliverables are already in the daily plan. Keep departmental and
    // leadership panels whenever they include work belonging to someone else.
    const personalPanel = root.querySelector('.workspace-primary > .department-work-panel');
    const personalHeadings = new Set(['Your next marketing deliverables', 'Your next TeMark deliverables', 'Research & analysis deliverables', 'Finance responsibilities', 'Your task overview']);
    const heading = personalPanel?.querySelector('.panel-header h2')?.textContent.trim();
    if (personalHeadings.has(heading) && open.every(task => task.assignee_id === user.id)) personalPanel.remove();
    return template.innerHTML;
  };

  accountPage = async function () {
    return await previousAccount() + `<section class="panel panel-pad interface-home-preference" id="home-hr-shortcut-preference"><h2>Home HR shortcut</h2><p>Keep a quick way to contact HR on your Home page.</p><label class="checkline"><input id="home-hr-shortcut-enabled" type="checkbox" ${shortcutHidden() ? '' : 'checked'}>Show the HR shortcut on Home</label><p class="hint">This setting applies to your account in this browser. Contact HR remains available in the menu.</p><p class="small muted" data-hr-shortcut-status role="status"></p></section>`;
  };

  handleAction = async function (element) {
    if (element.dataset.action !== 'hide-home-hr-shortcut') return previousAction(element);
    if (!user || route !== 'home') return;
    setShortcutHidden(true);
    element.closest('.flexible-hr-shortcut')?.remove();
    const heading = $('#flexible-today-title');
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
    toast('HR shortcut hidden. Restore it in My account.');
  };

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== 'home-hr-shortcut-enabled' || route !== 'account' || !user) return;
    setShortcutHidden(!input.checked);
    const status = $('[data-hr-shortcut-status]');
    if (status) status.textContent = input.checked ? 'HR shortcut will appear on Home.' : 'HR shortcut is hidden on Home.';
  });

  founderUpdatesPage = async function () {
    const template = document.createElement('template');
    template.innerHTML = await previousFounderUpdates();
    const root = template.content, heading = root.querySelector('.page-title'), overview = root.querySelector('.founder-summary');
    heading?.classList.add('interface-founder-heading');
    overview?.classList.add('interface-founder-overview');
    const overviewHeading = overview?.querySelector('.panel-header');
    if (overviewHeading) {
      const actions = document.createElement('div');
      actions.className = 'interface-founder-actions';
      const copy = heading?.querySelector('[data-action="copy-founder-updates"]'), download = overviewHeading.querySelector('a');
      if (copy) actions.append(copy);
      if (download) actions.append(download);
      if (actions.children.length) overviewHeading.append(actions);
    }
    const feed = root.querySelector('.founder-text-update')?.parentElement;
    feed?.classList.add('interface-founder-feed');
    return template.innerHTML;
  };
})();
