import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArrivalQRProvider, useArrivalQR } from '../ArrivalQRContext.js';
import { useAuth } from '../AuthContext.js';
import supabase from '../../utils/supabaseClient.js';
import { getQRCode } from '../../utils/qrStorage.js';

jest.mock('../AuthContext.js', () => ({ useAuth: jest.fn() }));
jest.mock('../../utils/qrStorage.js', () => ({ getQRCode: jest.fn(), storeQRCode: jest.fn() }));
jest.mock('../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));

// A query that resolves to rows however it is chained
const query = (rows) => {
  const chain = {};
  ['select', 'eq', 'order', 'limit'].forEach((m) => { chain[m] = () => chain; });
  chain.maybeSingle = () => Promise.resolve({ data: null });
  chain.then = (resolve) => resolve({ data: rows });
  return chain;
};

let onBinUpdate;
const Probe = () => {
  const { arrivedBin, showBinQR } = useArrivalQR();
  return (
    <>
      <p>arrived: {arrivedBin ? arrivedBin.id : 'none'}</p>
      <button type="button" onClick={() => showBinQR({ id: 'bin-9' })}>open bin-9</button>
    </>
  );
};
const mount = () => render(<ArrivalQRProvider><Probe /></ArrivalQRProvider>);

describe('ArrivalQRProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.mockReturnValue({ user: { id: 'u1' } });
    getQRCode.mockResolvedValue({ qrCodeUrl: 'data:image/png;base64,SAME' });
    supabase.channel.mockImplementation(() => {
      const channel = {
        on: (_event, _filter, handler) => { onBinUpdate = handler; return channel; },
        subscribe: () => channel,
      };
      return channel;
    });
    supabase.from.mockImplementation(() => query([]));
  });

  it('opens the QR code by itself when the collector has already arrived, once', async () => {
    supabase.from.mockImplementation(() => query([{ id: 'bin-1', location_id: 'loc-1', bin_locations: { location_name: 'Home' } }]));
    const { unmount } = mount();

    expect(await screen.findByRole('dialog')).toHaveTextContent('Your collector is here');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('arrived: bin-1')).toBeInTheDocument();
    // The code shown is the one kept for this bin (the one My Digital Bins shows)
    await waitFor(() => expect(screen.getByAltText('Digital bin QR code')).toHaveAttribute('src', 'data:image/png;base64,SAME'));
    expect(getQRCode).toHaveBeenCalledWith('bin-1');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Coming back to the app during the same arrival doesn't push it again
    unmount();
    mount();
    expect(await screen.findByText('arrived: bin-1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("opens when the collector's app marks the bin arrived, and puts it away after the scan", async () => {
    mount();
    await waitFor(() => expect(onBinUpdate).toBeDefined());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => onBinUpdate({ new: { id: 'bin-2', status: 'arrived', location_id: null } }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Your collector is here');

    // The collector's scan moves the bin to 'collecting'
    act(() => onBinUpdate({ new: { id: 'bin-2', status: 'collecting' } }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('arrived: none')).toBeInTheDocument();
  });

  it('ignores other status changes', async () => {
    mount();
    await waitFor(() => expect(onBinUpdate).toBeDefined());
    act(() => onBinUpdate({ new: { id: 'bin-3', status: 'en_route' } }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens any bin on request, before arrival too', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'open bin-9' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Your bin QR code');
  });
});
