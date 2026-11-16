'use strict';

// Announcements stay inside TEL OS. Only explicit close actions save a dismissal.
let announcementsPage;
(() => {
  const previousShell = shell, previousHome = homePage, previousHR = hrPage;
  const previousBind = bindPage, previousAction = handleAction, previousLogin = renderLogin;
  let owner = null, feed = [], management = false, managementItems = [], audiences = [];
  let loading = null, popup = null, popupBusy = false, retryTimer = null;
  const displayAudience = value => value === 'Marketing' ? 'TeMark' : value;
  const eligible = () => user && !user.must_change_password && ['active', 'on_leave'].includes(user.status);
  const verified = () => eligible() && typeof verifiedEmailConnection === 'function' && !!verifiedEmailConnection(records.connections || {});
  const expired = item => !!item.expires_at && Date.parse(item.expires_at) <= Date.now();
  const pending = () => feed.filter(item => !item.dismissed && !expired(item) && item.status === 'published');

  function clearPopup() { popup?.remove(); popup = null; }
  function checkOwner() {
    if (owner === user?.id) return;
    owner = user?.id || null; feed = []; managementItems = []; audiences = []; management = false; loading = null;
    clearPopup();
  }
  async function loadFeed() {
    checkOwner();
    if (!eligible()) return [];
    if (loading) return loading;
    const requestedBy = user.id;
    const request = api('/api/announcements').then(data => {
      if (user?.id !== requestedBy) return [];
      feed = data.announcements || []; audiences = data.audiences || [];
      updateBadges();
      const board = document.querySelector('[data-announcements-home]');
      if (board && !board.contains(document.activeElement)) board.outerHTML = boardHTML();
      return feed;
    });
    loading = request;
    try { return await request; } finally { if (loading === request) loading = null; }
  }
  function updateBadges() {
    const count = pending().length;
    for (const link of document.querySelectorAll('[data-announcements-nav]')) {
      let badge = link.querySelector('.count');
      if (count && !badge) { badge = document.createElement('span'); badge.className = 'count'; link.append(badge); }
      if (badge) { badge.textContent = count; if (!count) badge.remove(); }
      link.setAttribute('aria-label', count ? `Announcements, ${count} new` : 'Announcements');
    }
  }
  function metadata(item) {
    return `<div class="announcement-meta"><span class="badge">${esc(displayAudience(item.audience))}</span><span>By ${esc(item.creator_name || 'TEL team')} · ${esc(datetime(item.published_at || item.created_at))} IST</span>${item.revision > 1 ? `<span>Updated ${esc(datetime(item.updated_at))} IST · revision ${esc(item.revision)}</span>` : ''}</div>`;
  }
  function card(item, manage = false) {
    const status = item.status === 'published' && expired(item) ? 'Expired' : human(item.status);
    return `<article class="announcement-card" data-announcement-id="${esc(item.id)}"><div class="announcement-card-heading"><h2>${esc(item.title)}</h2>${manage || expired(item) ? `<span class="badge">${esc(status)}</span>` : ''}</div>${metadata(item)}<div class="announcement-body">${esc(item.body)}</div>${item.expires_at ? `<p class="hint">${expired(item) ? 'Expired' : 'Expires'} ${esc(datetime(item.expires_at))} IST</p>` : ''}${manage ? `<div class="btn-row">${button('Edit', 'announcement-edit', '', `data-id="${esc(item.id)}"`)}${item.status !== 'archived' ? button('Archive', 'announcement-archive', '', `data-id="${esc(item.id)}"`) : ''}</div>` : item.dismissed ? '<p class="announcement-dismissed">Popup dismissed for this revision. You can read the update here anytime.</p>' : ''}</article>`;
  }
  function boardHTML(error = false) {
    const preview = feed.filter(item => !expired(item)).slice(0, 3);
    return `<section class="panel announcement-home-board" data-announcements-home aria-labelledby="announcement-home-title"><div class="panel-header"><div><span class="eyebrow">FROM YOUR TEAM</span><h2 id="announcement-home-title">Announcements</h2></div><a class="link-btn" href="#announcements">View all ${icon('arrow')}</a></div>${error ? '<p class="announcement-empty">Announcements could not load. Open View all to try again.</p>' : preview.length ? `<ul class="announcement-preview-list">${preview.map(item => `<li><a href="#announcements"><span class="announcement-preview-top"><strong>${esc(item.title)}</strong>${!item.dismissed ? '<span class="badge">New</span>' : ''}</span><span class="announcement-preview-body">${esc(item.body.length > 220 ? item.body.slice(0, 220) + '…' : item.body)}</span><small>${esc(displayAudience(item.audience))} · ${esc(date(item.published_at, true))}</small></a></li>`).join('')}</ul>` : '<p class="announcement-empty">No current announcements. Team updates will appear here.</p>'}${isHR() ? '<div class="announcement-board-footer"><a class="link-btn" href="#announcements">Manage announcements '+icon('arrow')+'</a><span class="hint">Company updates and HR notices</span></div>' : ''}</section>`;
  }
  function hrShortcut() {
    return `<section class="panel panel-pad announcement-hr-shortcut"><div><h2>Keep the team informed.</h2><p>Publish company updates and HR notices. Manage drafts, published updates and archives in Announcements.</p></div><a class="btn" href="#announcements">Manage announcements ${icon('arrow')}</a></section>`;
  }
  announcementsPage = async function () {
    checkOwner(); clearPopup();
    const manage = management && isHR(), data = await api('/api/announcements?' + (manage ? 'manage=1' : 'history=1'));
    if (manage) managementItems = data.announcements || [];
    audiences = data.audiences || [];
    const items = data.announcements || [];
    return pageHeading('Announcements', 'Company updates and notices for your team, kept in one place.', isHR() ? button('New announcement', 'announcement-new', 'primary') : '', 'TEAM UPDATES') +
      `<section id="announcements-board" aria-label="Announcement history">${isHR() ? `<div class="announcement-view-switch" role="group" aria-label="Announcement view"><button class="btn ${!manage ? 'primary' : ''}" data-action="announcement-view" data-value="history" aria-pressed="${!manage}">For you & history</button><button class="btn ${manage ? 'primary' : ''}" data-action="announcement-view" data-value="manage" aria-pressed="${manage}">Manage announcements</button></div>` : ''}<p class="announcement-history-copy">${manage ? 'Drafts and archived notices are visible to authorised managers. Published changes appear again for recipients. ' + (isFounder() ? 'You can manage every department.' : 'HR can manage Company and HR audiences.') : 'Read published updates for your audience, including updates whose popup you dismissed and expired notices.'}</p><div class="announcement-list">${items.length ? items.map(item => card(item, manage)).join('') : empty(manage ? 'No announcements to manage' : 'No announcements yet', manage ? 'Create an announcement to share a company update or an HR notice.' : 'Published team updates will be kept here.', 'bell')}</div>${data.has_more ? '<p class="note">Showing the latest 200 announcements.</p>' : ''}</section>`;
  };
  homePage = async function () {
    const [html, data] = await Promise.all([previousHome(), loadFeed().catch(() => null)]);
    const template = document.createElement('template'); template.innerHTML = html;
    const intro = template.content.querySelector('.flexible-home-intro') || template.content.querySelector('.page-title');
    if (intro) intro.insertAdjacentHTML('afterend', boardHTML(data === null));
    return template.innerHTML;
  };
  hrPage = async function () {
    const html = await previousHR(); if (!isHR()) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    template.content.querySelector('.page-title')?.insertAdjacentHTML('afterend', hrShortcut());
    return template.innerHTML;
  };
  if (typeof hrRecordsPage === 'function') {
    const previousRecords = hrRecordsPage;
    hrRecordsPage = async function () {
      const html = await previousRecords(), template = document.createElement('template'); template.innerHTML = html;
      template.content.querySelector('.hr-control-intro')?.insertAdjacentHTML('afterend', hrShortcut());
      return template.innerHTML;
    };
  }
  shell = function () {
    checkOwner(); clearPopup(); previousShell();
    const nav = document.querySelector('.nav-scroll');
    if (nav) {
      const link = document.createElement('template'); link.innerHTML = navLink('announcements', 'Announcements', 'bell');
      link.content.firstElementChild.dataset.announcementsNav = '';
      const meetings = nav.querySelector('a[href="#meetings"]');
      if (meetings) meetings.after(link.content); else nav.append(link.content);
    }
    if (route === 'announcements') { const crumb = document.querySelector('.breadcrumb strong'); if (crumb) crumb.textContent = 'Announcements'; }
    updateBadges();
  };
  renderLogin = function () { clearPopup(); owner = null; feed = []; return previousLogin(); };

  function editing() {
    const element = document.activeElement;
    return element?.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
  }
  function focusedOutsidePopup() {
    const element = document.activeElement;
    return element && element !== document.body && element !== document.documentElement && !popup?.contains(element);
  }
  function safeToShow() {
    return verified() && !!document.querySelector('.workspace') && !document.hidden && !route.startsWith('channel/') && !['announcements', 'connections'].includes(route) && !route.startsWith('verify-email/') && !editing() && !focusedOutsidePopup() && !dialog.open;
  }
  function maybePopup() {
    checkOwner(); updateBadges();
    if (!safeToShow()) { if (!popupBusy) clearPopup(); return; }
    const item = pending()[0];
    if (!item) { clearPopup(); return; }
    if (popup?.dataset.announcementId === item.id && Number(popup.dataset.revision) === item.revision) return;
    clearPopup(); popup = document.createElement('aside');
    popup.className = 'announcement-popup'; popup.dataset.announcementId = item.id; popup.dataset.revision = item.revision;
    popup.setAttribute('role', 'region'); popup.setAttribute('aria-labelledby', 'announcement-popup-title');
    popup.innerHTML = `<div class="announcement-popup-heading"><span class="eyebrow">TEAM ANNOUNCEMENT${pending().length > 1 ? ' · ' + pending().length + ' NEW' : ''}</span><button class="icon-btn" type="button" data-action="announcement-dismiss" aria-label="Dismiss announcement: ${esc(item.title)}">${icon('close')}</button></div><h2 id="announcement-popup-title">${esc(item.title)}</h2>${metadata(item)}<div class="announcement-popup-body">${esc(item.body)}</div><p class="announcement-popup-error" role="alert"></p><div class="announcement-popup-footer"><a class="link-btn" href="#announcements">Read all announcements ${icon('arrow')}</a><span class="hint">Close to dismiss this revision.</span></div>`;
    document.body.append(popup);
    const status = document.createElement('span'); status.className = 'announcement-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); popup.append(status);
    requestAnimationFrame(() => { if (status.isConnected) status.textContent = `New team announcement: ${item.title}. Read it in Announcements.`; });
  }
  async function dismissPopup() {
    if (!popup || popupBusy || !verified()) return;
    const item = feed.find(row => row.id === popup.dataset.announcementId && row.revision === Number(popup.dataset.revision));
    if (!item) return;
    const currentPopup = popup, requestedBy = user.id;
    popupBusy = true; currentPopup.querySelector('button').disabled = true;
    currentPopup.querySelector('.announcement-popup-error').textContent = '';
    try {
      await api('/api/announcements/' + encodeURIComponent(item.id) + '/dismiss', 'POST', {revision: item.revision});
      if (user?.id !== requestedBy) return;
      item.dismissed = true; clearPopup(); updateBadges();
      const board = document.querySelector('[data-announcements-home]'); if (board) board.outerHTML = boardHTML();
    } catch (error) {
      if (currentPopup.isConnected) { currentPopup.querySelector('.announcement-popup-error').textContent = error.message + ' Your dismissal was not saved.'; currentPopup.querySelector('button').disabled = false; }
    } finally { popupBusy = false; if (!popup) setTimeout(maybePopup, 250); }
  }
  const localDateTime = value => {
    if (!value) return '';
    const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  function editor(item = null) {
    clearPopup();
    const choices = audiences.length ? audiences : isFounder() ? departments : ['Company', 'HR'];
    const expiry = localDateTime(item?.expires_at), ownerAtOpen = user.id;
    openDialog(item ? 'Edit announcement' : 'New announcement', `<p class="dialog-subtitle">${isFounder() ? 'Share an update with the company or a department.' : 'Share a company update or an HR notice.'} Published edits appear again for recipients.</p><form data-announcement-editor><div class="form-error" role="alert" tabindex="-1"></div><div class="field"><label for="announcement-title">Title</label><input id="announcement-title" name="title" maxlength="160" value="${esc(item?.title || '')}" required></div><div class="field"><label for="announcement-body">Announcement</label><textarea id="announcement-body" name="body" rows="7" maxlength="10000" required>${esc(item?.body || '')}</textarea><small>Plain text. Line breaks are kept.</small></div><div class="form-grid"><div class="field"><label for="announcement-audience">Audience</label><select id="announcement-audience" name="audience">${choices.map(value => `<option value="${esc(value)}" ${value === (item?.audience || 'Company') ? 'selected' : ''}>${esc(displayAudience(value))}</option>`).join('')}</select></div><div class="field"><label for="announcement-status">Status</label><select id="announcement-status" name="status">${(item ? ['draft', 'published', 'archived'] : ['draft', 'published']).map(value => `<option value="${value}" ${value === (item?.status || 'draft') ? 'selected' : ''}>${esc(human(value))}</option>`).join('')}</select></div><div class="field wide"><label for="announcement-expiry">Expiry (optional, your device time)</label><input id="announcement-expiry" name="expires_at" type="datetime-local" value="${esc(expiry)}"><small>After expiry, the popup stops and the published notice stays in history.</small></div></div><div class="form-actions">${button('Cancel', 'close-dialog')}<button class="btn primary" type="submit">${item?.status === 'published' ? 'Save published update' : 'Save draft'}</button></div></form>`);
    dialog.classList.add('announcement-editor-dialog');
    const form = document.querySelector('[data-announcement-editor]'), submit = form.querySelector('[type="submit"]');
    const submitCopy = () => form.elements.status.value === 'published' ? item ? 'Save published update' : 'Publish announcement' : form.elements.status.value === 'archived' ? 'Archive announcement' : 'Save draft';
    submit.textContent = submitCopy();
    form.elements.status.addEventListener('change', () => { submit.textContent = submitCopy(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled || !form.reportValidity()) return;
      const data = {title: form.elements.title.value.trim(), body: form.elements.body.value.trim(), audience: form.elements.audience.value, status: form.elements.status.value};
      if (item) data.revision = item.revision;
      if (!item || form.elements.expires_at.value !== expiry) data.expires_at = form.elements.expires_at.value ? new Date(form.elements.expires_at.value).toISOString() : null;
      submit.disabled = true; submit.textContent = 'Saving…';
      try {
        await api('/api/announcements' + (item ? '/' + encodeURIComponent(item.id) : ''), item ? 'PATCH' : 'POST', data);
        if (user?.id !== ownerAtOpen) return;
        dialog.close(); await loadFeed(); toast(data.status === 'published' ? 'Announcement published in TEL OS.' : data.status === 'archived' ? 'Announcement archived.' : 'Draft saved.');
        management = true; if (route === 'announcements') await navigate(); else location.hash = 'announcements';
      } catch (error) { formError(form, error.message); submit.disabled = false; submit.textContent = submitCopy(); }
    });
  }
  handleAction = async function (element) {
    const action = element.dataset.action;
    if (action === 'announcement-dismiss') { await dismissPopup(); return; }
    if (action === 'announcement-view') { management = element.dataset.value === 'manage'; await navigate(); return; }
    if (action === 'announcement-new') { if (isHR()) editor(); return; }
    if (action === 'announcement-edit' || action === 'announcement-archive') {
      if (!isHR()) return;
      const item = managementItems.find(row => row.id === element.dataset.id); if (!item) throw Error('Refresh Announcements before editing this notice.');
      if (action === 'announcement-edit') editor(item);
      else modalForm('Archive announcement?', `<p>Archive “${esc(item.title)}”? It will leave the team’s announcement feed and remain available to authorised managers.</p>`, () => api('/api/announcements/' + encodeURIComponent(item.id), 'PATCH', {revision: item.revision, status: 'archived'}), {submit: 'Archive announcement', after: async () => { await loadFeed(); await navigate(); toast('Announcement archived.'); }});
      return;
    }
    return previousAction(element);
  };
  bindPage = function () {
    previousBind();
    if (eligible()) loadFeed().then(maybePopup).catch(() => {});
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && popup && !dialog.open) { event.preventDefault(); dismissPopup(); } });
  document.addEventListener('focusin', () => { if (editing() || focusedOutsidePopup()) clearPopup(); });
  document.addEventListener('focusout', () => { clearTimeout(retryTimer); retryTimer = setTimeout(maybePopup, 200); });
  dialog.addEventListener('close', () => setTimeout(maybePopup, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPopup(); else if (eligible()) loadFeed().then(maybePopup).catch(() => {}); });
  setInterval(() => { if (eligible() && !document.hidden) loadFeed().then(maybePopup).catch(() => {}); }, 60000);
  window.refreshAnnouncements = async () => { await loadFeed(); maybePopup(); };
})();
