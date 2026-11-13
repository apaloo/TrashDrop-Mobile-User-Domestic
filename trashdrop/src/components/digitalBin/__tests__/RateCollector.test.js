// Households rate their collector (issue #186). The database decides who may
// rate what; the screen sends 1-5 stars and an optional comment, once.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RateCollector from '../RateCollector.js';
import { getMyRating, rateJob } from '../../../services/ratingService.js';

jest.mock('../../../services/ratingService.js', () => ({
  MAX_COMMENT_LENGTH: 500,
  getMyRating: jest.fn(),
  rateJob: jest.fn(),
}));

beforeEach(() => { getMyRating.mockReset(); rateJob.mockReset(); });

test('rates the collector with stars and a comment, then thanks the household', async () => {
  getMyRating.mockResolvedValue(null);
  rateJob.mockResolvedValue({ stars: 4 });
  render(<RateCollector jobId="bin-1" />);
  const send = await screen.findByRole('button', { name: 'Send rating' });
  expect(send).toBeDisabled(); // stars first
  await userEvent.click(screen.getByRole('button', { name: /^4 stars/ }));
  expect(screen.getByText('Good')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Comment/), 'On time, friendly');
  await userEvent.click(send);
  expect(rateJob).toHaveBeenCalledWith({ source: 'digital_bins', jobId: 'bin-1', stars: 4, comment: 'On time, friendly' });
  expect(await screen.findByRole('status')).toHaveTextContent('You rated your collector 4 stars. Thank you!');
});

test('says collectors see only their average, never the comment', async () => {
  getMyRating.mockResolvedValue(null);
  render(<RateCollector jobId="bin-1" />);
  expect(await screen.findByText(/sees only their average rating, never your comment/)).toBeInTheDocument();
});

test('an already rated job shows the rating and no form', async () => {
  getMyRating.mockResolvedValue({ stars: 1, comment: 'Late' });
  render(<RateCollector jobId="bin-1" />);
  expect(await screen.findByRole('status')).toHaveTextContent('You rated your collector 1 star. Thank you!');
  expect(screen.queryByRole('button', { name: 'Send rating' })).not.toBeInTheDocument();
});

test('the database\'s refusal is shown and the form stays', async () => {
  getMyRating.mockResolvedValue(null);
  rateJob.mockRejectedValue(new Error('You have already rated this pickup'));
  render(<RateCollector jobId="bin-1" />);
  await userEvent.click(await screen.findByRole('button', { name: /^5 stars/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Send rating' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You have already rated this pickup');
  expect(screen.getByRole('button', { name: 'Send rating' })).toBeEnabled();
});

test('the comment box stops at 500 characters', async () => {
  getMyRating.mockResolvedValue(null);
  render(<RateCollector jobId="bin-1" />);
  expect(await screen.findByLabelText(/Comment/)).toHaveAttribute('maxLength', '500');
});

test('if the earlier rating can\'t be read, the household can still try (the database decides)', async () => {
  getMyRating.mockRejectedValue(new Error('offline'));
  render(<RateCollector jobId="bin-1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send rating' })).toBeInTheDocument());
});
