import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findViolations } from '../check-hardcoded-colors.mjs';

const rules = (src) => findViolations(src).map((v) => v.match);

test('flags Tailwind palette, black/white, arbitrary and literal colours', () => {
  assert.deepEqual(rules('<div className="bg-yellow-500 hover:text-gray-400 border-zinc-800/50">'), [
    'bg-yellow-500',
    'hover:text-gray-400',
    'border-zinc-800/50',
  ]);
  assert.deepEqual(rules('<p className="text-black dark:bg-white">'), ['text-black', 'dark:bg-white']);
  assert.deepEqual(rules('<div className="bg-[#18231E] text-[rgb(0,0,0)]">'), ['bg-[#18231E]', 'text-[rgb(0,0,0)]']);
  assert.deepEqual(rules("const c = '#D4A359';"), ['#D4A359']);
  assert.deepEqual(rules('.x { color: rgb(1 2 3); }'), ['rgb(1']);
});

test('allows semantic tokens, ids and explicit escapes', () => {
  assert.deepEqual(
    rules('<button className="bg-primary text-primary-foreground hover:bg-primary/90 border-border">'),
    [],
  );
  assert.deepEqual(rules('<span className="bg-success/15 text-success ring-ring">'), []);
  assert.deepEqual(rules("document.getElementById('root'); location.hash === '#details';"), []);
  assert.deepEqual(rules("{ color: '#f8f5ef' }, // pk-allow-color theme-color meta"), []);
  assert.deepEqual(rules('<div className="text-sm bg-muted text-muted-foreground">'), []);
});
