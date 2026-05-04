/** Telegram Bot API payment-related types for Stars (XTR) */

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface LabeledPrice {
  label: string;
  amount: number;
}

export interface PreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
  shipping_option_id?: string;
  order_info?: Record<string, unknown>;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

export interface RefundedPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

export interface Message {
  message_id: number;
  from?: TelegramUser;
  date: number;
  text?: string;
  chat: {
    id: number;
    type: string;
  };
  successful_payment?: SuccessfulPayment;
  refunded_payment?: RefundedPayment;
}

export interface TelegramUpdate {
  update_id: number;
  message?: Message;
  pre_checkout_query?: PreCheckoutQuery;
  shipping_query?: ShippingQuery;
  my_chat_member?: ChatMemberUpdated;
  chat_join_request?: ChatJoinRequest;
  callback_query?: CallbackQuery;
}

/** Parameters for createInvoiceLink */
export interface CreateInvoiceLinkParams {
  title: string;
  description: string;
  payload: string;
  currency?: 'XTR';
  prices: LabeledPrice[];
  subscription_period?: number;
  photo_url?: string;
  photo_size?: number;
  photo_width?: number;
  photo_height?: number;
}

/** Parameters for sendInvoice (one-time purchases only) */
export interface SendInvoiceParams {
  chat_id: number | string;
  title: string;
  description: string;
  payload: string;
  currency?: 'XTR';
  prices: LabeledPrice[];
  photo_url?: string;
  start_parameter?: string;
}

/** WebApp initData types */
export interface WebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  is_bot?: boolean;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface WebAppInitData {
  query_id?: string;
  user?: WebAppUser;
  receiver?: WebAppUser;
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  };
  chat_type?: 'sender' | 'private' | 'group' | 'supergroup' | 'channel';
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
  signature?: string;
}

/** Bot API response wrapper */
export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** Star transaction from getStarTransactions */
export interface StarTransaction {
  id: string;
  amount: number;
  nanostar_amount?: number;
  date: number;
  source?: TransactionPartner;
  receiver?: TransactionPartner;
}

export interface TransactionPartner {
  type: string;
  user?: TelegramUser;
  invoice_payload?: string;
  subscription_period?: number;
}

export interface StarTransactions {
  transactions: StarTransaction[];
}

/** Bot info from getMe */
export interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/** Parameters for setWebhook */
export interface SetWebhookParams {
  url: string;
  secret_token?: string;
  allowed_updates?: string[];
  max_connections?: number;
  drop_pending_updates?: boolean;
}

/** Chat member status update (my_chat_member / chat_member) */
export interface ChatMemberUpdated {
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  from: TelegramUser;
  date: number;
  old_chat_member: {
    status: string;
    user: TelegramUser;
  };
  new_chat_member: {
    status: string;
    user: TelegramUser;
  };
}

/** Callback query from inline keyboard buttons */
export interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message?: Message;
  data?: string;
  chat_instance?: string;
}

/** Chat invite link object returned by createChatInviteLink */
export interface ChatInviteLink {
  invite_link: string;
  creator: TelegramUser;
  creates_join_request: boolean;
  is_primary: boolean;
  is_revoked: boolean;
  name?: string;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
}

/** Parameters for createChatInviteLink */
export interface CreateChatInviteLinkParams {
  chat_id: number | string;
  name?: string;
  expire_date?: number;
  member_limit?: number;
  creates_join_request?: boolean;
}

/** Chat join request from chat_join_request update */
export interface ChatJoinRequest {
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  from: TelegramUser;
  user_chat_id: number;
  date: number;
  bio?: string;
  invite_link?: ChatInviteLink;
}

/** Chat member info returned by getChatMember */
export interface ChatMemberInfo {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: TelegramUser;
}

/** Shipping query from a user who selected a shipping address */
export interface ShippingQuery {
  id: string;
  from: TelegramUser;
  invoice_payload: string;
  shipping_address: {
    country_code: string;
    state: string;
    city: string;
    street_line1: string;
    street_line2: string;
    post_code: string;
  };
}
