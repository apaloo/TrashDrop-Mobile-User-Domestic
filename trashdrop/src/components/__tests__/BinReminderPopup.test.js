import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import BinReminderPopup from '../BinReminderPopup.js';
import { answerReminder, getOpenReminder } from '../../services/binReminderService.js';

jest.mock('../../context/AuthContext.js', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../services/binReminderService.js', () => {
  const actual = jest.requireActual('../../services/binReminderService.js');
  return { ...actual, getOpenReminder: jest.fn(), answerReminder: jest.fn() };
});

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const reminder = () => ({
  reminder_id: 'rem-1',
  plan_id: 'plan-1',
  due_date: tomorrow(),
  frequency: 'weekly',
  preferred_time: 'morning',
  location_id: 'loc-1',
  location_name: 'Home',
  bin_size_liters: 120,
  waste_type: 'general',
  bag_count: 2
});

// Shows where "Book it now" went and what it carried
const BookingPage = () => {
  const { state } = useLocation();
  return <p>Booking {state?.bookFromReminder?.reminder_id}</p>;
};

const renderAt = (path = '/dashboard') => render(
  <MemoryRouter initialEntries={[path]}>
    <BinReminderPopup />
    <Routes>
      <Route path="/dashboard" element={<p>Dashboard</p>} />
      <Route path="/digital-bin" element={<BookingPage />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  sessionStorage.clear();
  getOpenReminder.mockResolvedValue(reminder());
  answerReminder.mockResolvedValue(undefined);
});

describe('Collection reminder pop-up', () => {
  it('pops up the day before with the collection details', async () => {
    renderAt();
    expect(await screen.findByRole('alertdialog', { name: 'Your weekly collection is tomorrow' })).toBeInTheDocument();
    expect(screen.getByText(/morning \(8am - 12pm\) at Home/)).toBeInTheDocument();
    expect(screen.getByText(/2 bins, 120L, general waste/)).toBeInTheDocument();
  });

  it('Book it now opens the booking form with the reminder', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Book it now' }));
    expect(screen.getByText('Booking rem-1')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(answerReminder).not.toHaveBeenCalled();
  });

  it('Skip this time answers the reminder and closes', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip this time' }));
    expect(answerReminder).toHaveBeenCalledWith('rem-1', 'skip');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('Stop these reminders asks first, then stops them', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop these reminders' }));
    expect(screen.getByRole('alertdialog', { name: 'Stop these reminders?' })).toBeInTheDocument();
    expect(answerReminder).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop these reminders' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, stop reminders' }));
    expect(answerReminder).toHaveBeenCalledWith('rem-1', 'stop');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('Not now hides it until the app is opened again', async () => {
    const { unmount } = renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(answerReminder).not.toHaveBeenCalled();
    unmount();
    const callsBefore = getOpenReminder.mock.calls.length;

    renderAt();
    await waitFor(() => expect(getOpenReminder.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows an error and stays open when the answer does not save', async () => {
    answerReminder.mockRejectedValue(new Error("We couldn't save that. Please try again."));
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip this time' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save that");
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('does not cover the booking form', async () => {
    renderAt('/digital-bin');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows nothing when there is no reminder', async () => {
    getOpenReminder.mockResolvedValue(null);
    renderAt();
    await waitFor(() => expect(getOpenReminder).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
