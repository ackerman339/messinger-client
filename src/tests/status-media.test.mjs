import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const mobile = existsSync(new URL('../components/statuses-panel.tsx', import.meta.url));
const source = readFileSync(new URL('../services/statuses.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
});
const path = '/statuses/status-id/media/content';
const signed = 'https://example.invalid/media';

function fixture(contentPath, failure) {
  const calls = [];
  const result = { url: signed, contentPath };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (name) => {
      if (name === 'axios') return { isAxiosError: (error) => error?.isAxiosError === true };
      if (name.endsWith('/token-storage')) {
        return { tokenStorage: { getAccessToken: async () => 'access-token' } };
      }
      if (name.endsWith('/clients/http-client')) {
        return {
          httpClient: {
            get: async (route, options) => {
              calls.push({ route, options });
              if (calls.length === 1 && failure) throw failure;
              return { data: { result } };
            },
            getUri: ({ url }) => `https://api.example.invalid/api/V1${url}`,
          },
        };
      }
      throw new Error('Unknown dependency ' + name);
    },
    module,
    module.exports,
  );
  return { statusService: module.exports.statusService, calls };
}

test('loading status media retries a timeout and opens the authenticated stream', async () => {
  const failure = { isAxiosError: true, code: 'ECONNABORTED' };
  const { statusService, calls } = fixture(path, failure);
  const signal = new AbortController().signal;
  const media = await statusService.getMedia('status-id', signal);
  assert.deepEqual(
    calls,
    Array(2).fill({
      route: '/statuses/status-id/media',
      options: { signal, timeout: 30_000 },
    }),
  );
  assert.equal(media.uri, 'https://api.example.invalid/api/V1' + path);
  assert.deepEqual(
    mobile ? media.headers : media.requiresCredentials,
    mobile ? { Authorization: 'Bearer access-token' } : true,
  );
});

test('legacy download URLs do not receive API credentials', async () => {
  const { statusService, calls } = fixture('https://unrelated.example.invalid/media');
  assert.deepEqual(await statusService.getMedia('status-id', new AbortController().signal), {
    uri: signed,
  });
  assert.equal(calls.length, 1);
});

test('status media does not retry access failures', async () => {
  const forbidden = { isAxiosError: true, response: { status: 403 } };
  const { statusService, calls } = fixture(path, forbidden);
  await assert.rejects(
    statusService.getMedia('status-id', new AbortController().signal),
    (error) => error === forbidden,
  );
  assert.equal(calls.length, 1);
});
