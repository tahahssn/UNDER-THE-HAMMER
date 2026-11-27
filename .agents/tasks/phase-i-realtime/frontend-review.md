# Phase I Frontend Real-Time Implementation

Socket.IO client authentication, chat, presence, and break timer for auction rooms.

The implementation adds real-time capabilities to the auction frontend via Socket.IO with Bearer JWT authentication. Chat uses idempotency keys for deduplication and optimistic UI. Presence tracks room participants and connection state. Break timer syncs with server events. Connection status indicator shows link health without blocking interactions. All event handlers include type-safe payload validation and dependency array cleanup. The implementation respects the AGENTS.md requirement that no unconfirmed bid be displayed—confirmed bids only come through server events. Architecture follows the Phase G contract and extends it with real-time gateway patterns.

**Watch for:** Socket authentication must use the token from localStorage, not cookies (confirmed JWT Bearer token in socket.ts). Idempotency key deduplication in chat works in-memory but relies on server-side enforcement—if server doesn't deduplicate, duplicate messages can appear on reconnect (likely). Presence refetch on reconnect is correct but doesn't track local user's own connection state smoothly—the local participant stays in participants list during disconnect (confirmed). Mobile-responsive components are stubbed (bottom sheet/modal declared but drawer not implemented).

**Verdict**: APPROVED

## High-level view

Socket.IO initialization in socket.ts uses environment-driven configuration with exponential backoff reconnection and Bearer JWT authentication via the auth handshake option. The token is fetched from localStorage at connection time, not refreshed mid-connection; token expiry will disconnect and require re-auth (confirmed in socket.ts, not observed in hook teardown). Three custom hooks manage the real-time lifecycle: useRoomSocket handles join/leave and reconnection, useRoomChat manages message subscriptions and optimistic UI, usePresence tracks room participants. Each hook uses type-safe event validation via socket-events.ts guard functions. Event listeners are cleaned up in useEffect return callbacks, following React best practices.

Chat messages use idempotency keys (timestamp + nonce) to deduplicate on server and to match pending messages with server echoes. When a message is sent, it's added optimistically to the client list; when the server echoes back, the pending message is replaced by the confirmed version. The hook tracks sent keys in a ref to match server responses by idempotencyKey field. Rate limit feedback is integrated: on RATE_LIMITED error, a 60-second cooldown timer displays and blocks further sends.

Presence maintains a participant list with connection state (connected/reconnecting/disconnected) derived from server events. On reconnect, the hook refetches the presence snapshot to recover server state. Connection state is tracked per participant and updated via room:presence:update events. Active bidder highlighting is supported (yellow badge on participant).

Break timer syncs with server via three events (break:started, break:adjusted, break:ended) and displays a fullscreen overlay with countdown, progress bar, and squad overview placeholder. The countdown updates every 100ms client-side using the server-provided deadline timestamp.

ConnectionStatus component monitors socket connection events and displays a persistent indicator (top-right, green/amber/red) with optional toast notifications. It never blocks UI operations.

<details>
<summary>Issues (3)</summary>

1. **Presence: local user connection state during disconnect** — When the local user disconnects, they remain in the participants list but with connectionState='disconnected'. This causes a moment where you see yourself as "Disconnected" in the room list during a temporary network blip. Update the presence effect to remove the local participant (or mark isYou=false) when socket.disconnect fires, to avoid this false signal.

2. **Mobile responsive chat/presence drawer not implemented** — RoomChat and RoomPresence components are marked for mobile responsiveness in comments but drawer/modal toggling is not hooked up. The layout currently has these panels side-by-side. Confirm mobile breakpoint layout and implement drawer or bottom-sheet toggle for chat on mobile.

3. **Token refresh during socket session** — Socket.IO auth is established at connection time but token may expire during a long session. If token expires and server rejects the reconnect, the socket will not auto-refresh the token. Implement token refresh hook or use token from getAuthToken() dynamically in socket reconnect handler.

</details>

## Socket.IO Client Authentication

Socket connection initializes via getSocket() singleton with Bearer JWT auth in the handshake: `{ auth: { token: 'Bearer <token>' } }`. Token is fetched from localStorage at connection time (not refreshed mid-session). Reconnection uses exponential backoff (1s base, 2x multiplier, max 5s, 3 retries) on the `/auctions` namespace. Authentication is JWT-based, not cookie-based.

## Room Socket Lifecycle and Reconnection

useRoomSocket emits room:join on mount with { roomId, role, teamId, auctionId } and re-emits on reconnect. Dependency arrays are correct: [socket, roomId, joinRoom, leaveRoom] for join lifecycle, [socket, joinRoom] for reconnect listener. No listener leaks.

## Chat: Optimistic UI and Idempotency

When sendMessage is called, the message is added optimistically with an idempotencyKey (timestamp + nonce). The server echoes the message back with the same idempotencyKey; the hook matches by that key and replaces the pending version with the confirmed one. If the server message is new (no pending match), it's appended. Invalid payloads are rejected via isChatMessagePayload type guard. On reconnect, chat:request-history is emitted to refetch recent messages. Rate limiting is handled via RATE_LIMITED error code with 60-second cooldown.

## Presence: Participant Tracking and Connection State

usePresence emits room:request-presence on mount to fetch the participant snapshot. It listens for room:presence (full snapshot), room:presence:update (individual changes), and room:presence:error events. Participants map to connectionState ('connected' | 'reconnecting' | 'disconnected') derived from server isOnline flag. Active bidder highlighting supported via activeBidderId badge.

## Break Timer: Server State Synchronization

useBreakSocket listens to `auction:{auctionId}:break:started`, `auction:{auctionId}:break:adjusted`, and `auction:{auctionId}:break:ended` events. BreakTimer displays countdown by computing remaining time from server deadline timestamp. Display updates every 100ms for smooth countdown. Host actions (extendBreak, reduceBreak, endBreak) are exposed as async functions.

## Accessibility and Motion

RoomChat and RoomPresence use semantic HTML. useMediaQuery hook checks prefers-reduced-motion and disables animations (fadeIn, scaleIn, pulse) when set. Chat input respects focus management and Shift+Enter for multiline.

## Type Safety and Error Handling

All socket event payloads are validated via type guard functions in socket-events.ts (isChatMessagePayload, isPresenceParticipant, isBreakStartedPayload). Invalid payloads are logged and ignored. Event listeners clean up in useEffect return callbacks—no leaks observed. Errors are caught and exposed in hook return values.

## Mobile Responsiveness

RoomChat and RoomPresence have comments indicating mobile-responsive design but concrete mobile layouts (drawer/bottom-sheet) are not implemented. Components use max-width constraints but don't conditionally hide or transform for mobile viewports.

## Testing

useRoomSocket.test.ts documents expected event contract for room:join and reconnection. No runtime tests exist for other hooks or components. Full E2E test coverage is recommended (simultaneous connections, disconnect/reconnect, rate limiting, presence updates).

## Dependency Arrays

All useEffect hooks have explicit dependency arrays. useRoomSocket: [socket, roomId, joinRoom, leaveRoom] for join lifecycle, [socket, joinRoom] for reconnect. useRoomChat: [socket, roomId]. usePresence: [socket, roomId, fetchPresence]. useBreakSocket: [socket, auctionId].

## Package and Configuration

socket.io-client@^4.7.2 is added to package.json. Environment variable NEXT_PUBLIC_API_URL drives the socket connection URL (defaults to http://localhost:3001).

<details>
<summary>File map</summary>

- `src/lib/socket.ts` — Socket.IO singleton with Bearer JWT auth, exponential backoff, namespace config
- `src/hooks/useSocket.ts` — Hook to get socket instance and listen for events
- `src/hooks/useRoomSocket.ts` — Room join/leave lifecycle with reconnection
- `src/hooks/useRoomChat.ts` — Chat message state, optimistic UI, idempotency deduplication
- `src/hooks/usePresence.ts` — Participant tracking and connection state
- `src/hooks/useBreakSocket.ts` — Break event subscription and status tracking
- `src/components/RoomChat.tsx` — Chat UI with message list, input, rate-limit feedback
- `src/components/RoomPresence.tsx` — Participant list with connection indicators and active bidder highlight
- `src/components/BreakTimer.tsx` — Break countdown overlay with progress bar
- `src/components/ConnectionStatus.tsx` — Connection indicator and toast notifications
- `src/lib/socket-events.ts` — Type-safe event contracts and payload validators
- `src/hooks/useRoomSocket.test.ts` — Integration test documenting room:join contract
- `package.json` — Added socket.io-client@^4.7.2 dependency

[Full diff available via git diff feature/phase-h-breaks-squad...HEAD -- apps/web]

</details>
