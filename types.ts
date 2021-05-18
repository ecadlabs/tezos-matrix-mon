// deno-lint-ignore-file camelcase ban-types

import {
    CreateEventContent, Event, PowerLevelsEventContent,
    RoomEvent, Signed, StateEvent, MatrixEvent
} from "./events.ts";

export interface MatrixError {
    errcode: string;
    error: string;
}

interface BaseLoginRequest {
    identifier: UserIdentifier;
    device_id?: string;
    initial_device_display_name?: string;
}

export type UserIdentifier = UserUserIdentifier | ThirdPartyUserIdentifier | PhoneUserIdentifier;

interface UserUserIdentifier {
    type: "m.id.user";
    user: string;
}

interface ThirdPartyUserIdentifier {
    type: "m.id.thirdparty";
    medium: string,
    address: string;
}

interface PhoneUserIdentifier {
    type: "m.id.phone",
    country: string;
    phone: string;
}

interface PasswordLoginRequest extends BaseLoginRequest {
    type: "m.login.password";
    password: string;
}

interface TokenLoginRequest extends BaseLoginRequest {
    type: "m.login.token";
    token: string;
}

export type LoginRequest = PasswordLoginRequest | TokenLoginRequest;

export interface LoginResponse {
    user_id: string;
    access_token: string;
    device_id?: string;
    well_known?: DiscoveryInformation;
}

interface DiscoveryInformation {
    ["m.homeserver"]: ServerInformation;
    ["m.identity_server"]?: ServerInformation;
    [key: string]: unknown;
}

interface ServerInformation {
    base_url: string;
}

export interface MatrixEvents<T extends Event = Event> {
    events: T[];
}

type Presence = "offline" | "online" | "unavailable";

export interface SyncRequest {
    filter?: string;
    since?: string;
    full_state?: boolean;
    set_presence?: Presence;
    timeout?: number;
}

export interface SyncResponse {
    next_batch: string;
    rooms?: Rooms;
    presence?: MatrixEvents;
    account_data?: MatrixEvents;
    to_device?: MatrixEvents;
    device_lists?: DeviceLists;
    device_one_time_keys_count?: Record<string, number>;
}

interface DeviceLists {
    changed?: string[];
    left?: string[];
}

interface Rooms {
    join?: Record<string, JoinedRoom>;
    invite?: Record<string, InvitedRoom>;
    leave?: Record<string, RoomUpdate>;
}

interface RoomUpdate {
    state?: MatrixEvents<MatrixEvent>;
    timeline?: Timeline;
    account_data?: MatrixEvents;
}

interface JoinedRoom extends RoomUpdate {
    summary?: RoomSummary;
    ephemeral?: MatrixEvents;
    unread_notifications?: UnreadNotificationCounts;
}

interface UnreadNotificationCounts {
    highlight_count?: number;
    notification_count?: number;
}

interface RoomSummary {
    ["m.heroes"]?: string[];
    ["m.joined_member_count"]?: number;
    ["m.invited_member_count"]?: number;
}

interface Timeline extends MatrixEvents<MatrixEvent> {
    limited?: boolean;
    prev_batch?: string;
}

interface InvitedRoom {
    invite_state: MatrixEvents<MatrixEvent>;
}

type RoomVisibility = "public" | "private";
type RoomPreset = "private_chat" | "public_chat" | "trusted_private_chat";

export interface CreateRoomRequest {
    visibility?: RoomVisibility;
    room_alias_name?: string;
    name?: string;
    topic?: string;
    invite?: string[];
    invite_3pid: Invite3pid[];
    room_version?: string;
    creation_content?: CreateEventContent;
    initial_state?: StateEvent[];
    preset?: RoomPreset;
    is_direct?: boolean;
    power_level_content_override?: PowerLevelsEventContent;
}

interface Invite3pid {
    id_server: string;
    id_access_token: string;
    medium: string;
    address: string;
}

export interface InviteRequest {
    user_id: string;
}

export interface JoinRequest {
    third_party_signed?: ThirdPartySigned;
}

export interface JoinResponse {
    room_id: string;
}

export interface ThirdPartySigned extends Signed {
    sender: string;
}

export interface EventID {
    event_id: string;
}