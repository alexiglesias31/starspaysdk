import { timingSafeEqual, createHmac } from 'node:crypto';
import type { TelegramUpdate, LabeledPrice } from '../types/telegram.js';
import {
  SUBSCRIPTION_PERIOD_SECONDS,
  SUBSCRIPTION_PERIOD_VALUES,
  STARS_SUPPORTED_PERIOD,
  MIN_INVOICE_AMOUNT,
  MAX_SUBSCRIPTION_AMOUNT,
  type StarsPayConfig,
} from '../types/config.js';
import type { Subscription, SubscriptionEventType } from '../types/subscription.js';
import type { PaymentProvider, ProviderInvoiceResult, ProviderRefundResult } from './providers/types.js';
import { StarsProvider } from './providers/stars.js';
import { TelegramPaymentsProvider } from './providers/telegram-payments.js';
import { parseWebhookUpdate, isPaymentUpdate } from './webhook.js';
import { parseProductLink } from '../product-links.js';
import { TelegramApiClient } from './telegram-api.js';
import { StarsPayApiClient } from './api-client.js';

const TELEGRAM_INVOICE_TITLE_MAX_BYTES = 32;
const TELEGRAM_INVOICE_DESCRIPTION_MAX_BYTES = 255;

export type StarsPayEventHandler = (
  event: SubscriptionEventType | 'payment.one_time' | 'payment.refunded',
  data: { subscription?: Subscription; telegramUserId: number; amount: number; payload: string; chargeId?: string }
) => void | Promise<void>;

export interface StarsPayServerOptions extends StarsPayConfig {
  /**
   * Called when payment events occur.
   * Use this to grant/revoke access to premium features.
   * Handlers must be idempotent because Telegram may retry the webhook on failure.
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

  /**
   * Custom shipping query handler for provider payments with is_flexible=true.
   * Return shipping options to approve, or null to reject.
   */
  onShippingQuery?: (data: {
    shippingQueryId: string;
    userId: number;
    payload: string;
    shippingAddress: {
      country_code: string;
      state: string;
      city: string;
      street_line1: string;
      street_line2: string;
      post_code: string;
    };
  }) => Array<{ id: string; title: string; prices: LabeledPrice[] }> | null | Promise<Array<{ id: string; title: string; prices: LabeledPrice[] }> | null>;

  /**
   * Optional webhook secret for validating incoming requests from Telegram.
   * When set, the middleware checks the `X-Telegram-Bot-Api-Secret-Token` header
   * and rejects requests that do not match with a 403 response.
   * Configure this secret in Telegram's setWebhook call via the `secret_token` parameter.
   */
  webhookSecret?: string;
}

/**
 * Constant-time comparison of a webhook secret header value against the expected secret.
 * Use this to authenticate incoming Telegram webhook requests when using `handleUpdate`
 * directly (outside the Express middleware, which performs this check automatically).
 *
 * Returns `false` if `headerValue` is null, undefined, or does not match `expected`.
 */
export function verifyWebhookSecret(a: string | null | undefined, expected: string): boolean {
  if (!expected) return false;
  const value = typeof a === 'string' ? a : '';
  if (!value) return false;
  // Hash both to fixed length to prevent timing oracle on secret length
  const valueBuf = createHmac('sha256', 'webhook-verify').update(value).digest();
  const expectedBuf = createHmac('sha256', 'webhook-verify').update(expected).digest();
  return timingSafeEqual(valueBuf, expectedBuf);
}

/**
 * Creates a StarsPay server instance with middleware and event handling.
 */
/** Private sentinel — only the middleware can produce this value. */
const MIDDLEWARE_VERIFIED = Symbol('middleware-verified');

export function createStarsPay(options: StarsPayServerOptions) {
  const telegram = new TelegramApiClient(options.botToken);
  const api = new StarsPayApiClient(options.apiKey, options.apiUrl);
  const debug = options.debug ?? false;

  function log(...args: unknown[]) {
    if (debug) {
      // Redact sensitive values from debug output
      const redacted = args.map(arg => {
        if (typeof arg === 'number' && arg > 0) return '[amount]';
        if (typeof arg === 'string' && arg.length > 20 && /^[A-Za-z0-9_-]+$/.test(arg)) return '[redacted]';
        return arg;
      });
      console.log('[starspay]', ...redacted);
    }
  }

  if (options.webhookSecret !== undefined && options.webhookSecret.trim().length === 0) {
    throw new Error('StarsPay: webhookSecret must not be empty or whitespace-only. Either provide a valid secret or omit the option.');
  }

  if (options.testMode) {
    const env = process.env?.NODE_ENV?.toLowerCase();
    const allowedEnvs = ['development', 'test'];
    if (!env || !allowedEnvs.includes(env)) {
      throw new Error(
        'StarsPay: testMode is enabled but NODE_ENV is not set to a development value. ' +
        'Set NODE_ENV to "development" or "test", or remove testMode for production.'
      );
    }
    // Defense-in-depth: refuse testMode when pointing at the production API
    const resolvedApiUrl = options.apiUrl || 'https://api.starspay.dev';
    if (resolvedApiUrl.includes('api.starspay.dev')) {
      throw new Error(
        'StarsPay: testMode cannot be used with the production API URL. ' +
        'Set a local/staging apiUrl or remove testMode.'
      );
    }
    log('WARNING: testMode is enabled — all entitlement checks will return true');
  }

  if (!options.webhookSecret) {
    if (!options.testMode) {
      throw new Error(
        'StarsPay: webhookSecret is required in production. ' +
        'Set webhookSecret and configure secret_token in Telegram setWebhook. ' +
        'Use testMode: true for development without a secret.'
      );
    }
    console.warn(
      '[starspay] WARNING: webhookSecret not set — webhook requests are not authenticated. ' +
      'Set webhookSecret and configure secret_token in Telegram setWebhook for production use.'
    );
  }

  /**
   * Express/Connect-compatible middleware.
   * Intercepts payment-related Telegram updates and processes them.
   * Non-payment updates are passed through to the next handler.
   */
  function middleware() {
    return async (
      req: { body: TelegramUpdate; headers: Record<string, string | string[] | undefined> },
      res: { sendStatus: (code: number) => void; status: (code: number) => { json: (data: unknown) => void } },
      next: () => void
    ) => {
      // Validate webhook secret if configured.
      // Telegram sends this via the X-Telegram-Bot-Api-Secret-Token header
      // when the secret_token parameter is provided to setWebhook.
      if (options.webhookSecret) {
        const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
        const headerValue = typeof secretHeader === 'string' ? secretHeader : null;
        if (!verifyWebhookSecret(headerValue, options.webhookSecret)) {
          res.status(403).json({ error: 'Invalid webhook secret' });
          return;
        }
      }

      const update = req.body;

      if (!update || typeof update !== 'object' || !isPaymentUpdate(update)) {
        return next();
      }

      try {
        // Pass the private sentinel so handleUpdate skips re-verification
        // (middleware already verified the secret above).
        await handleUpdate(update, MIDDLEWARE_VERIFIED);
        res.sendStatus(200);
      } catch (error) {
        log('Error processing payment update:', error);
        res.status(500).json({ error: 'Internal payment processing error' });
      }
    };
  }

  /**
   * Process a raw Telegram update.
   *
   * When webhookSecret is configured, you MUST pass the
   * X-Telegram-Bot-Api-Secret-Token header value as the second argument.
   * Omitting it throws an error to prevent unauthenticated processing.
   */
  async function handleUpdate(update: TelegramUpdate, secretHeader?: string | typeof MIDDLEWARE_VERIFIED): Promise<void> {
    if (options.testMode) {
      log('WARNING: Processing update in testMode — no webhook authentication');
    }

    if (!update || typeof update !== 'object') {
      throw new Error('StarsPay: handleUpdate expects a parsed TelegramUpdate object, not a raw string or Buffer');
    }

    // When the middleware calls handleUpdate, it passes MIDDLEWARE_VERIFIED (a private Symbol)
    // to signal that it already verified the secret. External callers cannot produce this value.
    if (secretHeader !== MIDDLEWARE_VERIFIED) {
      if (options.webhookSecret && secretHeader === undefined) {
        throw new Error(
          'StarsPay: webhookSecret is configured but secretHeader was not passed to handleUpdate. ' +
          'Pass the X-Telegram-Bot-Api-Secret-Token header value to authenticate the request.'
        );
      }

      // Warn when a secret header is passed but no webhookSecret is configured to verify against
      if (!options.webhookSecret && typeof secretHeader === 'string') {
        log('WARNING: Received webhook secret header but no webhookSecret is configured — request is NOT authenticated');
      }

      // Verify the secret when a string header is provided
      if (options.webhookSecret && !verifyWebhookSecret(secretHeader as string, options.webhookSecret)) {
        throw new Error('Invalid or missing webhook secret header. Set the secret_token in Telegram setWebhook.');
      }
    }

    if (!isPaymentUpdate(update)) return;

    const event = parseWebhookUpdate(update);
    log('Processing event:', event.type);

    switch (event.type) {
      case 'shipping_query': {
        if (!event.shippingQuery) {
          log('Received shipping_query event without query data — skipping');
          break;
        }
        const query = event.shippingQuery;
        if (options.onShippingQuery) {
          try {
            const shippingOptions = await options.onShippingQuery({
              shippingQueryId: query.id,
              userId: query.from.id,
              payload: query.invoice_payload,
              shippingAddress: query.shipping_address,
            });
            if (shippingOptions) {
              await telegram.answerShippingQuery(query.id, true, shippingOptions);
            } else {
              await telegram.answerShippingQuery(query.id, false, undefined, 'Shipping not available to this address');
            }
          } catch (error) {
            log('Shipping query handler error:', error instanceof Error ? error.message : 'unknown error');
            await telegram.answerShippingQuery(query.id, false, undefined, 'Error processing shipping');
          }
        } else {
          await telegram.answerShippingQuery(query.id, false, undefined, 'Shipping not configured');
        }
        break;
      }

      case 'pre_checkout': {
        if (!event.preCheckoutQuery) {
          log('Received pre_checkout event without query data — skipping');
          break;
        }
        const query = event.preCheckoutQuery;

        // Validate required nested fields before accessing them
        if (!query.from || typeof query.from.id !== 'number') {
          log('WARNING: pre_checkout_query.from is missing or from.id is not a number — skipping');
          break;
        }
        if (typeof query.id !== 'string' || typeof query.invoice_payload !== 'string') {
          log('WARNING: pre_checkout_query missing required fields (id, invoice_payload) — skipping');
          break;
        }

        let approved = true;
        let rejectionMessage = 'Payment validation failed';

        if (options.onPreCheckout) {
          try {
            const PRECHECKOUT_TIMEOUT_MS = 6_000;
            let timeoutHandle: ReturnType<typeof setTimeout>;
            approved = await Promise.race([
              Promise.resolve(options.onPreCheckout({
                userId: query.from.id,
                amount: query.total_amount,
                payload: query.invoice_payload,
              })).then(result => { clearTimeout(timeoutHandle); return result; }),
              new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => reject(new Error('Pre-checkout validation timed out')), PRECHECKOUT_TIMEOUT_MS);
              }),
            ]);
          } catch (error) {
            log('Pre-checkout validation error/timeout:', error instanceof Error ? error.message : 'unknown error');
            approved = false;
          }
        }

        if (approved) {
          try {
            const backendValidation = await api.reportPreCheckout({
              id: query.id,
              from: { id: query.from.id },
              currency: query.currency,
              total_amount: query.total_amount,
              invoice_payload: query.invoice_payload,
              shipping_option_id: query.shipping_option_id,
              order_info: query.order_info,
              is_recurring: query.is_recurring,
              is_first_recurring: query.is_first_recurring,
            });

            if (backendValidation.allowed === false) {
              approved = false;
              rejectionMessage = backendValidation.reason || 'Billing limit reached. Upgrade required.';
            }
          } catch (err) {
            log('Backend pre-checkout validation error:', err instanceof Error ? err.message : 'unknown error');
            approved = false;
          }
        }

        await telegram.answerPreCheckoutQuery(
          query.id,
          approved,
          approved ? undefined : rejectionMessage
        );

        break;
      }

      case 'payment.one_time':
      case 'payment.subscription_initial':
      case 'payment.subscription_renewal': {
        if (!event.telegramUserId) {
          // Missing userId on a real payment — throw to trigger 500 so Telegram retries
          throw new Error('Payment event received with no telegramUserId — returning 500 for retry');
        }
        if (!event.successfulPayment) {
          log('Received payment event without payment data — skipping');
          break;
        }
        const payment = event.successfulPayment;
        const userId = event.telegramUserId;

        // Validate required nested fields on the payment object
        if (
          typeof payment.telegram_payment_charge_id !== 'string' ||
          typeof payment.invoice_payload !== 'string' ||
          typeof payment.total_amount !== 'number' ||
          typeof payment.currency !== 'string'
        ) {
          log('WARNING: successful_payment missing required fields — skipping');
          break;
        }

        // Validate currency — only Telegram Stars (XTR) unless providers configured
        if (payment.currency !== 'XTR' && !options.payments?.providers) {
          log('WARNING: Received non-Stars payment but no providers configured:', payment.currency);
          break;
        }

        if (!event.paymentType) {
          log('Missing paymentType in payment event — skipping');
          break;
        }

        // Report payment to backend
        const result = await api.reportPayment({
          telegram_user_id: userId,
          payment_type: event.paymentType,
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
          const paymentTypeMap: Record<string, SubscriptionEventType | 'payment.one_time'> = {
            'one_time': 'payment.one_time',
            'subscription_initial': 'subscription.created',
            'subscription_renewal': 'subscription.renewed',
          };
          const eventType = paymentTypeMap[event.paymentType];
          if (!eventType) {
            log('Unknown paymentType:', event.paymentType);
            break;
          }

          try {
            await options.onEvent(eventType, {
              subscription: result.subscription,
              telegramUserId: userId,
              amount: payment.total_amount,
              payload: payment.invoice_payload,
            });
          } catch (eventError) {
            // The backend payment report is idempotent, so rethrow here to let Telegram retry.
            // Integrator handlers must be idempotent to tolerate retry delivery safely.
            log('onEvent handler error (request will be retried):', eventError);
            throw eventError;
          }
        }

        break;
      }

      case 'payment.refunded': {
        if (!event.telegramUserId) {
          // Missing userId on a real payment — throw to trigger 500 so Telegram retries
          throw new Error('Payment event received with no telegramUserId — returning 500 for retry');
        }
        if (!event.refundedPayment) {
          log('Received refund event without payment data — skipping');
          break;
        }
        const refund = event.refundedPayment;
        const userId = event.telegramUserId;

        // Report refund to backend so subscription status can be revoked
        await api.reportRefund({
          telegram_user_id: userId,
          telegram_payment_charge_id: refund.telegram_payment_charge_id,
          amount: refund.total_amount,
          invoice_payload: refund.invoice_payload,
        });

        if (options.onEvent) {
          try {
            await options.onEvent('payment.refunded', {
              telegramUserId: userId,
              amount: refund.total_amount,
              payload: refund.invoice_payload,
              chargeId: refund.telegram_payment_charge_id,
            });
          } catch (eventError) {
            // Refund recording is idempotent, so rethrow here to let Telegram retry.
            log('onEvent handler error (request will be retried):', eventError);
            throw eventError;
          }
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
    if (typeof params.title !== 'string' || params.title.length === 0 || Buffer.byteLength(params.title, 'utf8') > 32) {
      throw new Error('StarsPay: title is required and must be 1-32 bytes (UTF-8)');
    }
    if (typeof params.description !== 'string' || params.description.length === 0 || Buffer.byteLength(params.description, 'utf8') > 255) {
      throw new Error('StarsPay: description is required and must be 1-255 bytes (UTF-8)');
    }
    if (typeof params.payload !== 'string' || params.payload.length === 0 || Buffer.byteLength(params.payload, 'utf8') > 128) {
      throw new Error('StarsPay: payload is required and must be 1-128 bytes (UTF-8)');
    }
    if (/[\x00-\x1f\x7f]/.test(params.payload)) {
      throw new Error('StarsPay: payload must not contain control characters');
    }
    if (!Number.isInteger(params.amount) || params.amount < MIN_INVOICE_AMOUNT || params.amount > MAX_SUBSCRIPTION_AMOUNT) {
      throw new Error(
        `StarsPay: invalid invoice amount (${params.amount}). ` +
        `Must be an integer between ${MIN_INVOICE_AMOUNT} and ${MAX_SUBSCRIPTION_AMOUNT}.`
      );
    }

    return telegram.createInvoiceLink({
      title: params.title,
      description: params.description,
      payload: params.payload,
      prices: [{ label: params.title, amount: params.amount }],
      subscription_period: params.subscription ? SUBSCRIPTION_PERIOD_SECONDS : undefined,
      photo_url: params.photoUrl,
    });
  }

  /**
   * Create an invoice link using a specific payment provider.
   */
  async function createProviderInvoice(params: {
    title: string;
    description: string;
    payload: string;
    amount: number;
    currency: string;
    provider: PaymentProvider;
    telegramUserId?: number;
    subscription?: boolean;
    prices?: LabeledPrice[];
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
    if (params.provider === 'stars') {
      if (!Number.isInteger(params.amount) || params.amount < MIN_INVOICE_AMOUNT || params.amount > MAX_SUBSCRIPTION_AMOUNT) {
        throw new Error(`StarsPay: invalid Stars amount (${params.amount}). Must be ${MIN_INVOICE_AMOUNT}-${MAX_SUBSCRIPTION_AMOUNT}.`);
      }
      const starsProvider = new StarsProvider(telegram);
      return starsProvider.createInvoice({
        title: params.title,
        description: params.description,
        payload: params.payload,
        amount: params.amount,
        subscription: params.subscription,
        photoUrl: params.photoUrl,
      });
    }

    if (params.provider === 'telegram_payments') {
      if (!options.payments?.providers) {
        throw new Error('StarsPay: no providers configured. Set payments.providers in config.');
      }
      const providerEntries = Object.entries(options.payments.providers);
      if (providerEntries.length === 0) {
        throw new Error('StarsPay: no provider tokens configured.');
      }
      const [, providerConfig] = providerEntries[0];
      const telegramPaymentsProvider = new TelegramPaymentsProvider(telegram, {
        providerToken: providerConfig.token,
        testToken: providerConfig.testToken,
      }, options.testMode);

      return telegramPaymentsProvider.createInvoice({
        title: params.title,
        description: params.description,
        payload: params.payload,
        prices: params.prices || [{ label: params.title, amount: params.amount }],
        currency: params.currency,
        needName: params.needName,
        needEmail: params.needEmail,
        needPhoneNumber: params.needPhoneNumber,
        needShippingAddress: params.needShippingAddress,
        isFlexible: params.isFlexible,
        sendPhoneNumberToProvider: params.sendPhoneNumberToProvider,
        sendEmailToProvider: params.sendEmailToProvider,
        providerData: params.providerData,
        maxTipAmount: params.maxTipAmount,
        suggestedTipAmounts: params.suggestedTipAmounts,
        photoUrl: params.photoUrl,
      });
    }

    throw new Error(`StarsPay: unsupported provider "${params.provider}" for createProviderInvoice. Supported: stars, telegram_payments.`);
  }

  /**
   * Refund a payment using the appropriate provider.
   */
  async function refundPayment(params: {
    provider: PaymentProvider;
    chargeId: string;
    telegramUserId: number;
  }): Promise<ProviderRefundResult> {
    if (params.provider === 'stars') {
      const starsProvider = new StarsProvider(telegram);
      return starsProvider.refund(params.telegramUserId, params.chargeId);
    }
    return { success: false, provider: params.provider };
  }

  /**
   * Check if a user has an active subscription.
   * Always returns true when testMode is enabled.
   */
  async function isActive(telegramUserId: number): Promise<boolean> {
    if (options.testMode) {
      log('testMode: bypassing subscription check, returning active');
      return true;
    }
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

  /**
   * Handle a /start command with a product link payload.
   * Parses the start parameter, fetches product/price data, and sends
   * an invoice or subscription button to the chat.
   * Returns true if the param was a product link, false otherwise.
   */
  async function handleBotStart(chatId: number, startParam: string): Promise<boolean> {
    if (!Number.isInteger(chatId) || chatId === 0) {
      throw new Error('StarsPay: invalid chatId — must be a non-zero integer');
    }

    const parsed = parseProductLink(startParam);
    if (!parsed) return false;

    log('Product link detected:', parsed);

    const { price, product } = await api.getPrice(parsed.priceId);
    const invoiceText = getTelegramInvoiceText(product.name, product.description);

    if (product.active === false || price.active === false) {
      log('Product or price is inactive:', parsed.priceId);
      return false;
    }

    if (!Number.isInteger(price.amount) || price.amount < MIN_INVOICE_AMOUNT || price.amount > MAX_SUBSCRIPTION_AMOUNT) {
      log('Invalid price amount from API:', price.amount);
      return false;
    }

    // Validate subscription period — must be one of the supported cadences
    // (7d / 30d / 365d). Telegram Stars natively supports only 30d; for 7d
    // and 365d we create one-time invoices and let the renewal-scheduler on
    // the StarsPay backend drive subsequent invoices.
    if (price.period != null && !SUBSCRIPTION_PERIOD_VALUES.includes(price.period)) {
      log('Invalid subscription period from API:', price.period, '(expected one of', SUBSCRIPTION_PERIOD_VALUES.join(', '), ')');
      return false;
    }

    if (product.type === 'one_time') {
      await telegram.sendInvoice({
        chat_id: chatId,
        title: invoiceText.title,
        description: invoiceText.description,
        payload: `starspay:${price.app_id}:${price.id}:${chatId}`,
        prices: [{ label: invoiceText.title, amount: price.amount }],
      });
    } else {
      // Deterministic payload for subscriptions — renewal matching requires consistent payloads
      // across different chats; do not include chatId.
      // Only attach subscription_period for Telegram Stars at 30d (Telegram's
      // only natively-recurring cadence). For weekly / yearly Stars prices
      // and any non-Stars provider we create a one-time invoice; the
      // renewal-scheduler handles subsequent cycles.
      const linkParams: Parameters<typeof telegram.createInvoiceLink>[0] = {
        title: invoiceText.title,
        description: invoiceText.description,
        payload: `starspay:${price.app_id}:${price.id}`,
        prices: [{ label: invoiceText.title, amount: price.amount }],
      };
      if (price.period === STARS_SUPPORTED_PERIOD) {
        linkParams.subscription_period = STARS_SUPPORTED_PERIOD;
      }
      const invoiceUrl = await telegram.createInvoiceLink(linkParams);

      // Escape Markdown special characters in user-provided product data
      const safeName = escapeMarkdown(product.name);
      const safeDesc = escapeMarkdown(product.description || 'Subscribe to get access.');
      await telegram.sendMessage(chatId,
        `*${safeName}*\n\n${safeDesc}`, {
        parseMode: 'MarkdownV2',
        replyMarkup: {
          inline_keyboard: [[{
            text: `Subscribe for ${price.amount} Stars/month`,
            url: invoiceUrl,
          }]],
        },
      });
    }

    return true;
  }

  return {
    middleware,
    handleUpdate,
    handleBotStart,
    createInvoice,
    createProviderInvoice,
    refundPayment,
    isActive,
    cancelSubscription,
    refund,
    telegram,
    api,
  };
}

export type StarsPay = ReturnType<typeof createStarsPay>;

/** Escape Telegram Markdown special characters in user-provided strings. */
function escapeMarkdown(text: string): string {
  // Strip Unicode control characters (Cc and Cf) to prevent bidi/visual spoofing
  const cleaned = text.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '');
  return cleaned.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function getTelegramInvoiceText(name: string, description?: string | null): { title: string; description: string } {
  const fallbackTitle = 'Purchase';
  const fallbackDescription = 'StarsPay purchase';

  const title = truncateUtf8WithEllipsis(name, TELEGRAM_INVOICE_TITLE_MAX_BYTES) || fallbackTitle;
  const resolvedDescription = description && description.trim().length > 0
    ? description
    : name;
  const truncatedDescription = truncateUtf8WithEllipsis(
    resolvedDescription,
    TELEGRAM_INVOICE_DESCRIPTION_MAX_BYTES
  );

  return {
    title,
    description: truncatedDescription || fallbackDescription,
  };
}

function truncateUtf8WithEllipsis(value: string, maxBytes: number): string {
  const normalized = value.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  if (!normalized) return '';
  if (Buffer.byteLength(normalized, 'utf8') <= maxBytes) return normalized;

  const suffix = maxBytes > 3 ? '...' : '';
  const budget = maxBytes - suffix.length;
  let truncated = '';
  let usedBytes = 0;

  for (const char of normalized) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (usedBytes + charBytes > budget) break;
    truncated += char;
    usedBytes += charBytes;
  }

  const safeBase = truncated.trimEnd();
  return safeBase ? `${safeBase}${suffix}` : normalized.slice(0, maxBytes);
}
