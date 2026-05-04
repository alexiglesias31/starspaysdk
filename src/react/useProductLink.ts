import { useState, useEffect } from 'react';
import type { Product, Price } from '../types/payment.js';
import { parseProductLink } from '../product-links.js';
import { useStarsPay } from './StarsPayProvider.js';

export interface UseProductLinkResult {
  /** Whether the startParam was a valid product link */
  isProductLink: boolean;
  /** The parsed price ID */
  priceId: string | null;
  /** The fetched product (null while loading or if not a product link) */
  product: Product | null;
  /** The fetched price (null while loading or if not a product link) */
  price: Price | null;
  /** Whether data is being fetched */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
}

/**
 * Hook that parses a Telegram `startapp`/`start` parameter and fetches the
 * associated product and price from the StarsPay API.
 *
 * @example
 * ```tsx
 * const startParam = Telegram.WebApp.initDataUnsafe.start_param;
 * const { isProductLink, product, price, isLoading } = useProductLink(startParam);
 * ```
 */
export function useProductLink(startParam?: string): UseProductLinkResult {
  const { client } = useStarsPay();

  // Parse outside the effect so we can extract the stable priceId string to
  // use as a dependency, avoiding re-runs when the parsed object reference changes.
  const parsed = startParam ? parseProductLink(startParam) : null;
  const priceId = parsed?.priceId ?? null;

  const [product, setProduct] = useState<Product | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [isLoading, setIsLoading] = useState(!!priceId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!priceId) {
      setProduct(null);
      setPrice(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    client.getPrice(priceId).then(
      (result: { price: Price; product: Product }) => {
        if (cancelled) return;
        setProduct(result.product);
        setPrice(result.price);
        setIsLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setProduct(null);
        setPrice(null);
        setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [client, priceId]);

  return {
    isProductLink: !!priceId,
    priceId,
    product,
    price,
    isLoading,
    error,
  };
}
