'use strict';

// Presentation only: canonical departments, routes, records and permissions stay intact.
(() => {
  const previousWorkspace = departmentWorkspace;
  const previousHome = homePage;
  const previousShell = shell;
  const presentationLabel = value => String(value).replace(/\bMarketing\b/g, 'Team ARC').replace(/\bmarketing\b/g, 'Team ARC');

  function kind() {
    if (!user) return '';
    if (isFounder()) return 'founder';
    if (user.department === 'Marketing') return 'arc';
    if (user.department === 'HR') return 'hr';
    if (user.department === 'Finance') return 'finance';
    if (user.department === 'Strategy') return 'strategy';
    return 'team';
  }

  departmentWorkspace = function () {
    const workspace = previousWorkspace();
    const next = {...workspace, actions: workspace.actions.map(action => [...action])};
    if (workspace.key === 'leadership') {
      next.name = 'Founders';
      next.title = 'A clear view of the company.';
      next.copy = 'Stay close to every department. Review delivery, support your people, and give the next decision a clear owner.';
    } else if (workspace.key === 'marketing') {
      next.name = 'Team ARC';
      next.title = isLead() ? 'Good ideas. Clear briefs. Work delivered.' : 'Your ideas have a place to move forward.';
      next.copy = isLead()
        ? 'Give every brief an owner, make feedback useful, and help your team move from the first idea to the final delivery.'
        : 'Find your brief, make your next move, and share finished work with the people who help it grow.';
      next.actions = next.actions.map(([label, ...rest]) => [presentationLabel(label), ...rest]);
    } else if (workspace.key === 'hr') {
      next.name = 'HR';
      next.title = 'People first. The details, in place.';
      next.copy = isHR()
        ? 'A considered space to welcome teammates, keep records current, and move people reviews forward.'
        : 'Keep your people operations work connected, organised, and ready for the next teammate.';
    }
    return next;
  };

  homePage = async function () {
    const template = document.createElement('template');
    template.innerHTML = await previousHome();
    const root = template.content;
    const overview = root.querySelector('.department-intro');
    const title = root.querySelector('.page-title');
    const daily = root.querySelector('.daily-focus');
    const actions = root.querySelector('.department-quick-paths');
    const stats = root.querySelector('.stats');
    const work = root.querySelector('.grid-two');
    const guide = root.querySelector('.welcome-guide');
    if (!overview || !title || !daily || !actions || !stats || !work) return template.innerHTML;

    const workspaceKind = kind();
    const subtitle = title.querySelector('p');
    if (subtitle && workspaceKind === 'arc') subtitle.textContent = 'Your Team ARC workspace. A little clarity for everything you’re creating.';
    if (subtitle && workspaceKind === 'hr') subtitle.textContent = 'Your people operations workspace, with the next review in focus.';
    const existingTitleAction = title.querySelector(':scope > .btn');
    const titleActions = document.createElement('div');
    titleActions.className = 'workspace-title-actions';
    const workdayLink = document.createElement('a');
    // Avoid changing the hash router when jumping to a section on Home.
    workdayLink.href = '#home';
    workdayLink.className = 'btn workspace-workday-link';
    workdayLink.dataset.workspaceJump = 'workday';
    workdayLink.innerHTML = icon('clock') + 'Your workday';
    titleActions.append(workdayLink);
    if (existingTitleAction) titleActions.append(existingTitleAction);
    title.append(titleActions);

    overview.classList.add('workspace-hero');
    const eyebrow = overview.querySelector('.department-tag');
    if (eyebrow && workspaceKind === 'founder') eyebrow.innerHTML = icon('chart') + 'Founders · Company view';
    if (eyebrow && workspaceKind === 'arc') eyebrow.innerHTML = icon('task') + 'Team ARC · Creative workspace';
    if (eyebrow && workspaceKind === 'hr') eyebrow.innerHTML = icon('people') + 'HR · People operations';
    const role = overview.querySelector('.department-role');
    if (role) role.setAttribute('aria-label', 'Your role: ' + role.textContent);

    actions.setAttribute('aria-label', workspaceKind === 'founder' ? 'Company actions' : workspaceKind === 'arc' ? 'Team ARC actions' : workspaceKind === 'hr' ? 'People operations actions' : 'Workspace actions');
    stats.classList.add('workspace-metrics');
    stats.setAttribute('aria-label', workspaceKind === 'founder' ? 'Company overview' : 'Current work overview');
    daily.classList.add('workspace-workday');
    daily.id = 'workspace-workday';
    daily.setAttribute('tabindex', '-1');
    daily.setAttribute('aria-label', 'Your workday and clock-in schedule');

    // Keep source order aligned with the visible order and keyboard navigation.
    const primary = work.querySelector(':scope > .stack');
    const support = work.querySelector(':scope > .stack:last-child');
    const layout = document.createElement('div');
    layout.className = 'workspace-home-layout';
    if (primary) {
      primary.classList.add('workspace-primary');
      layout.append(primary);
    }
    const aside = document.createElement('aside');
    aside.className = 'stack workspace-personal';
    aside.setAttribute('aria-label', 'Your workday and team availability');
    aside.append(daily);
    if (support) aside.append(...support.children);
    if (guide) {
      guide.classList.add('workspace-guide');
      aside.append(guide);
    }
    layout.append(aside);
    work.remove();
    overview.after(actions);
    actions.after(stats);
    stats.after(layout);

    // Only known product labels change. User-authored task names and copy are untouched.
    for (const label of root.querySelectorAll('.department-work-panel .panel-header h2, .stat-head > span, .department-overview-card > h3, .department-work-panel .empty > .btn')) {
      label.textContent = presentationLabel(label.textContent);
    }
    return template.innerHTML;
  };

  function applyPresentation() {
    const workspaceKind = kind();
    if (workspaceKind) document.body.dataset.workspaceKind = workspaceKind;
    else delete document.body.dataset.workspaceKind;
    const main = document.getElementById('main');
    if (main) {
      main.classList.toggle('workspace-page', Boolean(user) && !route.startsWith('channel/'));
      main.classList.toggle('workspace-home', Boolean(user) && route === 'home');
    }
    if (!user) return;
    const name = document.querySelector('.workspace-name');
    const displayName = {founder: 'Founders workspace', arc: 'Team ARC', hr: 'People operations'}[workspaceKind] || (user.department || 'Team') + ' workspace';
    const displayCopy = {founder: 'Company clarity. Thoughtful decisions.', arc: 'Ideas, shaped together.', hr: 'Care for the people behind the work.'}[workspaceKind] || 'Ideas. Made real. Together.';
    const nameHeading = name?.querySelector('strong');
    const nameCopy = name?.querySelector('small');
    if (nameHeading && nameHeading.textContent !== displayName) nameHeading.textContent = displayName;
    if (nameCopy && nameCopy.textContent !== displayCopy) nameCopy.textContent = displayCopy;
    for (const link of document.querySelectorAll('.nav-scroll a[href="#marketing-reports"] > span:first-of-type, .nav-scroll a[href="#channel/marketing"] > span:first-of-type, .nav-scroll a[href="#channel/marketing-reports"] > span:first-of-type')) {
      const label = link.closest('a').getAttribute('href') === '#channel/marketing' ? 'Team ARC' : 'Team ARC reports';
      if (link.textContent !== label) link.textContent = label;
    }
    const crumb = document.querySelector('.breadcrumb strong');
    if (crumb && route === 'home' && crumb.textContent !== displayName) crumb.textContent = displayName;
    if (crumb && route === 'marketing-reports' && crumb.textContent !== 'Team ARC reports') crumb.textContent = 'Team ARC reports';
    for (const option of document.querySelectorAll('select[name="department"] option[value="Marketing"]')) {
      if (option.textContent !== 'Team ARC') option.textContent = 'Team ARC';
    }
    if (route === 'marketing-reports') {
      const heading = main?.querySelector('.page-title h1');
      if (heading && heading.textContent === 'Marketing reports') heading.textContent = 'Team ARC reports';
    }
  }

  shell = function () {
    previousShell();
    applyPresentation();
  };
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-workspace-jump="workday"]');
    if (!target) return;
    const workday = document.getElementById('workspace-workday');
    if (!workday) return;
    event.preventDefault();
    workday.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
    workday.focus({preventScroll: true});
  });
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; applyPresentation(); });
  }).observe(document.getElementById('app'), {childList: true, subtree: true});
  applyPresentation();
})();
