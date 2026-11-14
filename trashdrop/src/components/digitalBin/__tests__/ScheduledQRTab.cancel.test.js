// Cancelling a digital bin from the household's bin list. Collectors list
// bins by status, so the cancel must set status 'cancelled', not only
// is_active = false: on 2026-11-14 production had a bin cancelled that way that
// was still 'pending' and still offered to collectors.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScheduledQRTab from '../ScheduledQRTab.js';

const mockAuth = { user: { id: 'u1' } };
jest.mock('../../../context/AuthContext.js', () => ({ useAuth: () => mockAuth }));

const mockUpdates = [];
let mockError = null;
jest.mock('../../../utils/supabaseClient.js', () => ({
  __esModule: true,
  default: {
    from: (table) => ({
      update: (row) => ({
        eq: async (column, value) => {
          mockUpdates.push({ table, row, column, value });
          return { error: mockError };
        }
      })
    })
  }
}));
jest.mock('../../../utils/realtime.js', () => ({
  subscribeToPickupUpdates: () => ({ unsubscribe: () => {} }),
  handlePickupUpdate: () => {}
}));
jest.mock('../../../context/useArrivalQR.js', () => ({ useArrivalQR: () => ({ arrivedBin: null, showBinQR: () => {} }) }));
jest.mock('../../../utils/householdCache.js', () => ({ cachedBinsFor: () => [] }));
jest.mock('../../../utils/shareQrImage.js', () => ({ shareQrImage: async () => 'shared' }));
// The list itself has its own tests: here it shows each bin's status and a cancel button
jest.mock('../QRCodeList.js', () => ({
  __esModule: true,
  default: ({ pickups, onCancelPickup, emptyStateMessage }) => (
    pickups.length === 0 ? <p>{emptyStateMessage}</p> : pickups.map((p) => (
      <div key={p.id}>
        <span>{`${p.id}: ${p.status}`}</span>
        <button type="button" onClick={() => onCancelPickup(p.id)}>Cancel {p.id}</button>
      </div>
    ))
  )
}));

const BIN = { id: 'bin-1', location_id: 'loc-1', status: 'active', is_active: true, created_at: '2026-11-14T08:00:00Z' };

beforeEach(() => {
  mockUpdates.length = 0;
  mockError = null;
  localStorage.clear();
});

async function cancelBin(onRefresh = jest.fn()) {
  render(<ScheduledQRTab scheduledPickups={[BIN]} onRefresh={onRefresh} isLoading={false} />);
  expect(await screen.findByText('bin-1: active')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel bin-1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel Bin' }));
  return onRefresh;
}

it('cancelling sets the status collectors list by, as well as is_active', async () => {
  const onRefresh = await cancelBin();
  await waitFor(() => expect(mockUpdates).toHaveLength(1));
  expect(mockUpdates[0]).toMatchObject({
    table: 'digital_bins',
    row: { status: 'cancelled', is_active: false },
    column: 'id',
    value: 'bin-1'
  });
  expect(onRefresh).toHaveBeenCalled();
  // it moves off the Active tab
  expect(await screen.findByText("You don't have any active digital bins. Get a digital bin to start!")).toBeInTheDocument();
});

it('a refused cancel puts the bin back and says so', async () => {
  mockError = { message: 'Status cannot change from collecting to cancelled' };
  const onRefresh = await cancelBin();
  expect(await screen.findByText('Failed to cancel digital bin. Please try again.')).toBeInTheDocument();
  expect(screen.getByText('bin-1: active')).toBeInTheDocument();
  expect(onRefresh).not.toHaveBeenCalled();
});
