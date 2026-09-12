import { getActiveAlerts, acknowledgeAlert, reportAlertMatch, reportAlertMatchWithEscalation } from '../../src/services/api';
import * as auth from '../../src/services/auth';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
  getStoredProfile: jest.fn(),
  clearAccessToken: jest.fn(),
}));

jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api',
}));

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

/** Responds to successive fetch() calls in order — used to simulate the
 * match-report call followed by the two chat-escalation calls it triggers. */
function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; payload: unknown }>) {
  let callIndex = 0;
  (global.fetch as jest.Mock) = jest.fn().mockImplementation(async () => {
    const response = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.payload,
    };
  });
}

describe('operational alerts api (new mobile feature)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth.getAccessToken as jest.Mock).mockResolvedValue('tok-123');
    (auth.getStoredProfile as jest.Mock).mockResolvedValue({ roleId: 1 });
    (global.fetch as any) = jest.fn();
  });

  it('getActiveAlerts fetches the officer alert inbox with the bearer token', async () => {
    const alerts = [{ id: 'alert-1', alertType: 'general', priority: 'medium' }];
    mockFetchJson(alerts);

    const result = await getActiveAlerts();

    expect(result).toEqual(alerts);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/alerts/active');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('getActiveAlerts surfaces server error messages', async () => {
    mockFetchJson({ error: 'Only officer accounts can view operational alerts' }, false, 403);
    await expect(getActiveAlerts()).rejects.toThrow('Only officer accounts can view operational alerts');
  });

  it('acknowledgeAlert POSTs to the acknowledge endpoint and encodes the id', async () => {
    mockFetchJson({ alertId: 'alert/1', acknowledgedAt: '2026-09-09T10:05:00Z' });

    const result = await acknowledgeAlert('alert/1');

    expect(result).toEqual({ alertId: 'alert/1', acknowledgedAt: '2026-09-09T10:05:00Z' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/alerts/alert%2F1/acknowledge');
    expect(init.method).toBe('POST');
  });

  it('reportAlertMatch POSTs notes and never sends a status field', async () => {
    mockFetchJson({
      id: 1,
      alertId: 'alert-1',
      notes: 'Vehicle matching description seen',
      createdAt: '2026-09-09T10:10:00Z',
      disclaimer: 'This is an escalation signal only',
    });

    const result = await reportAlertMatch('alert-1', 'Vehicle matching description seen');

    expect(result).toMatchObject({ id: 1, alertId: 'alert-1' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/alerts/alert-1/matches');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ notes: 'Vehicle matching description seen' });
    expect(body).not.toHaveProperty('status');
  });

  describe('reportAlertMatchWithEscalation', () => {
    const alert = { id: '2d7c26cb-9612-4585-be18-133b04de05f6', description: 'Vehicle seen at N1 offramp', alertType: 'bolo_vehicle', priority: 'high' as const };

    it('invokes the emergency chat escalation after a successful match report', async () => {
      mockFetchSequence([
        { ok: true, payload: { id: 1, alertId: alert.id, notes: 'n', createdAt: 't', disclaimer: 'd' } },
        { ok: true, payload: { id: 'thread-1' } },
        { ok: true, payload: { id: 99 } },
      ]);

      const result = await reportAlertMatchWithEscalation(
        alert,
        'Vehicle matching description seen',
        { name: 'John', surname: 'Doe' }
      );

      expect(result).toEqual({ escalated: true, escalationError: null });
      expect(global.fetch).toHaveBeenCalledTimes(3);

      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls[0][0]).toBe(`http://localhost:4000/api/alerts/${alert.id}/matches`);
      expect(calls[1][0]).toBe('http://localhost:4000/api/chat/threads/emergency');
      expect(calls[2][0]).toBe('http://localhost:4000/api/chat/threads/thread-1/messages');

      const chatBody = JSON.parse((calls[2][1] as RequestInit).body as string);
      expect(chatBody.priority).toBe('high');

      // Raw alert UUID must never appear in the user-facing chat message — it
      // stays in the API URL and backend audit log only.
      expect(chatBody.body).not.toContain(alert.id);

      // The cleaned-up message must include a human-readable summary instead.
      expect(chatBody.body).toContain('Possible match reported for Operational Alert: Vehicle seen at N1 offramp');
      expect(chatBody.body).toContain('Type: BOLO — Vehicle');
      expect(chatBody.body).toContain('Priority: High');
      expect(chatBody.body).toContain('Reported by: John Doe');
      expect(chatBody.body).toContain(
        "This is an escalation signal only — it does not confirm that the person or vehicle is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's operational procedure and escalate to the appropriate authority. This system does not determine what action, if any, is lawful."
      );
    });

    it('falls back to a generic officer label and the raw alert type code when data is unavailable', async () => {
      mockFetchSequence([
        { ok: true, payload: { id: 1, alertId: alert.id, notes: 'n', createdAt: 't', disclaimer: 'd' } },
        { ok: true, payload: { id: 'thread-1' } },
        { ok: true, payload: { id: 99 } },
      ]);

      await reportAlertMatchWithEscalation(
        { ...alert, alertType: 'some_future_type' },
        'notes'
      );

      const calls = (global.fetch as jest.Mock).mock.calls;
      const chatBody = JSON.parse((calls[2][1] as RequestInit).body as string);
      expect(chatBody.body).toContain('Type: some_future_type');
      expect(chatBody.body).toContain('Reported by: An officer');
    });

    it('keeps the match report saved when chat escalation fails, and reports the failure', async () => {
      mockFetchSequence([
        { ok: true, payload: { id: 1, alertId: 'alert-1', notes: 'n', createdAt: 't', disclaimer: 'd' } },
        { ok: false, status: 500, payload: { error: 'Chat service unavailable' } },
      ]);

      const result = await reportAlertMatchWithEscalation(alert, 'Vehicle matching description seen');

      expect(result.escalated).toBe(false);
      expect(result.escalationError).toMatch(/chat service unavailable/i);
      // The match report itself succeeded (first call) and is not retried or rolled back.
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('propagates a failure to save the match report itself (escalation never attempted)', async () => {
      mockFetchSequence([
        { ok: false, status: 403, payload: { error: 'This alert is not targeted to you' } },
      ]);

      await expect(reportAlertMatchWithEscalation(alert, 'notes')).rejects.toThrow('This alert is not targeted to you');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
