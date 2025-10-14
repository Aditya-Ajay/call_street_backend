# Chat System Quick Reference

## Socket.io Client Setup

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: JWT_TOKEN }
});

// Join channel
socket.emit('join_channel', { channelId: 'uuid' });

// Send message
socket.emit('send_message', {
  channelId: 'uuid',
  message: 'Hello!'
});

// Listen for messages
socket.on('message', (msg) => {
  console.log(msg);
});
```

## REST API Quick Reference

```bash
# Get channels
GET /api/chat/channels/:analystId

# Get messages
GET /api/chat/messages/:channelId?limit=50
Authorization: Bearer TOKEN

# Create channel (analyst only)
POST /api/chat/channels
Authorization: Bearer TOKEN
{
  "channelName": "VIP Room",
  "channelType": "premium",
  "icon": "💎"
}

# Search messages
GET /api/chat/search/:channelId?q=nifty
Authorization: Bearer TOKEN
```

## Common Events

### Send Message
```javascript
socket.emit('send_message', {
  channelId: 'uuid',
  message: 'Text here',
  messageType: 'text' // optional
});
```

### Typing Indicator
```javascript
// Start
socket.emit('typing_start', { channelId: 'uuid' });

// Stop (after 3 seconds of inactivity)
socket.emit('typing_stop', { channelId: 'uuid' });
```

### Moderation (Analyst Only)
```javascript
// Mute user
socket.emit('mute_user', {
  channelId: 'uuid',
  targetUserId: 'uuid',
  duration: 60 // minutes
});

// Ban user
socket.emit('ban_user', {
  channelId: 'uuid',
  targetUserId: 'uuid',
  reason: 'Spam'
});

// Delete message
socket.emit('delete_message', {
  messageId: 'uuid',
  channelId: 'uuid',
  reason: 'Inappropriate'
});
```

## Rate Limits

- **Users:** 10 messages/minute
- **Analysts:** 30 messages/minute
- **Warning:** At 8 messages (users) or 24 messages (analysts)

## Access Control

| User Type | Read | Post | Moderate |
|-----------|------|------|----------|
| Free      | ✅   | ❌   | ❌       |
| Paid      | ✅   | ✅   | ❌       |
| Analyst   | ✅   | ✅   | ✅       |

## Default Channels

When analyst signs up, create default channels:
```javascript
const ChatChannel = require('./models/ChatChannel');
await ChatChannel.createDefaultChannels(analystId);
```

Creates:
- 📢 Announcements (read-only)
- 💬 General Discussion
- 📊 Today's Calls
- 🎯 Trade Ideas

## Error Handling

```javascript
socket.on('error', (error) => {
  console.error(error.event, error.message);
});

socket.on('rate_limit_exceeded', (data) => {
  // Disable send button for data.retry_after seconds
});

socket.on('user_muted', (data) => {
  // Show "You've been muted" message
  // Disable input until data.mute_until
});
```

## Database Queries

### Get Channel Messages
```javascript
const ChatMessage = require('./models/ChatMessage');
const result = await ChatMessage.getChannelMessages(channelId, 50, 0);
```

### Check Rate Limit
```javascript
const rateLimit = await ChatMessage.checkRateLimit(userId, channelId, 10);
if (rateLimit.is_limited) {
  // Block message
}
```

### Check User Access
```javascript
const ChatChannel = require('./models/ChatChannel');
const access = await ChatChannel.checkUserAccess(channelId, userId, userRole);
if (!access.can_post) {
  // Show upgrade prompt
}
```

## File Paths

```
Models:       /backend/src/models/ChatChannel.js
              /backend/src/models/ChatMessage.js
Controller:   /backend/src/controllers/chatController.js
Routes:       /backend/src/routes/chat.routes.js
Socket.io:    /backend/src/socket/chatSocket.js
Migrations:   /backend/migrations/010_*.sql, 011_*.sql
Docs:         /backend/CHAT_SYSTEM_README.md
Test Client:  /backend/test_chat_socket.html
```

## Troubleshooting

### Connection Issues
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Check: JWT token valid? Server running? CORS configured?
});
```

### Message Not Sending
1. Check rate limit (10 msgs/min)
2. Check user has paid subscription (not free tier)
3. Check message length (max 500 chars)
4. Check user not muted/banned

### Access Denied
1. Verify JWT token in Authorization header or socket auth
2. Check subscription status in database
3. Check channel requires subscription
4. Check minimum tier requirement

## Testing with cURL

```bash
# Get channels (public)
curl http://localhost:5000/api/chat/channels/analyst-uuid

# Get messages (auth required)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/chat/messages/channel-uuid

# Create channel (analyst only)
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channelName":"Test","channelType":"general","icon":"💬"}' \
  http://localhost:5000/api/chat/channels
```

## Integration Checklist

1. ✅ Run migrations (010, 011)
2. ✅ Install socket.io (`npm install`)
3. ✅ Initialize Socket.io in server.js
4. ✅ Set JWT_SECRET in .env
5. ✅ Call createDefaultChannels() on analyst signup
6. ✅ Test with test_chat_socket.html

## Support

- Full docs: `/backend/CHAT_SYSTEM_README.md`
- API reference: `/backend/CHAT_API_REFERENCE.md`
- Test client: `/backend/test_chat_socket.html`
