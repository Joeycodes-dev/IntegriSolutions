import { describe, it, expect } from 'vitest';
import { roleLabel, isSelfParticipant, isSelfOfficerContact, ownParticipantSource, threadTitle } from '../../src/components/chat/EmergencyChatPanel';
import type { ChatOfficerContact, ChatThreadSummary, UserProfile } from '../../src/types';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'uid-1',
    officerId: 3,
    email: 'jane@example.com',
    name: 'Jane',
    surname: 'Supervisor',
    badgeNumber: 'S003',
    idNumber: '9001015009087',
    employmentStatus: 'Active',
    province: 'Gauteng',
    region: 'Tshwane',
    officerTypeId: 1,
    roleId: 2,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('EmergencyChatPanel role/identity rendering', () => {
  describe('roleLabel', () => {
    it('maps known role ids to their labels', () => {
      expect(roleLabel(1)).toBe('Officer');
      expect(roleLabel(2)).toBe('Supervisor');
      expect(roleLabel(3)).toBe('Admin');
    });

    it('does not silently default to Officer for an unrecognized or missing role id', () => {
      expect(roleLabel(0)).toBe('Unknown role');
      expect(roleLabel(99)).toBe('Unknown role');
      expect(roleLabel(NaN)).toBe('Unknown role');
    });
  });

  describe('ownParticipantSource', () => {
    it('resolves admin and supervisor viewers to their own source table', () => {
      expect(ownParticipantSource(makeProfile({ roleId: 3 }))).toBe('admin_users');
      expect(ownParticipantSource(makeProfile({ roleId: 2 }))).toBe('supervisor_users');
    });
  });

  describe('isSelfParticipant', () => {
    it('identifies the viewer correctly when source and id both match', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      expect(isSelfParticipant({ source: 'supervisor_users', participantId: 3 }, supervisor)).toBe(true);
    });

    it('does NOT misattribute an officer with the same numeric id as "self" (the bug this fixes)', () => {
      // officer_users, supervisor_users, and admin_users each have their own
      // independent id sequence — Officer #3 and Supervisor #3 both existing
      // is expected, not a data bug. Only the (source, id) pair identifies a
      // specific person.
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const officerWithSameId = { source: 'officer_users', participantId: 3 };
      expect(isSelfParticipant(officerWithSameId, supervisor)).toBe(false);
    });

    it('does NOT misattribute an admin with the same numeric id as "self"', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const adminWithSameId = { source: 'admin_users', participantId: 3 };
      expect(isSelfParticipant(adminWithSameId, supervisor)).toBe(false);
    });

    it('returns false when there is no signed-in profile', () => {
      expect(isSelfParticipant({ source: 'supervisor_users', participantId: 3 }, null)).toBe(false);
    });
  });

  describe('threadTitle', () => {
    function makeThread(overrides: Partial<ChatThreadSummary> = {}): ChatThreadSummary {
      return {
        id: 'thread-1',
        kind: 'emergency',
        title: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        lastReadAt: null,
        unreadCount: 0,
        participants: [],
        latestMessage: null,
        ...overrides
      };
    }

    it('excludes only the true self, not a same-id participant from a different role table', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const thread = makeThread({
        participants: [
          { source: 'officer_users', participantId: 3, roleId: 1, name: 'John Officer', badgeNumber: 'B003' },
          { source: 'supervisor_users', participantId: 3, roleId: 2, name: 'Jane Supervisor', badgeNumber: 'S003' }
        ]
      });

      // Before the fix, "John Officer" would have been wrongly excluded too
      // (participantId 3 === ownParticipantId 3), leaving the title empty
      // or wrong. It must remain the other participant's name.
      expect(threadTitle(thread, supervisor)).toBe('John Officer');
    });

    it('falls back to "Emergency channel" when every listed participant is the viewer', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const thread = makeThread({
        participants: [
          { source: 'supervisor_users', participantId: 3, roleId: 2, name: 'Jane Supervisor', badgeNumber: 'S003' }
        ]
      });
      expect(threadTitle(thread, supervisor)).toBe('Emergency channel');
    });
  });

  describe('isSelfOfficerContact (officer-contact picker filtering)', () => {
    function makeContact(overrides: Partial<ChatOfficerContact> = {}): ChatOfficerContact {
      return { officerId: 3, name: 'John Officer', badgeNumber: 'B003', email: 'john@example.com', ...overrides };
    }

    it('does not treat an officer contact as "self" just because a Supervisor shares the same numeric id', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const officerWithSameId = makeContact({ officerId: 3 });
      expect(isSelfOfficerContact(officerWithSameId, supervisor)).toBe(false);
    });

    it('does not treat an officer contact as "self" just because an Admin shares the same numeric id', () => {
      const admin = makeProfile({ roleId: 3, officerId: 3 });
      const officerWithSameId = makeContact({ officerId: 3 });
      expect(isSelfOfficerContact(officerWithSameId, admin)).toBe(false);
    });

    it('regression: a picker filtered with isSelfOfficerContact keeps an officer whose id collides with the viewer', () => {
      // This mirrors EmergencyChatPanel's own contacts filter exactly (same
      // exported helper, same call shape) — reproducing the reported bug
      // scenario: Supervisor #3 must still see Officer #3 in the picker.
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const contacts: ChatOfficerContact[] = [
        makeContact({ officerId: 3, name: 'John Officer' }),
        makeContact({ officerId: 7, name: 'Alice Officer' })
      ];

      const visible = contacts.filter((contact) => !isSelfOfficerContact(contact, supervisor));

      expect(visible.map((c) => c.officerId)).toEqual([3, 7]);
      expect(visible.map((c) => c.name)).toContain('John Officer');
    });

    it('a raw id comparison (the old, buggy approach) would have wrongly hidden the colliding officer', () => {
      const supervisor = makeProfile({ roleId: 2, officerId: 3 });
      const contacts: ChatOfficerContact[] = [makeContact({ officerId: 3, name: 'John Officer' })];

      const oldBuggyFilter = contacts.filter((contact) => contact.officerId !== supervisor.officerId);
      expect(oldBuggyFilter).toHaveLength(0);

      const fixedFilter = contacts.filter((contact) => !isSelfOfficerContact(contact, supervisor));
      expect(fixedFilter).toHaveLength(1);
    });
  });
});
