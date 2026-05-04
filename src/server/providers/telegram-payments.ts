import type { TelegramApiClient } from '../telegram-api.js';
import type { LabeledPrice } from '../../types/telegram.js';
import type { ProviderInvoiceResult, ProviderRefundResult } from './types.js';

export interface TelegramPaymentsProviderConfig {
  /** Provider token from BotFather (e.g., "123456:LIVE:AbCdEf") */
  providerToken: string;
  /** Optional test token for development */
  testToken?: string;
}

/**
 * TelegramPaymentsProvider uses TelegramApiClient with a `provider_token` and
 * fiat currencies to process card payments through the Telegram Payments API.
 *
 * The actual upstream gateway behind the provider token is configured by the
 * merchant in @BotFather and varies by country — Stripe, Redsys (Spain),
 * YooKassa (Russia), Paymaster, etc. From our SDK's perspective it's always
 * the same Telegram Payments API regardless of the underlying gateway.
 */
export class TelegramPaymentsProvider {
  readonly name = 'telegram_payments' as const;
  private readonly providerToken: string;

  constructor(
    private readonly telegram: TelegramApiClient,
    private readonly config: TelegramPaymentsProviderConfig,
    testMode?: boolean
  ) {
    this.providerToken = testMode && config.testToken ? config.testToken : config.providerToken;
  }

  /** Create an invoice link via Telegram Payments API */
  async createInvoice(params: {
    title: string;
    description: string;
    payload: string;
    prices: LabeledPrice[];
    currency: string;
    // Telegram Payments options
    needName?: boolean;
    needEmail?: boolean;
    needPhoneNumber?: boolean;
    needShippingAddress?: boolean;
    isFlexible?: boolean;
    sendPhoneNumberToProvider?: boolean;
    sendEmailToProvider?: boolean;
    providerData?: string;
    maxTipAmount?: number;
    suggestedTipAmounts?: number[];
    photoUrl?: string;
  }): Promise<ProviderInvoiceResult> {
    const url = await this.telegram.createInvoiceLink({
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices: params.prices,
      provider_token: this.providerToken,
      // Currency is a fiat code (USD, EUR, etc.) — cast needed because the base
      // CreateInvoiceLinkParams types currency as the literal 'XTR'.
      currency: params.currency as 'XTR',
      ...(params.needName && { need_name: true }),
      ...(params.needEmail && { need_email: true }),
      ...(params.needPhoneNumber && { need_phone_number: true }),
      ...(params.needShippingAddress && { need_shipping_address: true }),
      ...(params.isFlexible && { is_flexible: true }),
      ...(params.sendPhoneNumberToProvider && { send_phone_number_to_provider: true }),
      ...(params.sendEmailToProvider && { send_email_to_provider: true }),
      ...(params.providerData && { provider_data: params.providerData }),
      ...(params.maxTipAmount !== undefined && { max_tip_amount: params.maxTipAmount }),
      ...(params.suggestedTipAmounts && { suggested_tip_amounts: params.suggestedTipAmounts }),
      ...(params.photoUrl && { photo_url: params.photoUrl }),
      // NOTE: subscription_period requires XTR, so NOT passed for Telegram Payments
    });
    return {
      providerInvoiceId: params.payload,
      payUrl: url,
      provider: 'telegram_payments',
    };
  }

  /** Send an invoice directly to a chat via Telegram Payments API */
  async sendInvoice(chatId: number | string, params: {
    title: string;
    description: string;
    payload: string;
    prices: LabeledPrice[];
    currency: string;
    needName?: boolean;
    needEmail?: boolean;
    needPhoneNumber?: boolean;
    needShippingAddress?: boolean;
    isFlexible?: boolean;
    sendPhoneNumberToProvider?: boolean;
    sendEmailToProvider?: boolean;
    providerData?: string;
    maxTipAmount?: number;
    suggestedTipAmounts?: number[];
    photoUrl?: string;
  }): Promise<ProviderInvoiceResult> {
    await this.telegram.sendInvoice({
      chat_id: chatId,
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices: params.prices,
      provider_token: this.providerToken,
      currency: params.currency as 'XTR',
      ...(params.needName && { need_name: true }),
      ...(params.needEmail && { need_email: true }),
      ...(params.needPhoneNumber && { need_phone_number: true }),
      ...(params.needShippingAddress && { need_shipping_address: true }),
      ...(params.isFlexible && { is_flexible: true }),
      ...(params.sendPhoneNumberToProvider && { send_phone_number_to_provider: true }),
      ...(params.sendEmailToProvider && { send_email_to_provider: true }),
      ...(params.providerData && { provider_data: params.providerData }),
      ...(params.maxTipAmount !== undefined && { max_tip_amount: params.maxTipAmount }),
      ...(params.suggestedTipAmounts && { suggested_tip_amounts: params.suggestedTipAmounts }),
      ...(params.photoUrl && { photo_url: params.photoUrl }),
    });
    return {
      providerInvoiceId: params.payload,
      payUrl: '',
      provider: 'telegram_payments',
    };
  }

  /**
   * Refund a Telegram Payments charge.
   * NOTE: Fiat refunds cannot be done via Telegram Bot API. The merchant must
   * use the underlying gateway's API directly with provider_payment_charge_id
   * (e.g., Stripe's refund endpoint, YooKassa's refund endpoint, etc.).
   * This method returns a result indicating the refund must be done externally.
   */
  async refund(_userId: number, _chargeId: string): Promise<ProviderRefundResult> {
    return {
      success: false,
      provider: 'telegram_payments',
      // Caller should use the upstream gateway's API with provider_payment_charge_id
    };
  }
}
