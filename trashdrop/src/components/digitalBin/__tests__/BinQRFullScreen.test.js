import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BinQRFullScreen, { ensureBinQR } from '../BinQRFullScreen.js';
import { getQRCode, storeQRCode } from '../../../utils/qrStorage.js';

jest.mock('../../../utils/qrStorage.js', () => ({ getQRCode: jest.fn(), storeQRCode: jest.fn() }));

describe('BinQRFullScreen', () => {
  it('uses the code already kept on the phone', async () => {
    getQRCode.mockResolvedValue({ qrCodeUrl: 'data:image/png;base64,KEPT' });
    await expect(ensureBinQR('bin-1')).resolves.toBe('data:image/png;base64,KEPT');
    expect(storeQRCode).not.toHaveBeenCalled();
  });

  it('makes and keeps the code when the phone has none, as My Digital Bins does', async () => {
    getQRCode.mockResolvedValue(null);
    storeQRCode.mockResolvedValue({ qrCodeUrl: 'data:image/png;base64,NEW' });
    await expect(ensureBinQR('bin-1', 'loc-1')).resolves.toBe('data:image/png;base64,NEW');
    expect(storeQRCode).toHaveBeenCalledWith('bin-1', null, { locationId: 'loc-1', syncToSupabase: true });
  });

  it('shows the code large and closes with Escape', async () => {
    getQRCode.mockResolvedValue({ qrCodeUrl: 'data:image/png;base64,KEPT' });
    const onClose = jest.fn();
    render(<BinQRFullScreen binId="bin-1" arrived onClose={onClose} />);
    expect(await screen.findByAltText('Digital bin QR code')).toHaveAttribute('src', 'data:image/png;base64,KEPT');
    expect(screen.getByRole('dialog')).toHaveTextContent('Your collector is here');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
