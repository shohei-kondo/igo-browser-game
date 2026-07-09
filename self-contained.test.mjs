import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index.html is self-contained for GitHub Pages', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /import\s+.*from\s+['"]/);
  assert.match(html, /<style>/i);
  assert.match(html, /<script>/i);
  assert.match(html, /class GoGame/);

  const script = html.match(/<script>([\s\S]*)<\/script>/i)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});
