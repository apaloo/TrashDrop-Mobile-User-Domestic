import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import QRCodeList from '../QRCodeList.js';
import { getQRCode } from '../../../utils/qrStorage.js';

jest.mock('../../../utils/qrStorage.js', () => ({ getQRCode: jest.fn(), storeQRCode: jest.fn() }));
jest.mock('../../../utils/supabaseClient.js', () => ({ __esModule: true, default: {} }));

const bin = (id, name) => ({ id, location_id: `loc-${id}`, location_name: name, status: 'active', frequency: 'weekly' });

describe('QRCodeList with the bin the collector has reached', () => {
  beforeEach(() => {
    getQRCode.mockResolvedValue({ qrCodeUrl: 'data:image/png;base64,SAME' });
  });

  it('opens that bin so its QR code is showing, and leaves the others closed', async () => {
    render(<QRCodeList pickups={[bin('b1', 'Shop'), bin('b2', 'Home')]} focusBinId="b2" />);
    const codes = await screen.findAllByAltText('Digital Bin QR Code');
    expect(codes).toHaveLength(1);
    expect(codes[0].closest('.ring-td-lime')).toHaveTextContent('Digital Bin #b2');
  });

  it('opens nothing by itself when no collector is there', async () => {
    render(<QRCodeList pickups={[bin('b1', 'Shop'), bin('b2', 'Home')]} />);
    expect(await screen.findByText('Digital Bin #b2')).toBeInTheDocument();
    expect(screen.queryByAltText('Digital Bin QR Code')).not.toBeInTheDocument();
  });
});
