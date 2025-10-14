# Discord-Style Real-Time Community Chat System

Complete implementation of a multi-channel community chat system for the Analyst Marketplace Platform.

## Overview

This is a production-ready, Discord-style real-time chat system with channels, moderation, rate limiting, and presence tracking. Built with Socket.io, Express.js, and PostgreSQL.

## Features

### Core Features
- **Multi-channel support** - Discord-style channels per analyst
- **Real-time messaging** - Instant message delivery via Socket.io
- **Typing indicators** - See who's typing in real-time
- **Online presence** - Track online/offline users
- **Message history** - Paginated message retrieval
- **Rate limiting** - Prevent spam (10 msgs/min for users, 30 for analysts)

### Moderation Tools
- **Mute users** - Temporary or permanent mute
- **Ban users** - Permanently remove from channel
- **Delete messages** - Analyst or message owner can delete
- **Flag messages** - Users can report inappropriate content
- **Pin messages** - Highlight important messages

### Access Control
- **Free tier** - Read-only access to all channels
- **Paid tier** - Full read/write access
- **Analyst** - Full moderation powers

## Architecture

### Files Structure
```
backend/
├── src/
│   ├── models/
│   │   ├── ChatChannel.js      # Channel database operations
│   │   └── ChatMessage.js      # Message database operations
│   ├── controllers/
│   │   └── chatController.js   # HTTP REST endpoints
│   ├── routes/
│   │   └── chat.routes.js      # Route definitions
│   ├── socket/
│   │   └── chatSocket.js       # Socket.io real-time handlers
│   └── migrations/
│       ├── 010_create_chat_channels_table.sql
│       └── 011_create_chat_messages_table.sql
```

## Database Schema

### chat_channels
```sql
- id (UUID, primary key)
- analyst_id (UUID, references users)
- channel_name (VARCHAR 255)
- channel_description (TEXT)
- channel_type (VARCHAR 50) - announcement, general, trading, ideas
- icon (VARCHAR 10) - emoji icon
- is_read_only (BOOLEAN) - analyst-only posting
- message_rate_limit (INTEGER) - messages per minute
- require_subscription (BOOLEAN)
- minimum_tier_required (UUID, references subscription_tiers)
- total_messages (INTEGER)
- active_members_count (INTEGER)
- last_message_at (TIMESTAMP)
- created_at, updated_at, deleted_at
```

### chat_messages
```sql
- id (UUID, primary key)
- channel_id (UUID, references chat_channels)
- user_id (UUID, references users)
- analyst_id (UUID, denormalized for query performance)
- message (TEXT, max 2000 chars)
- message_type (VARCHAR 50) - text, image, file, system
- attachment_url (VARCHAR 500)
- reply_to_message_id (UUID, self-reference for threading)
- is_deleted, deleted_by, deleted_at, deletion_reason
- is_flagged, flagged_by, flagged_reason
- is_pinned, pinned_by, pinned_at
- created_at, updated_at
```

## Socket.io Events

### Client → Server

#### `join_channel`
Join a specific channel
```javascript
socket.emit('join_channel', { channelId: 'uuid' });
```

#### `leave_channel`
Leave a channel
```javascript
socket.emit('leave_channel', { channelId: 'uuid' });
```

#### `send_message`
Send a message to a channel
```javascript
socket.emit('send_message', {
  channelId: 'uuid',
  message: 'Hello world',
  messageType: 'text', // optional: text, image, file
  replyToMessageId: 'uuid' // optional: for threading
});
```

#### `typing_start`
User started typing
```javascript
socket.emit('typing_start', { channelId: 'uuid' });
```

#### `typing_stop`
User stopped typing
```javascript
socket.emit('typing_stop', { channelId: 'uuid' });
```

#### `delete_message`
Delete a message (analyst or owner)
```javascript
socket.emit('delete_message', {
  messageId: 'uuid',
  channelId: 'uuid',
  reason: 'Spam' // optional
});
```

#### `mute_user`
Mute a user (analyst only)
```javascript
socket.emit('mute_user', {
  channelId: 'uuid',
  targetUserId: 'uuid',
  duration: 60 // minutes (60, 1440, or -1 for permanent)
});
```

#### `ban_user`
Ban a user from channel (analyst only)
```javascript
socket.emit('ban_user', {
  channelId: 'uuid',
  targetUserId: 'uuid',
  reason: 'Abusive behavior'
});
```

#### `get_online_users`
Get list of online users in channel
```javascript
socket.emit('get_online_users', { channelId: 'uuid' });
```

#### `presence_update`
Update presence (sent every 30 seconds)
```javascript
socket.emit('presence_update', {});
```

### Server → Client

#### `channel_joined`
Confirmation of joining channel with initial data
```javascript
{
  channelId: 'uuid',
  channel: { /* channel info */ },
  messages: [ /* last 100 messages */ ],
  pinned_messages: [ /* pinned messages */ ],
  online_count: 42,
  can_post: true,
  is_analyst: false,
  timestamp: '2025-10-08T...'
}
```

#### `message`
New message received
```javascript
{
  id: 'uuid',
  channel_id: 'uuid',
  user_id: 'uuid',
  user_name: 'Priya',
  user_role: 'trader',
  message: 'Great analysis!',
  message_type: 'text',
  created_at: '2025-10-08T...'
}
```

#### `message_deleted`
Message was deleted
```javascript
{
  channelId: 'uuid',
  messageId: 'uuid',
  deletedBy: 'uuid',
  reason: 'Spam',
  timestamp: '2025-10-08T...'
}
```

#### `user_joined`
User joined the channel
```javascript
{
  channelId: 'uuid',
  userId: 'uuid',
  userName: 'Rahul',
  userRole: 'trader',
  online_count: 43,
  timestamp: '2025-10-08T...'
}
```

#### `user_left`
User left the channel
```javascript
{
  channelId: 'uuid',
  userId: 'uuid',
  userName: 'Priya',
  online_count: 42,
  timestamp: '2025-10-08T...'
}
```

#### `typing_indicator`
Someone is typing
```javascript
{
  channelId: 'uuid',
  userId: 'uuid',
  userName: 'Rahul',
  typing_users: ['Priya', 'Amit'], // max 5 names
  typing_count: 3
}
```

#### `rate_limit_exceeded`
User exceeded rate limit
```javascript
{
  channelId: 'uuid',
  message: "You're sending too fast. Wait 42 seconds",
  retry_after: 42,
  limit: 10
}
```

#### `rate_limit_warning`
User approaching rate limit
```javascript
{
  channelId: 'uuid',
  message: 'Slow down! Max 10 messages per minute',
  remaining: 2
}
```

#### `user_muted`
You've been muted
```javascript
{
  channelId: 'uuid',
  message: 'You have been muted by the analyst for 60 minutes',
  duration: 60,
  mute_until: '2025-10-08T...'
}
```

#### `user_banned`
You've been banned
```javascript
{
  channelId: 'uuid',
  message: 'You have been banned from this channel by the analyst. Reason: Spam',
  reason: 'Spam'
}
```

#### `online_users`
Response to get_online_users request
```javascript
{
  channelId: 'uuid',
  users: [
    { userId: 'uuid', userName: 'Priya', userRole: 'trader', connectedAt: '...' },
    { userId: 'uuid', userName: 'Rahul', userRole: 'analyst', connectedAt: '...' }
  ],
  count: 2
}
```

#### `error`
Error occurred
```javascript
{
  event: 'send_message',
  message: 'Upgrade to Paid tier to post messages'
}
```

## REST API Endpoints

### Channel Management

#### `GET /api/chat/channels/:analystId`
Get all channels for an analyst
- **Access:** Public
- **Returns:** List of channels

#### `GET /api/chat/channels/single/:channelId`
Get single channel with access info
- **Access:** Private (requires auth)
- **Returns:** Channel details and access permissions

#### `POST /api/chat/channels`
Create a new channel (analyst only)
- **Access:** Private (analyst only)
- **Body:**
```json
{
  "channelName": "Trading Ideas",
  "channelDescription": "Share your best trade ideas",
  "channelType": "ideas",
  "icon": "🎯",
  "isReadOnly": false,
  "messageRateLimit": 10,
  "requireSubscription": true
}
```

#### `PUT /api/chat/channels/:channelId`
Update channel settings
- **Access:** Private (analyst only)
- **Body:** Same as create (partial updates allowed)

#### `DELETE /api/chat/channels/:channelId`
Delete channel (soft delete)
- **Access:** Private (analyst only)

#### `POST /api/chat/channels/default/:analystId`
Create default channels for new analyst
- **Access:** Private (analyst or admin)
- **Creates:** Announcements, General, Today's Calls, Trade Ideas

#### `GET /api/chat/channels/:channelId/members`
Get all members of a channel
- **Access:** Private (analyst only)
- **Query params:** `limit`, `offset`

### Message Management

#### `GET /api/chat/messages/:channelId`
Get message history (paginated)
- **Access:** Private (requires channel access)
- **Query params:** `limit`, `offset`, `before` (messageId)

#### `GET /api/chat/messages/pinned/:channelId`
Get pinned messages
- **Access:** Private (requires channel access)

#### `POST /api/chat/messages/:messageId/delete`
Delete a message
- **Access:** Private (analyst or message owner)
- **Body:** `{ "reason": "Spam" }`

#### `POST /api/chat/messages/:messageId/flag`
Flag message for moderation
- **Access:** Private
- **Body:** `{ "reason": "Inappropriate content" }`

#### `POST /api/chat/messages/:messageId/pin`
Pin a message
- **Access:** Private (analyst only)

#### `POST /api/chat/messages/:messageId/unpin`
Unpin a message
- **Access:** Private (analyst only)

#### `GET /api/chat/user/messages`
Get current user's messages
- **Access:** Private
- **Query params:** `channelId`

### Moderation

#### `POST /api/chat/users/:userId/mute`
Mute a user (REST fallback, prefer Socket.io)
- **Access:** Private (analyst only)
- **Body:** `{ "channelId": "uuid", "duration": 60 }`

#### `POST /api/chat/users/:userId/ban`
Ban a user (REST fallback, prefer Socket.io)
- **Access:** Private (analyst only)
- **Body:** `{ "channelId": "uuid", "reason": "Spam" }`

#### `GET /api/chat/moderation/flagged`
Get flagged messages for review
- **Access:** Private (analyst only)
- **Query params:** `limit`, `offset`

### Analytics

#### `GET /api/chat/users/:channelId/online`
Get online users (REST fallback, prefer Socket.io)
- **Access:** Private (requires channel access)

#### `GET /api/chat/stats/:channelId`
Get channel statistics
- **Access:** Private (analyst only)
- **Returns:**
```json
{
  "total_messages": 1542,
  "unique_users": 87,
  "messages_last_24h": 156,
  "last_message_at": "2025-10-08T..."
}
```

#### `GET /api/chat/search/:channelId`
Search messages in channel
- **Access:** Private (requires channel access)
- **Query params:** `q` (search query, min 2 chars)

## Default Channels

When an analyst signs up, 4 default channels are created:

1. **Announcements** (📢)
   - Type: `announcement`
   - Read-only (analyst posts only)
   - Rate limit: 30 msgs/min for analyst

2. **General Discussion** (💬)
   - Type: `general`
   - Free-form chat
   - Rate limit: 10 msgs/min

3. **Today's Calls** (📊)
   - Type: `trading`
   - Discuss current trading calls
   - Rate limit: 10 msgs/min

4. **Trade Ideas** (🎯)
   - Type: `ideas`
   - Share and discuss trade ideas
   - Rate limit: 10 msgs/min

## Access Control Matrix

| User Type | Read Messages | Post Messages | Delete Own | Delete Any | Mute | Ban | Create Channels |
|-----------|---------------|---------------|------------|------------|------|-----|-----------------|
| Free Tier | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Paid Tier | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Analyst   | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Rate Limiting

### Message Rate Limits
- **Regular users:** 10 messages per minute
- **Analysts:** 30 messages per minute
- **Warning threshold:** 80% of limit (8 msgs for users, 24 for analysts)
- **Bypass:** Announcement channels bypass rate limits for analysts

### How it works
1. Rate limit checked before sending message
2. Count messages from last 60 seconds
3. If exceeded: Block message, send `rate_limit_exceeded` event
4. If approaching (80%): Send `rate_limit_warning` event
5. Rate limit resets after 1 minute

## Moderation Actions

### Mute User
- **Duration options:**
  - 60 minutes (1 hour)
  - 1440 minutes (24 hours)
  - -1 (permanent/until unmuted)
- **Effect:** User can read but not post
- **Display:** "You've been muted by the analyst. Time remaining: X minutes"
- **Auto-expire:** Mutes automatically expire after duration

### Ban User
- **Effect:** User removed from channel, cannot rejoin
- **Scope:** Channel-specific (can still access other analysts)
- **Display:** "You have been banned from this channel. Reason: X"
- **Appeal:** User can contact support to appeal

### Delete Message
- **Who can delete:**
  - Message owner (own messages)
  - Analyst (any message in their channels)
- **Type:** Soft delete (message hidden, not removed from DB)
- **Audit:** Deletion logged with user_id and reason
- **Limitation:** Cannot delete messages older than 24 hours (archive rule)

## Performance Optimizations

### Database
- Indexes on `(channel_id, created_at DESC)` for message queries
- Indexes on `(user_id, channel_id, created_at)` for rate limiting
- Denormalized `analyst_id` in messages for faster queries
- Pagination with `limit` and `offset` for all list endpoints

### Socket.io
- One Socket.io room per channel (`channel_{channelId}`)
- In-memory tracking of online users (use Redis in production)
- Debounced typing indicators (3 second delay)
- Throttled presence updates (30 second intervals)

### Caching (Production)
- Use Redis for:
  - Online user tracking
  - Mute/ban lists
  - Rate limiting counters
  - Typing indicators
  - Presence data

## Security Considerations

### Authentication
- JWT verification on Socket.io handshake
- Token passed in `socket.handshake.auth.token`
- User info attached to socket: `socket.userId`, `socket.userRole`

### Input Validation
- Message max length: 500 characters
- Channel name max: 255 characters
- Search query min: 2 characters
- XSS prevention: Sanitize all user input

### SQL Injection Prevention
- All queries use parameterized statements
- Never concatenate user input into SQL
- PostgreSQL prepared statements via `pg` library

### Access Control
- Every endpoint checks user permissions
- Subscription status verified before allowing posts
- Analyst verification for moderation actions
- Channel access checked on join and message send

## Error Handling

All endpoints return consistent error format:
```json
{
  "success": false,
  "message": "User-friendly error message",
  "error": "Technical details (dev only)"
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad request (validation error)
- `401` - Unauthorized (no token or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `429` - Too many requests (rate limited)
- `500` - Internal server error

## Testing

### Socket.io Client Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  // Join a channel
  socket.emit('join_channel', { channelId: 'uuid' });
});

socket.on('channel_joined', (data) => {
  console.log('Joined channel:', data);
});

socket.on('message', (message) => {
  console.log('New message:', message);
});

// Send a message
socket.emit('send_message', {
  channelId: 'uuid',
  message: 'Hello from client!'
});
```

### REST API Testing (cURL)
```bash
# Get analyst's channels
curl http://localhost:5000/api/chat/channels/{analystId}

# Get channel messages (requires auth)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:5000/api/chat/messages/{channelId}?limit=50

# Create channel (analyst only)
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "VIP Trading Room",
    "channelType": "premium",
    "icon": "💎",
    "requireSubscription": true
  }' \
  http://localhost:5000/api/chat/channels
```

## Production Deployment Checklist

- [ ] Enable Redis for in-memory stores (online users, mutes, bans)
- [ ] Configure Socket.io sticky sessions (if using multiple servers)
- [ ] Set up WebSocket load balancing
- [ ] Enable CORS for production frontend URL
- [ ] Set up rate limiting per IP address
- [ ] Enable message content moderation (profanity filter)
- [ ] Set up monitoring for Socket.io connections
- [ ] Configure database connection pooling (already done)
- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Enable SSL/TLS for WebSocket connections
- [ ] Set up log aggregation (CloudWatch, Datadog)
- [ ] Configure database backups
- [ ] Set up CDN for media attachments (Cloudinary)
- [ ] Enable compression for Socket.io messages

## Monitoring

### Key Metrics to Track
- Active Socket.io connections
- Messages sent per minute
- Rate limit violations
- Mute/ban actions
- Average message latency
- Database query performance
- Channel active user counts
- Typing indicator frequency

### Logging
All important events are logged:
- User connections/disconnections
- Channel joins/leaves
- Message sends
- Moderation actions (mute/ban/delete)
- Rate limit violations
- Errors and exceptions

## Future Enhancements

1. **Message Reactions** - Like, love, laugh emoji reactions
2. **Message Threading** - Full threaded conversations
3. **Voice Channels** - WebRTC voice chat
4. **File Uploads** - Attach images/files to messages
5. **Mentions** - @username notifications
6. **Read Receipts** - Track who read messages
7. **User Roles** - Moderator, VIP, etc.
8. **Custom Emojis** - Analyst-specific emojis
9. **Message Formatting** - Bold, italic, code blocks
10. **DMs** - Direct messages between users

## Support

For issues or questions:
- Check logs in `/backend/logs/`
- Review database migrations in `/backend/migrations/`
- Test Socket.io connection with included test client
- Verify JWT token is valid and not expired
- Check CORS configuration in server.js

## License

Proprietary - Analyst Marketplace Platform
