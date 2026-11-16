import {test} from 'node:test';
import assert from 'node:assert/strict';
import {helperDestinations, helperPersonalAnswer, resolveHelperRequest} from '../public/tel-helper-intents.js';

const founder = helperDestinations({role: 'founder', department: 'Leadership', channels: [{id: 'hr', name: 'hr'}, {id: 'marketing-reports', name: 'marketing-reports'}]});
const member = helperDestinations({role: 'employee', department: 'Strategy', channels: [{id: 'general', name: 'general'}]});
test('natural requests open the intended existing section', () => {
  for (const [query, expected] of [['open my tasks', 'tasks'], ['where do I clock in', 'attendance'], ['please register my email', 'connections'], ['show HR tickets', 'grievances'], ['open report chat', 'channel/marketing-reports'], ['HR chat', 'channel/hr'], ['show the company overview', 'founder-updates']]) {
    const result = resolveHelperRequest(query, founder);
    assert.equal(result.type, 'open', query);
    assert.equal(result.target.route, expected, query);
  }
  const heartbeat = resolveHelperRequest('show the last heartbeat for Tani', founder);
  assert.equal(heartbeat.target.route, 'monitor');
  assert.equal(heartbeat.focus, 'heartbeat');
});
test('the helper respects roles and only exposes provided accessible channels', () => {
  for (const query of ['last heartbeat', 'founder updates', 'people admin']) assert.equal(resolveHelperRequest(query, member).type, 'denied');
  assert.equal(member.some(item => item.route === 'channel/hr'), false);
  assert.equal(resolveHelperRequest('open general chat', member).target.route, 'channel/general');
  const malicious = helperDestinations({role: 'employee', channels: [{id: 'https://example.com', name: 'outside'}]});
  assert.equal(malicious.some(item => item.route.startsWith('channel/')), false);
});
test('ambiguous or unrecognised requests do not guess a destination', () => {
  const ambiguous = resolveHelperRequest('reports', founder);
  assert.equal(ambiguous.type, 'choose');
  assert.deepEqual(ambiguous.choices.map(item => item.route).sort(), ['marketing-reports', 'reports']);
  assert.equal(resolveHelperRequest('purple elephant', founder).type, 'unknown');
  assert.equal(resolveHelperRequest('', founder).type, 'empty');
});

test('personal questions use supported summaries while explicit routes keep navigation', () => {
  for (const [query, topic] of [['What are my tasks?', 'tasks'], ['What are my upcoming meetings?', 'meetings'], ['What is my work status?', 'status'], ['Am I clocked in?', 'status'], ['How many hours have I worked today?', 'status']]) {
    const result = resolveHelperRequest(query, member);
    assert.equal(result.type, 'answer', query);
    assert.equal(result.topic, topic, query);
  }
  for (const [query, destination] of [['open announcements', 'announcements'], ['open calendar', 'calendar'], ['Contact HR', 'grievances'], ['open my tasks', 'tasks']]) {
    assert.equal(resolveHelperRequest(query, member).target.route, destination);
  }
  assert.equal(resolveHelperRequest('my tasks and meetings', member).type, 'choose');
  assert.equal(resolveHelperRequest('tasks or calendar', member).type, 'choose');
  assert.equal(resolveHelperRequest('status', member).type, 'choose');
  assert.match(resolveHelperRequest('how do I submit a task?', member).message, /Submit deliverable/);
  assert.match(resolveHelperRequest('how can I contact HR?', member).message, /I do not read HR tickets/);
});

test('TeMark aliases retain the actual accessible channel and report role restrictions', () => {
  const marketing = helperDestinations({role: 'employee', department: 'Marketing', channels: [{id: 'marketing', name: 'marketing'}]});
  assert.equal(resolveHelperRequest('TeMark chat', marketing).target.route, 'channel/marketing');
  assert.equal(resolveHelperRequest('marketing chat', marketing).target.route, 'channel/marketing');
  assert.equal(resolveHelperRequest('TeMark reports', marketing).target.route, 'marketing-reports');
  assert.equal(resolveHelperRequest('TeMark reports', member).type, 'denied');
  assert.equal(marketing.find(item => item.route === 'channel/marketing').label, '#TeMark');
  const board = helperDestinations({role: 'employee', channels: [{id: 'announcements', name: 'announcements'}]});
  assert.equal(resolveHelperRequest('open announcements', board).target.route, 'announcements');
  assert.equal(resolveHelperRequest('announcements chat', board).target.route, 'channel/announcements');
});

test('personal summaries filter broad role feeds and omit private record contents', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const data = {tasks: [
    {title: '<img src=x onerror=alert(1)>', assignee_id: 'me', status: 'working', deadline: '2026-11-18', description: 'PRIVATE DESCRIPTION', submission: 'PRIVATE SUBMISSION'},
    {title: 'Other person', assignee_id: 'other', status: 'todo', deadline: '2026-11-16'},
    {title: 'Completed', assignee_id: 'me', status: 'done', deadline: '2026-11-16'}
  ]};
  const answer = helperPersonalAnswer('tasks', data, 'me', now);
  assert.match(answer.text, /^1 active assignment/);
  assert.match(answer.lines[0], /<img src=x onerror=alert\(1\)>/);
  assert.match(answer.checked, /16 Nov 2026.*IST/);
  assert.doesNotMatch(JSON.stringify(answer), /PRIVATE|Other person|Completed/);
  const meeting = helperPersonalAnswer('meetings', {meetings: [
    {title: 'Mine', starts_at: '2026-11-17T10:00:00Z', participants: ['me'], purpose: 'PRIVATE PURPOSE'},
    {title: 'Organised', starts_at: '2026-11-18T10:00:00Z', participants: [], created_by: 'me'},
    {title: 'Other', starts_at: '2026-11-16T11:00:00Z', participants: ['other']},
    {title: 'Past', starts_at: '2026-11-15T10:00:00Z', participants: ['me']}
  ]}, 'me', now);
  assert.equal(meeting.lines.length, 2);
  assert.doesNotMatch(JSON.stringify(meeting), /PRIVATE|Other|Past/);
  assert.match(helperPersonalAnswer('tasks', {tasks: []}, 'me', now).text, /no active assignments/);
  assert.match(helperPersonalAnswer('meetings', {meetings: []}, 'me', now).text, /No upcoming meetings/);
});

test('work status uses current personal attendance and IST date without inventing a session', () => {
  const now = new Date('2026-11-16T20:00:00Z'); // 17 November in IST.
  const answer = helperPersonalAnswer('status', {attendance: {current: {user_id: 'me', state: 'break'}, attendance: [
    {user_id: 'me', work_date: '2026-11-17', active_seconds: 3660},
    {user_id: 'me', work_date: '2026-11-16', active_seconds: 8000},
    {user_id: 'other', work_date: '2026-11-17', active_seconds: 8000}
  ]}}, 'me', now);
  assert.match(answer.text, /on a break/);
  assert.match(answer.lines[0], /1h 1m.*17 Nov 2026/);
  assert.match(helperPersonalAnswer('status', {attendance: {attendance: []}}, 'me', now).text, /not clocked in today/);
  assert.throws(() => helperPersonalAnswer('private-ticket', {}, 'me', now), /Unsupported/);
});
