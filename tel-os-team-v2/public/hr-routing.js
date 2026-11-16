(() => {
  'use strict';

  function visibilityText(visibility) {
    if (!visibility) return 'Visible to you and this ticket’s authorised reviewers.';
    const reviewers = visibility.legacy_all_founders ? ['all founders'] : (visibility.founders || []).filter(founder => founder.available !== false).map(founder => founder.name);
    if (visibility.hr_visible) reviewers.unshift('the HR team');
    const owner = visibility.owner && visibility.owner.id !== user.id ? visibility.owner.name : 'you';
    return `Visible to ${owner}${reviewers.length ? ', ' + reviewers.join(', ') : ''}. ${visibility.hr_visible ? 'HR can read the ticket, replies and images.' : 'HR cannot see this ticket, its replies or images.'}${visibility.explicit ? ' Other founders cannot see it.' : ' This ticket keeps its original reviewer access.'}`;
  }

  function visibilityNote(visibility) {
    return `<p class="hr-ticket-visibility">${icon('shield')}<span>${esc(visibilityText(visibility))}</span></p>`;
  }

  newGrievance = async function () {
    try {
      const roster = await api('/api/grievances/reviewers');
      const founders = roster.founders.filter(founder => founder.id !== user.id);
      const fields = field('Subject', 'title', 'text', {required: true, maxlength: 160}) +
        field('What happened?', 'body', 'textarea', {required: true, rows: 7, maxlength: 12000, hint: 'Share the information needed for a fair review. This ticket is associated with your account.'}) +
        `<fieldset class="hr-reviewer-selection" aria-describedby="hr-reviewer-help"><legend>Who can see this private ticket?</legend><p id="hr-reviewer-help" class="hint">You always have access. Choose the HR team, specific founders, or both. Your choices also apply to replies and images.</p><label class="checkline"><input type="checkbox" name="hr_visible" ${roster.hr_available ? 'checked' : 'disabled'}><span>Allow the HR team to see this ticket<small>${roster.hr_available ? 'HR lead and HR members who are currently available.' : 'No other HR reviewer is currently available.'}</small></span></label><p class="hr-founder-label">Founders who can see this ticket</p><div class="hr-founder-options">${founders.map(founder => `<label class="checkline"><input type="checkbox" name="founder_id" value="${esc(founder.id)}"><span>${esc(founder.name)}</span></label>`).join('') || '<p class="hint">No other active founders are currently available.</p>'}</div><p class="hint">Select at least one other reviewer. A reviewer cannot resolve their own ticket.</p><p class="hr-selection-summary" role="status" aria-live="polite" aria-atomic="true"></p></fieldset>`;
      modalForm('Open a private HR ticket', fields, (body, form) => {
        const hr_visible = form.elements.hr_visible.checked;
        const founder_ids = [...form.querySelectorAll('[name="founder_id"]:checked')].map(input => input.value);
        if (!hr_visible && !founder_ids.length) throw Error('Choose the HR team or at least one founder who can review your ticket.');
        return api('/api/grievances', 'POST', {title: body.title, body: body.body, hr_visible, founder_ids});
      }, {submit: 'Submit private ticket', description: 'Only you and the reviewers you choose can read this ticket.'});
      const form = $('#modal-form');
      function updateSummary() {
        const selected = [...form.querySelectorAll('[name="founder_id"]:checked')].map(input => founders.find(founder => founder.id === input.value));
        form.querySelector('.hr-selection-summary').textContent = visibilityText({explicit: true, hr_visible: form.elements.hr_visible.checked, founders: selected});
      }
      form.addEventListener('change', updateSummary);
      updateSummary();
    } catch (error) {
      openDialog('Private ticket reviewers unavailable', `<p class="form-error visible" role="alert">${esc(error.message)}</p><div class="form-actions">${button('Close', 'close-dialog')}</div>`);
    }
  };

  const previousGrievancesPage = grievancesPage;
  grievancesPage = async function () {
    const template = document.createElement('template');
    template.innerHTML = await previousGrievancesPage();
    const note = template.content.querySelector('.note span');
    if (note) note.textContent = 'Choose exactly which founders can see a new ticket and whether the HR team can see it. Replies and images use the same private access.';
    for (const card of template.content.querySelectorAll('article.list-card')) {
      const ticket = records.grievances.find(row => row.id === card.querySelector('[data-action="ticket-chat"]')?.dataset.id);
      if (ticket) card.querySelector('.list-card-head')?.insertAdjacentHTML('afterend', visibilityNote(ticket.visibility));
    }
    return template.innerHTML;
  };

  const previousTicketChat = ticketChat;
  ticketChat = async function (id) {
    await previousTicketChat(id);
    const ticket = records.grievances?.find(row => row.id === id);
    const content = dialog.querySelector('.dialog-content');
    if (content && ticket) content.insertAdjacentHTML('afterbegin', visibilityNote(ticket.visibility));
  };

  const previousGuidePage = guidePage;
  guidePage = async function () {
    const template = document.createElement('template');
    template.innerHTML = await previousGuidePage();
    for (const paragraph of template.content.querySelectorAll('.guide-step-copy p')) {
      if (paragraph.textContent.includes('private concerns')) paragraph.textContent = 'Use team channels for work updates and threads for replies. For private support, open Contact HR and choose which founders can see your ticket and whether the HR team can see it. Replies and images follow the same choices.';
    }
    return template.innerHTML;
  };
})();
