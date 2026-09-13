'use client';

import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { quoteAmounts, type Offering } from 'wayleave-merchant';
import { gatewayResponse } from '../lib/gateway-response';
import { developerPackPublicUrl, formatUsdc } from '../lib/merchant-purchase';
import './developer-pack.css';

/** Public storefront. Purchase history and owner approval live in Payments. */
export function DeveloperPack() {
  const [offering, setOffering] = useState<Offering>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/gateway/merchant/offerings', { signal: controller.signal })
      .then(gatewayResponse<{ offerings: Offering[] }>)
      .then((value) => {
        if (!controller.signal.aborted)
          setOffering(
            value.offerings.find(
              (item) => item.id === 'wayleave-developer-pack',
            ),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('The merchant catalog is unavailable. Reload to retry.');
      });
    return () => controller.abort();
  }, []);
  let debit = '';
  try {
    if (offering)
      debit = quoteAmounts(offering.price, offering.maxTransferFee).sourceDebit;
  } catch {
    /* Unavailable configuration has no valid quote. */
  }
  return (
    <section
      className="developer-pack"
      aria-label="Wayleave Developer Pack checkout"
    >
      <div className="developer-pack-heading">
        <span className="developer-pack-icon">
          <Package size={24} />
        </span>
        <div>
          <span className="developer-pack-kicker">
            CURRENT OFFERING · TESTNET
          </span>
          <h2>Payment terms</h2>
        </div>
      </div>
      {offering ? (
        <>
          <div className="developer-pack-price">
            <strong>{formatUsdc(offering.price)}</strong> test USDC
          </div>
          <p>Received on Ethereum Sepolia. The buyer wallet pays on Arc.</p>
          <p className="developer-pack-note">
            Your payment is capped at {formatUsdc(debit)} USDC, plus gas. Up to{' '}
            {formatUsdc(offering.maxTransferFee)} USDC covers transfer fees; any
            unused budget goes to the merchant.
          </p>
        </>
      ) : (
        <p role="status">{error || 'Loading current price…'}</p>
      )}
      {offering && !offering.available && (
        <p role="status">
          Checkout is not configured yet. You can read the pack contents and
          instructions.
        </p>
      )}
      <p>
        Offering ID: <code>wayleave-developer-pack</code>
      </p>
      <p>
        Use <code>list_offerings</code> through your configured Wayleave
        connection to check availability, then request an exact quote. These
        displayed terms do not authorize payment.
      </p>
      <p className="developer-pack-note">
        Public purchase page:{' '}
        <a href={developerPackPublicUrl}>{developerPackPublicUrl}</a>
      </p>
    </section>
  );
}
