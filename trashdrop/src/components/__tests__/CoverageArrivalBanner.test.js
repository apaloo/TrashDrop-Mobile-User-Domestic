import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CoverageArrivalBanner from '../CoverageArrivalBanner.js';

// Plain functions, not jest.fn(): CRA's resetMocks wipes mock implementations before each test
let mockArrivals = [];
const mockClosed = [];
const mockNavigate = [];
jest.mock('react-router-dom', () => ({ useNavigate: () => (path) => mockNavigate.push(path) }));
jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../services/serviceCoverageService.js', () => ({
  getCoverageArrivals: async () => mockArrivals,
  closeCoverageWaitlistEntry: async (...args) => { mockClosed.push(args); },
}));

const arrival = (id, suburb, address) => ({ waitlist_id: id, suburb, address, district: 'D' });

beforeEach(() => {
  mockArrivals = [];
  mockClosed.length = 0;
  mockNavigate.length = 0;
});

describe('CoverageArrivalBanner', () => {
  it('shows nothing when no waitlisted place is covered yet', async () => {
    const { container } = render(<CoverageArrivalBanner />);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('announces an arrival and sends the user to book', async () => {
    mockArrivals = [arrival('w1', 'Kintampo Central', 'Kintampo, Bono East')];
    render(<CoverageArrivalBanner />);

    expect(await screen.findByText(/TrashDrop now operates in Kintampo Central/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Book a pickup' }));

    expect(mockClosed).toEqual([['w1', 'booked']]);
    expect(mockNavigate).toEqual(['/digital-bin']);
  });

  it('moves on to the next arrival after a dismissal', async () => {
    mockArrivals = [arrival('w1', 'Kintampo Central', 'Home'), arrival('w2', 'Techiman', 'Shop')];
    render(<CoverageArrivalBanner />);

    await screen.findByText(/Kintampo Central/);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(mockClosed).toEqual([['w1', 'dismissed']]);
    expect(await screen.findByText(/TrashDrop now operates in Techiman/)).toBeInTheDocument();
  });
});
