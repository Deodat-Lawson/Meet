# Taking Meet to production

What exists today is a complete, working meeting system. This is the honest list
of what stands between it and something you would put real users on, ordered by
what breaks first.

## Tier 1 — you cannot launch without these

### 1. A domain, TLS, and the right announced IP

```bash
cp .env.example .env
# PUBLIC_IP  = the server's public address (not a Docker-internal one)
# DOMAIN     = meet.yourdomain.com, DNS A record pointed at PUBLIC_IP
# JWT_SECRET = openssl rand -base64 48
cd infra && docker compose up -d
```

`MEDIASOUP_ANNOUNCED_IP` is the single most common way to ship a broken
deployment. It is the address remote browsers send RTP to. Get it wrong and the
meeting connects, the participant list populates, chat works — and every tile
stays black, because signaling is fine and only media is going nowhere. On a
cloud VM with a NAT'd private address, this must be the *public* IP, not what
`ifconfig` reports.

Verify from outside your network, not from the server.

### 2. TURN, and proof that it works

`docker compose` starts coturn, but an unverified TURN server is worse than none
— you will not notice until a user on a corporate network cannot join.

Test with Google's ICE trickle tool, or force relay-only in the browser console:

```js
// In a joined meeting: if this still connects, TURN is genuinely working.
await window.__meet /* dev builds only */
```

Around 8–15% of real-world users need a relay. Symmetric NAT and outbound-UDP-blocking
firewalls are the usual causes. Budget relayed bandwidth accordingly: relayed
traffic transits your server twice.

### 3. Real authentication

Right now anyone who can reach the server can create a room, and anyone with a
room code can join one. That is correct for a demo and wrong for a product.

Meeting codes are ~33^10 ≈ 1.5×10^15, so guessing is not the threat — enumeration
by a bot that has seen one link is. Minimum viable:

- Accounts (OIDC/SSO, or a managed provider) gating `POST /api/rooms`
- Bind `displayName` to the authenticated identity so people cannot impersonate
- Per-account room quotas and rate limits

`packages/server/src/auth.ts` already issues and verifies join tokens; the change
is requiring an authenticated principal before one is minted.

### 4. Secrets that are not in `.env` on the box

Move `JWT_SECRET` and `TURN_PASSWORD` into your platform's secret manager. Rotating
`JWT_SECRET` invalidates all outstanding join tokens, which is the intended
revocation mechanism — make sure that is a runbook step and not a surprise.

## Tier 2 — needed within weeks of launch

### 5. Capacity planning, with actual arithmetic

A participant uploads once. That is the whole point of the SFU. But the *server*
sends N−1 copies, so egress is quadratic in room size:

| Room size | Server egress per room | 100 concurrent rooms |
| --- | --- | --- |
| 4 people | ~7 Mbps | 0.7 Gbps |
| 10 people | ~18 Mbps | 1.8 Gbps |
| 25 people | ~120 Mbps | 12 Gbps |

(Assuming viewers pull the ~200 kbps mid simulcast layer in a gallery, plus audio.)

Bandwidth, not CPU, is what you will run out of first — and egress is the dominant
line on the bill. mediasoup handles roughly 500 consumers per worker core, so a
16-core box is ~8000 consumers, which is about 28 people × 100 rooms. You will hit
the network ceiling well before that.

Two levers already in the code do most of the work: consumers are paused when a
tile scrolls off screen, and layer selection follows rendered tile size. A 25-person
gallery of thumbnails costs a fraction of 25 full-resolution streams.

### 6. Horizontal scaling

A room's router lives on one worker on one machine. Adding servers therefore
requires **room affinity** — every participant in a given room must reach the same
instance.

Simplest workable approach: hash the room id at the load balancer. Add a small
Redis-backed registry mapping `roomId → instance` so `POST /api/rooms` can place a
room and everyone else can look it up.

For very large meetings that outgrow one machine, mediasoup's `PipeTransport`
bridges routers across instances. That is a real project, not a config change —
do not reach for it until room affinity is genuinely insufficient.

### 7. Observability

`/api/metrics` returns JSON today. For production you want:

- **Prometheus exporter** — room count, peers, per-worker CPU, consumer counts,
  transport failures, ICE restart rate
- **Error tracking** (Sentry) on both clients — the browser errors that matter are
  `getUserMedia` failures and ICE failures, and you will not hear about them
- **Log aggregation** — the server already emits structured pino JSON
- **Alerts** that mean something: worker died, ICE failure rate over baseline,
  p95 join time, transport DTLS failure rate

Client-side quality telemetry is the highest-value addition. `RoomClient` already
polls RTT and packet loss for the UI indicator; shipping that to a backend gives
you the "was the meeting actually any good" signal that server metrics cannot.

### 8. Recording storage

Recordings currently write to a local volume. That fills a disk and is lost when
the container is replaced. Move to S3 (or equivalent) with lifecycle rules, run
the generated `compose.sh` as a batch job, and decide a retention policy — meeting
recordings are among the most sensitive data you will hold.

### 9. CI/CD

`.github/workflows/ci.yml` runs typecheck, unit tests, the full end-to-end suite
against real Chrome, and an Android build. Add deploy-on-tag and you have a
pipeline. Keep the e2e job — it is what catches the media-plane regressions that
unit tests structurally cannot.

## Tier 3 — product maturity

### 10. Persistence

Everything is in memory. Rooms vanish shortly after the last participant leaves.
Scheduled meetings, recurring rooms, meeting history, per-user settings and chat
transcripts all need a datastore. Postgres is the obvious choice; the room model in
`RoomManager` is already the natural boundary.

### 11. End-to-end encryption

Today media is encrypted in transit (DTLS-SRTP) but the SFU can see it, which is
the same posture as Zoom's default. True E2EE uses WebRTC Insertable Streams so the
server forwards ciphertext it cannot read.

Worth knowing before you promise it: E2EE breaks server-side recording and any
server-side transcription, and `react-native-webrtc` support is materially behind
the browser. Scope it deliberately.

### 12. Android distribution

- Generate an upload keystore, keep it in CI secrets, never in the repo
- `./gradlew bundleRelease` produces the AAB the Play Store wants
- Play requires a privacy policy and a data-safety declaration — you capture
  camera, microphone and screen, all of which must be disclosed
- Wire up crash reporting; a minified release failing only once a call starts is
  exactly the bug ProGuard rules exist to prevent

### 13. Abuse and safety

Screen sharing plus anonymous join is a combination that gets abused. Consider
waiting rooms on by default for public links (already implemented, just not the
default), host-only screen share as a room setting (implemented), reporting, and
per-IP room-creation limits.

## What I would do first

1. Deploy the Compose stack behind a real domain, and verify TURN from a phone on
   cellular with Wi-Fi off. That single test exercises TLS, announced IP, and relay
   in one go.
2. Put authentication in front of room creation.
3. Add Prometheus plus client quality telemetry, so you find out about bad meetings
   from data rather than complaints.
4. Only then worry about scaling. One well-provisioned machine comfortably handles
   a few hundred concurrent participants, which is further than most products get.

## What is already production-grade

Worth being clear, so effort goes where it is actually needed:

- The media plane: simulcast, layer selection by rendered size, off-screen consumer
  pausing, DTX, ICE restart on network change, one router per room on the least
  loaded worker
- Graceful shutdown, health checks, fail-fast on a dead worker
- Input validation on every signaling request, per-connection rate limiting, JWT
  join tokens
- The moderation model: roles, host reassignment, lock, waiting room, and the
  permission checks behind each
- Test coverage that asserts real RTP flow rather than signaling state
