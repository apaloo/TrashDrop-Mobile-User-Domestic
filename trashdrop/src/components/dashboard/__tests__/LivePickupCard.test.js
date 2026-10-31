import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LivePickupCard from '../LivePickupCard';

const pickup = (over) => ({
  id: 'p1', status: 'en_route', bag_count: 2, points_earned: 10,
  collector: { first_name: 'Kwame', last_name: 'Mensah' }, location: { address: 'Osu, Accra' }, ...over,
});
const show = (p, unread = 0) => render(<MemoryRouter><LivePickupCard pickup={p} unreadNotifications={unread} /></MemoryRouter>);

it('shows the collector, place, bags, points and how far the pickup has got', () => {
  show(pickup());
  expect(screen.getByText('Kwame Mensah')).toBeInTheDocument();
  expect(screen.getByText('Osu, Accra')).toBeInTheDocument();
  expect(screen.getByText('Pickup · 2 bags')).toBeInTheDocument();
  expect(screen.getByText('+10 points')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Pickup progress' })).getByText('On the way').closest('li')).toHaveAttribute('aria-current', 'step');
});

it('links to tracking and alerts while the collector is on the way, with the unread count', () => {
  show(pickup(), 3);
  expect(screen.getByRole('link', { name: /Track Collector/ })).toHaveAttribute('href', '/collector-tracking?pickupId=p1');
  expect(screen.getByRole('link', { name: /Alerts/ })).toHaveAttribute('href', '/notifications');
  expect(screen.getByText('3')).toBeInTheDocument();
});

it('marks a collected pickup as the last step', () => {
  show(pickup({ status: 'collecting' }));
  expect(screen.getByText('Collected').closest('li')).toHaveAttribute('aria-current', 'step');
});

it('shows a digital bin and its frequency', () => {
  show(pickup({ is_digital_bin: true, frequency: 'weekly', bag_count: 1 }));
  expect(screen.getByText('Digital bin · 1 bag')).toBeInTheDocument();
  expect(screen.getByText('weekly')).toBeInTheDocument();
});
