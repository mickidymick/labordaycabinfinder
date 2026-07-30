import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupabaseUrl } from '../lib/supabaseUrl';

const PROJECT = 'https://ufpwjzsuaryrvestrlml.supabase.co';

test('the RESTful endpoint is reduced to the project URL', () => {
  // This exact value shipped to production once and broke Google sign-in with
  // "No API key found in request".
  assert.equal(normalizeSupabaseUrl(`${PROJECT}/rest/v1/`), PROJECT);
  assert.equal(normalizeSupabaseUrl(`${PROJECT}/rest/v1`), PROJECT);
  assert.equal(normalizeSupabaseUrl(`${PROJECT}/auth/v1`), PROJECT);
});

test('an already-correct URL is left alone', () => {
  assert.equal(normalizeSupabaseUrl(PROJECT), PROJECT);
  assert.equal(normalizeSupabaseUrl(`${PROJECT}/`), PROJECT);
  assert.equal(normalizeSupabaseUrl(`  ${PROJECT}  `), PROJECT);
});

test('empty and unparseable values are handled without throwing', () => {
  assert.equal(normalizeSupabaseUrl(''), '');
  assert.equal(normalizeSupabaseUrl('   '), '');
  // Left as-is so createClient raises its own clearer error.
  assert.equal(normalizeSupabaseUrl('not-a-url/'), 'not-a-url');
});
