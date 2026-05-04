import { describe, it, expect, vi, afterEach } from 'vitest';
import { TxLimitExceededError } from '../../src/errors/tx-limit-exceeded-error.js';
import { StarsPayClient } from '../../src/client/starspay-client.js';

describe('TxLimitExceededError', () => {
  it('sets code, tier, txCount, txLimit, name', () => {
    const err = new TxLimitExceededError('free', 5, 5);
    expect(err.code).toBe('tx_limit_exceeded');
    expect(err.tier).toBe('free');
    expect(err.txCount).toBe(5);
    expect(err.txLimit).toBe(5);
    expect(err.name).toBe('TxLimitExceededError');
    expect(err).toBeInstanceOf(Error);
  });

  it('message mentions tier and counts', () => {
    const err = new TxLimitExceededError('starter', 250, 250);
    expect(err.message).toContain('starter');
    expect(err.message).toContain('250');
  });
});

describe('StarsPayClient.createInvoiceLink — 402 parsing', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('throws TxLimitExceededError for 402 tx_limit_exceeded body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'tx_limit_exceeded', tier: 'free', tx_count: 5, tx_limit: 5 }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new StarsPayClient({ apiKey: 'sp_pub_test', apiUrl: 'https://localhost:4000' });
    await expect(
      client.createInvoiceLink({ priceId: 'p1', telegramUserId: 42 }),
    ).rejects.toMatchObject({
      code: 'tx_limit_exceeded',
      tier: 'free',
      txCount: 5,
      txLimit: 5,
    });
  });

  it('does NOT wrap unrelated 402 errors as TxLimitExceededError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'other' }), { status: 402, headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new StarsPayClient({ apiKey: 'sp_pub_test', apiUrl: 'https://localhost:4000' });
    const promise = client.createInvoiceLink({ priceId: 'p1', telegramUserId: 42 });
    await expect(promise).rejects.not.toBeInstanceOf(TxLimitExceededError);
  });
});
