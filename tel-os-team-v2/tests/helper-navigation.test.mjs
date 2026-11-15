import {test} from 'node:test';
import assert from 'node:assert/strict';
import {helperDestinations, resolveHelperRequest} from '../public/tel-helper-intents.js';

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
