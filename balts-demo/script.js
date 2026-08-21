(() => {
  const menuButton = document.querySelector('.menu-button');
  const menu = document.querySelector('.mega-menu');

  const setMenu = (open) => {
    if (!menuButton || !menu) return;
    menuButton.classList.toggle('is-open', open);
    menu.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menuButton.querySelector('span').textContent = open ? 'Close' : 'Menu';
    menu.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  };

  menuButton?.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  menu?.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? window.scrollY / max : 0;
    document.documentElement.style.setProperty('--scroll-progress', String(progress));
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  const capabilities = {
    water: {
      number: '01', name: 'Water-slide', caption: 'For complex geometry', accent: '#f04b32',
      intro: 'Thin, conformable decoration engineered for curved, painted and hard-to-reach product surfaces.',
      best: 'Bicycles, helmets, automotive parts and premium product decoration',
      control: 'Application-fit material and finish selection',
      finishes: ['Regular', 'Peelable', 'Embossed', 'Day-glow', 'Night-glow']
    },
    adhesive: {
      number: '02', name: 'Self-adhesive', caption: 'For durable identification', accent: '#b8e64a',
      intro: 'High-performance film systems developed for controlled application, clean edges and long-term brand clarity.',
      best: 'Equipment, electrical panels, labels, outdoor use and product branding',
      control: 'Adhesion, film and ink matched to exposure',
      finishes: ['High-tack', 'Smooth film', 'Precision-cut', 'Weather-aware']
    },
    transfer: {
      number: '03', name: 'Heat-transfer', caption: 'For textiles and leather', accent: '#8c87ff',
      intro: 'High-opacity transfers made for flexible substrates where colour, wash performance and hand-feel matter.',
      best: 'Sports goods, fabric, leather, bags and branded apparel components',
      control: 'Phthalate- and heavy-metal-free process choices',
      finishes: ['Wash-fast', 'High-opacity', 'Flexible', 'Clean-release']
    },
    direct: {
      number: '04', name: 'Direct printing', caption: 'For flat rigid surfaces', accent: '#62c7e8',
      intro: 'Controlled surface printing that makes the graphic feel integrated with the part rather than added later.',
      best: 'Metal, glass, plastic, nameplates, panels and flat components',
      control: 'Surface preparation and production consistency',
      finishes: ['Multi-surface', 'Sharp detail', 'Opaque colour', 'Repeatable']
    }
  };

  const systemDetail = document.querySelector('.system-detail');
  document.querySelectorAll('[data-capability]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = capabilities[button.dataset.capability];
      if (!item || !systemDetail) return;
      document.querySelectorAll('[data-capability]').forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      systemDetail.style.setProperty('--system-accent', item.accent);
      document.querySelector('#system-label').textContent = `SELECTED SYSTEM / ${item.number}`;
      document.querySelector('#system-name').textContent = item.name;
      document.querySelector('#system-intro').textContent = item.intro;
      document.querySelector('#system-best').textContent = item.best;
      document.querySelector('#system-control').textContent = item.control;
      document.querySelector('#system-number').textContent = item.number;
      document.querySelector('#system-caption').textContent = item.caption;
      document.querySelector('#system-finishes').innerHTML = item.finishes.map((finish) => `<span>${finish}</span>`).join('');
    });
  });

  const brief = {
    surface: 'Curved / painted product',
    exposure: 'Outdoor weather',
    volume: '1K–10K pieces'
  };

  const getRecommendation = () => {
    if (brief.surface.startsWith('Curved')) return 'Water-slide decal system';
    if (brief.surface.startsWith('Equipment')) return 'Self-adhesive decal system';
    if (brief.surface.startsWith('Fabric')) return 'Heat-transfer decal system';
    return 'Direct surface printing';
  };

  const updateBrief = () => {
    const recommendation = getRecommendation();
    document.querySelector('#brief-recommendation').textContent = recommendation;
    document.querySelector('#brief-surface').textContent = brief.surface;
    document.querySelector('#brief-exposure').textContent = brief.exposure;
    document.querySelector('#brief-volume').textContent = brief.volume;
    const subject = encodeURIComponent(`BALTS project brief — ${recommendation}`);
    const body = encodeURIComponent(`Hello BALTS team,\n\nI would like to discuss a printing requirement.\n\nSurface: ${brief.surface}\nExposure: ${brief.exposure}\nApproximate volume: ${brief.volume}\nSuggested starting route: ${recommendation}\n\nPlease help us confirm the right material, finish and sampling process.\n\nRegards,`);
    document.querySelector('#brief-email').href = `mailto:support@balts.in?subject=${subject}&body=${body}`;
  };

  document.querySelectorAll('[data-choice-group]').forEach((group) => {
    group.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((choice) => choice.classList.remove('is-selected'));
        button.classList.add('is-selected');
        brief[group.dataset.choiceGroup] = button.dataset.value;
        updateBrief();
      });
    });
  });
  updateBrief();

  document.querySelectorAll('.faq__list article').forEach((article) => {
    const button = article.querySelector('button');
    button.addEventListener('click', () => {
      const shouldOpen = !article.classList.contains('is-open');
      document.querySelectorAll('.faq__list article').forEach((item) => {
        item.classList.remove('is-open');
        item.querySelector('button').setAttribute('aria-expanded', 'false');
        item.querySelector('button i').textContent = '+';
      });
      if (shouldOpen) {
        article.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        button.querySelector('i').textContent = '−';
      }
    });
  });
})();
