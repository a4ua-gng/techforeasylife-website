'use strict';

document.documentElement.classList.add('js');
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

// A warm light palette is the default; the evening palette stays plum, not black.
const themeButton = $('.theme-switch');
function syncTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'Switch to daylight theme' : 'Switch to evening theme');
  $('meta[name="theme-color"]').content = dark ? '#261f2b' : '#f8f5ef';
}
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('sk-group-theme-v2', next); } catch (_) { /* Storage is optional. */ }
  syncTheme();
});
syncTheme();

const menuButton = $('.menu-toggle');
const navigation = $('.main-nav');
function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
$$('a', navigation).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => {
  if (!event.target.closest('.site-header') && navigation.classList.contains('is-open')) closeMenu();
});

// One photograph collection drives the carousel, lightbox and business details.
const showcase = $('.hero-showcase');
const slides = $$('.hero-slide', showcase);
const selectors = $$('[data-goto]');
const pauseButton = $('.slide-pause');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const photos = slides.map(slide => ({
  src: $('img', slide).getAttribute('src'),
  alt: $('img', slide).alt,
  title: slide.dataset.brand,
  category: slide.dataset.category
}));
let currentSlide = 0;
let carouselTimer = null;
let userPaused = reducedMotion.matches;
const suspensions = new Set(document.hidden ? ['hidden'] : []);
const interval = 7000;

function syncPlayback() {
  window.clearTimeout(carouselTimer);
  showcase.classList.remove('is-playing', 'is-suspended');
  pauseButton.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
  pauseButton.firstElementChild.textContent = userPaused ? '▶' : 'Ⅱ';
  if (userPaused || suspensions.size) return;
  // Restart the visual progress bar at the same time as the actual timer.
  void showcase.offsetWidth;
  showcase.classList.add('is-playing');
  carouselTimer = window.setTimeout(() => setSlide(currentSlide + 1, false), interval);
}
function suspend(reason, paused) {
  if (paused) suspensions.add(reason); else suspensions.delete(reason);
  syncPlayback();
}
function setSlide(index, announce = true) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => {
    const active = i === currentSlide;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
  selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === currentSlide)));
  const slide = slides[currentSlide];
  $('#slide-category').textContent = slide.dataset.category;
  $('#slide-title').textContent = slide.dataset.title;
  $('#slide-brand').textContent = slide.dataset.brand;
  $('#slide-current').textContent = String(currentSlide + 1).padStart(2, '0');
  $('.view-photo').setAttribute('aria-label', `Open ${slide.dataset.brand} photograph`);
  if (announce) $('#slide-announcement').textContent = `${currentSlide + 1} of ${slides.length}: ${slide.dataset.brand}. ${slide.dataset.title}`;
  syncPlayback();
}
selectors.forEach(button => button.addEventListener('click', () => setSlide(Number(button.dataset.goto))));
$('.slide-prev').addEventListener('click', () => setSlide(currentSlide - 1));
$('.slide-next').addEventListener('click', () => setSlide(currentSlide + 1));
pauseButton.addEventListener('click', () => { userPaused = !userPaused; syncPlayback(); });
showcase.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') suspend('hover', true); });
showcase.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') suspend('hover', false); });
showcase.addEventListener('focusin', () => suspend('focus', true));
showcase.addEventListener('focusout', event => { if (!showcase.contains(event.relatedTarget)) suspend('focus', false); });
showcase.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    setSlide(currentSlide + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
document.addEventListener('visibilitychange', () => suspend('hidden', document.hidden));
reducedMotion.addEventListener('change', event => {
  if (event.matches) userPaused = true;
  syncPlayback();
});
setSlide(0, false);

// Native dialogs provide keyboard focus containment and Escape-to-close support.
const dialogs = $$('dialog');
function syncDialogs() {
  const open = dialogs.some(dialog => dialog.open);
  document.body.classList.toggle('modal-open', open);
  suspend('dialog', open);
}
function openDialog(dialog) {
  closeMenu();
  dialogs.forEach(other => { if (other !== dialog && other.open) other.close(); });
  if (!dialog.open) dialog.showModal();
  syncDialogs();
}
dialogs.forEach(dialog => {
  $('.dialog-close', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', syncDialogs);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
});

const photoDialog = $('#photo-dialog');
let currentPhoto = 0;
function displayPhoto(index) {
  currentPhoto = (index + photos.length) % photos.length;
  const photo = photos[currentPhoto];
  $('#expanded-photo').src = photo.src;
  $('#expanded-photo').alt = photo.alt;
  $('#photo-dialog-title').textContent = photo.title;
  $('#photo-count').textContent = `${String(currentPhoto + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
}
function openPhoto(index) {
  displayPhoto(index);
  openDialog(photoDialog);
}
$$('[data-photo]').forEach(button => button.addEventListener('click', () => openPhoto(Number(button.dataset.photo))));
$('.view-photo').addEventListener('click', () => openPhoto(currentSlide));
$('.gallery-prev').addEventListener('click', () => displayPhoto(currentPhoto - 1));
$('.gallery-next').addEventListener('click', () => displayPhoto(currentPhoto + 1));
photoDialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    displayPhoto(currentPhoto + (event.key === 'ArrowRight' ? 1 : -1));
  }
});

const businessInfo = {
  royal: { title: 'Royal Enfield', category: 'MOTORCYCLE RETAIL', photo: 1, description: 'A connection to the open road. Discover the publicly listed GS Auto showrooms in Howly and Sonkuchi, Barpeta, with contact details and directions in our showroom directory.', href: '#locations', cta: 'Explore GS Auto showrooms' },
  yamaha: { title: 'Yamaha', category: 'MOTORCYCLE RETAIL · D.S. YAMAHA', photo: 2, description: 'A place for the next chapter of your riding story. Discover the D.S. Yamaha space in Dudhnoi, pictured in the group showcase.', href: 'https://www.yamaha-motor-india.com/', cta: 'Explore Yamaha' },
  tvs: { title: 'TVS', category: 'TWO-WHEELER RETAIL · D.A. TVS', photo: 0, description: 'Motorcycles, scooters and everyday journeys. Discover the D.A. TVS space featured in the group showcase, and explore TVS Motor’s official dealer network.', href: 'https://dealers.tvsmotor.com/', cta: 'Visit the TVS dealer directory' },
  montra: { title: 'Montra Electric', category: 'ELECTRIC MOBILITY', photo: 3, description: 'A different kind of momentum. With electric three-wheelers at its heart, this space brings a fresh perspective to moving people and businesses.', href: 'https://www.montraelectric.com/', cta: 'Explore Montra Electric' },
  ashok: { title: 'Ashok Leyland', category: 'COMMERCIAL MOBILITY', photo: 4, description: 'Keep ambition moving. The commercial vehicle facility pictured in this showcase opens up a world of possibilities for enterprise and the road ahead.', href: 'https://www.ashokleyland.com/', cta: 'Explore Ashok Leyland' },
  care: { title: 'Dental Care', category: 'HEALTH & WELLBEING', photo: 5, description: 'A welcoming reception, space to pause and a more personal experience. Take a closer look at the Dental Care space pictured in the portfolio.', href: '#gallery', cta: 'View the care space' }
};
const businessDialog = $('#business-dialog');
const businessLink = $('#business-link');
let selectedBusiness = null;
$$('[data-business]').forEach(button => button.addEventListener('click', () => {
  selectedBusiness = businessInfo[button.dataset.business];
  const business = selectedBusiness;
  $('#business-title').textContent = business.title;
  $('#business-category').textContent = business.category;
  $('#business-description').textContent = business.description;
  $('#business-image').src = photos[business.photo].src;
  $('#business-image').alt = photos[business.photo].alt;
  businessLink.href = business.href;
  businessLink.replaceChildren(document.createTextNode(business.cta + ' '));
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  businessLink.append(arrow);
  if (business.href.startsWith('https://')) {
    businessLink.target = '_blank';
    businessLink.rel = 'noopener';
  } else {
    businessLink.removeAttribute('target');
    businessLink.removeAttribute('rel');
  }
  openDialog(businessDialog);
}));
businessLink.addEventListener('click', event => {
  if (selectedBusiness?.href === '#gallery') {
    event.preventDefault();
    openPhoto(selectedBusiness.photo);
  } else if (selectedBusiness?.href.startsWith('#')) {
    businessDialog.close();
  }
});
$('.concept-details').addEventListener('click', () => openDialog($('#concept-dialog')));

const businessCards = $$('.business-card');
const businessGrid = $('.business-grid');
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.filter;
  $$('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  let count = 0;
  businessCards.forEach(card => {
    card.hidden = filter !== 'all' && card.dataset.category !== filter;
    if (!card.hidden) count++;
  });
  businessGrid.classList.toggle('is-filtered', filter !== 'all');
  businessGrid.classList.toggle('is-single', count === 1);
  $('.filter-count').textContent = `${count} business${count === 1 ? '' : 'es'}`;
}));

const search = $('#showroom-search');
const locations = $$('.location-row');
search.addEventListener('input', () => {
  const tokens = search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  let count = 0;
  locations.forEach(row => {
    row.hidden = !tokens.every(token => row.dataset.search.includes(token));
    if (!row.hidden) count++;
  });
  $('.location-count').textContent = `${count} showroom${count === 1 ? '' : 's'}`;
  $('.empty-state').hidden = count > 0;
});
