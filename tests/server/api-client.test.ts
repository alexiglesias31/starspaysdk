import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StarsPayApiClient, StarsPayApiError } from '../../src/server/api-client';

describe('StarsPayApiClient', () => {
  let client: StarsPayApiClient;
  const API_KEY = 'sp_test_key_123';

  beforeEach(() => {
    client = new StarsPayApiClient(API_KEY);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOkResponse(data: unknown) {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200 })
    );
  }

  function mockErrorResponse(status: number, statusText = 'Error') {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{}', { status, statusText })
    );
  }

  function lastCallUrl(): string {
    return vi.mocked(fetch).mock.calls[0][0] as string;
  }

  function lastCallOptions(): RequestInit {
    return vi.mocked(fetch).mock.calls[0][1] as RequestInit;
  }

  function lastCallBody(): unknown {
    return JSON.parse(lastCallOptions().body as string);
  }

  describe('constructor', () => {
    it('should use default API URL', () => {
      mockOkResponse({ products: [] });
      client.listProducts();
      expect(lastCallUrl()).toContain('https://api.starspay.dev');
    });

    it('should use custom API URL', async () => {
      const customClient = new StarsPayApiClient(API_KEY, 'https://custom.api.com');
      mockOkResponse({ products: [] });
      await customClient.listProducts();
      expect(lastCallUrl()).toContain('https://custom.api.com');
    });

    it('should reject publishable keys in the server client', () => {
      expect(() => new StarsPayApiClient('sp_pub_123')).toThrow(
        'server SDK requires a server API key'
      );
    });
  });

  describe('auth headers', () => {
    it('should include Bearer token in Authorization header', async () => {
      mockOkResponse({ products: [] });
      await client.listProducts();
      const headers = lastCallOptions().headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('reportPayment', () => {
    const paymentData = {
      telegram_user_id: 12345,
      telegram_username: 'testuser',
      telegram_first_name: 'Test',
      payment_type: 'one_time',
      amount: 100,
      currency: 'XTR',
      telegram_payment_charge_id: 'charge_123',
      provider_payment_charge_id: 'provider_123',
      invoice_payload: 'product:premium',
    };

    it('should POST to /v1/payments/report', async () => {
      const responseData = { payment: { id: 'pay_1' } };
      mockOkResponse(responseData);

      const result = await client.reportPayment(paymentData);

      expect(result).toEqual(responseData);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/payments/report');
      expect(lastCallOptions().method).toBe('POST');
      expect(lastCallBody()).toEqual(paymentData);
    });

    it('should throw StarsPayApiError on error response', async () => {
      mockErrorResponse(500, 'Internal Server Error');
      await expect(client.reportPayment(paymentData)).rejects.toThrow(StarsPayApiError);
    });

    it('should include optional fields when provided', async () => {
      const dataWithOptionals = {
        ...paymentData,
        subscription_expiration_date: 1700000000,
        is_recurring: true,
        is_first_recurring: true,
      };
      mockOkResponse({ payment: { id: 'pay_1' } });
      await client.reportPayment(dataWithOptionals);
      expect(lastCallBody()).toEqual(dataWithOptionals);
    });
  });

  describe('isActive', () => {
    it('should GET /v1/subscriptions/active/{userId}', async () => {
      mockOkResponse({ active: true, subscription: { id: 'sub_1', status: 'active' } });
      const result = await client.isActive(12345);

      expect(result.active).toBe(true);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/subscriptions/active/12345');
      expect(lastCallOptions().method).toBe('GET');
    });

    it('should return inactive status', async () => {
      mockOkResponse({ active: false, subscription: null });
      const result = await client.isActive(99999);
      expect(result.active).toBe(false);
    });

    it('should throw on error', async () => {
      mockErrorResponse(401, 'Unauthorized');
      await expect(client.isActive(12345)).rejects.toThrow(StarsPayApiError);
    });
  });

  describe('getSubscriptions', () => {
    it('should GET /v1/subscriptions/user/{userId}', async () => {
      const subs = { subscriptions: [{ id: 'sub_1' }, { id: 'sub_2' }] };
      mockOkResponse(subs);
      const result = await client.getSubscriptions(12345);

      expect(result.subscriptions).toHaveLength(2);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/subscriptions/user/12345');
    });

    it('should throw on 403', async () => {
      mockErrorResponse(403, 'Forbidden');
      await expect(client.getSubscriptions(12345)).rejects.toThrow('API error: 403');
    });
  });

  describe('createProduct', () => {
    it('should POST to /v1/products', async () => {
      const productData = { name: 'Premium', type: 'subscription' as const };
      mockOkResponse({ id: 'prod_1', ...productData });
      const result = await client.createProduct(productData);

      expect(result).toEqual({ id: 'prod_1', ...productData });
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/products');
      expect(lastCallOptions().method).toBe('POST');
      expect(lastCallBody()).toEqual(productData);
    });

    it('should throw on 422', async () => {
      mockErrorResponse(422, 'Unprocessable Entity');
      await expect(client.createProduct({ name: '' })).rejects.toThrow(StarsPayApiError);
    });
  });

  describe('listProducts', () => {
    it('should GET /v1/products', async () => {
      mockOkResponse({ products: [{ id: 'prod_1' }] });
      const result = await client.listProducts();

      expect(result.products).toHaveLength(1);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/products');
    });

    it('should handle empty list', async () => {
      mockOkResponse({ products: [] });
      const result = await client.listProducts();
      expect(result.products).toHaveLength(0);
    });

    it('should throw on 500', async () => {
      mockErrorResponse(500, 'Internal Server Error');
      await expect(client.listProducts()).rejects.toThrow(StarsPayApiError);
    });
  });

  describe('createPrice', () => {
    it('should POST to /v1/prices', async () => {
      const priceData = { product_id: 'prod_1', amount: 100, period: 2592000 };
      mockOkResponse({ id: 'price_1', ...priceData });
      const result = await client.createPrice(priceData);

      expect(result).toEqual({ id: 'price_1', ...priceData });
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/prices');
      expect(lastCallOptions().method).toBe('POST');
    });

    it('should throw on 400', async () => {
      mockErrorResponse(400, 'Bad Request');
      await expect(client.createPrice({})).rejects.toThrow(StarsPayApiError);
    });
  });

  describe('listPrices', () => {
    it('should GET /v1/prices with product_id query param', async () => {
      mockOkResponse({ prices: [{ id: 'price_1', amount: 100 }] });
      const result = await client.listPrices('prod_1');

      expect(result.prices).toHaveLength(1);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/prices?product_id=prod_1');
    });

    it('should handle empty prices list', async () => {
      mockOkResponse({ prices: [] });
      const result = await client.listPrices('prod_nonexistent');
      expect(result.prices).toHaveLength(0);
    });

    it('should throw on 404', async () => {
      mockErrorResponse(404, 'Not Found');
      await expect(client.listPrices('bad_id')).rejects.toThrow(StarsPayApiError);
    });
  });

  describe('getPrice', () => {
    it('should GET /v1/prices/{priceId}', async () => {
      const responseData = {
        price: { id: 'price_1', amount: 100 },
        product: { id: 'prod_1', name: 'Premium' },
      };
      mockOkResponse(responseData);
      const result = await client.getPrice('price_1');

      expect(result.price.id).toBe('price_1');
      expect(result.product.id).toBe('prod_1');
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/prices/price_1');
    });

    it('should throw on 404', async () => {
      mockErrorResponse(404, 'Not Found');
      await expect(client.getPrice('bad_id')).rejects.toThrow('API error: 404');
    });
  });

  describe('getCustomer', () => {
    it('should GET /v1/customers/{userId}', async () => {
      const customer = { id: 'cust_1', telegram_user_id: 12345 };
      mockOkResponse(customer);
      const result = await client.getCustomer(12345);

      expect(result).toEqual(customer);
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/customers/12345');
    });

    it('should return null on 404 error', async () => {
      mockErrorResponse(404, 'Not Found');
      const result = await client.getCustomer(99999);
      expect(result).toBeNull();
    });

    it('should rethrow non-404 errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      await expect(client.getCustomer(12345)).rejects.toThrow('network error');
    });
  });

  describe('reportPreCheckout', () => {
    const preCheckoutData = {
      id: 'pcq_123',
      from: { id: 12345 },
      currency: 'XTR',
      total_amount: 100,
      invoice_payload: 'product:premium',
      is_recurring: false,
      is_first_recurring: false,
    };

    it('should POST to /v1/webhooks/pre-checkout', async () => {
      mockOkResponse({ ok: true, allowed: true, reason: null });
      const result = await client.reportPreCheckout(preCheckoutData);

      expect(result).toEqual({ ok: true, allowed: true, reason: null });
      expect(lastCallUrl()).toBe('https://api.starspay.dev/v1/webhooks/pre-checkout');
      expect(lastCallOptions().method).toBe('POST');
      expect(lastCallBody()).toEqual(preCheckoutData);
      expect(lastCallOptions().signal).toBeInstanceOf(AbortSignal);
    });

    it('should return backend validation details', async () => {
      mockOkResponse({ ok: true, allowed: false, reason: 'Billing limit reached. Upgrade required.' });
      const result = await client.reportPreCheckout(preCheckoutData);
      expect(result).toEqual({
        ok: true,
        allowed: false,
        reason: 'Billing limit reached. Upgrade required.',
      });
    });

    it('should throw on error', async () => {
      mockErrorResponse(500, 'Internal Server Error');
      await expect(client.reportPreCheckout(preCheckoutData)).rejects.toThrow(StarsPayApiError);
    });
  });
});

describe('StarsPayApiError', () => {
  it('should extend Error', () => {
    const error = new StarsPayApiError('test error', 400);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name StarsPayApiError', () => {
    const error = new StarsPayApiError('test', 400);
    expect(error.name).toBe('StarsPayApiError');
  });

  it('should store statusCode', () => {
    const error = new StarsPayApiError('test', 422);
    expect(error.statusCode).toBe(422);
  });

  it('should store message', () => {
    const error = new StarsPayApiError('Something went wrong', 500);
    expect(error.message).toBe('Something went wrong');
  });
});
