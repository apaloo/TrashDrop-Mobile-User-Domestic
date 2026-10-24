import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DumpingReportForm from '../DumpingReportForm.js';
import { useAuth } from '../../context/AuthContext.js';

jest.mock('../../services/dumpingService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../context/AuthContext.js');
jest.mock('../CameraModal.js', () => () => null);

// The Report form keeps every field; the required taps come first and the
// optional details sit together near the end.
describe('DumpingReportForm layout', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user123' } });
    global.navigator.geolocation = { getCurrentPosition: jest.fn() };
  });

  const follows = (first, second) =>
    // eslint-disable-next-line no-bitwise
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('orders the sections: type, size, severity, location, photos, then optional details', () => {
    render(<DumpingReportForm />);
    const sections = [
      screen.getByText(/^Type of Waste/),
      screen.getByText(/^Size of the illegal dumping/),
      screen.getByText(/^Severity/),
      screen.getByText(/^Location/),
      screen.getByText(/^Take Photos/),
      screen.getByText('More details (optional)'),
    ];
    sections.slice(1).forEach((section, i) => expect(follows(sections[i], section)).toBe(true));
  });

  it('puts a 2-row description and the contact checkbox in the optional box', () => {
    render(<DumpingReportForm />);
    const box = screen.getByRole('group', { name: 'More details (optional)' });
    const description = within(box).getByLabelText('Description (optional)');
    expect(description.tagName).toBe('TEXTAREA');
    expect(description).toHaveAttribute('rows', '2');
    expect(within(box).getByRole('checkbox', { name: /willing to be contacted/i })).toBeInTheDocument();
  });

  it('keeps one Location label and every note', () => {
    render(<DumpingReportForm />);
    expect(screen.queryByText(/Pin Location/)).not.toBeInTheDocument();
    expect(screen.getByText(/Please click on the map to select a location/)).toBeInTheDocument();
    expect(screen.getByText(/Add at least 1 photo \(up to 6\)/)).toBeInTheDocument();
    expect(screen.getByText(/By submitting this report, you confirm/)).toBeInTheDocument();
  });
});
