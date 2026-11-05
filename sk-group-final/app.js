(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const {sectors, email, photos, featured} = window.SK;
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
  const media = key => 'assets/' + key + '.webp';
  const maps = address => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  const formatNumber = value => String(value).padStart(2, '0');

  let slide = 0;
  const heroImage = $('#hero-image');
  const heroMedia = heroImage.parentElement;
  function showSlide(delta) {
    slide = (slide + delta + featured.length) % featured.length;
    const photo = photos[featured[slide]];
    const source = media(photo.key);
    heroImage.src = source;
    heroImage.alt = photo.alt;
    heroImage.width = photo.width;
    heroImage.height = photo.height;
    heroMedia.classList.toggle('portrait', Boolean(photo.portrait));
    heroMedia.style.setProperty('--hero-photo', `url("${source}")`);
    heroMedia.style.setProperty('--photo-position', photo.position || 'center 47%');
    $('#slide-name').textContent = photo.caption;
    $('#slide-kicker').textContent = formatNumber(slide + 1) + ' / ' + photo.category.toUpperCase();
    $('#slide-count').textContent = formatNumber(slide + 1) + ' / ' + formatNumber(featured.length);
  }
  $('#prev').addEventListener('click', () => showSlide(-1));
  $('#next').addEventListener('click', () => showSlide(1));
  $('.hero-controls').addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    showSlide(event.key === 'ArrowRight' ? 1 : -1);
  });

  $('#sector-grid').innerHTML = sectors.map(sector => {
    const photo = photos[sector.image];
    return `<a class="sector" href="#business-${sector.id}" data-sector="${sector.id}">
      <img src="${media(photo.key)}" alt="${escape(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async">
      <span class="tag" aria-hidden="true">${sector.n} / SECTOR</span>
      <div class="sector-copy"><h3>${escape(sector.name)}</h3>${photo.context ? `<p class="photo-label">${escape(photo.context)}</p>` : ''}</div>
      <span class="go" aria-hidden="true">↗</span>
    </a>`;
  }).join('');

  const search = $('#search');
  const filter = $('#sector-filter');
  filter.insertAdjacentHTML('beforeend', sectors.map(sector =>
    `<option value="${sector.id}">${escape(sector.name)}</option>`).join(''));
  const business = $('#enquiry [name="business"]');
  business.insertAdjacentHTML('beforeend', '<option>General group enquiry</option>' + sectors.map(sector =>
    `<optgroup label="${escape(sector.name)}">${sector.entries.map(([name, place]) =>
      `<option>${escape(name + ' — ' + place)}</option>`).join('')}</optgroup>`).join(''));

  function businessCard([name, place, description, address, link, phone, sourceLabel]) {
    const hours = name.includes('GS Riders') ? 'Showroom: 9 AM–8 PM'
      : name.includes('Axom Inn') ? 'Check-in details: see the property listing.'
        : 'Group enquiries: 9 AM–8 PM IST';
    return `<article class="entry">
      <span class="place">${escape(place)}</span><h3>${escape(name)}</h3><p>${escape(description)}</p>
      <address>${escape(address || 'Contact the group for the exact location.')}</address><p>${escape(hours)}</p>
      <div class="links">
        <button type="button" data-enquire data-business="${escape(name + ' — ' + place)}">Enquire</button>
        ${phone ? `<a href="tel:+91${escape(phone)}">Call branch</a>` : ''}
        ${address ? `<a href="${maps(address)}" target="_blank" rel="noopener">Map ↗</a>` : ''}
        ${link ? `<a href="${escape(link)}" target="_blank" rel="noopener">${escape(sourceLabel || (/dealers\.royalenfield/.test(link) ? 'Official dealer ↗' : 'Brand website ↗'))}</a>` : ''}
      </div>
    </article>`;
  }
  function renderDirectory(openId = '') {
    const term = search.value.trim().toLowerCase();
    const sectorFilter = filter.value;
    const opened = new Set([...document.querySelectorAll('.dir-group[open]')].map(group => group.id));
    let count = 0;
    $('#directory-list').innerHTML = sectors.filter(sector => !sectorFilter || sector.id === sectorFilter).map(sector => {
      const entries = sector.entries.filter(entry =>
        !term || [sector.name, ...entry.slice(0,4)].join(' ').toLowerCase().includes(term));
      if (!entries.length) return '';
      count += entries.length;
      const id = 'business-' + sector.id;
      return `<details class="dir-group" id="${id}" ${term || sectorFilter || openId === sector.id || opened.has(id) ? 'open' : ''}>
        <summary>${escape(sector.name)} <small>${entries.length} ${entries.length === 1 ? 'listing' : 'listings'}</small></summary>
        <div class="entries">${entries.map(businessCard).join('')}</div>
      </details>`;
    }).join('');
    $('#result-count').textContent = count ? count + ' business ' + (count === 1 ? 'listing' : 'listings') : 'No matches. Try a different name or location.';
  }
  function openSector(id) {
    search.value = '';
    filter.value = '';
    renderDirectory(id);
  }
  search.addEventListener('input', () => renderDirectory());
  filter.addEventListener('change', () => renderDirectory());
  renderDirectory(location.hash.startsWith('#business-') ? location.hash.slice(10) : '');
  addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#business-')) return;
    const id = location.hash.slice(1);
    const target = document.getElementById(id);
    if (target) target.open = true;
    else if (sectors.some(sector => 'business-' + sector.id === id)) {
      openSector(id.slice(9));
      document.getElementById(id)?.scrollIntoView();
    }
  });

  const album = Object.values(photos);
  const lightbox = $('#lightbox');
  let photoIndex = 0;
  const lightboxSource = $('#lightbox-source');
  function showPhoto(index) {
    photoIndex = (index + album.length) % album.length;
    const photo = album[photoIndex];
    $('#lightbox-image').src = media(photo.key);
    $('#lightbox-image').alt = photo.alt;
    $('#lightbox-caption').textContent = photo.caption + (photo.context ? ' · ' + photo.context : '');
    lightboxSource.hidden = !photo.source;
    lightboxSource.href = photo.source ? 'photo-credits.html#' + photo.key : 'photo-credits.html';
  }
  $('#gallery-grid').innerHTML = album.map((photo, i) => `<button class="photo" type="button" data-photo="${i}" aria-label="View ${escape(photo.caption)}">
    <img src="${media(photo.key)}" alt="${escape(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async">
    <span>${escape(photo.caption)} ${photo.context ? `<small>· ${escape(photo.context)}</small>` : ''} ↗</span>
  </button>`).join('');
  $('#gallery-prev').addEventListener('click', () => showPhoto(photoIndex - 1));
  $('#gallery-next').addEventListener('click', () => showPhoto(photoIndex + 1));
  lightbox.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(photoIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });

  const menu = $('.menu');
  const nav = $('#nav');
  const enquiry = $('#enquiry');
  function closeMenu() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open') && !enquiry.open && !lightbox.open) {
      closeMenu();
      menu.focus();
    }
  });
  const openers = new WeakMap();
  document.addEventListener('click', event => {
    const sector = event.target.closest('[data-sector]');
    if (sector && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) openSector(sector.dataset.sector);
    if (event.target.closest('#nav a')) closeMenu();
    const request = event.target.closest('[data-enquire]');
    if (request) {
      closeMenu();
      openers.set(enquiry, request);
      business.value = request.dataset.business || '';
      $('#email-status').textContent = '';
      enquiry.showModal();
    }
    const gallery = event.target.closest('[data-photo]');
    if (gallery) {
      openers.set(lightbox, gallery);
      showPhoto(Number(gallery.dataset.photo));
      lightbox.showModal();
    }
    const close = event.target.closest('[data-close]');
    if (close) close.closest('dialog').close();
  });
  for (const dialog of [enquiry, lightbox]) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => openers.get(dialog)?.focus());
  }
  $('#enquiry-form').addEventListener('submit', event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const subject = 'SK Group enquiry: ' + fields.get('business');
    const body = 'Business: ' + fields.get('business') + '\nName: ' + fields.get('name') + '\nContact: ' + fields.get('contact') + '\n\n' + fields.get('message');
    $('#email-status').textContent = 'If your email app did not open, use the email link below.';
    location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
})();
