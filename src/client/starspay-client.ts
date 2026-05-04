import type { StarsPayClientConfig } from '../types/config.js';
import type { Subscription } from '../types/subscription.js';
import type { Product, Price, Customer } from '../types/payment.js';
import { ENTITLED_STATUSES } from '../types/subscription.js';

const DEFAULT_API_URL = 'https://api.starspay.dev';

/**
 * Browser-side StarsPay client.
 * Used in Telegram Mini Apps to check subscription status and open payment flows.
 */
export class StarsPayClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private cache = new Map<string, { data: unknown; expires: number }>();
  private readonly cacheTtl: number;

  constructor(config: StarsPayClientConfig & { cacheTtl?: number }) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.cacheTtl = config.cacheTtl ?? 30_000; // 30 seconds default
  }

  /**
   * Check if the current user has an active subscription.
   * Uses client-side caching to minimize API calls.
   */
  async isActive(telegramUserId: number): Promise<boolean> {
    const cacheKey = `active:${telegramUserId}`;
    const cached = this.getFromCache<{ active: boolean }>(cacheKey);
    if (cached !== null) return cached.active;

    const result = await this.get<{ active: boolean; subscription?: Subscription }>(
      `/v1/subscriptions/active/${telegramUserId}`
    );
    this.setCache(cacheKey, result);
    return result.active;
  }

  /**
   * Get the active subscription for a user.
   */
  async getActiveSubscription(telegramUserId: number): Promise<Subscription | null> {
    const result = await this.get<{ active: boolean; subscription?: Subscription }>(
      `/v1/subscriptions/active/${telegramUserId}`
    );
    return result.subscription ?? null;
  }

  /**
   * Get all subscriptions for a user.
   */
  async getSubscriptions(telegramUserId: number): Promise<Subscription[]> {
    const result = await this.get<{ subscriptions: Subscription[] }>(
      `/v1/subscriptions/user/${telegramUserId}`
    );
    return result.subscriptions;
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

    const result = await this.get<{ prices: Price[] }>(`/v1/prices?product_id=${productId}`);
    this.setCache(cacheKey, result);
    return result.prices;
  }

  /**
   * Get customer profile.
   */
  async getCustomer(telegramUserId: number): Promise<Customer | null> {
    try {
      return await this.get<Customer>(`/v1/customers/${telegramUserId}`);
    } catch {
      return null;
    }
  }

  /**
   * Request an invoice link for a purchase.
   * The returned URL should be opened via Telegram.WebApp.openInvoice().
   */
  async createInvoiceLink(params: {
    priceId: string;
    telegramUserId: number;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.post<{ url: string }>('/v1/invoices/create', params);
    return result.url;
  }

  /**
   * Open a Telegram Stars payment flow.
   * Requires the Telegram WebApp SDK to be available.
   */
  async openPayment(invoiceUrl: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
    return new Promise((resolve) => {
      const webApp = (globalThis as unknown as { Telegram?: { WebApp?: { openInvoice: (url: string, cb: (status: string) => void) => void } } }).Telegram?.WebApp;

      if (!webApp) {
        throw new Error('Telegram WebApp SDK not available. Are you running inside a Mini App?');
      }

      webApp.openInvoice(invoiceUrl, (status: string) => {
        resolve(status as 'paid' | 'cancelled' | 'failed' | 'pending');
      });
    });
  }

  /** Clear all cached data */
  clearCache(): void {
    this.cache.clear();
  }

  /** Invalidate a specific user's cached subscription status */
  invalidateUser(telegramUserId: number): void {
    this.cache.delete(`active:${telegramUserId}`);
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
    this.cache.set(key, { data, expires: Date.now() + this.cacheTtl });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`StarsPay API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`StarsPay API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Helper to check entitlement from a subscription status.
 */
export function isEntitled(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  return ENTITLED_STATUSES.includes(subscription.status);
}
