'use strict';
// Chat navigation and drafts stay scoped to the signed-in account.
(() => {
  const drafts = new Map(), cursors = new Map(), pending = new Set(), readPending = new Set();
  let activeThread = null, threadGeneration = 0, unreadVersion = 0;
  const ownerStorage = 'tel.chat.draft-owner';
  function fitChatViewport() {
    const view = document.querySelector('.channel-view');
    if (!view) return;
    const viewport = window.visualViewport;
    const visibleHeight = viewport?.height || innerHeight;
    const top = viewport?.offsetTop || 0;
    view.dataset.keyboard = String(visibleHeight < innerHeight - 140 && document.activeElement?.matches('#message-form textarea'));
    const available = top + visibleHeight - Math.max(top, view.getBoundingClientRect().top) - 16;
    view.style.height = Math.max(160, available) + 'px';
  }
  window.addEventListener('resize', fitChatViewport);
  window.visualViewport?.addEventListener('resize', fitChatViewport);
  window.visualViewport?.addEventListener('scroll', fitChatViewport);
  document.addEventListener('focusin', event => { if (event.target.matches('#message-form textarea')) requestAnimationFrame(fitChatViewport); });
  document.addEventListener('focusout', event => { if (event.target.matches('#message-form textarea')) requestAnimationFrame(fitChatViewport); });
  const keyFor = (channel, parent = '') => `tel.chat.draft:${user?.id || ''}:${channel}:${parent || 'main'}`;
  const draftGet = key => {
    try { return sessionStorage.getItem(key) ?? drafts.get(key) ?? ''; } catch { return drafts.get(key) || ''; }
  };
  const draftSet = (key, value) => {
    drafts.set(key, value);
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {}
  };
  function clearDraftOwner() {
    drafts.clear(); cursors.clear(); activeThread = null; threadGeneration++;
    try {
      const owner = sessionStorage.getItem(ownerStorage);
      if (owner) for (const key of Object.keys(sessionStorage)) if (key.startsWith(`tel.chat.draft:${owner}:`)) sessionStorage.removeItem(key);
      sessionStorage.removeItem(ownerStorage);
    } catch {}
  }
  function setDraftOwner() {
    if (!user) return;
    try { const old = sessionStorage.getItem(ownerStorage); if (old && old !== user.id) clearDraftOwner(); sessionStorage.setItem(ownerStorage, user.id); } catch {}
  }
  const loginBeforeChat = renderLogin;
  renderLogin = function() { clearDraftOwner(); return loginBeforeChat(); };

  function paintUnread() {
    for (const channel of channels) {
      const link = document.querySelector(`.nav-scroll a[href="#channel/${encodeURIComponent(channel.id)}"]`);
      if (!link) continue;
      const count = Math.max(0, Number(channel.unread_count) || 0);
      let dot = link.querySelector('.channel-unread-dot');
      if (count && !dot) { dot = document.createElement('span'); dot.className = 'channel-unread-dot'; dot.setAttribute('aria-hidden', 'true'); link.append(dot); }
      else if (!count) dot?.remove();
      link.dataset.unreadCount = String(count);
      link.setAttribute('aria-label', `#${channel.name}${count ? `, ${count} unread ${count === 1 ? 'message' : 'messages'}` : ''}`);
    }
  }
  async function refreshUnread() {
    if (!user || user.must_change_password || document.visibilityState !== 'visible') return;
    const actor = user.id, version = unreadVersion;
    const result = await api('/api/channels');
    if (user?.id !== actor || version !== unreadVersion) return;
    channels = result.channels || channels;
    paintUnread();
  }
  function canReadChannel(channel) {
    return user && document.visibilityState === 'visible' && document.hasFocus() && route === 'channel/' + channel && $('#message-feed') && (!dialog.open || !!$('#thread-form'));
  }
  async function markCurrentRead() {
    const channel = records.currentChannel?.id;
    if (!channel || !canReadChannel(channel)) return;
    const actor = user.id, key = `${actor}:${channel}`, cursor = cursors.get(key);
    if (!cursor || readPending.has(key)) return;
    readPending.add(key);
    try {
      const result = await api('/api/channels/' + encodeURIComponent(channel) + '/read', 'POST', {message_id: cursor});
      if (user?.id !== actor) return;
      unreadVersion++;
      const current = channels.find(item => item.id === channel);
      if (current) current.unread_count = result.unread_count;
      paintUnread();
      if (cursors.get(key) === cursor) cursors.delete(key);
    } finally {
      readPending.delete(key);
      if (user?.id === actor && cursors.has(key) && cursors.get(key) !== cursor) markCurrentRead().catch(() => {});
    }
  }
  function captureCursor(channel, messages) {
    if (user && messages?.length) cursors.set(`${user.id}:${channel}`, messages.at(-1).id);
  }
  const shellBeforeChat = shell;
  shell = function() { shellBeforeChat(); paintUnread(); };
  const pageBeforeChat = channelPage;
  channelPage = async function(channel) { const html = await pageBeforeChat(channel); captureCursor(channel, records.messages); return html; };
  const htmlBeforeChat = messageHTML;
  messageHTML = function(message, replies = 0) { return htmlBeforeChat(message, message.reply_count ?? replies); };
  const loadBeforeChat = loadChannelMessages;
  loadChannelMessages = async function(forceBottom = false) {
    const channel = records.currentChannel?.id;
    await loadBeforeChat(forceBottom);
    if (channel && records.currentChannel?.id === channel) {
      captureCursor(channel, records.messages);
      await markCurrentRead();
    }
  };
  const bindBeforeChat = bindPage;
  bindPage = function() {
    bindBeforeChat(); setDraftOwner(); paintUnread();
    requestAnimationFrame(fitChatViewport);
    const form = $('#message-form');
    if (form && records.currentChannel) {
      const channel = records.currentChannel.id, key = keyFor(channel);
      form.dataset.chatChannel = channel;
      form.elements.body.value = draftGet(key);
      form.elements.body.addEventListener('input', () => draftSet(key, form.elements.body.value));
      const hint = form.querySelector('.composer-footer small');
      if (hint) hint.textContent = 'Enter to send · Shift+Enter for a new line';
      captureCursor(channel, records.messages);
      markCurrentRead().catch(() => {});
    }
  };

  function threadMessagesHTML(data) {
    return messageHTML({...data.parent, parent_id: 'root'}) + `<div class="section-title" data-thread-count style="margin:18px 0">${data.total_replies} ${data.total_replies === 1 ? 'reply' : 'replies'}${data.total_replies > data.replies.length ? ' · latest ' + data.replies.length + ' shown' : ''}</div>` + data.replies.map(item => messageHTML(item)).join('');
  }
  function updateRootCount(parent, count) {
    const root = records.messages?.find(item => item.id === parent);
    if (root) root.reply_count = count;
    for (const button of document.querySelectorAll('#message-feed [data-action="open-thread"]')) if (button.dataset.id === parent) button.textContent = count ? `${count} ${count === 1 ? 'reply' : 'replies'}` : 'Reply in thread';
  }
  async function refreshThread() {
    const thread = activeThread;
    if (!thread || !dialog.open || !$('#thread-form') || document.visibilityState !== 'visible') return;
    const result = await api('/api/channels/' + encodeURIComponent(thread.channel) + '/threads/' + encodeURIComponent(thread.parent));
    if (activeThread !== thread || !$('#thread-form')) return;
    const list = $('[data-thread-messages]');
    if (list) list.innerHTML = threadMessagesHTML(result);
    updateRootCount(thread.parent, result.total_replies);
  }
  threadDialog = async function(parent) {
    const channel = records.currentChannel?.id;
    if (!channel || !user) return;
    const generation = ++threadGeneration, actor = user.id;
    openDialog('Thread', '<p role="status">Opening replies…</p>');
    activeThread = {channel, parent};
    try {
      const data = await api('/api/channels/' + encodeURIComponent(channel) + '/threads/' + encodeURIComponent(parent));
      if (!dialog.open || generation !== threadGeneration || user?.id !== actor) return;
      const key = keyFor(channel, parent);
      openDialog('Thread', `<div data-thread-messages>${threadMessagesHTML(data)}</div><form id="thread-form" class="composer" data-chat-channel="${esc(channel)}" data-chat-parent="${esc(parent)}"><div class="form-error" role="alert" tabindex="-1"></div><label class="small muted" for="thread-body">Reply to ${esc(data.parent.name || 'this message')}</label><textarea id="thread-body" name="body" maxlength="4000" required></textarea><div class="composer-footer"><span class="small muted">Enter to send · Shift+Enter for a new line</span><button class="btn primary" type="submit">Reply</button></div></form>`);
      const form = $('#thread-form'); form.elements.body.value = draftGet(key);
      form.elements.body.addEventListener('input', () => draftSet(key, form.elements.body.value));
      form.elements.body.focus(); updateRootCount(parent, data.total_replies);
    } catch (error) {
      if (dialog.open && generation === threadGeneration) openDialog('Thread', `<p class="form-error" role="alert">${esc(error.message)}</p><button class="btn" data-action="open-thread" data-id="${esc(parent)}">Try again</button>`);
    }
  };
  const actionBeforeChat = handleAction;
  handleAction = async function(element) {
    if (element.dataset.action === 'open-thread') return threadDialog(element.dataset.id);
    return actionBeforeChat(element);
  };
  dialog.addEventListener('close', () => { activeThread = null; threadGeneration++; });

  // Capture replaces the legacy submit listeners, preventing click/Enter races.
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('#message-form,#thread-form')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const channel = form.dataset.chatChannel || records.currentChannel?.id;
    const parent = form.dataset.chatParent || '', actor = user?.id;
    if (!actor || !channel) return;
    const key = keyFor(channel, parent), content = form.elements.body.value;
    if (pending.has(key) || !content.trim() || !form.reportValidity()) return;
    pending.add(key); const button = form.querySelector('[type="submit"]'); button.disabled = true;
    const error = form.querySelector('.form-error'); error.textContent = '';
    try {
      await api('/api/channels/' + encodeURIComponent(channel) + '/messages', 'POST', {body: content, ...(parent ? {parent_id: parent} : {})});
      if (user?.id !== actor) return;
      if (form.isConnected && form.elements.body.value === content) { form.elements.body.value = ''; draftSet(key, ''); }
      else if (draftGet(key) === content) draftSet(key, '');
      if (route === 'channel/' + channel && records.currentChannel?.id === channel) await loadChannelMessages(!parent);
      if (parent && activeThread?.channel === channel && activeThread.parent === parent && $('#thread-form')) await refreshThread();
      if (form.isConnected) form.elements.body.focus();
    } catch (err) { if (form.isConnected) formError(form, err.message); else toast(err.message, true); }
    finally { pending.delete(key); if (button.isConnected) button.disabled = false; }
  }, true);
  const composing = new WeakSet();
  document.addEventListener('compositionstart', event => { if (event.target.matches('#message-form textarea,#thread-form textarea')) composing.add(event.target); });
  document.addEventListener('compositionend', event => { composing.delete(event.target); });
  document.addEventListener('keydown', event => {
    const input = event.target;
    if (!input.matches('#message-form textarea,#thread-form textarea') || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229 || composing.has(input)) return;
    event.preventDefault();
    const button = input.form.querySelector('[type="submit"]');
    if (!event.repeat && !button.disabled) input.form.requestSubmit(button);
  }, true);
  const visible = () => { if (document.visibilityState === 'visible') { refreshUnread().catch(() => {}); markCurrentRead().catch(() => {}); refreshThread().catch(() => {}); } };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', visible);
  setInterval(() => { refreshUnread().catch(() => {}); refreshThread().catch(() => {}); }, 15000);
})();
