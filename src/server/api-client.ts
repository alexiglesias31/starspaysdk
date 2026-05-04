import type { Payment, Product, Price, Customer } from '../types/payment.js';
import type { Subscription } from '../types/subscription.js';

const DEFAULT_API_URL = 'https://api.starspay.dev';

/**
 * HTTP client for communicating with the StarsPay backend (Supabase Edge Functions).
 * Used by the SDK middleware to report payment events and query subscription state.
 */
export class StarsPayApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, apiUrl?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
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
    return this.post('/v1/payments/report', data);
  }

  /** Check if a user has an active subscription */
  async isActive(telegramUserId: number): Promise<{ active: boolean; subscription?: Subscription }> {
    return this.get(`/v1/subscriptions/active/${telegramUserId}`);
  }

  /** Get all subscriptions for a user */
  async getSubscriptions(telegramUserId: number): Promise<{ subscriptions: Subscription[] }> {
    return this.get(`/v1/subscriptions/user/${telegramUserId}`);
  }

  /** Create a product */
  async createProduct(data: Partial<Product>): Promise<Product> {
    return this.post('/v1/products', data);
  }

  /** List products */
  async listProducts(): Promise<{ products: Product[] }> {
    return this.get('/v1/products');
  }

  /** Create a price for a product */
  async createPrice(data: Partial<Price>): Promise<Price> {
    return this.post('/v1/prices', data);
  }

  /** List prices for a product */
  async listPrices(productId: string): Promise<{ prices: Price[] }> {
    return this.get(`/v1/prices?product_id=${productId}`);
  }

  /** Get customer by Telegram user ID */
  async getCustomer(telegramUserId: number): Promise<Customer | null> {
    try {
      return await this.get(`/v1/customers/${telegramUserId}`);
    } catch {
      return null;
    }
  }

  /** Report a pre_checkout_query for logging */
  async reportPreCheckout(data: {
    telegram_user_id: number;
    total_amount: number;
    invoice_payload: string;
    pre_checkout_query_id: string;
  }): Promise<void> {
    await this.post('/v1/webhooks/pre-checkout', data);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new StarsPayApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status
      );
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
      throw new StarsPayApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    return response.json() as Promise<T>;
  }
}

export class StarsPayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'StarsPayApiError';
  }
}
