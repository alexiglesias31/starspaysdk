export class TxLimitExceededError extends Error {
  readonly code = 'tx_limit_exceeded' as const;
  readonly tier: string;
  readonly txCount: number;
  readonly txLimit: number;

  constructor(tier: string, txCount: number, txLimit: number) {
    super(`StarsPay: app on ${tier} plan reached ${txCount}/${txLimit} transactions in the last 30 days.`);
    this.name = 'TxLimitExceededError';
    this.tier = tier;
    this.txCount = txCount;
    this.txLimit = txLimit;
    Object.setPrototypeOf(this, TxLimitExceededError.prototype);
  }
}
