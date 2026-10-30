import React, { useEffect, useRef, useState } from 'react';
import { normalizeGhanaPhone, MOBILE_NETWORKS } from '../../utils/ghanaPhone.js';

/**
 * Confirms an airtime or data reward: which number to top up and on which
 * network. TrashDrop staff send it by hand, so these are what they need.
 */
const RedeemDialog = ({ reward, defaultPhone = '', busy = false, serverError = '', onCancel, onConfirm }) => {
  const [phone, setPhone] = useState(defaultPhone);
  const [network, setNetwork] = useState('');
  const [error, setError] = useState('');
  const phoneRef = useRef(null);

  useEffect(() => { setPhone(defaultPhone); }, [defaultPhone]);
  useEffect(() => { phoneRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const kind = reward.category === 'data' ? 'data bundle' : 'airtime';

  const submit = (e) => {
    e.preventDefault();
    const local = normalizeGhanaPhone(phone);
    if (!local) { setError('Enter a Ghana mobile number, e.g. 024 412 3456'); return; }
    if (!network) { setError('Choose your network'); return; }
    setError('');
    onConfirm({ phone: local, network });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="redeem-title"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
      >
      <form onSubmit={submit}>
        <h2 id="redeem-title" className="text-xl font-bold text-td-ink dark:text-white">{reward.name}</h2>
        <p className="mt-1 text-sm text-td-sage dark:text-gray-300">
          {reward.pointsCost.toLocaleString()} points. We'll send the {kind} to this number.
        </p>

        <label htmlFor="redeem-phone" className="mt-5 block text-sm font-medium text-td-ink dark:text-gray-200">Phone number</label>
        <input
          id="redeem-phone"
          ref={phoneRef}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError(''); }}
          placeholder="024 412 3456"
          className="mt-1 w-full rounded-lg border border-td-border dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-base text-td-ink dark:text-white"
        />

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-td-ink dark:text-gray-200">Network</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MOBILE_NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={network === n}
                onClick={() => { setNetwork(n); setError(''); }}
                className={`rounded-lg border px-2 py-2 text-sm font-medium ${
                  network === n
                    ? 'border-td-forest bg-td-tonal text-td-forest dark:border-green-300 dark:bg-green-900/40 dark:text-green-200'
                    : 'border-td-border text-td-ink dark:border-gray-600 dark:text-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        {(error || serverError) && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error || serverError}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-td-border dark:border-gray-600 px-4 py-2 text-sm font-medium text-td-ink dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-primary hover:bg-primary-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
          >
            {busy ? 'Redeeming…' : 'Redeem'}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default RedeemDialog;
