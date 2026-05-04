import type { TelegramUpdate } from '../types/telegram.js';
import type { StarsPayConfig } from '../types/config.js';
import type { Subscription, SubscriptionEventType } from '../types/subscription.js';
import { parseWebhookUpdate, isPaymentUpdate } from './webhook.js';
import { TelegramApiClient } from './telegram-api.js';
import { StarsPayApiClient } from './api-client.js';

export type StarsPayEventHandler = (
  event: SubscriptionEventType | 'payment.one_time' | 'payment.refunded',
  data: { subscription?: Subscription; telegramUserId: number; amount: number; payload: string }
) => void | Promise<void>;

export interface StarsPayServerOptions extends StarsPayConfig {
  /**
   * Called when payment events occur.
   * Use this to grant/revoke access to premium features.
   */
  onEvent?: StarsPayEventHandler;

  /**
   * Custom pre-checkout validation.
   * Return true to approve, false to reject.
   * Must complete quickly (within the 10-second Telegram timeout).
   */
  onPreCheckout?: (data: {
    userId: number;
    amount: number;
    payload: string;
  }) => boolean | Promise<boolean>;
}

/**
 * Creates a StarsPay server instance with middleware and event handling.
 */
export function createStarsPay(options: StarsPayServerOptions) {
  const telegram = new TelegramApiClient(options.botToken);
  const api = new StarsPayApiClient(options.apiKey, options.apiUrl);
  const debug = options.debug ?? false;

  function log(...args: unknown[]) {
    if (debug) console.log('[starspay]', ...args);
  }

  /**
   * Express/Connect-compatible middleware.
   * Intercepts payment-related Telegram updates and processes them.
   * Non-payment updates are passed through to the next handler.
   */
  function middleware() {
    return async (
      req: { body: TelegramUpdate },
      res: { sendStatus: (code: number) => void; status: (code: number) => { json: (data: unknown) => void } },
      next: () => void
    ) => {
      const update = req.body;

      if (!isPaymentUpdate(update)) {
        return next();
      }

      try {
        await handleUpdate(update);
        res.sendStatus(200);
      } catch (error) {
        log('Error processing payment update:', error);
        res.status(500).json({ error: 'Internal payment processing error' });
      }
    };
  }

  /**
   * Handle a raw Telegram update (for non-Express environments).
   * Call this with the parsed JSON body of a Telegram webhook request.
   */
  async function handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!isPaymentUpdate(update)) return;

    const event = parseWebhookUpdate(update);
    log('Processing event:', event.type);

    switch (event.type) {
      case 'pre_checkout': {
        const query = event.preCheckoutQuery!;
        let approved = true;

        if (options.onPreCheckout) {
          try {
            approved = await options.onPreCheckout({
              userId: query.from.id,
              amount: query.total_amount,
              payload: query.invoice_payload,
            });
          } catch (error) {
            log('Pre-checkout validation error:', error);
            approved = false;
          }
        }

        await telegram.answerPreCheckoutQuery(
          query.id,
          approved,
          approved ? undefined : 'Payment validation failed'
        );

        // Report to backend (fire-and-forget, don't block)
        api.reportPreCheckout({
          telegram_user_id: query.from.id,
          total_amount: query.total_amount,
          invoice_payload: query.invoice_payload,
          pre_checkout_query_id: query.id,
        }).catch((err) => log('Failed to report pre-checkout:', err));

        break;
      }

      case 'payment.one_time':
      case 'payment.subscription_initial':
      case 'payment.subscription_renewal': {
        const payment = event.successfulPayment!;
        const userId = event.telegramUserId!;

        // Report payment to backend
        const result = await api.reportPayment({
          telegram_user_id: userId,
          payment_type: event.paymentType!,
          amount: payment.total_amount,
          currency: payment.currency,
          telegram_payment_charge_id: payment.telegram_payment_charge_id,
          provider_payment_charge_id: payment.provider_payment_charge_id,
          invoice_payload: payment.invoice_payload,
          subscription_expiration_date: payment.subscription_expiration_date,
          is_recurring: payment.is_recurring,
          is_first_recurring: payment.is_first_recurring,
        });

        if (options.onEvent) {
          const eventType = event.paymentType === 'one_time'
            ? 'payment.one_time' as const
            : event.paymentType === 'subscription_initial'
              ? 'subscription.created' as const
              : 'subscription.renewed' as const;

          await options.onEvent(eventType, {
            subscription: result.subscription,
            telegramUserId: userId,
            amount: payment.total_amount,
            payload: payment.invoice_payload,
          });
        }

        break;
      }

      case 'payment.refunded': {
        const refund = event.refundedPayment!;
        const userId = event.telegramUserId!;

        if (options.onEvent) {
          await options.onEvent('payment.refunded', {
            telegramUserId: userId,
            amount: refund.total_amount,
            payload: refund.invoice_payload,
          });
        }

        break;
      }
    }
  }

  /**
   * Create an invoice link for a subscription or one-time purchase.
   */
  async function createInvoice(params: {
    title: string;
    description: string;
    payload: string;
    amount: number;
    subscription?: boolean;
    photoUrl?: string;
  }): Promise<string> {
    return telegram.createInvoiceLink({
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices: [{ label: params.title, amount: params.amount }],
      subscription_period: params.subscription ? 2592000 : undefined,
      photo_url: params.photoUrl,
    });
  }

  /**
   * Check if a user has an active subscription.
   */
  async function isActive(telegramUserId: number): Promise<boolean> {
    const result = await api.isActive(telegramUserId);
    return result.active;
  }

  /**
   * Cancel a user's subscription (disables auto-renewal).
   */
  async function cancelSubscription(
    telegramUserId: number,
    telegramPaymentChargeId: string
  ): Promise<boolean> {
    return telegram.editUserStarSubscription(telegramUserId, telegramPaymentChargeId, true);
  }

  /**
   * Refund a Stars payment.
   */
  async function refund(
    telegramUserId: number,
    telegramPaymentChargeId: string
  ): Promise<boolean> {
    return telegram.refundStarPayment(telegramUserId, telegramPaymentChargeId);
  }

  return {
    middleware,
    handleUpdate,
    createInvoice,
    isActive,
    cancelSubscription,
    refund,
    telegram,
    api,
  };
}

export type StarsPay = ReturnType<typeof createStarsPay>;
