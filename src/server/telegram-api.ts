import type {
  TelegramApiResponse,
  CreateInvoiceLinkParams,
  SendInvoiceParams,
  BotInfo,
  StarTransactions,
} from '../types/telegram.js';
import { STARS_CURRENCY } from '../types/config.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/**
 * Telegram Bot API client for Stars payment operations.
 */
export class TelegramApiClient {
  private readonly baseUrl: string;

  constructor(private readonly botToken: string) {
    this.baseUrl = `${TELEGRAM_API_BASE}${botToken}`;
  }

  /** Verify bot token and get bot info */
  async getMe(): Promise<BotInfo> {
    return this.call<BotInfo>('getMe');
  }

  /** Answer a pre-checkout query (must respond within 10 seconds) */
  async answerPreCheckoutQuery(
    preCheckoutQueryId: string,
    ok: boolean,
    errorMessage?: string
  ): Promise<boolean> {
    return this.call<boolean>('answerPreCheckoutQuery', {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      ...(errorMessage && { error_message: errorMessage }),
    });
  }

  /** Create an invoice link (required for subscriptions) */
  async createInvoiceLink(params: CreateInvoiceLinkParams): Promise<string> {
    return this.call<string>('createInvoiceLink', {
      ...params,
      currency: STARS_CURRENCY,
      provider_token: '',
    });
  }

  /** Send an invoice directly to a chat (one-time purchases only) */
  async sendInvoice(params: SendInvoiceParams): Promise<unknown> {
    return this.call('sendInvoice', {
      ...params,
      currency: STARS_CURRENCY,
      provider_token: '',
    });
  }

  /** Cancel or restore a user's subscription */
  async editUserStarSubscription(
    userId: number,
    telegramPaymentChargeId: string,
    isCanceled: boolean
  ): Promise<boolean> {
    return this.call<boolean>('editUserStarSubscription', {
      user_id: userId,
      telegram_payment_charge_id: telegramPaymentChargeId,
      is_canceled: isCanceled,
    });
  }

  /** Refund a Stars payment (full refund only) */
  async refundStarPayment(
    userId: number,
    telegramPaymentChargeId: string
  ): Promise<boolean> {
    return this.call<boolean>('refundStarPayment', {
      user_id: userId,
      telegram_payment_charge_id: telegramPaymentChargeId,
    });
  }

  /** Get bot's Star transactions */
  async getStarTransactions(
    offset?: number,
    limit?: number
  ): Promise<StarTransactions> {
    return this.call<StarTransactions>('getStarTransactions', {
      ...(offset !== undefined && { offset }),
      ...(limit !== undefined && { limit }),
    });
  }

  /** Get bot's current Star balance */
  async getMyStarBalance(): Promise<{ amount: number; nanostar_amount?: number }> {
    return this.call('getMyStarBalance');
  }

  private async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = (await response.json()) as TelegramApiResponse<T>;

    if (!data.ok) {
      throw new TelegramApiError(
        data.description || `Telegram API error: ${method}`,
        data.error_code
      );
    }

    return data.result as T;
  }
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}
