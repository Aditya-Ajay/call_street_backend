# Chat System API Reference

Complete API documentation for the Discord-style community chat system.

## Table of Contents
1. [Authentication](#authentication)
2. [Socket.io Events](#socketio-events)
3. [REST API Endpoints](#rest-api-endpoints)
4. [Error Codes](#error-codes)
5. [Rate Limiting](#rate-limiting)
6. [Examples](#examples)

---

## Authentication

All Socket.io connections and REST API endpoints require JWT authentication.

### Socket.io Authentication
Pass JWT token in handshake:
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

### REST API Authentication
Include JWT in Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Socket.io Events

### Client → Server Events

#### `join_channel`
Join a chat channel and receive message history.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000" // UUID
}
```

**Response:** `channel_joined` event

**Errors:**
- `Channel ID is required`
- `You do not have access to this channel`
- `Channel not found`

---

#### `leave_channel`
Leave a chat channel.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** None (silent)

---

#### `send_message`
Send a message to a channel.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000",
  message: "Great analysis on NIFTY today!",
  messageType: "text", // optional: "text" | "image" | "file" | "system"
  replyToMessageId: "uuid" // optional: for threading
}
```

**Response:** `message` event broadcast to all users in channel

**Validation:**
- Message cannot be empty
- Message max length: 500 characters
- Must have channel access
- Must have posting permissions (paid tier)
- Rate limit check

**Errors:**
- `Channel ID and message are required`
- `Message cannot be empty`
- `Message too long (max 500 characters)`
- `Upgrade to Paid tier to post messages`
- `You're sending too fast. Wait X seconds`

---

#### `typing_start`
Indicate user started typing.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `typing_indicator` event to others

**Note:** Debounced on client (wait 3 seconds after last keystroke)

---

#### `typing_stop`
Indicate user stopped typing.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `typing_indicator` event with `stopped: true`

---

#### `delete_message`
Delete a message (analyst or message owner only).

**Payload:**
```javascript
{
  messageId: "550e8400-e29b-41d4-a716-446655440000",
  channelId: "550e8400-e29b-41d4-a716-446655440000",
  reason: "Spam" // optional
}
```

**Response:** `message_deleted` event broadcast to channel

**Permissions:**
- Message owner can delete own messages
- Analyst can delete any message in their channels

**Errors:**
- `Message ID and Channel ID are required`
- `You do not have permission to delete this message`
- `Message not found`

---

#### `mute_user`
Mute a user (analyst only).

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000",
  targetUserId: "550e8400-e29b-41d4-a716-446655440000",
  duration: 60 // minutes (60=1hr, 1440=24hr, -1=permanent)
}
```

**Response:**
- `mute_success` to analyst
- `user_muted` to target user

**Permissions:** Analyst only

**Errors:**
- `Channel ID and Target User ID are required`
- `Only the analyst can mute users`

---

#### `ban_user`
Permanently ban a user from channel (analyst only).

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000",
  targetUserId: "550e8400-e29b-41d4-a716-446655440000",
  reason: "Abusive behavior" // optional
}
```

**Response:**
- `ban_success` to analyst
- `user_banned` to target user
- `user_banned_notification` to others in channel

**Effect:** User is kicked from channel and cannot rejoin

**Permissions:** Analyst only

**Errors:**
- `Channel ID and Target User ID are required`
- `Only the analyst can ban users`

---

#### `get_online_users`
Get list of users currently online in channel.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `online_users` event

---

#### `presence_update`
Update user's presence (sent automatically every 30 seconds).

**Payload:**
```javascript
{}
```

**Response:** `presence_update` event broadcast to user's channels

---

### Server → Client Events

#### `channel_joined`
Confirmation of joining channel with initial data.

**Payload:**
```javascript
{
  channelId: "550e8400-e29b-41d4-a716-446655440000",
  channel: {
    id: "uuid",
    channel_name: "General Discussion",
    channel_description: "Talk about anything",
    channel_type: "general",
    icon: "💬",
    is_read_only: false,
    analyst_name: "Rajesh Kumar",
    analyst_image: "https://..."
  },
  messages: [
    {
      id: "uuid",
      user_name: "Priya",
      user_role: "trader",
      message: "Hello everyone!",
      created_at: "2025-10-08T12:34:56Z"
    }
    // ... last 100 messages
  ],
  pinned_messages: [
    // ... pinned messages
  ],
  online_count: 42,
  can_post: true, // false for free tier
  is_analyst: false,
  timestamp: "2025-10-08T12:35:00Z"
}
```

---

#### `message`
New message received.

**Payload:**
```javascript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  channel_id: "uuid",
  user_id: "uuid",
  user_name: "Priya Sharma",
  user_role: "trader", // "analyst" | "trader" | "admin"
  user_image: "https://...",
  message: "Great call on NIFTY! Entered at 19,510",
  message_type: "text",
  reply_to: { // optional, if replying to another message
    id: "uuid",
    message: "NIFTY Long at 19,500",
    user_name: "Analyst",
    created_at: "2025-10-08T12:00:00Z"
  },
  created_at: "2025-10-08T12:34:56Z"
}
```

---

#### `message_deleted`
Message was deleted.

**Payload:**
```javascript
{
  channelId: "uuid",
  messageId: "uuid",
  deletedBy: "uuid",
  reason: "Spam", // or "Deleted by user"
  timestamp: "2025-10-08T12:35:00Z"
}
```

**Client Action:** Remove message from UI

---

#### `user_joined`
User joined the channel.

**Payload:**
```javascript
{
  channelId: "uuid",
  userId: "uuid",
  userName: "Rahul",
  userRole: "trader",
  online_count: 43,
  timestamp: "2025-10-08T12:35:00Z"
}
```

---

#### `user_left`
User left the channel.

**Payload:**
```javascript
{
  channelId: "uuid",
  userId: "uuid",
  userName: "Priya",
  online_count: 42,
  timestamp: "2025-10-08T12:35:00Z"
}
```

---

#### `typing_indicator`
Someone is typing in the channel.

**Payload:**
```javascript
{
  channelId: "uuid",
  userId: "uuid",
  userName: "Rahul",
  typing_users: ["Priya", "Amit", "Sanjay"], // max 5 names
  typing_count: 7, // total typing users
  stopped: false // true when user stops typing
}
```

**Display:** "Priya, Amit, Sanjay and 4 others are typing..."

---

#### `rate_limit_exceeded`
User exceeded rate limit.

**Payload:**
```javascript
{
  channelId: "uuid",
  message: "You're sending too fast. Wait 42 seconds",
  retry_after: 42, // seconds
  limit: 10 // messages per minute
}
```

**Client Action:** Disable send button for `retry_after` seconds

---

#### `rate_limit_warning`
User approaching rate limit (80% threshold).

**Payload:**
```javascript
{
  channelId: "uuid",
  message: "Slow down! Max 10 messages per minute",
  remaining: 2 // messages remaining
}
```

**Client Action:** Show warning toast

---

#### `user_muted`
You've been muted by the analyst.

**Payload:**
```javascript
{
  channelId: "uuid",
  message: "You have been muted by the analyst for 60 minutes",
  duration: 60, // minutes
  mute_until: "2025-10-08T13:35:00Z"
}
```

**Client Action:** Disable message input, show mute message

---

#### `user_banned`
You've been banned from the channel.

**Payload:**
```javascript
{
  channelId: "uuid",
  message: "You have been banned from this channel by the analyst. Reason: Spam",
  reason: "Spam"
}
```

**Client Action:** Kick user from channel, redirect to channel list

---

#### `mute_success`
Mute action successful (analyst only).

**Payload:**
```javascript
{
  channelId: "uuid",
  targetUserId: "uuid",
  duration: 60,
  mute_until: "2025-10-08T13:35:00Z"
}
```

---

#### `ban_success`
Ban action successful (analyst only).

**Payload:**
```javascript
{
  channelId: "uuid",
  targetUserId: "uuid",
  reason: "Spam"
}
```

---

#### `online_users`
Response to `get_online_users` request.

**Payload:**
```javascript
{
  channelId: "uuid",
  users: [
    {
      userId: "uuid",
      userName: "Priya Sharma",
      userRole: "trader",
      connectedAt: "2025-10-08T12:00:00Z"
    },
    {
      userId: "uuid",
      userName: "Rajesh Kumar",
      userRole: "analyst",
      connectedAt: "2025-10-08T11:30:00Z"
    }
  ],
  count: 42
}
```

---

#### `error`
Error occurred during operation.

**Payload:**
```javascript
{
  event: "send_message", // event that caused error
  message: "Upgrade to Paid tier to post messages"
}
```

---

## REST API Endpoints

### Channel Management

#### Get Analyst's Channels
```http
GET /api/chat/channels/:analystId
```

**Parameters:**
- `analystId` (path, required): Analyst's user UUID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "id": "uuid",
        "channel_name": "Announcements",
        "channel_description": "Important updates",
        "channel_type": "announcement",
        "icon": "📢",
        "is_read_only": true,
        "total_messages": 156,
        "active_members_count": 42,
        "last_message_at": "2025-10-08T12:34:56Z"
      }
    ],
    "count": 4
  }
}
```

**Access:** Public (no auth required)

---

#### Get Single Channel
```http
GET /api/chat/channels/single/:channelId
Authorization: Bearer <token>
```

**Parameters:**
- `channelId` (path, required): Channel UUID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "channel": {
      "id": "uuid",
      "channel_name": "General Discussion",
      "analyst_name": "Rajesh Kumar",
      ...
    },
    "access": {
      "can_post": true,
      "is_analyst": false
    }
  }
}
```

**Access:** Private (requires auth)

**Errors:**
- `403` - You do not have access to this channel
- `404` - Channel not found

---

#### Create Channel
```http
POST /api/chat/channels
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "channelName": "VIP Trading Room",
  "channelDescription": "Exclusive trading insights for VIP members",
  "channelType": "premium", // "announcement" | "general" | "trading" | "ideas" | "premium"
  "icon": "💎",
  "isReadOnly": false,
  "messageRateLimit": 10,
  "requireSubscription": true,
  "minimumTierRequired": "uuid" // optional: subscription tier UUID
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Channel created successfully",
  "data": {
    "channel": { ... }
  }
}
```

**Access:** Private (analyst only)

**Validation:**
- `channelName` required, max 255 chars
- `channelType` required, one of allowed types
- `icon` optional, max 10 chars (emoji)
- `messageRateLimit` optional, default 10

**Errors:**
- `400` - Validation error
- `403` - Unauthorized (not an analyst)
- `409` - Channel name already exists

---

#### Update Channel
```http
PUT /api/chat/channels/:channelId
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** (same as create, partial updates allowed)
```json
{
  "channelDescription": "Updated description",
  "isReadOnly": true
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Channel updated successfully",
  "data": {
    "channel": { ... }
  }
}
```

**Access:** Private (analyst, channel owner only)

---

#### Delete Channel
```http
DELETE /api/chat/channels/:channelId
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Channel deleted successfully"
}
```

**Note:** Soft delete (channel hidden, not removed from DB)

**Access:** Private (analyst, channel owner only)

---

#### Create Default Channels
```http
POST /api/chat/channels/default/:analystId
Authorization: Bearer <token>
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Default channels created successfully",
  "data": {
    "channels": [
      { "channel_name": "Announcements", ... },
      { "channel_name": "General Discussion", ... },
      { "channel_name": "Today's Calls", ... },
      { "channel_name": "Trade Ideas", ... }
    ],
    "count": 4
  }
}
```

**Use Case:** Called during analyst onboarding

**Access:** Private (analyst or admin only)

---

### Message Management

#### Get Message History
```http
GET /api/chat/messages/:channelId?limit=50&offset=0&before=uuid
Authorization: Bearer <token>
```

**Parameters:**
- `channelId` (path, required): Channel UUID
- `limit` (query, optional): Max messages (default: 20, max: 100)
- `offset` (query, optional): Pagination offset (default: 0)
- `before` (query, optional): Get messages before this message ID (for infinite scroll)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "user_name": "Priya",
        "user_role": "trader",
        "message": "Great analysis!",
        "created_at": "2025-10-08T12:34:56Z"
      }
    ],
    "pagination": {
      "total": 1542,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  }
}
```

**Access:** Private (requires channel access)

---

#### Get Pinned Messages
```http
GET /api/chat/messages/pinned/:channelId
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "pinned_messages": [
      {
        "id": "uuid",
        "message": "Important announcement!",
        "user_name": "Analyst",
        "pinned_at": "2025-10-08T10:00:00Z",
        "pinned_by_name": "Admin"
      }
    ]
  }
}
```

**Access:** Private (requires channel access)

---

#### Delete Message
```http
POST /api/chat/messages/:messageId/delete
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Spam" // optional
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Access:** Private (message owner or analyst)

---

#### Flag Message
```http
POST /api/chat/messages/:messageId/flag
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Inappropriate content"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Message flagged for review"
}
```

**Access:** Private (any user)

**Rate Limited:** 10 flags per hour per user

---

#### Pin Message
```http
POST /api/chat/messages/:messageId/pin
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Message pinned successfully"
}
```

**Access:** Private (analyst only)

**Limitation:** Max 10 pinned messages per channel

---

#### Search Messages
```http
GET /api/chat/search/:channelId?q=nifty
Authorization: Bearer <token>
```

**Parameters:**
- `channelId` (path, required): Channel UUID
- `q` (query, required): Search query (min 2 chars)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "message": "NIFTY analysis for today...",
        "user_name": "Analyst",
        "created_at": "2025-10-08T12:00:00Z"
      }
    ],
    "count": 15,
    "query": "nifty"
  }
}
```

**Access:** Private (requires channel access)

**Search:** Full-text search using PostgreSQL tsvector

---

### Moderation

#### Get Flagged Messages
```http
GET /api/chat/moderation/flagged?limit=50&offset=0
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "message": "Spam message",
        "user_name": "Spammer",
        "channel_name": "General Discussion",
        "flagged_by_name": "Priya",
        "flagged_reason": "Spam",
        "created_at": "2025-10-08T12:00:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 50,
      "offset": 0
    }
  }
}
```

**Access:** Private (analyst only)

---

### Analytics

#### Get Channel Statistics
```http
GET /api/chat/stats/:channelId
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "channel_id": "uuid",
    "channel_name": "General Discussion",
    "stats": {
      "total_messages": 1542,
      "unique_users": 87,
      "messages_last_24h": 156,
      "last_message_at": "2025-10-08T12:34:56Z"
    }
  }
}
```

**Access:** Private (analyst only)

---

## Error Codes

All errors follow this format:
```json
{
  "success": false,
  "message": "User-friendly error message",
  "error": "Technical details (dev only)"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Validation error or invalid input |
| 401 | Unauthorized | No authentication token or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists (duplicate) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## Rate Limiting

### Message Rate Limits
- **Regular users:** 10 messages per minute
- **Analysts:** 30 messages per minute
- **Window:** Rolling 60-second window
- **Warning:** At 80% capacity (8 msgs for users, 24 for analysts)

### API Rate Limits
- **Standard endpoints:** 100 requests per 15 minutes
- **Flag message:** 10 flags per hour per user
- **Channel creation:** 5 channels per hour per analyst

### Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1609459200
```

---

## Examples

### Complete Chat Flow (JavaScript)

```javascript
import io from 'socket.io-client';

// 1. Connect to server
const socket = io('http://localhost:5000', {
  auth: { token: JWT_TOKEN }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // 2. Join channel
  socket.emit('join_channel', {
    channelId: 'channel-uuid'
  });
});

// 3. Listen for channel joined
socket.on('channel_joined', (data) => {
  console.log('Joined:', data.channel.channel_name);
  console.log('Messages:', data.messages.length);
  console.log('Can post:', data.can_post);

  // Display messages
  data.messages.forEach(msg => {
    displayMessage(msg);
  });
});

// 4. Listen for new messages
socket.on('message', (message) => {
  displayMessage(message);
});

// 5. Send message
function sendMessage(text) {
  socket.emit('send_message', {
    channelId: 'channel-uuid',
    message: text
  });
}

// 6. Typing indicators
let typingTimeout;
messageInput.addEventListener('input', () => {
  socket.emit('typing_start', { channelId: 'channel-uuid' });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing_stop', { channelId: 'channel-uuid' });
  }, 3000);
});

// 7. Handle errors
socket.on('error', (error) => {
  console.error('Error:', error.message);
  showErrorToast(error.message);
});

// 8. Rate limit handling
socket.on('rate_limit_exceeded', (data) => {
  disableSendButton(data.retry_after);
  showWarning(`Slow down! Wait ${data.retry_after} seconds`);
});
```

### REST API Example (cURL)

```bash
# Get channels
curl http://localhost:5000/api/chat/channels/analyst-uuid

# Get messages (with auth)
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/chat/messages/channel-uuid?limit=50"

# Create channel
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "VIP Room",
    "channelType": "premium",
    "icon": "💎"
  }' \
  http://localhost:5000/api/chat/channels

# Search messages
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/chat/search/channel-uuid?q=nifty"
```

---

## Support

For technical support or bug reports:
- Email: dev@analystplatform.com
- Documentation: https://docs.analystplatform.com
- GitHub Issues: (internal only)

---

**Last Updated:** 2025-10-08
**API Version:** 1.0.0
