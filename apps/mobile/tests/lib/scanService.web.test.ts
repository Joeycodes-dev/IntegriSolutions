jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api'
}));

describe('web services/scanService.web (front-photo OCR disabled)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as any) = jest.fn();
  });

  it('throws immediately without any network call', async () => {
    const webScan = require('../../src/services/scanService.web');

    await expect(webScan.scanDriverLicense('file:///licence.jpg')).rejects.toThrow('not available on the web');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
