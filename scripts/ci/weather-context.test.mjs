import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const modules = new Map();
async function loadTs(path) {
  if (modules.has(path)) return modules.get(path);
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const specifier of [...code.matchAll(/from ["']([^"']+\.ts)["']/g)].map(x => x[1])) {
    const child = new URL(specifier, new URL(path, import.meta.url));
    const relative = child.href;
    const loaded = await loadTs(relative);
    code = code.replaceAll(specifier, loaded.url);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const result = { url, module: await import(url) }; modules.set(path, result); return result;
}
const { WeatherKitService, signWeatherKitToken } = (await loadTs('../../supabase/functions/_shared/weatherkit.ts')).module;
const { createWeatherHandler } = (await loadTs('../../supabase/functions/_shared/weather-handler.ts')).module;
const { parseWeatherContext, weatherConditionLabel, appleWeatherUrl } = (await loadTs('../../packages/shared/src/weather-context.ts')).module;
const { cityCenterFor } = (await loadTs('../../packages/shared/src/city-centers.ts')).module;

const now = Date.parse('2026-11-05T10:15:00Z');
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
const credentials = { teamId: 'ABCDEFGHIJ', keyId: '0123456789', serviceId: 'ch.example.weather',
  privateKey: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----` };
const stamp = x => new Date(x).toISOString();
function fixture(at = now) {
  const metadata = { readTime: stamp(at - 60_000), expireTime: stamp(at + 30 * 60_000), attributionURL: 'https://developer.apple.com/weatherkit/data-source-attribution/' };
  return { currentWeather: { asOf: stamp(at - 120_000), temperature: 12, conditionCode: 'Cloudy', windSpeed: 10, metadata },
    forecastHourly: { metadata, hours: Array.from({ length: 169 }, (_, i) => ({ forecastStart: stamp(Math.floor(at / 3_600_000) * 3_600_000 + i * 3_600_000), temperature: 18, conditionCode: 'Rain', precipitationChance: 0.8, windSpeed: 12 })) } };
}
function provider(data = fixture()) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json(String(url).includes('/attribution/') ? { 'logoDark@2x': '/images/Weather-dark@2x.png' } : data);
  };
  return { service: new WeatherKitService(credentials, fetcher), requests };
}

test('WeatherKit token uses the exact Apple claims and a valid short-lived ES256 signature', async () => {
  const token = await signWeatherKitToken(credentials, now), [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: credentials.keyId, id: `${credentials.teamId}.${credentials.serviceId}` });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iss: credentials.teamId, iat: now / 1000, exp: now / 1000 + 300, sub: credentials.serviceId });
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`)), true);
});
test('city-centre lookup preserves existing locations and rejects unknown/prototype names', () => {
  assert.deepEqual(cityCenterFor(' Basel '), { latitude: 47.5596, longitude: 7.5886 });
  assert.equal(cityCenterFor('Unbekannter Ort'), null); assert.equal(cityCenterFor('__proto__'), null);
});
test('current weather is validated, attributed and requested for the selected city only', async () => {
  const { service, requests } = provider(), result = await service.get('Zürich', undefined, now);
  assert.equal(result.state, 'KNOWN'); assert.equal(result.city, 'Zürich'); assert.equal(result.observation.temperatureC, 12);
  assert.equal(result.observation.kind, 'current'); assert.equal(result.attribution.name, 'Apple Weather');
  assert.equal(requests.length, 2);
  const request = new URL(requests[0].url);
  assert.match(request.pathname, /47\.3769\/8\.5417$/); assert.equal(request.searchParams.get('timezone'), 'Europe/Zurich');
  assert.equal(request.searchParams.get('dataSets'), 'currentWeather,forecastHourly');
  assert.equal(request.searchParams.has('userId'), false); assert.match(requests[0].options.headers.authorization, /^Bearer /);
});
test('tomorrow uses its hourly forecast rather than current conditions', async () => {
  const { service } = provider(), result = await service.get('Basel', stamp(now + 86_400_000), now);
  assert.equal(result.state, 'KNOWN'); assert.equal(result.observation.kind, 'forecast');
  assert.equal(result.observation.temperatureC, 18); assert.equal(result.observation.precipitationChance, 0.8);
  assert.equal(result.targetTime, stamp(now + 86_400_000));
});
test('summer-time overlap is matched using absolute instants', async () => {
  const start = Date.parse('2026-10-25T00:15:00Z'), { service } = provider(fixture(start));
  const result = await service.get('Basel', '2026-10-25T02:30:00+01:00', start);
  assert.equal(result.state, 'KNOWN'); assert.equal(result.observation.time, '2026-10-25T01:00:00.000Z');
});
test('missing configuration and unsupported cities never call Apple or invent a Basel forecast', async () => {
  let called = false; const service = new WeatherKitService(null, async () => { called = true; throw Error('must not call'); });
  assert.equal((await service.get('Basel', undefined, now)).reason, 'NOT_CONFIGURED');
  assert.equal((await service.get('Unknown', undefined, now)).reason, 'UNSUPPORTED_CITY'); assert.equal(called, false);
});
test('dates outside the seven-day window do not call the provider', async () => {
  const { service, requests } = provider();
  for (const at of ['invalid', stamp(now - 86_400_000), stamp(now + 8 * 86_400_000)]) assert.equal((await service.get('Basel', at, now)).reason, 'OUTSIDE_FORECAST');
  assert.equal(requests.length, 0);
});
test('concurrent requests share a bounded temporary cache, which refreshes after expiry', async () => {
  const { service, requests } = provider();
  const results = await Promise.all([service.get('Basel', undefined, now), service.get('Basel', undefined, now)]);
  assert.ok(results.every(x => x.state === 'KNOWN')); assert.equal(requests.length, 2);
  assert.equal((await service.get('Basel', undefined, now + 6 * 60_000)).state, 'KNOWN'); assert.equal(requests.length, 2);
  await service.get('Basel', undefined, now + 11 * 60_000); assert.equal(requests.length, 4);
});
test('provider expiry refreshes the cache before the general ten-minute maximum', async () => {
  const data = fixture(); data.currentWeather.metadata.expireTime = stamp(now + 60_000);
  const { service, requests } = provider(data);
  assert.equal((await service.get('Basel', undefined, now)).state, 'KNOWN');
  assert.equal((await service.get('Basel', undefined, now + 61_000)).state, 'UNKNOWN');
  assert.equal(requests.length, 4);
});
test('provider failure, expired metadata and unsafe attribution remain honestly unknown', async () => {
  const failed = new WeatherKitService(credentials, async () => new Response('denied', { status: 403 }));
  assert.equal((await failed.get('Basel', undefined, now)).state, 'UNKNOWN');
  const data = fixture(); data.forecastHourly.metadata.expireTime = stamp(now - 1);
  assert.equal((await provider(data).service.get('Basel', undefined, now)).state, 'UNKNOWN');
  const unavailable = fixture(); unavailable.currentWeather.metadata.temporarilyUnavailable = true;
  assert.equal((await provider(unavailable).service.get('Basel', undefined, now)).state, 'UNKNOWN');
  const unsafe = new WeatherKitService(credentials, async url => Response.json(String(url).includes('/attribution/') ? { 'logoDark@2x': 'https://evil.example/logo.png' } : fixture()));
  assert.equal((await unsafe.get('Basel', undefined, now)).state, 'UNKNOWN');
});
test('client rejects expired, mismatched and malformed server values', async () => {
  assert.equal(appleWeatherUrl('https://developer.apple.com/weatherkit/data-source-attribution/'), true);
  assert.equal(appleWeatherUrl('https://developer.apple.com/unrelated/'), false);
  assert.equal(appleWeatherUrl('https://developer.apple.com/weatherkit/data-source-attribution/?redirect=evil'), false);
  const result = await provider().service.get('Basel', undefined, now); assert.equal(result.state, 'KNOWN');
  assert.equal(parseWeatherContext(result, 'Bern', now), null);
  assert.equal(parseWeatherContext(result, 'Basel', now + 11 * 60_000), null);
  assert.equal(parseWeatherContext({ ...result, observation: { ...result.observation, temperatureC: null } }, 'Basel', now), null);
  assert.equal(weatherConditionLabel('Unrecognised'), 'Wetterlage nicht näher beschrieben');
});
test('authentication and method failures cannot reach the provider', async () => {
  let providerCalls = 0;
  const handler = createWeatherHandler({ actorForToken: async () => null, consume: async () => 'ALLOWED', weather: async () => { providerCalls++; throw Error('must not call'); } });
  assert.equal((await handler(new Request('https://example.invalid', { method: 'GET' }))).status, 405);
  assert.equal((await handler(new Request('https://example.invalid', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await handler(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer invalid' }, body: '{}' }))).status, 401);
  assert.equal(providerCalls, 0);
});
test('only verified actors are metered; spoofed IDs, oversized bodies and offset-free times are rejected', async () => {
  const actors = []; let providerCalls = 0;
  const handler = createWeatherHandler({ actorForToken: async () => 'verified-account', consume: async actor => { actors.push(actor); return 'ALLOWED'; }, weather: async () => { providerCalls++; return { version: 'backyrd.weather@1', state: 'UNKNOWN', reason: 'NOT_CONFIGURED' }; } });
  const request = body => handler(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer valid' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  for (const body of [{ city: 'Basel', actor: 'another-account' }, { city: 'Basel', at: '2026-11-05T12:00:00' }, 'x'.repeat(513)]) assert.equal((await request(body)).status, 400);
  assert.equal((await request({ city: 'Basel' })).status, 200); assert.deepEqual(actors, ['verified-account']); assert.equal(providerCalls, 1);
});
test('cost-boundary and authentication outages fail closed with recoverable responses', async () => {
  for (const [boundary, status] of [['LIMITED', 429], ['UNAVAILABLE', 503]]) {
    const handler = createWeatherHandler({ actorForToken: async () => 'verified', consume: async () => boundary, weather: async () => { throw Error('must not call'); } });
    assert.equal((await handler(new Request('https://example.invalid', { method: 'POST', headers: { authorization: 'Bearer valid' }, body: '{"city":"Basel"}' }))).status, status);
  }
});
