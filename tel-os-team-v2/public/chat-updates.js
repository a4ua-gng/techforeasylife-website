'use strict';
// Chat state is scoped to the signed-in account and to each channel/thread.
(() => {
  const drafts = new Map(), attachments = new Map(), cursors = new Map(), pending = new Set(), readPending = new Set();
  let activeThread = null, threadGeneration = 0, unreadVersion = 0;
  const ownerStorage = 'tel.chat.draft-owner';
  const keyFor = (channel, parent = '') => `tel.chat.draft:${user?.id || ''}:${channel}:${parent || 'main'}`;
  const draftGet = key => {
    try { return sessionStorage.getItem(key) ?? drafts.get(key) ?? ''; } catch { return drafts.get(key) || ''; }
  };
  const draftSet = (key, value) => {
    drafts.set(key, value);
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch {}
  };
  const canPostChannel = channel => {
    const item = channels.find(value => value.id === channel);
    return !!user && !!item && (item.posting_policy !== 'announcements' || isFounder() || user.role === 'hr_lead');
  };
  function fitChatViewport() {
    const view = document.querySelector('.channel-view');
    if (!view) return;
    const viewport = window.visualViewport, visibleHeight = viewport?.height || innerHeight, top = viewport?.offsetTop || 0;
    const chatFocused = !!document.activeElement?.closest('#message-form,#thread-form');
    const keyboard = visibleHeight < innerHeight - 140 && (chatFocused || view.dataset.keyboard === 'true');
    view.dataset.keyboard = String(!!keyboard);
    view.style.setProperty('--chat-viewport-height', visibleHeight + 'px');
    view.style.setProperty('--chat-viewport-top', top + 'px');
    // Height follows the visual viewport, including iOS keyboard pan/resize.
    // A phone's keyboard view fills the visible area so notices above the
    // conversation cannot push a multiline/image composer behind the keyboard.
    const keyboardScreen = keyboard && matchMedia('(max-width: 760px)').matches;
    const available = keyboardScreen ? visibleHeight - 8 : top + visibleHeight - Math.max(top, view.getBoundingClientRect().top) - 8;
    view.style.height = Math.max(120, available) + 'px';
  }
  window.addEventListener('resize', fitChatViewport);
  window.visualViewport?.addEventListener('resize', fitChatViewport);
  window.visualViewport?.addEventListener('scroll', fitChatViewport);
  document.addEventListener('focusin', event => { if (event.target.matches('#message-form textarea,#thread-form textarea')) requestAnimationFrame(fitChatViewport); });
  document.addEventListener('focusout', event => { if (event.target.matches('#message-form textarea,#thread-form textarea')) requestAnimationFrame(fitChatViewport); });

  function closeThread(restoreFocus = true) {
    const parent = activeThread?.parent;
    activeThread = null; threadGeneration++;
    $('#thread-pane')?.remove();
    $('.channel-view')?.classList.remove('thread-open');
    $('.chat-main')?.removeAttribute('inert');
    if (restoreFocus && parent) {
      const button = [...document.querySelectorAll('#message-feed [data-action="open-thread"]')].find(item => item.dataset.id === parent);
      button?.focus({preventScroll: true});
      markCurrentRead().catch(() => {});
    }
    fitChatViewport();
  }
  function clearDraftOwner() {
    drafts.clear(); attachments.clear(); cursors.clear(); closeThread(false);
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
    const main = $('.chat-main');
    return user && document.visibilityState === 'visible' && document.hasFocus() && route === 'channel/' + channel && $('#message-feed') && !dialog.open && !main?.hasAttribute('inert');
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
  shell = function() { closeThread(false); shellBeforeChat(); paintUnread(); };
  const pageBeforeChat = channelPage;
  channelPage = async function(channel) {
    const html = await pageBeforeChat(channel);
    captureCursor(channel, records.messages);
    return html.replace('<div class="channel-view">', '<div class="channel-view"><section class="chat-main" aria-label="Channel conversation">').replace(/<\/div>$/, '</section></div>');
  };

  function messageDay(stamp) {
    const value = new Date(stamp);
    return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(value);
  }
  messageHTML = function(message, replies = 0) {
    const mine = message.user_id === user?.id, count = message.reply_count ?? replies;
    const name = message.name || nameOf(message.user_id);
    return `<article class="message${mine ? ' message-own' : ''}" data-message-id="${esc(message.id)}" data-author="${esc(message.user_id)}" data-created-at="${esc(message.created_at)}" data-day="${esc(messageDay(message.created_at))}">${avatar(person(message.user_id) || name)}<div class="message-body"><div class="message-meta"><strong>${esc(name)}</strong><time datetime="${esc(message.created_at)}" title="${esc(datetime(message.created_at))}">${esc(time(message.created_at))}</time></div><div class="message-content">${imageText(message.body)}</div>${!message.parent_id && canPostChannel(records.currentChannel?.id) ? `<button class="thread-btn" data-action="open-thread" data-id="${esc(message.id)}" aria-label="${count ? `${count} ${count === 1 ? 'reply' : 'replies'}` : 'Reply in thread'} to ${esc(name)}">${icon('people')}<span>${count ? `${count} ${count === 1 ? 'reply' : 'replies'}` : 'Reply in thread'}</span>${icon('chevron')}</button>` : ''}</div></article>`;
  };
  function decorateMessages(feed) {
    if (!feed) return;
    feed.querySelectorAll('.chat-day-separator').forEach(item => item.remove());
    let previous;
    for (const item of feed.querySelectorAll(':scope > .message')) {
      const grouped = previous && previous.dataset.author === item.dataset.author && previous.dataset.day === item.dataset.day && Math.abs(new Date(item.dataset.createdAt) - new Date(previous.dataset.createdAt)) < 300000;
      item.classList.toggle('message-grouped', !!grouped);
      if (!previous || previous.dataset.day !== item.dataset.day) {
        const divider = document.createElement('div'); divider.className = 'chat-day-separator';
        divider.textContent = item.dataset.day === messageDay(new Date().toISOString()) ? 'Today' : date(item.dataset.createdAt, true);
        item.before(divider);
      }
      previous = item;
    }
  }
  const loadBeforeChat = loadChannelMessages;
  loadChannelMessages = async function(forceBottom = false) {
    const channel = records.currentChannel?.id;
    await loadBeforeChat(forceBottom);
    if (channel && records.currentChannel?.id === channel) {
      const feed = $('#message-feed'), atBottom = feed && feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
      decorateMessages(feed);
      if (feed && (forceBottom || atBottom)) feed.scrollTop = feed.scrollHeight;
      captureCursor(channel, records.messages);
      await markCurrentRead();
    }
  };

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(116, Math.max(44, input.scrollHeight)) + 'px';
    input.style.overflowY = input.scrollHeight > 116 ? 'auto' : 'hidden';
  }
  function formKey(form) { return keyFor(form.dataset.chatChannel, form.dataset.chatParent); }
  function paintAttachment(form) {
    if (!form?.isConnected) return;
    const entry = attachments.get(formKey(form)), host = form.querySelector('.chat-attachment-preview');
    host.hidden = !entry;
    host.innerHTML = entry ? `${entry.preview ? `<img src="${entry.preview}" alt="Selected image preview">` : '<span class="small muted">Preparing preview…</span>'}<div><strong>${esc(entry.file.name)}</strong><small>Ready to send${form.dataset.chatParent ? ' in this thread' : ''}</small></div><button class="icon-btn" type="button" data-action="remove-chat-attachment" aria-label="Remove attached image" ${pending.has(formKey(form)) ? 'disabled' : ''}>${icon('close')}</button>` : '';
    form.classList.toggle('has-attachment', !!entry);
    fitChatViewport();
  }
  function composerHTML(channel, parent = '') {
    const name = channels.find(item => item.id === channel)?.name || 'channel', id = parent ? 'thread-body' : 'message-input';
    return `<div class="form-error" role="alert" tabindex="-1"></div><label class="chat-sr-only" for="${id}">${parent ? 'Reply in thread' : `Message #${esc(name)}`}</label><div class="chat-attachment-preview" hidden></div><div class="chat-composer-row"><input type="file" data-chat-file accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label="Choose an image"><button class="icon-btn chat-attach" type="button" data-action="attach-chat-image" aria-label="Attach an image">${icon('plus')}</button><textarea id="${id}" name="body" rows="1" maxlength="4000" placeholder="${parent ? 'Reply in thread…' : `Message #${esc(name)}…`}"></textarea><button class="btn primary chat-send" type="submit" aria-label="${parent ? 'Send reply' : 'Send message'}">${icon('arrow')}<span class="chat-sr-only">${parent ? 'Reply' : 'Send'}</span></button></div><div class="composer-footer"><small>Enter to send <span aria-hidden="true">·</span> Shift+Enter for a new line</small><span class="chat-composer-status" role="status"></span></div>`;
  }
  function prepareComposer(form, channel, parent = '') {
    form.dataset.chatChannel = channel;
    if (parent) form.dataset.chatParent = parent;
    form.innerHTML = composerHTML(channel, parent);
    const input = form.elements.body, key = keyFor(channel, parent);
    input.value = draftGet(key);
    input.addEventListener('input', () => { draftSet(key, input.value); autosize(input); });
    form.querySelector('[data-chat-file]').addEventListener('change', async event => {
      const file = event.target.files[0]; event.target.value = '';
      if (!file || pending.has(key)) return;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { formError(form, 'Choose a JPEG, PNG, WebP or GIF image.'); return; }
      if (file.size > 20000000) { formError(form, 'Choose an image smaller than 20 MB.'); return; }
      const entry = {file, preview: '', uploaded: null};
      attachments.set(key, entry); form.querySelector('.form-error').textContent = ''; paintAttachment(form);
      try {
        const preview = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('This image could not be opened.')); reader.readAsDataURL(file); });
        if (attachments.get(key) === entry) { entry.preview = preview; paintAttachment(form); }
      } catch (error) { if (attachments.get(key) === entry) { attachments.delete(key); paintAttachment(form); formError(form, error.message); } }
    });
    paintAttachment(form); autosize(input);
    if (pending.has(key)) setSending(form, true);
  }
  function setSending(form, busy) {
    form.setAttribute('aria-busy', String(busy));
    form.querySelectorAll('[type="submit"],.chat-attach,[data-action="remove-chat-attachment"]').forEach(item => { item.disabled = busy; });
    form.querySelector('.chat-composer-status').textContent = busy ? 'Sending…' : '';
  }
  const bindBeforeChat = bindPage;
  bindPage = function() {
    bindBeforeChat(); setDraftOwner(); paintUnread();
    const form = $('#message-form');
    if (form && records.currentChannel) prepareComposer(form, records.currentChannel.id);
    decorateMessages($('#message-feed'));
    if ($('#message-feed')) $('#message-feed').scrollTop = $('#message-feed').scrollHeight;
    requestAnimationFrame(fitChatViewport);
    if (form) { captureCursor(records.currentChannel.id, records.messages); markCurrentRead().catch(() => {}); }
  };

  function updateRootCount(parent, count) {
    const root = records.messages?.find(item => item.id === parent);
    if (root) root.reply_count = count;
    for (const button of document.querySelectorAll('#message-feed [data-action="open-thread"]')) if (button.dataset.id === parent) {
      const label = count ? `${count} ${count === 1 ? 'reply' : 'replies'}` : 'Reply in thread';
      button.innerHTML = `${icon('people')}<span>${label}</span>${icon('chevron')}`;
      button.setAttribute('aria-label', `${label} to ${root?.name || 'this message'}`);
    }
  }
  function paintThread(data, forceBottom = false) {
    const list = $('[data-thread-messages]');
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const count = $('[data-thread-count]');
    if (count) count.textContent = `${data.total_replies} ${data.total_replies === 1 ? 'reply' : 'replies'}${data.total_replies > data.replies.length ? ' · latest ' + data.replies.length + ' shown' : ''}`;
    list.innerHTML = data.replies.map(item => messageHTML(item)).join('') || '<div class="chat-thread-empty"><strong>Keep the conversation together.</strong><p>Replies appear here, alongside the original message.</p></div>';
    decorateMessages(list);
    if (atBottom || forceBottom) list.scrollTop = list.scrollHeight;
    updateRootCount(data.parent.id, data.total_replies);
  }
  async function refreshThread(forceBottom = false) {
    const thread = activeThread;
    if (!thread || thread.refreshing || !$('#thread-form') || document.visibilityState !== 'visible') return;
    thread.refreshing = true;
    try {
      const result = await api('/api/channels/' + encodeURIComponent(thread.channel) + '/threads/' + encodeURIComponent(thread.parent));
      if (activeThread === thread && $('#thread-form')) paintThread(result, forceBottom);
    } finally { thread.refreshing = false; }
  }
  const smallScreen = matchMedia('(max-width: 760px)');
  function syncThreadLayout() {
    const main = $('.chat-main');
    if (main) main.toggleAttribute('inert', !!activeThread && smallScreen.matches);
    fitChatViewport();
  }
  smallScreen.addEventListener('change', syncThreadLayout);
  threadDialog = async function(parent) {
    const channel = records.currentChannel?.id;
    if (!channel || !user || !canPostChannel(channel) || !$('.channel-view')) return;
    closeThread(false);
    const generation = ++threadGeneration, actor = user.id;
    activeThread = {channel, parent};
    const pane = document.createElement('aside'); pane.id = 'thread-pane'; pane.className = 'chat-thread';
    pane.setAttribute('aria-labelledby', 'thread-heading');
    pane.innerHTML = `<header class="chat-thread-head"><button type="button" class="icon-btn" data-action="close-thread" aria-label="Back to channel">${icon('chevron')}</button><div><h2 id="thread-heading">Thread</h2><span>#${esc(records.currentChannel.name)}</span></div><span class="chat-thread-channel">Channel conversation</span></header><div class="chat-thread-loading" role="status">Opening replies…</div>`;
    $('.channel-view').append(pane); $('.channel-view').classList.add('thread-open'); syncThreadLayout();
    pane.querySelector('[data-action="close-thread"]').focus({preventScroll: true});
    try {
      const data = await api('/api/channels/' + encodeURIComponent(channel) + '/threads/' + encodeURIComponent(parent));
      if (activeThread?.parent !== parent || generation !== threadGeneration || user?.id !== actor || !pane.isConnected) return;
      pane.querySelector('.chat-thread-loading').remove();
      pane.insertAdjacentHTML('beforeend', `<div class="chat-thread-context"><span class="chat-context-label">Original message</span>${messageHTML({...data.parent, parent_id: 'root'})}</div><div class="chat-thread-count" data-thread-count role="status"></div><div data-thread-messages class="chat-thread-messages" aria-label="Thread replies"></div><form id="thread-form" class="composer"></form>`);
      prepareComposer($('#thread-form'), channel, parent); paintThread(data, true); fitChatViewport();
      // Keep the software keyboard closed until the reply field is tapped on phones.
      if (!smallScreen.matches) $('#thread-form').elements.body.focus({preventScroll: true});
    } catch (error) {
      if (pane.isConnected && generation === threadGeneration) {
        const host = pane.querySelector('.chat-thread-loading') || pane;
        host.insertAdjacentHTML('beforeend', `<p class="form-error" role="alert">${esc(error.message)}</p><button class="btn" data-action="open-thread" data-id="${esc(parent)}">Try again</button>`);
      }
    }
  };
  const actionBeforeChat = handleAction;
  handleAction = async function(element) {
    if (element.dataset.action === 'open-thread') return threadDialog(element.dataset.id);
    if (element.dataset.action === 'close-thread') return closeThread();
    if (element.dataset.action === 'attach-chat-image') { element.closest('form')?.querySelector('[data-chat-file]')?.click(); return; }
    if (element.dataset.action === 'remove-chat-attachment') {
      const form = element.closest('form'), key = formKey(form);
      if (!pending.has(key)) { attachments.delete(key); paintAttachment(form); form.elements.body.focus({preventScroll: true}); }
      return;
    }
    return actionBeforeChat(element);
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeThread && !dialog.open) { event.preventDefault(); closeThread(); }
  });

  async function uploadAttachment(entry, channel, actor) {
    if (entry.uploaded) return entry.uploaded;
    if (user?.id !== actor || !canPostChannel(channel)) throw Error('This channel is no longer available for posting.');
    let file = entry.prepared || entry.file;
    if (!entry.prepared && file.size > 150000 && file.type !== 'image/gif') {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .84));
        if (blob) file = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {type: 'image/webp'});
      } finally { bitmap.close(); }
    }
    if (file.size > 2097152) throw Error('This image is too large. Choose an image smaller than 2 MB.');
    entry.prepared = file;
    if (user?.id !== actor || !canPostChannel(channel)) throw Error('This channel is no longer available for posting.');
    const data = new FormData(); data.append('file', file); data.append('context_type', 'channel'); data.append('context_id', channel);
    const response = await fetch('/api/uploads', {method: 'POST', credentials: 'same-origin', body: data});
    let result; try { result = await response.json(); } catch { throw Error('The image could not be uploaded. Please try again.'); }
    if (!response.ok) throw Error(result.error || 'The image could not be uploaded. Please try again.');
    entry.uploaded = result.upload.url;
    return entry.uploaded;
  }
  // Capture replaces legacy submit listeners and prevents click/Enter races.
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('#message-form,#thread-form')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const channel = form.dataset.chatChannel, parent = form.dataset.chatParent || '', actor = user?.id;
    if (!actor || !channel || !canPostChannel(channel)) return;
    const key = keyFor(channel, parent), content = form.elements.body.value, attachment = attachments.get(key);
    if (pending.has(key) || (!content.trim() && !attachment) || !form.reportValidity()) return;
    if (attachment && content.length > 3945) { formError(form, 'Shorten the caption to 3,945 characters to leave room for your image.'); return; }
    pending.add(key); setSending(form, true); form.querySelector('.form-error').textContent = '';
    try {
      const url = attachment ? await uploadAttachment(attachment, channel, actor) : '';
      if (user?.id !== actor) return;
      await api('/api/channels/' + encodeURIComponent(channel) + '/messages', 'POST', {body: url ? `${content.trim() ? content + '\n' : ''}${url}` : content, ...(parent ? {parent_id: parent} : {})});
      if (user?.id !== actor) return;
      if (draftGet(key) === content) draftSet(key, '');
      for (const current of document.querySelectorAll('#message-form,#thread-form')) if (formKey(current) === key && current.elements.body.value === content) { current.elements.body.value = ''; autosize(current.elements.body); }
      if (attachments.get(key) === attachment) attachments.delete(key);
      if (form.isConnected) { paintAttachment(form); form.elements.body.focus({preventScroll: true}); }
      // A refresh failure cannot turn an accepted send into a retry/double message.
      if (route === 'channel/' + channel && records.currentChannel?.id === channel) await loadChannelMessages(!parent).catch(() => {});
      if (parent && activeThread?.channel === channel && activeThread.parent === parent) await refreshThread(true).catch(() => {});
    } catch (error) { if (form.isConnected) formError(form, error.message); else toast(error.message, true); }
    finally {
      pending.delete(key);
      for (const current of document.querySelectorAll('#message-form,#thread-form')) if (formKey(current) === key) { setSending(current, false); paintAttachment(current); }
    }
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
  dialog.addEventListener('close', () => markCurrentRead().catch(() => {}));
  setInterval(() => { refreshUnread().catch(() => {}); refreshThread().catch(() => {}); }, 15000);
})();
