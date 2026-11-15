export function normaliseRequest(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function helperDestinations({role, department, channels = []}) {
  const founder = role === 'founder';
  const hr = ['founder', 'hr_lead', 'hr_member'].includes(role);
  const reports = hr || ['team_lead', 'finance_head'].includes(role);
  const items = [
    ['home', 'Home', 'Your daily overview', ['home', 'dashboard', 'overview', 'welcome']],
    ['tasks', 'My tasks', 'Assignments and reviews', ['tasks', 'task', 'assignments', 'my work', 'deadlines', 'deliverables']],
    ['attendance', 'Attendance', 'Clock in, breaks and working times', ['attendance', 'clock in', 'clock out', 'check in', 'check out', 'break', 'clockin', 'clockout', 'start time', 'working hours', 'clock in schedule']],
    ['leave', 'Time off', 'Leave requests and decisions', ['time off', 'leave', 'holiday request', 'vacation']],
    ['calendar', 'Team calendar', 'Dates and team availability', ['calendar', 'team availability']],
    ['people', 'People', 'Find teammates and reporting lines', ['people', 'directory', 'team members', 'crew', 'who reports to']],
    ['meetings', 'Meetings', 'Meeting invitations and call details', ['meetings', 'meeting', 'calls', 'schedule meeting', 'upcoming meeting']],
    ['documents', 'Policies & documents', 'Company policies and shared documents', ['policies', 'policy', 'documents', 'handbook']],
    ['grievances', 'HR help & tickets', 'Private HR support and complaints', ['hr', 'hr help', 'hr support', 'complaint', 'complaints', 'ticket', 'tickets', 'grievance']],
    ['performance', 'Feedback', 'Work feedback', ['feedback', 'performance']],
    ['notifications', 'Notifications', 'Your new updates', ['notifications', 'notification', 'alerts', 'updates']],
    ['account', 'My account', 'Profile, password and identity documents', ['account', 'profile', 'password', 'my identity card', 'my id card', 'profile picture', 'profile photo']],
    ['guide', 'Start here', 'Beginner navigation guide', ['guide', 'help', 'how to use', 'start here', 'tutorial']],
    ['images', 'Images & uploads', 'Your accessible shared images', ['images', 'uploads', 'pictures', 'photos']],
    ['connections', 'Email setup', 'Register and verify your notification email', ['email', 'email setup', 'verify email', 'register email', 'connections', 'verification']],
    ['exits', 'Leaving the team', 'Exit requests', ['exit', 'resignation', 'leaving the team']],
    ['hr', 'People admin', 'Employee administration', ['people admin', 'hr admin', 'employee records', 'manage employees'], hr],
    ['reports', 'Team reports', 'Authorised team reports', ['reports', 'team reports'], reports],
    ['marketing-reports', 'Marketing reports', 'Marketing updates to Harsh', ['reports', 'marketing reports', 'marketing report', 'marketing updates'], founder || department === 'Marketing'],
    ['website-team', 'Website Team editor', 'Public team entries', ['website team', 'website editor', 'team editor'], hr],
    ['founder-updates', 'Founder text updates', 'Company operational summaries', ['founder updates', 'founder text updates', 'company updates', 'company overview', 'operational summary'], founder],
    ['monitor', 'Activity & status', 'Team presence and last heartbeats', ['activity', 'monitor', 'monitoring', 'presence', 'online', 'heartbeat', 'heartbeats', 'heart beat', 'last seen', 'who is online'], founder]
  ].map(([route, label, description, terms, available = true]) => ({route, label, description, terms, available}));
  for (const channel of channels) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channel.id)) continue;
    const terms = [`${channel.name} chat`, `${channel.name} channel`, `channel ${channel.name}`];
    if (channel.id === 'marketing-reports') terms.push('report chat', 'reports chat', 'marketing report chat');
    items.push({route: `channel/${channel.id}`, label: `#${channel.name}`, description: 'Team channel', terms, available: true});
  }
  return items;
}

export function resolveHelperRequest(value, destinations) {
  const query = normaliseRequest(value);
  if (!query) return {type: 'empty', choices: []};
  const contains = phrase => (` ${query} `).includes(` ${normaliseRequest(phrase)} `);
  const heartbeat = ['heartbeat', 'heartbeats', 'heart beat', 'last seen'].some(contains);
  if (heartbeat) {
    const target = destinations.find(item => item.route === 'monitor');
    return target?.available ? {type: 'open', target, focus: 'heartbeat'} : {type: 'denied', message: 'Team heartbeats are available to founders. You can open Attendance to check your own work times.'};
  }
  const scored = destinations.map(target => {
    const phrases = [target.label, ...target.terms];
    const score = Math.max(0, ...phrases.filter(contains).map(phrase => {
      const normal = normaliseRequest(phrase);
      return query === normal ? 1000 : normal.split(' ').length * 20 + Math.min(normal.length, 16);
    }));
    return {target, score};
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return {type: 'unknown', choices: destinations.filter(item => item.available && ['guide', 'tasks', 'attendance', 'connections'].includes(item.route))};
  const best = scored[0].score;
  const choices = scored.filter(item => item.score >= best - 2 && item.target.available).map(item => item.target);
  if (choices.length > 1) return {type: 'choose', choices};
  if (choices.length === 1) return {type: 'open', target: choices[0]};
  return {type: 'denied', message: 'That section is restricted for your role. Choose one of the sections available to you.'};
}
