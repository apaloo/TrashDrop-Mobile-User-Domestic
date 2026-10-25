import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CameraModal from '../CameraModal.js';

// A working camera in jsdom: a stream, a playing video and a canvas
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 720 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1280 });
  // Plain functions: the test setup resets jest.fn implementations between tests
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => {}, clearRect: () => {} });
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
});

beforeEach(() => {
  jest.useFakeTimers();
  global.URL.createObjectURL = jest.fn(() => 'blob:photo');
  global.URL.revokeObjectURL = jest.fn();
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn(() => Promise.resolve({ getTracks: () => [{ stop: jest.fn() }] })) },
  });
});

afterEach(() => jest.useRealTimers());

const setup = async (props) => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onCapture = jest.fn();
  const onClose = jest.fn();
  render(<CameraModal onCapture={onCapture} onClose={onClose} maxPhotos={6} {...props} />);
  const button = await screen.findByRole('button', { name: 'Capture photo' });
  await waitFor(() => expect(button).toBeEnabled());
  return { user, onCapture, onClose, button };
};

describe('CameraModal photo count', () => {
  it('flashes the count large after each photo, then hides it', async () => {
    const { user, button } = await setup();

    await user.click(button);
    expect(screen.getByTestId('photo-count-flash')).toHaveTextContent('1/6');
    expect(screen.getByTestId('photo-count')).toHaveTextContent('1/6');

    await user.click(button);
    expect(screen.getByTestId('photo-count-flash')).toHaveTextContent('2/6');

    act(() => { jest.advanceTimersByTime(1300); });
    expect(screen.queryByTestId('photo-count-flash')).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-count')).toHaveTextContent('2/6');
  });

  it('shows 6/6, then closes by itself (no extra tap, no 7th photo)', async () => {
    const { user, button, onCapture, onClose } = await setup({ currentCount: 5 });

    await user.click(button); // the 6th photo
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('photo-count-flash')).toHaveTextContent('6/6');
    expect(button).toBeDisabled(); // a quick extra tap can't take a 7th
    expect(onClose).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1300); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
