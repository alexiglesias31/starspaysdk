import type { StarsPayClientConfig } from '../types/config.js';
import type { Subscription } from '../types/subscription.js';
import type { Product, Price, Customer } from '../types/payment.js';
import { TxLimitExceededError } from '../errors/tx-limit-exceeded-error.js';

const DEFAULT_API_URL = 'https://api.starspay.dev';

function assertValidTelegramId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`StarsPay: invalid Telegram user ID: ${id}`);
  }
}

export class StarsPayClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'StarsPayClientError';
  }
}

/**
 * Browser-side StarsPay client.
 * Used in Telegram Mini Apps to check subscription status and open payment flows.
 */
export class StarsPayClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private cache = new Map<string, { data: unknown; expires: number }>();
  private readonly cacheTtl: number;
  readonly testMode: boolean;

  private readonly maxCacheSize = 50;

  constructor(config: StarsPayClientConfig) {
    if (!config.apiKey) {
      throw new Error('StarsPay: apiKey is required');
    }

    const apiUrl = config.apiUrl || DEFAULT_API_URL;

    // Enforce HTTPS to prevent credential leakage over plaintext
    if (apiUrl.startsWith('http://')) {
      const hostname = new URL(apiUrl).hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
        throw new Error('StarsPay: apiUrl must use HTTPS in production');
      }
    }

    // Guard against server keys being used in the browser client
    if (config.apiKey.startsWith('sk_') || config.apiKey.startsWith('sp_live_') || config.apiKey.startsWith('sp_test_')) {
      throw new Error('StarsPay: Do not use server API keys in the browser client. Use your publishable key instead.');
    }
    if (!config.apiKey.startsWith('sp_pub_')) {
      throw new Error('StarsPay: browser client apiKey must be a publishable key with the "sp_pub_" prefix.');
    }

    this.apiKey = config.apiKey;
    this.apiUrl = apiUrl;
    this.cacheTtl = config.cacheTtl ?? 30_000; // 30 seconds default
    this.testMode = config.testMode ?? false;

    // Warn when testMode is enabled with a production publishable key
    if (this.testMode && this.apiKey.startsWith('sp_pub_')) {
      console.warn(
        'StarsPay: testMode is enabled with a publishable API key. ' +
        'This should only be used in development. All subscription checks will be bypassed.'
      );
    }
  }

  /**
   * Check if the current user has an active subscription.
   * Uses client-side caching to minimize API calls.
   * Always returns true when testMode is enabled.
   */
  async isActive(telegramUserId: number): Promise<boolean> {
    if (this.testMode) return true;
    assertValidTelegramId(telegramUserId);

    const cached = this.getFromCache<{ active: boolean }>(this.getActiveStatusCacheKey(telegramUserId));
    if (cached !== null) return cached.active;

    const result = await this.get<{ active: boolean; subscription?: Subscription }>(
      `/v1/subscriptions/active/${telegramUserId}`
    );
    this.setCache(this.getActiveStatusCacheKey(telegramUserId), { active: result.active });
    return result.active;
  }

  /**
   * Get the active subscription for a user.
   * Returns a mock active subscription when testMode is enabled.
   */
  async getActiveSubscription(telegramUserId: number): Promise<Subscription | null> {
    if (this.testMode) {
      return createTestSubscription(telegramUserId);
    }
    assertValidTelegramId(telegramUserId);

    const cached = this.getFromCache<{ subscription: Subscription | null }>(
      this.getActiveSubscriptionCacheKey(telegramUserId)
    );
    if (cached !== null) return cached.subscription;

    const result = await this.get<{ active: boolean; subscription?: Subscription }>(
      `/v1/subscriptions/active/${telegramUserId}`
    );
    this.setCache(this.getActiveStatusCacheKey(telegramUserId), { active: result.active });
    this.setCache(this.getActiveSubscriptionCacheKey(telegramUserId), {
      subscription: result.subscription ?? null,
    });
    return result.subscription ?? null;
  }

  /**
   * Get all subscriptions for a user.
   */
  async getSubscriptions(telegramUserId: number): Promise<Subscription[]> {
    if (this.testMode) {
      return [createTestSubscription(telegramUserId)];
    }
    throw new Error(
      'StarsPay: getSubscriptions() is not available in the browser client. ' +
      'Use getActiveSubscription() in the Mini App or query via the server SDK instead.'
    );
  }

  /**
   * List available products.
   */
  async getProducts(): Promise<Product[]> {
    const cacheKey = 'products';
    const cached = this.getFromCache<{ products: Product[] }>(cacheKey);
    if (cached !== null) return cached.products;

    const result = await this.get<{ products: Product[] }>('/v1/products');
    this.setCache(cacheKey, result);
    return result.products;
  }

  /**
   * List prices for a product.
   */
  async getPrices(productId: string): Promise<Price[]> {
    const cacheKey = `prices:${productId}`;
    const cached = this.getFromCache<{ prices: Price[] }>(cacheKey);
    if (cached !== null) return cached.prices;

    const result = await this.get<{ prices: Price[] }>(`/v1/prices?product_id=${encodeURIComponent(productId)}`);
    this.setCache(cacheKey, result);
    return result.prices;
  }

  /**
   * Get a specific price with its associated product.
   */
  async getPrice(priceId: string): Promise<{ price: Price; product: Product }> {
    const cacheKey = `price:${priceId}`;
    const cached = this.getFromCache<{ price: Price; product: Product }>(cacheKey);
    if (cached !== null) return cached;

    const result = await this.get<{ price: Price; product: Product }>(`/v1/prices/${encodeURIComponent(priceId)}`);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get customer profile. Returns null if the customer does not exist (404).
   */
  async getCustomer(telegramUserId: number): Promise<Customer | null> {
    throw new Error(
      'StarsPay: getCustomer() is not available in the browser client. ' +
      'Query customer records from your server instead.'
    );
  }

  /**
   * Request an invoice link for a purchase.
   * The returned URL should be opened via Telegram.WebApp.openInvoice().
   * Throws TxLimitExceededError when the app has reached its plan's transaction limit.
   */
  async createInvoiceLink(params: {
    priceId: string;
    telegramUserId: number;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    assertValidTelegramId(params.telegramUserId);
    if (!params.priceId || typeof params.priceId !== 'string' || params.priceId.length > 128) {
      throw new Error('StarsPay: priceId must be a non-empty string of 128 characters or fewer');
    }
    try {
      const result = await this.post<{ url: string }>('/v1/invoices/create', params);
      if (typeof result.url !== 'string' || !result.url.startsWith('https://t.me/$')) {
        throw new StarsPayClientError('Invalid invoice URL returned by server', 0);
      }
      return result.url;
    } catch (err) {
      if (err instanceof StarsPayClientError && err.statusCode === 402) {
        const body = err.body;
        if (
          body !== null &&
          typeof body === 'object' &&
          (body as { error?: unknown }).error === 'tx_limit_exceeded' &&
          typeof (body as { tier?: unknown }).tier === 'string' &&
          typeof (body as { tx_count?: unknown }).tx_count === 'number' &&
          typeof (body as { tx_limit?: unknown }).tx_limit === 'number'
        ) {
          const b = body as { tier: string; tx_count: number; tx_limit: number };
          throw new TxLimitExceededError(b.tier, b.tx_count, b.tx_limit);
        }
      }
      throw err;
    }
  }

  /**
   * Open a Telegram Stars payment flow.
   * Requires the Telegram WebApp SDK to be available.
   */
  async openPayment(invoiceUrl: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
    return new Promise((resolve, reject) => {
      const webApp = (globalThis as unknown as { Telegram?: { WebApp?: { openInvoice: (url: string, cb: (status: string) => void) => void } } }).Telegram?.WebApp;

      if (!webApp) {
        reject(new Error('Telegram WebApp SDK not available. Are you running inside a Mini App?'));
        return;
      }

      const validStatuses = new Set(['paid', 'cancelled', 'failed', 'pending']);
      webApp.openInvoice(invoiceUrl, (status: string) => {
        if (!validStatuses.has(status)) {
          resolve('failed');
          return;
        }
        resolve(status as 'paid' | 'cancelled' | 'failed' | 'pending');
      });
    });
  }

  /** Open a payment link in Telegram (for non-Stars provider invoice URLs) */
  openExternalPayment(payUrl: string): void {
    const webApp = (globalThis as Record<string, unknown>).Telegram as Record<string, unknown> | undefined;
    const webAppObj = webApp?.WebApp as Record<string, (...args: unknown[]) => void> | undefined;
    if (webAppObj?.openTelegramLink && payUrl.startsWith('https://t.me/')) {
      webAppObj.openTelegramLink(payUrl);
    } else if (webAppObj?.openLink) {
      webAppObj.openLink(payUrl);
    } else {
      const g = globalThis as Record<string, unknown>;
      if (typeof g['window'] !== 'undefined') {
        (g['window'] as { open: (url: string, target: string) => void }).open(payUrl, '_blank');
      }
    }
  }

  /** Clear all cached data */
  clearCache(): void {
    this.cache.clear();
  }

  /** Invalidate a specific user's cached subscription status */
  invalidateUser(telegramUserId: number): void {
    this.cache.delete(this.getActiveStatusCacheKey(telegramUserId));
    this.cache.delete(this.getActiveSubscriptionCacheKey(telegramUserId));
    this.cache.delete(`subs:${telegramUserId}`);
  }

  private getActiveStatusCacheKey(telegramUserId: number): string {
    return `activeStatus:${telegramUserId}`;
  }

  private getActiveSubscriptionCacheKey(telegramUserId: number): string {
    return `activeSubscription:${telegramUserId}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    // Evict oldest entries if cache exceeds max size to prevent unbounded memory growth
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expires: Date.now() + this.cacheTtl });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
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
        throw new Error(`StarsPay: request to ${path} timed out after 15 seconds`);
      }
      throw new Error(`StarsPay: network error calling ${path}`, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        // non-JSON error body — leave undefined
      }
      throw new StarsPayClientError(`StarsPay API error: ${response.status}`, response.status, errorBody);
    }

    // Handle empty responses (204 No Content or zero-length body)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      throw new StarsPayClientError('StarsPay API returned empty response', 204);
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new StarsPayClientError(`StarsPay API returned non-JSON response for ${path}`, response.status);
    }
    if (responseBody === null || typeof responseBody !== 'object') {
      throw new StarsPayClientError('StarsPay API returned unexpected response format', response.status);
    }
    return responseBody as T;
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>('POST', path, data);
  }
}

/**
 * Helper to check entitlement from a subscription status. A `past_due`
 * subscription denies entitlement when its `retain_access_during_grace` is
 * explicitly `false` (merchant opted out of grace-period access).
 */
export function isEntitled(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active' || subscription.status === 'canceled') return true;
  if (subscription.status === 'past_due') return subscription.retain_access_during_grace !== false;
  return false;
}

function createTestSubscription(telegramUserId: number): Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `test_sub_${telegramUserId}`,
    app_id: 'test_app',
    customer_id: 'test_customer',
    telegram_user_id: telegramUserId,
    product_id: 'test_product',
    price_id: 'test_price',
    status: 'active',
    amount: 0,
    telegram_payment_charge_id: null,
    provider_payment_charge_id: null,
    invoice_payload: 'test_mode',
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60, // 30 days
    cancel_at_period_end: false,
    canceled_at: null,
    grace_period_seconds: 259200,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
