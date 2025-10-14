# Trading Call Formatter API Documentation

## Overview

The Trading Call Formatter API provides AI-powered formatting and categorization of raw trading calls. It uses Claude AI to extract structured information from analyst text/voice input and categorizes calls by trading strategy type.

---

## Endpoint

**POST** `/api/posts/format-call`

### Authentication
Required. JWT token in `Authorization` header.
Access: **Analyst only**

### Rate Limiting
Standard rate limit applies (100 requests per 15 minutes per user).

---

## Request

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `raw_input` | string | **Yes** | Raw text/voice transcription of the trading call |
| `call_type` | string | No | Suggested call type hint (see Call Types below) |
| `stock_symbol` | string | No | Stock symbol hint (e.g., "RELIANCE", "NIFTY") |

### Call Types

| Type | Description | DB Mapping | Keywords |
|------|-------------|------------|----------|
| `longterm` | Long-term investments (weeks to months) | `long_term` | "long term", "investment", "accumulate" |
| `positional` | Position trading (days to weeks) | `positional` | "positional", "few weeks" |
| `swing` | Swing trading (2-10 days) | `swing` | "swing", "few days", "short term" |
| `intraday` | Intraday trading (same day) | `intraday` | "intraday", "today", "aaj", "day trade" |
| `overnight` | Overnight positions (1-2 days) | `swing` | "overnight", "tomorrow", "1-2 days" |
| `quant` | Quantitative/algorithmic strategies | `options` | "algo", "quant", "systematic" |

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Trading call formatted successfully",
  "data": {
    "call_type": "intraday",
    "call_type_description": "Intraday trading (same day)",
    "stock_symbol": "NIFTY",
    "action": "BUY",
    "entry_price": 19500,
    "target_price": 19600,
    "stop_loss": 19450,
    "quantity_suggestion": 100,
    "strategy": "Breakout above resistance with strong volume",
    "risk_reward_ratio": "1:2.0",
    "time_frame": "Intraday",
    "reasoning": "Strong momentum with volume confirmation",
    "formatted_text": "🎯 **INTRADAY CALL**\n\n📊 Stock: NIFTY\n📈 Action: BUY\n💰 Entry: ₹19,500\n🎯 Target: ₹19,600\n🛡️ Stop Loss: ₹19,450\n⚖️ Risk:Reward = 1:2.0\n\n📝 Strategy: Breakout above resistance with strong volume",
    "db_strategy_type": "intraday",
    "metadata": {
      "rawInput": "NIFTY buy at 19500 target 19600 stop loss 19450 intraday",
      "suggestedCallType": "intraday",
      "suggestedStock": "NIFTY",
      "tokensUsed": 450,
      "latencyMs": 1234,
      "timestamp": "2025-01-15T10:30:00.000Z",
      "price_validation": {
        "valid": true,
        "warnings": []
      },
      "stock_symbol_validated": true
    }
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `call_type` | string | Categorized call type (see Call Types table) |
| `call_type_description` | string | Human-readable description of the call type |
| `stock_symbol` | string\|null | Normalized stock ticker symbol (NSE format) |
| `action` | string\|null | Trading action: "BUY", "SELL", or null |
| `entry_price` | number\|null | Entry price point |
| `target_price` | number\|null | Target price for profit booking |
| `stop_loss` | number\|null | Stop loss price for risk management |
| `quantity_suggestion` | number\|null | Suggested quantity (if mentioned) |
| `strategy` | string\|null | Trading strategy description |
| `risk_reward_ratio` | string\|null | Risk to reward ratio (e.g., "1:2.5") |
| `time_frame` | string\|null | Time frame for the call |
| `reasoning` | string\|null | Analyst's reasoning/rationale |
| `formatted_text` | string | Professional formatted display text with emojis |
| `db_strategy_type` | string | Database-compatible strategy type |
| `metadata` | object | Request metadata and validation info |

---

## Error Responses

### 400 Bad Request - Invalid Input
```json
{
  "success": false,
  "message": "raw_input is required and must be a non-empty string"
}
```

### 400 Bad Request - Invalid Call Type
```json
{
  "success": false,
  "message": "Invalid call_type. Must be one of: longterm, positional, swing, intraday, overnight, quant"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Only analysts can access this endpoint"
}
```

### 500 Internal Server Error - AI Formatting Failed
```json
{
  "success": false,
  "message": "AI formatting failed",
  "error": "Claude API timeout after 5 seconds",
  "fallback": true,
  "shouldRetry": true
}
```

---

## Usage Examples

### Example 1: Intraday Call (English)

**Request:**
```bash
curl -X POST https://api.callstreet.com/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "NIFTY buy at 19500 target 19600 stop loss 19450 intraday",
    "call_type": "intraday",
    "stock_symbol": "NIFTY"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Trading call formatted successfully",
  "data": {
    "call_type": "intraday",
    "stock_symbol": "NIFTY",
    "action": "BUY",
    "entry_price": 19500,
    "target_price": 19600,
    "stop_loss": 19450,
    "risk_reward_ratio": "1:2.0",
    "formatted_text": "🎯 **INTRADAY CALL**\n\n📊 Stock: NIFTY\n..."
  }
}
```

### Example 2: Swing Call (Hinglish)

**Request:**
```bash
curl -X POST https://api.callstreet.com/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "RELIANCE ko 2450 pe khareed lo swing trade ke liye target 2550 stop 2400"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "call_type": "swing",
    "stock_symbol": "RELIANCE",
    "action": "BUY",
    "entry_price": 2450,
    "target_price": 2550,
    "stop_loss": 2400,
    "risk_reward_ratio": "1:2.0"
  }
}
```

### Example 3: Long-term Investment

**Request:**
```bash
curl -X POST https://api.callstreet.com/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "Good setup in TCS for long term investment around 3500",
    "call_type": "longterm"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "call_type": "longterm",
    "stock_symbol": "TCS",
    "action": "BUY",
    "entry_price": 3500,
    "target_price": null,
    "stop_loss": null,
    "strategy": "Long-term investment",
    "reasoning": "Good setup"
  }
}
```

### Example 4: Without Hints (AI Auto-detect)

**Request:**
```bash
curl -X POST https://api.callstreet.com/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "Bank Nifty sell karo 45000 pe overnight position target 44500 stoploss 45200"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "call_type": "overnight",
    "stock_symbol": "BANKNIFTY",
    "action": "SELL",
    "entry_price": 45000,
    "target_price": 44500,
    "stop_loss": 45200,
    "db_strategy_type": "swing"
  }
}
```

---

## AI Behavior

### What AI Extracts:
- Call type (categorization based on keywords)
- Stock symbol (with normalization to NSE format)
- Trading action (BUY/SELL/HOLD)
- Entry price, target price, stop loss
- Strategy and reasoning (if mentioned)
- Risk-reward ratio (calculated automatically)
- Quantity suggestions (if mentioned)
- Time frame

### What AI NEVER Does:
- Hallucinate prices or trading data
- Provide its own trading advice
- Add analysis not present in input
- Invent missing information
- Return data for prohibited content

### Prohibited Content:
Calls containing these keywords will be rejected:
- "guaranteed returns"
- "insider tip"
- "pump and dump"
- "risk-free"
- "guaranteed profit"
- "sure shot"
- "zero risk"
- "100% returns"

---

## Integration with Post Creation

This endpoint is designed to be used **before** creating a post. Typical workflow:

1. Analyst provides raw text/voice input
2. Frontend calls `/api/posts/format-call` to get structured data
3. Frontend displays formatted preview to analyst
4. Analyst can edit/confirm the formatted data
5. Frontend calls `/api/posts/create` with the confirmed data

**Example Integration:**
```javascript
// Step 1: Format the call
const formatResponse = await fetch('/api/posts/format-call', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    raw_input: userInput,
    call_type: selectedCallType
  })
});

const formattedData = await formatResponse.json();

// Step 2: Show preview to user
displayPreview(formattedData.data);

// Step 3: Create post with confirmed data
const createResponse = await fetch('/api/posts/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    raw_content: userInput,
    post_type: 'call',
    strategy_type: formattedData.data.db_strategy_type,
    stock_symbol: formattedData.data.stock_symbol,
    action: formattedData.data.action,
    entry_price: formattedData.data.entry_price,
    target_price: formattedData.data.target_price,
    stop_loss: formattedData.data.stop_loss,
    risk_reward_ratio: formattedData.data.risk_reward_ratio,
    audience: 'paid'
  })
});
```

---

## Price Validation

The API performs automatic price logic validation:

### For BUY Calls:
- ✅ Target price > Entry price
- ✅ Stop loss < Entry price

### For SELL Calls:
- ✅ Target price < Entry price
- ✅ Stop loss > Entry price

**Validation warnings** are included in `metadata.price_validation`:
```json
{
  "valid": false,
  "warnings": [
    "BUY call: target price should be greater than entry price"
  ]
}
```

---

## Stock Symbol Normalization

The API automatically normalizes stock symbols to NSE format:

| Input | Normalized Output |
|-------|-------------------|
| "hdfc bank" | "HDFCBANK" |
| "reliance" | "RELIANCE" |
| "nifty 50" | "NIFTY" |
| "tata consultancy" | "TCS" |

**100+ Indian stocks supported.** See `/backend/src/utils/stockSymbolMapper.js` for full list.

---

## Performance

- **Target latency**: < 2 seconds (P95)
- **AI timeout**: 5 seconds
- **Retry logic**: Automatic for timeouts and rate limits
- **Cost tracking**: Token usage logged in metadata

---

## Language Support

Supports:
- **English**: "NIFTY buy at 19500 target 19600"
- **Hindi**: "NIFTY को 19500 पे खरीदो"
- **Hinglish**: "NIFTY ko 19500 pe khareed lo"

Keywords recognized:
- **BUY**: "buy", "khareed lo", "khareed", "long"
- **SELL**: "sell", "bech do", "bech", "short"
- **Intraday**: "intraday", "aaj", "today"
- **Swing**: "swing", "short term", "few days"

---

## Best Practices

1. **Provide hints when available**: If you know the call type or stock, pass them as hints
2. **Handle fallback gracefully**: If AI formatting fails, allow manual entry
3. **Show preview before posting**: Let analyst review and edit AI-formatted data
4. **Validate prices client-side**: Check price logic before submitting
5. **Use for calls only**: This endpoint is optimized for trading calls, not general content
6. **Monitor latency**: Track API response times and handle timeouts

---

## Testing

### Test with curl:
```bash
# Test intraday call
curl -X POST http://localhost:5000/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_input":"NIFTY buy at 19500 target 19600 stop 19450 intraday"}'

# Test Hinglish input
curl -X POST http://localhost:5000/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_input":"RELIANCE ko 2450 pe khareed lo"}'

# Test with invalid call type
curl -X POST http://localhost:5000/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_input":"test","call_type":"invalid"}'
```

---

## Related Endpoints

- `POST /api/posts/create` - Create a post (use after formatting)
- `POST /api/posts/:id/format-ai` - Re-format existing post
- `GET /api/posts/feed` - Get user feed with call type filters

---

## Support

For issues or questions:
- Email: support@callstreet.com
- Slack: #api-support
- Documentation: https://docs.callstreet.com

---

**Last Updated**: 2025-01-15
**API Version**: v1.0
**Maintained by**: Backend Team
