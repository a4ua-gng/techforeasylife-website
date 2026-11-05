(() => {
  'use strict';

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const normal = value => value.normalize('NFKD').toLowerCase().trim();
  const plainClick = event => event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;

  const menu = $('.menu');
  const nav = $('#nav');
  const mobile = matchMedia('(max-width:720px)');
  function closeMenu() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }
  function syncMenu() {
    menu.hidden = !mobile.matches;
    closeMenu();
  }
  if (menu && nav) {
    document.documentElement.classList.add('js');
    syncMenu();
    mobile.addEventListener('change', syncMenu);
    menu.addEventListener('click', () => {
      menu.setAttribute('aria-expanded', String(nav.classList.toggle('open')));
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && nav.classList.contains('open') && !$('dialog[open]')) {
        closeMenu();
        menu.focus();
      }
    });
  }

  const filterBar = $('[data-filters]');
  if (filterBar) {
    const cards = $$('[data-dealer]');
    const search = $('#dealer-search');
    const filters = $$('[data-filter]', filterBar);
    let category = 'all';
    function applyFilter() {
      const terms = normal(search.value).split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const card of cards) {
        const typeMatches = category === 'all' || card.dataset.type === category;
        const haystack = normal(card.dataset.search);
        card.hidden = !(typeMatches && terms.every(term => haystack.includes(term)));
        if (!card.hidden) shown += 1;
      }
      $('#dealer-empty').hidden = shown > 0;
      $('#dealer-count').textContent = shown + (shown === 1 ? ' branch shown' : ' branches shown');
    }
    for (const button of filters) button.addEventListener('click', () => {
      category = button.dataset.filter;
      for (const item of filters) item.setAttribute('aria-pressed', String(item === button));
      applyFilter();
    });
    search.addEventListener('input', applyFilter);
    filterBar.hidden = false;
    applyFilter();
  }

  const openers = new WeakMap();
  const canShow = dialog => dialog && typeof dialog.showModal === 'function';
  function openDialog(dialog, opener) {
    if (!canShow(dialog) || dialog.open || $('dialog[open]')) return false;
    openers.set(dialog, opener);
    if (menu && nav) closeMenu();
    dialog.showModal();
    return true;
  }
  for (const dialog of $$('dialog')) {
    $('[data-dismiss]', dialog)?.addEventListener('click', () => dialog.close());
    let outsideDown = false;
    function outside(event) {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom);
    }
    dialog.addEventListener('pointerdown', event => { outsideDown = outside(event); });
    dialog.addEventListener('click', event => {
      if (outsideDown && outside(event)) dialog.close();
      outsideDown = false;
    });
    dialog.addEventListener('close', () => {
      const opener = openers.get(dialog);
      if (opener?.isConnected) opener.focus({preventScroll:true});
    });
  }

  const contact = $('[data-auto-contact]');
  if (canShow(contact)) {
    const firstContact = $('.branch-intro [data-branch-contact]');
    const contactKey = 'skx-contact-v1:' + contact.dataset.autoContact;
    let seenHere = false;
    let autoTimer;
    function shownBefore() {
      try { return seenHere || sessionStorage.getItem(contactKey) === 'shown'; }
      catch { return seenHere; }
    }
    function noteShown() {
      seenHere = true;
      try { sessionStorage.setItem(contactKey, 'shown'); } catch { /* storage is optional */ }
    }
    function scheduleContact() {
      if (shownBefore() || document.hidden || location.hash) return;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        if (!shownBefore() && !document.hidden && window.scrollY < 24 &&
            (document.activeElement === document.body || document.activeElement === document.documentElement) &&
            openDialog(contact, firstContact)) noteShown();
      }, 650);
    }
    for (const link of $$('[data-branch-contact]')) link.addEventListener('click', event => {
      if (!plainClick(event)) return;
      if (openDialog(contact, link)) {
        event.preventDefault();
        clearTimeout(autoTimer);
        noteShown();
      }
    });
    scheduleContact();
    document.addEventListener('visibilitychange', scheduleContact);
    addEventListener('pagehide', () => clearTimeout(autoTimer));
  }

  const enquiry = $('#group-enquiry');
  const form = $('#enquiry-form');
  if (canShow(enquiry) && form) {
    for (const trigger of $$('[data-enquire]')) trigger.addEventListener('click', event => {
      if (!plainClick(event)) return;
      if (openDialog(enquiry, trigger)) {
        event.preventDefault();
        form.elements.business.value = trigger.dataset.business || 'General group enquiry';
        $('.form-status', form).textContent = '';
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = new FormData(form);
      const business = fields.get('business');
      const lines = ['Business: ' + business, 'Name: ' + fields.get('name'),
        'Contact: ' + fields.get('reply'), '', fields.get('message')];
      const email = form.dataset.email;
      const subject = encodeURIComponent('SK Group X enquiry: ' + business);
      const body = encodeURIComponent(lines.join('\n'));
      $('.form-status', form).textContent = 'If your email app does not open, email ' + email + '.';
      location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
    });
  }

  const photoDialog = $('#photo-dialog');
  const photos = $$('[data-photo]');
  if (canShow(photoDialog) && photos.length) {
    const view = $('#photo-view');
    let index = 0;
    function selectPhoto(i) {
      index = (i + photos.length) % photos.length;
      const photo = photos[index];
      view.alt = $('img', photo).alt;
      view.src = photo.href;
      $('#photo-title').textContent = photo.dataset.title;
      $('#photo-caption').textContent = photo.dataset.caption;
      $('#photo-credit').textContent = photo.dataset.credit;
    }
    photos.forEach((photo, i) => photo.addEventListener('click', event => {
      if (!plainClick(event)) return;
      if (openDialog(photoDialog, photo)) {
        event.preventDefault();
        selectPhoto(i);
      }
    }));
    if (photos.length === 1) $('.photo-controls', photoDialog).hidden = true;
    for (const control of $$('[data-photo-step]', photoDialog)) {
      control.addEventListener('click', () => selectPhoto(index + Number(control.dataset.photoStep)));
    }
    photoDialog.addEventListener('keydown', event => {
      if (photos.length < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      selectPhoto(index + (event.key === 'ArrowRight' ? 1 : -1));
    });
  }

  const aliases = {
    '#portfolio':'businesses', '#locations':'dealerships',
    '#business-two-wheelers':'dealerships', '#business-commercial':'dealerships',
  };
  function followHash() {
    const id = aliases[location.hash];
    if (id && document.getElementById(id)) {
      document.getElementById(id).scrollIntoView();
      return;
    }
    const target = document.getElementById(location.hash.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
  followHash();
  addEventListener('hashchange', followHash);
})();
