/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { PaymentMethodSelector } from '../../src/react/PaymentMethodSelector';
import type { PaymentProvider } from '../../src/server/providers/types';

describe('PaymentMethodSelector', () => {
  const providers: PaymentProvider[] = ['stars', 'telegram_payments'];

  it('renders one button per provider with the expected labels', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="stars"
        onChange={onChange}
      />
    );

    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(providers.length);

    expect(screen.getByText('Telegram Stars')).toBeTruthy();
    expect(screen.getByText('Card (via Telegram Payments)')).toBeTruthy();
  });

  it('renders only the providers supplied in availableProviders', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={['stars']}
        value="stars"
        onChange={onChange}
      />
    );

    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.queryByText('Card (via Telegram Payments)')).toBeNull();
  });

  it('marks the selected provider with aria-pressed="true" / aria-checked="true"', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="telegram_payments"
        onChange={onChange}
      />
    );

    const selected = screen.getByRole('radio', { name: 'Card (via Telegram Payments)' });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.getAttribute('aria-checked')).toBe('true');

    const starsBtn = screen.getByRole('radio', { name: 'Telegram Stars' });
    expect(starsBtn.getAttribute('aria-pressed')).toBe('false');
    expect(starsBtn.getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with the provider value when an unselected card is clicked', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="stars"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Card (via Telegram Payments)' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('telegram_payments');
  });

  it('does not call onChange when the already-selected provider is re-clicked', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="stars"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Telegram Stars' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks onChange and disables buttons when disabled=true', () => {
    const onChange = vi.fn();
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="stars"
        onChange={onChange}
        disabled
      />
    );

    const cardBtn = screen.getByRole('radio', { name: 'Card (via Telegram Payments)' });
    expect((cardBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(cardBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates the selected card when the consumer updates value', () => {
    function Harness() {
      const [provider, setProvider] = useState<PaymentProvider>('stars');
      return (
        <PaymentMethodSelector
          availableProviders={providers}
          value={provider}
          onChange={setProvider}
        />
      );
    }

    render(<Harness />);

    expect(
      screen.getByRole('radio', { name: 'Telegram Stars' }).getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Card (via Telegram Payments)' }));

    expect(
      screen.getByRole('radio', { name: 'Card (via Telegram Payments)' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: 'Telegram Stars' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('exposes data-provider on each button for styling hooks', () => {
    render(
      <PaymentMethodSelector
        availableProviders={providers}
        value="stars"
        onChange={() => {}}
      />
    );

    for (const p of providers) {
      const btn = document.querySelector(`[data-provider="${p}"]`);
      expect(btn).not.toBeNull();
    }
  });
});
