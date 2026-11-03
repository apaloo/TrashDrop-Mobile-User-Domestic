import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PhotoViewer from '../PhotoViewer';

const Harness = ({ photos, start = 0 }) => {
  const [index, setIndex] = useState(start);
  return index === null
    ? <p>closed</p>
    : <PhotoViewer photos={photos} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} />;
};
const photos = ['a.jpg', 'b.jpg', 'c.jpg'];
const viewerImage = () => screen.getByRole('dialog').querySelector('img');
const wait = (ms) => act(() => { jest.advanceTimersByTime(ms); });

describe('PhotoViewer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('moves with arrows, keys and swipes, wrapping at the ends', () => {
    render(<Harness photos={photos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(viewerImage()).toHaveAttribute('src', 'c.jpg');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(viewerImage()).toHaveAttribute('src', 'a.jpg');

    const stage = viewerImage().parentElement;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100 }] });
    expect(viewerImage()).toHaveAttribute('src', 'b.jpg');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('plays as a slideshow every 4 seconds and loops', () => {
    render(<Harness photos={photos} />);
    wait(3999);
    expect(viewerImage()).toHaveAttribute('src', 'a.jpg');
    wait(1);
    expect(viewerImage()).toHaveAttribute('src', 'b.jpg');
    wait(4000);
    wait(4000);
    expect(viewerImage()).toHaveAttribute('src', 'a.jpg');
  });

  it('pauses and plays with the button and the space bar', () => {
    render(<Harness photos={photos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }));
    wait(10000);
    expect(viewerImage()).toHaveAttribute('src', 'a.jpg');
    fireEvent.keyDown(window, { key: ' ' });
    wait(4000);
    expect(viewerImage()).toHaveAttribute('src', 'b.jpg');
  });

  it('gives a photo the full 4 seconds after a manual move', () => {
    render(<Harness photos={photos} />);
    wait(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    wait(3000);
    expect(viewerImage()).toHaveAttribute('src', 'b.jpg');
    wait(1000);
    expect(viewerImage()).toHaveAttribute('src', 'c.jpg');
  });

  it('shows no slideshow controls for a single photo', () => {
    render(<Harness photos={['only.jpg']} />);
    expect(screen.queryByRole('button', { name: /slideshow/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
  });

  it('closes with Escape, X and CLOSE', () => {
    const { unmount } = render(<Harness photos={photos} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('closed')).toBeInTheDocument();
    unmount();

    render(<Harness photos={photos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close photo viewer' }));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('closes with the large CLOSE button', () => {
    render(<Harness photos={photos} />);
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE' }));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});
