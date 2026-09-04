import { describe, expect, it } from 'vitest';
import { ApiError, call } from './api';
import { fakeIo, json } from './test/fake-io';

const config = { url: 'https://b', clientId: 'id', clientSecret: 'sec' };

describe('call', () => {
  it('sends the service token headers and JSON bodies', async () => {
    const fake = fakeIo({ responses: [json(201, { ok: 1 })] });
    const res = await call(fake.io, config, {
      method: 'POST',
      path: '/api/x',
      body: { a: 1 },
      timeoutMs: 1234,
    });
    expect(res).toEqual({ ok: 1 });
    expect(fake.requests).toEqual([
      {
        url: 'https://b/api/x',
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'CF-Access-Client-Id': 'id',
            'CF-Access-Client-Secret': 'sec',
          },
          body: '{"a":1}',
          timeoutMs: 1234,
        },
      },
    ]);
  });
  it('omits the token headers unless both halves are present, and the body on GET', async () => {
    const fake = fakeIo({ responses: [json(200, {}), json(200, {})] });
    await call(
      fake.io,
      { ...config, clientSecret: null },
      { method: 'GET', path: '/api/ping', timeoutMs: 1 },
    );
    await call(
      fake.io,
      { ...config, clientId: null },
      { method: 'GET', path: '/api/ping', timeoutMs: 1 },
    );
    for (const r of fake.requests) {
      expect(r.init.headers).toEqual({ 'content-type': 'application/json' });
      expect(r.init.body).toBeUndefined();
    }
  });
  it('names a login page for what it is', async () => {
    const fake = fakeIo({ responses: [{ status: 200, body: '\n<!DOCTYPE html><html>' }] });
    await expect(
      call(fake.io, config, { method: 'GET', path: '/p', timeoutMs: 1 }),
    ).rejects.toMatchObject({
      status: 200,
      message: 'the server answered with a page, not JSON — is the Access token set?',
    });
  });

  it('turns non-2xx answers into ApiError with the server reason', async () => {
    const fake = fakeIo({
      responses: [
        json(404, { error: 'agent not found' }),
        { status: 502, body: 'bad gateway' },
        json(500, { error: 5 }),
        json(400, 'str'),
        { status: 199, body: 'null' },
        { status: 300, body: '5' },
        json(422, { error: 'said so' }),
      ],
    });
    const failure = async () => {
      try {
        await call(fake.io, config, { method: 'GET', path: '/p', timeoutMs: 1 });
      } catch (err) {
        return err as ApiError;
      }
      return null;
    };
    expect(await failure()).toMatchObject({ status: 404, message: 'agent not found' });
    expect(await failure()).toMatchObject({ status: 502, message: 'HTTP 502' });
    expect(await failure()).toMatchObject({ status: 500, message: 'HTTP 500' });
    expect(await failure()).toMatchObject({ status: 400, message: 'HTTP 400' });
    expect(await failure()).toMatchObject({ status: 199, message: 'HTTP 199' });
    expect(await failure()).toMatchObject({ status: 300, message: 'HTTP 300' });
    const said = await failure();
    expect(said).toBeInstanceOf(ApiError);
    expect(said).toMatchObject({ status: 422, message: 'said so' });
  });
});
