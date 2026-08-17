/**
 * Enum values are the exact wire strings used by the Flutter client
 * (`@JsonValue(...)` in `lib/data/models`). Keep these snake_case values
 * byte-identical across all three clients — they are the contract.
 */

export const MemberRole = {
  Admin: 'admin',
  Member: 'member',
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const CirclePrivacy = {
  Private: 'private',
  Public: 'public',
} as const;
export type CirclePrivacy = (typeof CirclePrivacy)[keyof typeof CirclePrivacy];

export const RatingsShared = {
  None: 'none',
  Approved: 'approved',
  Selective: 'selective',
} as const;
export type RatingsShared = (typeof RatingsShared)[keyof typeof RatingsShared];

export const RelationshipStatus = {
  Friends: 'friends',
  RequestedByMe: 'requested_by_me',
  RequestedByThem: 'requested_by_them',
  None: 'none',
} as const;
export type RelationshipStatus =
  (typeof RelationshipStatus)[keyof typeof RelationshipStatus];

export const RatingSource = {
  App: 'app',
  Imdb: 'imdb',
  Letterboxd: 'letterboxd',
} as const;
export type RatingSource = (typeof RatingSource)[keyof typeof RatingSource];

export const OutingStatus = {
  Planned: 'planned',
  Done: 'done',
} as const;
export type OutingStatus = (typeof OutingStatus)[keyof typeof OutingStatus];

export const RsvpStatus = {
  Going: 'going',
  Maybe: 'maybe',
  CantGo: 'cant_go',
} as const;
export type RsvpStatus = (typeof RsvpStatus)[keyof typeof RsvpStatus];

export const NotificationType = {
  RsvpChange: 'rsvp_change',
  TicketsOnSale: 'tickets_on_sale',
  OutingReminder: 'outing_reminder',
  ChatMessage: 'chat_message',
  FriendRequest: 'friend_request',
  RatingImported: 'rating_imported',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
