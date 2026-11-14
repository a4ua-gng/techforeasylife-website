import {queueMeetingDeliveries} from './deliveries.js';
const sameDept = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const isFounder = user => user.role === 'founder';
const isHRLead = user => user.role === 'hr_lead';
const isLead = user => ['team_lead', 'finance_head'].includes(user.role);
const isManager = user => isFounder(user) || isHRLead(user) || isLead(user) || user.role === 'hr_member';
const canSeeDepartment = (user, department) => isFounder(user) || sameDept(department, 'Company') || (!sameDept(department, 'Leadership') && sameDept(user.department, department));
const canManageDepartment = (user, department) => isFounder(user) || (isHRLead(user) && (sameDept(department, 'Company') || sameDept(department, 'HR'))) || (isLead(user) && sameDept(user.department, department));

export async function handleCollaboration({ request, url, env, user, body, helpers: h }) {
  const { json, fail, rows, one, run, audit, notify, id, now, day } = h;
  const path = url.pathname;
  const method = request.method;
  const b = body || {};
  const uniqueRun = async (sql, ...params) => {
    try { return await run(env, sql, ...params); }
    catch (error) {
      if (/UNIQUE constraint failed/i.test(String(error))) fail(409, 'A matching record already exists; refresh and try again.');
      throw error;
    }
  };
  const text = (value, max, label, required = false) => {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') fail(400, `${label} must be text.`);
    value = value.trim();
    if ((required && !value) || value.length > max) fail(400, `${label} ${required && !value ? 'is required' : `must be at most ${max} characters`}.`);
    return value;
  };
  const dept = (value, fallback = user.department) => {
    const department = text(value ?? fallback, 60, 'Department', true);
    if (!canManageDepartment(user, department) && !(user.role === 'hr_member' && sameDept(department, 'HR'))) fail(403, 'You cannot manage this department.');
    return department;
  };
  const urlValue = value => {
    const v = text(value, 1500, 'Call link');
    if (v) {
      let parsed;
      try { parsed = new URL(v); } catch { fail(400, 'Use a valid HTTPS call link.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(400, 'Use a valid HTTPS call link without embedded credentials.');
    }
    return v;
  };
  const date = (value, label) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail(400, `Use a valid ${label}.`);
    return value;
  };
  const userIDs = async (value, label) => {
    if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== 'string' || x.length > 80)) fail(400, `${label} must be a list of employee IDs.`);
    const ids = [...new Set(value)];
    if (ids.length) {
      const people = await rows(env, `SELECT id,status FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
      if (people.length !== ids.length || people.some(x => ['suspended', 'exited'].includes(x.status))) fail(400, `${label} contains an unavailable account.`);
    }
    return ids;
  };
  const meetingData = row => ({ ...row, participants: JSON.parse(row.participants_json || '[]'), attended: JSON.parse(row.attended_json || '[]'), participants_json: undefined, attended_json: undefined });
  const canSeeMeeting = row => canSeeDepartment(user, row.department) || row.created_by === user.id || JSON.parse(row.participants_json || '[]').includes(user.id);
  const channelAccess = async channelId => {
    const channel = await one(env, 'SELECT * FROM channels WHERE id=?', channelId);
    if (!channel) fail(404, 'Channel not found.');
    if (!canSeeDepartment(user, channel.department)) fail(403, 'This channel is restricted to its department.');
    return channel;
  };

  if (path === '/api/channels' && method === 'GET') {
    const channels = (await rows(env, 'SELECT * FROM channels ORDER BY CASE department WHEN \'Company\' THEN 0 ELSE 1 END,name')).filter(c => canSeeDepartment(user, c.department));
    return json({ channels });
  }
  if (path === '/api/channels' && method === 'POST') {
    if (!isManager(user)) fail(403, 'A team lead or HR must create channels.');
    const name = text(b.name, 60, 'Channel name', true).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(name)) fail(400, 'Channel names need 2–60 lowercase letters, numbers or hyphens.');
    const department = dept(b.department);
    const posting_policy = b.posting_policy === 'announcements' ? 'announcements' : 'members';
    if (posting_policy === 'announcements' && !isFounder(user) && !isHRLead(user)) fail(403, 'Only founders or the HR lead can create announcement channels.');
    if (await one(env, 'SELECT id FROM channels WHERE name=?', name)) fail(409, 'That channel name already exists.');
    const channelId = id();
    await uniqueRun('INSERT INTO channels(id,name,description,department,posting_policy,created_by,created_at) VALUES(?,?,?,?,?,?,?)', channelId, name, text(b.description, 500, 'Description'), department, posting_policy, user.id, now());
    await audit(env, user, 'channel_created', 'channel', channelId);
    return json({ channel: await one(env, 'SELECT * FROM channels WHERE id=?', channelId) }, 201);
  }
  const messageMatch = path.match(/^\/api\/channels\/([^/]+)\/messages$/);
  if (messageMatch && method === 'GET') {
    const channel = await channelAccess(messageMatch[1]);
    const messages = await rows(env, 'SELECT m.*,u.name FROM (SELECT * FROM messages WHERE channel_id=? ORDER BY created_at DESC,id DESC LIMIT 200) m JOIN users u ON u.id=m.user_id ORDER BY m.created_at,m.id', channel.id);
    return json({ messages });
  }
  if (messageMatch && method === 'POST') {
    const channel = await channelAccess(messageMatch[1]);
    if (channel.posting_policy === 'announcements' && !isFounder(user) && !isHRLead(user)) fail(403, 'Only founders and the HR lead can post official announcements.');
    const content = text(b.body, 4000, 'Message', true);
    const parent_id = b.parent_id ? text(b.parent_id, 80, 'Thread ID', true) : null;
    let parent;
    if (parent_id) {
      parent = await one(env, 'SELECT * FROM messages WHERE id=? AND channel_id=?', parent_id, channel.id);
      if (!parent || parent.parent_id) fail(400, 'Reply to an existing top-level message in this channel.');
    }
    const messageId = id();
    await run(env, 'INSERT INTO messages(id,channel_id,user_id,body,parent_id,created_at) VALUES(?,?,?,?,?,?)', messageId, channel.id, user.id, content, parent_id, now());
    const mentions = [...new Set([...content.matchAll(/@([a-z0-9._-]{2,60})/gi)].map(m => m[1].toLowerCase()))].slice(0, 30);
    const recipients = new Set(parent && parent.user_id !== user.id ? [parent.user_id] : []);
    if (mentions.length) {
      const mentioned = await rows(env, `SELECT id,role,department FROM users WHERE lower(username) IN (${mentions.map(() => '?').join(',')}) AND status IN ('active','on_leave')`, ...mentions);
      for (const person of mentioned) if (person.id !== user.id && canSeeDepartment(person, channel.department)) recipients.add(person.id);
    }
    if (channel.posting_policy === 'announcements') {
      const members = await rows(env, "SELECT id,role,department FROM users WHERE status IN ('active','on_leave')");
      for (const person of members) if (person.id !== user.id && canSeeDepartment(person, channel.department)) recipients.add(person.id);
    }
    if(channel.id==='marketing-reports'){const owner=await one(env,"SELECT id FROM users WHERE username='harsh' AND role='founder' AND status='active'");if(owner&&owner.id!==user.id)recipients.add(owner.id);}
    for (const recipient of recipients) await notify(env, recipient, parent ? `Reply in #${channel.name}` : `Update in #${channel.name}`, `${user.name} posted a message.`, 'channel/'+channel.id);
    await audit(env, user, 'message_posted', 'channel', channel.id);
    return json({ message: await one(env, 'SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?', messageId) }, 201);
  }

  if (path === '/api/meetings' && method === 'GET') {
    const meetings = (await rows(env, 'SELECT * FROM meetings ORDER BY starts_at DESC LIMIT 300')).filter(canSeeMeeting).map(meetingData);
    return json({ meetings });
  }
  if (path === '/api/meetings' && method === 'POST') {
    if (!isManager(user)) fail(403, 'A team lead or HR must schedule meetings.');
    const department = dept(b.department);
    const title = text(b.title, 160, 'Meeting title', true);
    const purpose = text(b.purpose, 3000, 'Meeting purpose', true);
    const timestamp = Date.parse(b.starts_at);
    if (typeof b.starts_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.starts_at) || !Number.isFinite(timestamp)) fail(400, 'Specify a meeting time with its timezone.');
    const participants = await userIDs(b.participants || [], 'Participants');
    if (!participants.includes(user.id)) participants.push(user.id);
    const attended = await userIDs(b.attended || [], 'Attendance');
    if (attended.some(p => !participants.includes(p))) fail(400, 'Meeting attendance must come from the participant list.');
    const meetingId = id();
    await run(env, 'INSERT INTO meetings(id,title,purpose,starts_at,call_url,participants_json,attended_json,decisions,follow_ups,department,kind,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', meetingId, title, purpose, new Date(timestamp).toISOString(), urlValue(b.call_url), JSON.stringify(participants), JSON.stringify(attended), text(b.decisions, 5000, 'Decisions'), text(b.follow_ups, 5000, 'Follow-up responsibilities'), department, b.kind === 'client_call' ? 'client_call' : 'meeting', user.id, now(), now());
    for (const participant of participants) if (participant !== user.id) await notify(env, participant, 'Meeting scheduled', `${title} · ${new Date(timestamp).toISOString()}`, 'meetings');
    await queueMeetingDeliveries(env,await one(env,'SELECT * FROM meetings WHERE id=?',meetingId));
    await audit(env, user, 'meeting_created', 'meeting', meetingId);
    return json({ meeting: meetingData(await one(env, 'SELECT * FROM meetings WHERE id=?', meetingId)) }, 201);
  }
  const meetingMatch = path.match(/^\/api\/meetings\/([^/]+)$/);
  if (meetingMatch && method === 'PATCH') {
    const meeting = await one(env, 'SELECT * FROM meetings WHERE id=?', meetingMatch[1]);
    if (!meeting) fail(404, 'Meeting not found.');
    if (!canSeeMeeting(meeting) || !(meeting.created_by === user.id || canManageDepartment(user, meeting.department))) fail(403, 'Only the organiser or an authorised manager can update the meeting.');
    const participants = JSON.parse(meeting.participants_json || '[]');
    const attended = b.attended === undefined ? JSON.parse(meeting.attended_json || '[]') : await userIDs(b.attended, 'Attendance');
    if (attended.some(p => !participants.includes(p))) fail(400, 'Meeting attendance must come from the participant list.');
    await run(env, 'UPDATE meetings SET decisions=?,follow_ups=?,attended_json=?,updated_at=? WHERE id=?', text(b.decisions ?? meeting.decisions, 5000, 'Decisions'), text(b.follow_ups ?? meeting.follow_ups, 5000, 'Follow-up responsibilities'), JSON.stringify(attended), now(), meeting.id);
    await audit(env, user, 'meeting_record_updated', 'meeting', meeting.id);
    return json({ meeting: meetingData(await one(env, 'SELECT * FROM meetings WHERE id=?', meeting.id)) });
  }

  if (path === '/api/documents' && method === 'GET') {
    return json({ documents: (await rows(env, 'SELECT * FROM documents ORDER BY updated_at DESC LIMIT 300')).filter(d => canSeeDepartment(user, d.department)) });
  }
  if (path === '/api/documents' && method === 'POST') {
    if (!isManager(user)) fail(403, 'A team lead or HR must publish policies.');
    const department = dept(b.department);
    const documentId = id();
    await run(env, 'INSERT INTO documents(id,title,body,department,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', documentId, text(b.title, 160, 'Document title', true), text(b.body, 16000, 'Document body', true), department, user.id, now(), now());
    await audit(env, user, 'document_published', 'document', documentId);
    return json({ document: await one(env, 'SELECT * FROM documents WHERE id=?', documentId) }, 201);
  }

  if (path === '/api/grievances' && method === 'GET') {
    const query = isFounder(user) ? 'SELECT * FROM grievances ORDER BY created_at DESC LIMIT 200' : ['hr_lead','hr_member'].includes(user.role) ? 'SELECT * FROM grievances WHERE founder_only=0 OR user_id=? ORDER BY created_at DESC LIMIT 200' : 'SELECT * FROM grievances WHERE user_id=? ORDER BY created_at DESC LIMIT 200';
    return json({ grievances: await rows(env, query, ...(isFounder(user) ? [] : [user.id])) });
  }
  if (path === '/api/grievances' && method === 'POST') {
    if (b.founder_only !== undefined && typeof b.founder_only !== 'boolean') fail(400, 'Choose whether this is founder-only.');
    const grievanceId = id();
    await run(env, 'INSERT INTO grievances(id,user_id,title,body,founder_only,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', grievanceId, user.id, text(b.title, 160, 'Concern title', true), text(b.body, 12000, 'Concern details', true), b.founder_only ? 1 : 0, now(), now());
    const reviewers = await rows(env, b.founder_only ? "SELECT id FROM users WHERE role='founder' AND status='active'" : "SELECT id FROM users WHERE role IN ('founder','hr_lead','hr_member') AND status='active'");
    for (const reviewer of reviewers) if (reviewer.id !== user.id) await notify(env, reviewer.id, 'Confidential concern received', 'A private concern is awaiting authorised review.', 'grievances');
    // Audit excludes the title and body; the restricted founder audit retains the actor for accountability.
    await audit(env, user, 'confidential_concern_received', 'grievance', grievanceId);
    return json({ grievance: await one(env, 'SELECT * FROM grievances WHERE id=?', grievanceId) }, 201);
  }
  const grievanceMatch = path.match(/^\/api\/grievances\/([^/]+)$/);
  if (grievanceMatch && method === 'PATCH') {
    const grievance = await one(env, 'SELECT * FROM grievances WHERE id=?', grievanceMatch[1]);
    if (!grievance) fail(404, 'Concern not found.');
    if ((!isFounder(user) && !(['hr_lead','hr_member'].includes(user.role) && !grievance.founder_only)) || grievance.user_id === user.id) fail(403, 'An independent authorised reviewer must handle this concern.');
    if (!['in_review', 'resolved'].includes(b.status)) fail(400, 'Choose in_review or resolved.');
    if (grievance.status === 'resolved') fail(409, 'This concern is already resolved.');
    const response = text(b.response, 6000, 'Review response', b.status === 'resolved');
    const result = await run(env, 'UPDATE grievances SET status=?,response=?,reviewed_by=?,updated_at=? WHERE id=? AND status=?', b.status, response, user.id, now(), grievance.id, grievance.status);
    if (result.meta?.changes === 0) fail(409, 'This concern changed; refresh before reviewing.');
    await notify(env, grievance.user_id, 'Confidential concern updated', 'An authorised reviewer updated your report.', 'grievances');
    await audit(env, user, 'confidential_concern_reviewed', 'grievance', grievance.id);
    return json({ grievance: await one(env, 'SELECT * FROM grievances WHERE id=?', grievance.id) });
  }

  if (path === '/api/performance' && method === 'GET') {
    const reviews = await rows(env, 'SELECT r.*,u.name,u.department,v.name reviewer_name FROM performance_reviews r JOIN users u ON u.id=r.user_id JOIN users v ON v.id=r.reviewer_id ORDER BY r.period DESC,r.created_at DESC LIMIT 500');
    return json({ reviews: reviews.filter(r => r.user_id === user.id || isFounder(user) || isHRLead(user) || (isLead(user) && sameDept(user.department, r.department))) });
  }
  if (path === '/api/performance' && method === 'POST') {
    if (!isFounder(user) && !isHRLead(user) && !isLead(user)) fail(403, 'Only an authorised reviewer can record performance feedback.');
    const target = await one(env, 'SELECT id,role,department,name FROM users WHERE id=?', text(b.user_id, 80, 'Employee ID', true));
    if (!target) fail(404, 'Employee not found.');
    if (target.id === user.id) fail(403, 'An independent reviewer must provide the review.');
    if (!isFounder(user) && (target.role === 'founder' || (isHRLead(user) && target.role === 'hr_lead') || (isLead(user) && (!sameDept(user.department, target.department) || ['team_lead', 'finance_head', 'hr_lead'].includes(target.role))))) fail(403, 'You cannot review this employee.');
    const period = text(b.period, 7, 'Review month', true);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > day().slice(0, 7)) fail(400, 'Use a current or past review month in YYYY-MM format.');
    const fields = ['quality', 'timeliness', 'communication', 'initiative', 'reliability', 'collaboration', 'summary'];
    const comments = fields.map(key => text(b[key], key === 'summary' ? 4000 : 1200, key[0].toUpperCase() + key.slice(1), true));
    if (await one(env, 'SELECT id FROM performance_reviews WHERE user_id=? AND period=? AND reviewer_id=?', target.id, period, user.id)) fail(409, 'You have already recorded feedback for this employee and month.');
    const reviewId = id();
    await uniqueRun('INSERT INTO performance_reviews(id,user_id,reviewer_id,period,quality,timeliness,communication,initiative,reliability,collaboration,summary,next_steps,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', reviewId, target.id, user.id, period, ...comments, text(b.next_steps, 4000, 'Next steps'), now());
    await notify(env, target.id, 'Monthly feedback available', `${period} feedback from ${user.name} is ready to read.`, 'performance');
    await audit(env, user, 'performance_review_recorded', 'performance_review', reviewId);
    return json({ review: await one(env, 'SELECT * FROM performance_reviews WHERE id=?', reviewId) }, 201);
  }

  if (path === '/api/exits' && method === 'GET') {
    const sql = isFounder(user) || isHRLead(user) ? 'SELECT e.*,u.name FROM exit_requests e JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 300' : 'SELECT e.*,u.name FROM exit_requests e JOIN users u ON u.id=e.user_id WHERE e.user_id=? ORDER BY e.created_at DESC LIMIT 100';
    return json({ exits: await rows(env, sql, ...(isFounder(user) || isHRLead(user) ? [] : [user.id])) });
  }
  if (path === '/api/exits' && method === 'POST') {
    const proposed_end = date(b.proposed_end, 'last working date');
    if (proposed_end < day()) fail(400, 'The last working date cannot be in the past.');
    if (await one(env, "SELECT id FROM exit_requests WHERE user_id=? AND status='pending'", user.id)) fail(409, 'You already have a pending exit request.');
    const exitId = id();
    await uniqueRun('INSERT INTO exit_requests(id,user_id,proposed_end,handover_plan,created_at) VALUES(?,?,?,?,?)', exitId, user.id, proposed_end, text(b.handover_plan, 6000, 'Handover plan', true), now());
    const reviewers = await rows(env, "SELECT id FROM users WHERE role IN ('founder','hr_lead') AND status='active'");
    for (const reviewer of reviewers) if (reviewer.id !== user.id) await notify(env, reviewer.id, 'Exit request awaiting review', `${user.name} has submitted an exit and handover request.`, 'exits');
    await audit(env, user, 'exit_requested', 'exit_request', exitId);
    return json({ exit: await one(env, 'SELECT * FROM exit_requests WHERE id=?', exitId) }, 201);
  }
  const exitMatch = path.match(/^\/api\/exits\/([^/]+)$/);
  if (exitMatch && method === 'PATCH') {
    if (!isFounder(user) && !isHRLead(user)) fail(403, 'Only founders and the HR lead may review exits.');
    const exit = await one(env, 'SELECT e.*,u.role FROM exit_requests e JOIN users u ON u.id=e.user_id WHERE e.id=?', exitMatch[1]);
    if (!exit) fail(404, 'Exit request not found.');
    if (exit.user_id === user.id || (exit.role === 'founder' && !isFounder(user))) fail(403, 'An independent authorised founder must review this exit.');
    if (exit.status !== 'pending') fail(409, 'This exit request has already been reviewed.');
    if (!['approve', 'reject'].includes(b.action)) fail(400, 'Choose approve or reject.');
    const comment = text(b.comment, 3000, 'Review comment', true);
    const result = await run(env, "UPDATE exit_requests SET status=?,reviewed_by=?,review_comment=?,reviewed_at=? WHERE id=? AND status='pending'", b.action === 'approve' ? 'approved' : 'rejected', user.id, comment, now(), exit.id);
    if (result.meta?.changes === 0) fail(409, 'This exit request changed; refresh before reviewing.');
    // Approval accepts the proposed departure. Account deactivation remains a documented status request at the agreed effective date.
    await notify(env, exit.user_id, `Exit request ${b.action === 'approve' ? 'approved' : 'rejected'}`, comment, 'exits');
    await audit(env, user, b.action === 'approve' ? 'exit_approved' : 'exit_rejected', 'exit_request', exit.id);
    return json({ exit: await one(env, 'SELECT * FROM exit_requests WHERE id=?', exit.id) });
  }
  return null;
}
