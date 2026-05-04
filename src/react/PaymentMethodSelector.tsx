import type { CSSProperties } from 'react';
import type { PaymentProvider } from '../server/providers/types.js';

export interface PaymentMethodSelectorProps {
  /** Providers to render as selectable options. */
  availableProviders: PaymentProvider[];
  /** Currently-selected provider. */
  value: PaymentProvider;
  /** Called when the user selects a different provider. */
  onChange: (provider: PaymentProvider) => void;
  /** Disables all options. */
  disabled?: boolean;
}

interface ProviderCopy {
  label: string;
  description: string;
}

const PROVIDER_COPY: Record<PaymentProvider, ProviderCopy> = {
  stars: {
    label: 'Telegram Stars',
    description: 'Pay in-app with Stars',
  },
  telegram_payments: {
    label: 'Card (via Telegram Payments)',
    description: 'Credit or debit card checkout',
  },
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '8px',
  width: '100%',
};

function cardStyle(selected: boolean, disabled: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '12px 14px',
    borderRadius: '8px',
    border: `1px solid ${selected ? '#3b82f6' : '#d1d5db'}`,
    background: selected ? '#eff6ff' : '#ffffff',
    color: '#111827',
    textAlign: 'left',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    font: 'inherit',
    width: '100%',
  };
}

const labelStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '14px',
};

const descriptionStyle: CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
};

/**
 * A grid of selectable payment-method cards. Wire it up with a local `useState`
 * holding the chosen provider and pass the value through to `createInvoiceLink`
 * or the matching button component.
 *
 * @example
 * ```tsx
 * const [provider, setProvider] = useState<PaymentProvider>('stars');
 * <PaymentMethodSelector
 *   availableProviders={['stars', 'telegram_payments']}
 *   value={provider}
 *   onChange={setProvider}
 * />
 * ```
 */
export function PaymentMethodSelector({
  availableProviders,
  value,
  onChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Payment method" style={gridStyle}>
      {availableProviders.map((provider) => {
        const copy = PROVIDER_COPY[provider];
        const selected = provider === value;
        return (
          <button
            key={provider}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            aria-label={copy.label}
            data-provider={provider}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              if (provider !== value) onChange(provider);
            }}
            style={cardStyle(selected, disabled)}
          >
            <span style={labelStyle}>{copy.label}</span>
            <span style={descriptionStyle}>{copy.description}</span>
          </button>
        );
      })}
    </div>
  );
}
