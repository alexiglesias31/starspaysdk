import type { TelegramApiClient } from '../telegram-api.js';
import type { CreateInvoiceLinkParams, SendInvoiceParams } from '../../types/telegram.js';
import type { ProviderInvoiceResult, ProviderRefundResult } from './types.js';
import { SUBSCRIPTION_PERIOD_SECONDS } from '../../types/config.js';

/**
 * StarsProvider wraps TelegramApiClient for Telegram Stars (XTR) payments.
 *
 * Stars payments use an empty `provider_token` and the `XTR` currency,
 * both of which are defaulted by TelegramApiClient.
 */
export class StarsProvider {
  readonly name = 'stars' as const;

  constructor(private readonly telegram: TelegramApiClient) {}

  /** Create a Stars invoice link */
  async createInvoice(params: {
    title: string;
    description: string;
    payload: string;
    amount: number;
    subscription?: boolean;
    photoUrl?: string;
  }): Promise<ProviderInvoiceResult> {
    const prices = [{ label: params.title, amount: params.amount }];
    const invoiceParams: CreateInvoiceLinkParams = {
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices,
      ...(params.subscription && { subscription_period: SUBSCRIPTION_PERIOD_SECONDS }),
      ...(params.photoUrl && { photo_url: params.photoUrl }),
    };
    const url = await this.telegram.createInvoiceLink(invoiceParams);
    return {
      providerInvoiceId: params.payload, // Stars uses payload as identifier
      payUrl: url,
      provider: 'stars',
    };
  }

  /** Send a Stars invoice directly to a chat */
  async sendInvoice(chatId: number | string, params: {
    title: string;
    description: string;
    payload: string;
    amount: number;
    photoUrl?: string;
  }): Promise<ProviderInvoiceResult> {
    const prices = [{ label: params.title, amount: params.amount }];
    const invoiceParams: SendInvoiceParams = {
      chat_id: chatId,
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices,
      ...(params.photoUrl && { photo_url: params.photoUrl }),
    };
    await this.telegram.sendInvoice(invoiceParams);
    return {
      providerInvoiceId: params.payload,
      payUrl: '', // sendInvoice doesn't return a URL
      provider: 'stars',
    };
  }

  /** Refund a Stars payment */
  async refund(userId: number, chargeId: string): Promise<ProviderRefundResult> {
    try {
      await this.telegram.refundStarPayment(userId, chargeId);
      return { success: true, refundId: chargeId, provider: 'stars' };
    } catch (error) {
      console.error('[starspay] Stars refund failed:', error instanceof Error ? error.message : error);
      return { success: false, provider: 'stars' };
    }
  }

  /** Cancel a Stars subscription */
  async cancelSubscription(userId: number, chargeId: string): Promise<void> {
    await this.telegram.editUserStarSubscription(userId, chargeId, true);
  }
}
