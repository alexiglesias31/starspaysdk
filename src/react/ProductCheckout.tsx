import type { ReactNode } from 'react';
import { useProductLink } from './useProductLink.js';
import { PurchaseButton } from './PurchaseButton.js';
import { SubscriptionButton } from './SubscriptionButton.js';

export interface ProductCheckoutProps {
  /** The start_param from Telegram.WebApp.initDataUnsafe */
  startParam?: string;
  /** Content to show while loading product data */
  loading?: ReactNode;
  /** Content to show if the startParam is not a valid product link */
  notFound?: ReactNode;
  /** Content to show on error — can be a render function receiving the error */
  error?: ReactNode | ((error: Error) => ReactNode);
  /** Called after successful payment */
  onSuccess?: () => void;
  /** Called when payment fails */
  onError?: (error: Error) => void;
}

/**
 * Drop-in checkout component for when a user lands on the Mini App via a
 * product link. Parses the start parameter, fetches product/price data, and
 * renders the appropriate payment button.
 *
 * Intentionally unstyled — wrap with your own layout and styles.
 *
 * @example
 * ```tsx
 * const startParam = Telegram.WebApp.initDataUnsafe.start_param;
 * <ProductCheckout
 *   startParam={startParam}
 *   loading={<p>Loading...</p>}
 *   notFound={<p>Product not found.</p>}
 *   onSuccess={() => router.push('/thank-you')}
 * />
 * ```
 */
export function ProductCheckout({
  startParam,
  loading = null,
  notFound = null,
  error: errorProp,
  onSuccess,
  onError,
}: ProductCheckoutProps) {
  // When startParam is undefined/null (Telegram context not yet loaded), show loading
  if (startParam == null) {
    return <>{loading}</>;
  }

  return (
    <ProductCheckoutInner
      startParam={startParam}
      loading={loading}
      notFound={notFound}
      error={errorProp}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
}

/** Inner component that only renders when startParam is a defined string */
function ProductCheckoutInner({
  startParam,
  loading,
  notFound,
  error: errorProp,
  onSuccess,
  onError,
}: ProductCheckoutProps & { startParam: string }) {
  const { isProductLink, priceId, product, price, isLoading, error } = useProductLink(startParam);

  if (!isProductLink) {
    return <>{notFound}</>;
  }

  if (isLoading) {
    return <>{loading}</>;
  }

  if (error || !product || !price || !priceId) {
    const errorToRender = error ?? new Error('Failed to load product');

    if (typeof errorProp === 'function') {
      return <>{errorProp(errorToRender)}</>;
    }

    return <>{errorProp ?? null}</>;
  }

  return (
    <section aria-label={product.name}>
      <h2>{product.name}</h2>
      {product.description && <p>{product.description}</p>}
      {product.type === 'subscription' ? (
        <SubscriptionButton priceId={priceId} onSuccess={onSuccess} onError={onError}>
          {`Subscribe for ${price.amount} Stars/month`}
        </SubscriptionButton>
      ) : (
        <PurchaseButton priceId={priceId} onSuccess={onSuccess} onError={onError}>
          {`Buy for ${price.amount} Stars`}
        </PurchaseButton>
      )}
    </section>
  );
}
