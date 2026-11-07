import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageHeader from '../PageHeader.js';

describe('PageHeader back button', () => {
  it('shows a round back button before the title that goes back when tapped', () => {
    const onBack = jest.fn();
    render(<PageHeader title="Notifications" onBack={onBack} backLabel="Back to Dashboard" />);

    const back = screen.getByRole('button', { name: 'Back to Dashboard' });
    expect(back).toHaveClass('rounded-full', 'h-11', 'w-11');
    // An icon button, not a text link
    expect(back).toHaveTextContent('');
    expect(back.compareDocumentPosition(screen.getByRole('heading', { name: 'Notifications' })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no back button unless the page asks for one', () => {
    render(<PageHeader title="Rewards" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
