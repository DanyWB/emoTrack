import type { User } from '@prisma/client';

export interface AdminOverview {
  totalUsers: number;
  consentedUsers: number;
  onboardedUsers: number;
  activeUsers: number;
  totalCheckins: number;
  totalEvents: number;
  checkinsLast7Days: number;
  eventsLast7Days: number;
  remindersEnabledUsers: number;
}

export interface AdminActiveUserListItem {
  user: User;
  entriesCount: number;
  eventsCount: number;
  lastEntryDate: Date | null;
}

export interface AdminActiveUsersPage {
  items: AdminActiveUserListItem[];
  total: number;
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface AdminUserDetail extends AdminActiveUserListItem {
  firstEntryDate: Date | null;
  summariesCount: number;
}
