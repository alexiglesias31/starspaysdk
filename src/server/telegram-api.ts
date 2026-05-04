import type {
  TelegramApiResponse,
  CreateInvoiceLinkParams,
  SendInvoiceParams,
  SetWebhookParams,
  BotInfo,
  StarTransactions,
  CreateChatInviteLinkParams,
  ChatInviteLink,
  ChatMemberInfo,
  LabeledPrice,
} from '../types/telegram.js';
import { STARS_CURRENCY } from '../types/config.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/**
 * Telegram Bot API client for Stars payment operations.
 */
export class TelegramApiClient {
  private readonly baseUrl: string;

  constructor(private readonly botToken: string) {
    if (!botToken || !/^\d+:[A-Za-z0-9_-]{30,50}$/.test(botToken)) {
      throw new Error('StarsPay: botToken format is invalid. Expected format: <numeric_id>:<alphanumeric_secret>');
    }
    // SECURITY NOTE: The bot token is part of the Telegram Bot API URL convention.
    // Never log this URL. Error messages intentionally exclude the full URL.
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
  async createInvoiceLink(params: CreateInvoiceLinkParams & {
    provider_token?: string;
    currency?: string;
    need_name?: boolean;
    need_email?: boolean;
    need_phone_number?: boolean;
    need_shipping_address?: boolean;
    is_flexible?: boolean;
    send_phone_number_to_provider?: boolean;
    send_email_to_provider?: boolean;
    provider_data?: string;
    max_tip_amount?: number;
    suggested_tip_amounts?: number[];
  }): Promise<string> {
    return this.call<string>('createInvoiceLink', {
      ...params,
      currency: params.currency ?? STARS_CURRENCY,
      provider_token: params.provider_token ?? '',
    });
  }

  /** Send an invoice directly to a chat (one-time purchases only) */
  async sendInvoice(params: SendInvoiceParams & {
    provider_token?: string;
    currency?: string;
    need_name?: boolean;
    need_email?: boolean;
    need_phone_number?: boolean;
    need_shipping_address?: boolean;
    is_flexible?: boolean;
    send_phone_number_to_provider?: boolean;
    send_email_to_provider?: boolean;
    provider_data?: string;
    max_tip_amount?: number;
    suggested_tip_amounts?: number[];
  }): Promise<Record<string, unknown>> {
    return this.call('sendInvoice', {
      ...params,
      currency: params.currency ?? STARS_CURRENCY,
      provider_token: params.provider_token ?? '',
    });
  }

  /** Answer a shipping query (required when is_flexible = true) */
  async answerShippingQuery(
    shippingQueryId: string,
    ok: boolean,
    shippingOptions?: Array<{ id: string; title: string; prices: LabeledPrice[] }>,
    errorMessage?: string
  ): Promise<boolean> {
    return this.call<boolean>('answerShippingQuery', {
      shipping_query_id: shippingQueryId,
      ok,
      ...(shippingOptions && { shipping_options: shippingOptions }),
      ...(errorMessage && { error_message: errorMessage }),
    });
  }

  /** Send a text message with optional inline keyboard */
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyMarkup?: Record<string, unknown>;
    }
  ): Promise<Record<string, unknown>> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(options?.parseMode && { parse_mode: options.parseMode }),
      ...(options?.replyMarkup && { reply_markup: options.replyMarkup }),
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

  /** Set webhook URL for receiving Telegram updates */
  async setWebhook(params: SetWebhookParams): Promise<boolean> {
    return this.call<boolean>('setWebhook', { ...params });
  }

  /** Remove webhook integration */
  async deleteWebhook(dropPendingUpdates?: boolean): Promise<boolean> {
    return this.call<boolean>('deleteWebhook', {
      ...(dropPendingUpdates !== undefined && { drop_pending_updates: dropPendingUpdates }),
    });
  }

  // ── Channel membership management ──────────────────────────

  /** Create an invite link for a chat (supports join-request gating) */
  async createChatInviteLink(params: CreateChatInviteLinkParams): Promise<ChatInviteLink> {
    return this.call<ChatInviteLink>('createChatInviteLink', {
      chat_id: params.chat_id,
      ...(params.name !== undefined && { name: params.name }),
      ...(params.expire_date !== undefined && { expire_date: params.expire_date }),
      ...(params.member_limit !== undefined && { member_limit: params.member_limit }),
      ...(params.creates_join_request !== undefined && { creates_join_request: params.creates_join_request }),
    });
  }

  /** Approve a pending chat join request */
  async approveChatJoinRequest(chatId: number | string, userId: number): Promise<boolean> {
    return this.call<boolean>('approveChatJoinRequest', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  /** Decline a pending chat join request */
  async declineChatJoinRequest(chatId: number | string, userId: number): Promise<boolean> {
    return this.call<boolean>('declineChatJoinRequest', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  /** Ban a user from a channel/group (removes and prevents rejoin until unbanned) */
  async banChatMember(chatId: number | string, userId: number, revokeMessages?: boolean): Promise<boolean> {
    return this.call<boolean>('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...(revokeMessages !== undefined && { revoke_messages: revokeMessages }),
    });
  }

  /** Unban a user (allows rejoining via invite link; does NOT re-add them) */
  async unbanChatMember(chatId: number | string, userId: number): Promise<boolean> {
    return this.call<boolean>('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
  }

  /** Get a user's membership status in a chat */
  async getChatMember(chatId: number | string, userId: number): Promise<ChatMemberInfo> {
    return this.call<ChatMemberInfo>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  private async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: params ? JSON.stringify(params) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TelegramApiError(`Telegram API method ${method} timed out after 30 seconds`, undefined);
      }
      throw new TelegramApiError(
        `Network error calling Telegram API method: ${method}`,
        undefined
      );
    } finally {
      clearTimeout(timeout);
    }

    let data: TelegramApiResponse<T>;
    try {
      data = (await response.json()) as TelegramApiResponse<T>;
    } catch {
      throw new TelegramApiError(
        `Telegram API returned non-JSON response for ${method} (status ${response.status})`,
        response.status
      );
    }

    if (!data.ok) {
      throw new TelegramApiError(
        data.description || `Telegram API error: ${method}`,
        data.error_code
      );
    }

    if (data.result === undefined) {
      throw new TelegramApiError(
        `Telegram API returned ok: true without result for ${method}`,
        undefined
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
