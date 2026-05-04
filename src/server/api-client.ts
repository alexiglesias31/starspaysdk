import type { Payment, Product, Price, Customer, CreateProductParams, CreatePriceParams } from '../types/payment.js';
import type { Subscription } from '../types/subscription.js';

const DEFAULT_API_URL = 'https://api.starspay.dev';

function assertValidTelegramId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`StarsPay: invalid Telegram user ID: ${id}`);
  }
}

/** Error thrown when the StarsPay API returns a non-OK response. */
export class StarsPayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'StarsPayApiError';
  }
}

/**
 * HTTP client for communicating with the StarsPay backend (Supabase Edge Functions).
 * Used by the SDK middleware to report payment events and query subscription state.
 */
export class StarsPayApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, apiUrl?: string) {
    if (!apiKey) {
      throw new Error('StarsPay: apiKey is required');
    }
    if (!apiKey.startsWith('sp_live_') && !apiKey.startsWith('sp_test_')) {
      throw new Error(
        'StarsPay: server SDK requires a server API key with the "sp_live_" or "sp_test_" prefix.'
      );
    }

    const resolvedUrl = apiUrl || DEFAULT_API_URL;

    // Enforce HTTPS to prevent credential leakage over plaintext
    if (resolvedUrl.startsWith('http://')) {
      const hostname = new URL(resolvedUrl).hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
        throw new Error('StarsPay: apiUrl must use HTTPS in production');
      }
    }

    this.apiKey = apiKey;
    this.apiUrl = resolvedUrl;
  }

  /** Report a payment event to the StarsPay backend */
  async reportPayment(data: {
    telegram_user_id: number;
    telegram_username?: string | null;
    telegram_first_name?: string | null;
    payment_type: string;
    amount: number;
    currency: string;
    telegram_payment_charge_id: string;
    provider_payment_charge_id: string;
    invoice_payload: string;
    subscription_expiration_date?: number | null;
    is_recurring?: boolean;
    is_first_recurring?: boolean;
  }): Promise<{ payment: Payment; subscription?: Subscription }> {
    assertValidTelegramId(data.telegram_user_id);
    return this.post('/v1/payments/report', data);
  }

  /** Check if a user has an active subscription */
  async isActive(telegramUserId: number): Promise<{ active: boolean; subscription?: Subscription }> {
    assertValidTelegramId(telegramUserId);
    return this.get(`/v1/subscriptions/active/${telegramUserId}`);
  }

  /** Get all subscriptions for a user */
  async getSubscriptions(telegramUserId: number): Promise<{ subscriptions: Subscription[] }> {
    assertValidTelegramId(telegramUserId);
    return this.get(`/v1/subscriptions/user/${telegramUserId}`);
  }

  /** Create a product */
  async createProduct(data: CreateProductParams): Promise<Product> {
    return this.post('/v1/products', data);
  }

  /** List products */
  async listProducts(): Promise<{ products: Product[] }> {
    return this.get('/v1/products');
  }

  /** Create a price for a product */
  async createPrice(data: CreatePriceParams): Promise<Price> {
    return this.post('/v1/prices', data);
  }

  /** List prices for a product */
  async listPrices(productId: string): Promise<{ prices: Price[] }> {
    return this.get(`/v1/prices?product_id=${encodeURIComponent(productId)}`);
  }

  /** Get a specific price with its associated product */
  async getPrice(priceId: string): Promise<{ price: Price; product: Product }> {
    return this.get(`/v1/prices/${encodeURIComponent(priceId)}`);
  }

  /** Get customer by Telegram user ID. Returns null if the customer does not exist (404). */
  async getCustomer(telegramUserId: number): Promise<Customer | null> {
    assertValidTelegramId(telegramUserId);
    try {
      return await this.get(`/v1/customers/${telegramUserId}`);
    } catch (error) {
      if (error instanceof StarsPayApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /** Report a pre_checkout_query for logging */
  async reportPreCheckout(data: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
    shipping_option_id?: string;
    order_info?: Record<string, unknown>;
    is_recurring?: boolean;
    is_first_recurring?: boolean;
  }): Promise<{ ok: boolean; allowed: boolean; reason?: string | null }> {
    return this.post('/v1/webhooks/pre-checkout', data, { timeoutMs: 2_000 });
  }

  /** Report a refund event to the StarsPay backend */
  async reportRefund(data: {
    telegram_user_id: number;
    telegram_payment_charge_id: string;
    amount: number;
    invoice_payload: string;
  }): Promise<void> {
    await this.post('/v1/payments/refund', data);
  }

  private async get<T>(path: string, options?: { timeoutMs?: number }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  private async post<T>(path: string, data: unknown, options?: { timeoutMs?: number }): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  private async request<T>(method: string, path: string, body?: unknown, options?: { timeoutMs?: number }): Promise<T> {
    let response: Response;
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 15_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`StarsPay: request to ${path} timed out after ${timeoutMs / 1000} seconds`);
      }
      throw new Error(`StarsPay: network error calling ${path}`, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.json() as Record<string, unknown>;
        errorDetail = (errorBody.error as string) || (errorBody.message as string) || '';
      } catch {
        // Response body is not JSON or already consumed — use status only
      }
      throw new StarsPayApiError(
        errorDetail ? `API error ${response.status}: ${errorDetail}` : `API error: ${response.status}`,
        response.status
      );
    }

    // Handle empty responses (204 No Content or zero-length body)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      throw new StarsPayApiError('StarsPay API returned empty response (204 No Content)', 204);
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new StarsPayApiError(`StarsPay API returned non-JSON response for ${path}`, response.status);
    }
    if (responseBody === null || typeof responseBody !== 'object') {
      throw new StarsPayApiError('StarsPay API returned unexpected response format', response.status);
    }
    return responseBody as T;
  }
}
