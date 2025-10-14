# Voice-to-Trading-Call AI Formatting API

Complete documentation for the AI-powered voice-to-trading-call formatting feature using Claude API.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Cost Management](#cost-management)
8. [Stock Symbol Mapping](#stock-symbol-mapping)
9. [Testing](#testing)
10. [Frontend Integration](#frontend-integration)

---

## Overview

The AI formatting feature allows analysts to convert voice transcripts into structured trading call data using Claude API (Anthropic's LLM).

### Key Features

- **Voice-to-Text Formatting**: Convert raw voice transcripts into structured trading calls
- **Multilingual Support**: English, Hindi, and Hinglish
- **Stock Symbol Normalization**: Automatically map stock names to NSE symbols
- **Confidence Scoring**: AI-generated confidence levels for formatted data
- **Error Handling**: Graceful fallbacks when AI fails
- **Rate Limiting**: 10 requests/minute, 100 requests/day per analyst
- **Cost Tracking**: Token usage and cost monitoring per user

### Technical Stack

- **AI Model**: Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
- **SDK**: @anthropic-ai/sdk v0.12.0
- **Database**: PostgreSQL (ai_usage_logs table)
- **Authentication**: JWT tokens

---

## Architecture

```
┌─────────────────┐
│  Voice Input    │
│   (Frontend)    │
└────────┬────────┘
         │
         │ 1. POST /api/ai/format-call
         ▼
┌─────────────────┐
│  AI Controller  │──────► Rate Limiting Check (10/min, 100/day)
└────────┬────────┘
         │
         │ 2. Call AI Service
         ▼
┌─────────────────┐
│   AI Service    │──────► Claude API (Anthropic)
│  (aiService.js) │        - Extract trading data
└────────┬────────┘        - Validate schema
         │                 - Calculate risk:reward
         │
         │ 3. Normalize Stock Symbol
         ▼
┌─────────────────┐
│ Stock Mapper    │──────► Map "HDFC Bank" → "HDFCBANK"
└────────┬────────┘
         │
         │ 4. Log Usage
         ▼
┌─────────────────┐
│   Database      │──────► ai_usage_logs table
│ (PostgreSQL)    │        - Token usage
└────────┬────────┘        - Cost tracking
         │                 - Audit trail
         │
         │ 5. Return Formatted Call
         ▼
┌─────────────────┐
│   Response      │──────► { formatted_call, metadata }
└─────────────────┘
```

---

## API Endpoints

### 1. Format Trading Call

**Endpoint**: `POST /api/ai/format-call`

**Authentication**: Required (Analysts only)

**Rate Limit**: 10 requests/minute, 100 requests/day

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

**Request Body**:
```json
{
  "transcript": "Buy HDFC Bank at 1520 rupees, target 1640, stop loss at 1480, this is a swing trade based on breakout pattern",
  "language": "en",        // Optional: 'en', 'hi', 'hinglish' (default: 'en')
  "use_retry": true        // Optional: Enable retry logic (default: true)
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Trading call formatted successfully",
  "data": {
    "formatted_call": {
      "stock": "HDFCBANK",
      "action": "BUY",
      "entry_price": 1520,
      "target_price": 1640,
      "stop_loss": 1480,
      "strategy_type": "SWING",
      "confidence": null,
      "reasoning": "breakout pattern",
      "risk_reward_ratio": "1:3.0",
      "time_horizon": null
    },
    "original_transcript": "Buy HDFC Bank at 1520 rupees...",
    "ai_confidence": "high",
    "metadata": {
      "model": "claude-sonnet-4-5-20250929",
      "tokens_used": 245,
      "latency_ms": 1234,
      "formatted_at": "2025-10-09T10:30:00.000Z",
      "language": "en"
    }
  }
}
```

---

### 2. Get Usage Statistics

**Endpoint**: `GET /api/ai/usage-stats`

**Authentication**: Required (Analysts only)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Usage statistics fetched successfully",
  "data": {
    "today": {
      "requests": 15,
      "tokens": 3500,
      "cost_inr": 2.625,
      "successful": 14,
      "failed": 1,
      "remaining_requests": 85
    },
    "this_month": {
      "requests": 450,
      "tokens": 105000,
      "cost_inr": 78.75
    },
    "limits": {
      "per_minute": 10,
      "per_day": 100,
      "per_month": 3000
    }
  }
}
```

---

### 3. Health Check

**Endpoint**: `GET /api/ai/health`

**Authentication**: Not required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "AI service is operational",
  "data": {
    "service": "claude-api",
    "model": "claude-sonnet-4-5-20250929",
    "status": "available",
    "features": {
      "voice_formatting": true,
      "retry_logic": true,
      "multilingual": true,
      "languages": ["en", "hi", "hinglish"]
    },
    "limits": {
      "transcript_min_length": 10,
      "transcript_max_length": 1000,
      "requests_per_minute": 10,
      "requests_per_day": 100
    }
  }
}
```

---

## Request/Response Examples

### Example 1: Simple Buy Call (English)

**Request**:
```bash
curl -X POST http://localhost:8080/api/ai/format-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transcript": "Buy Reliance at 2450 target 2500 stop loss 2420",
    "language": "en"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "formatted_call": {
      "stock": "RELIANCE",
      "action": "BUY",
      "entry_price": 2450,
      "target_price": 2500,
      "stop_loss": 2420,
      "strategy_type": null,
      "confidence": null,
      "reasoning": null,
      "risk_reward_ratio": "1:1.7",
      "time_horizon": null
    },
    "ai_confidence": "high"
  }
}
```

---

### Example 2: Sell Call with Strategy (English)

**Request**:
```bash
curl -X POST http://localhost:8080/api/ai/format-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transcript": "Sell Tata Motors at 620 for intraday target 610 stop loss 625 based on bearish reversal",
    "language": "en"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "formatted_call": {
      "stock": "TATAMOTORS",
      "action": "SELL",
      "entry_price": 620,
      "target_price": 610,
      "stop_loss": 625,
      "strategy_type": "INTRADAY",
      "confidence": null,
      "reasoning": "bearish reversal",
      "risk_reward_ratio": "1:2.0",
      "time_horizon": null
    },
    "ai_confidence": "high"
  }
}
```

---

### Example 3: Hinglish Call

**Request**:
```bash
curl -X POST http://localhost:8080/api/ai/format-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transcript": "ICICI Bank ko 950 pe khareed lo target 980 stop 930",
    "language": "hinglish"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "formatted_call": {
      "stock": "ICICIBANK",
      "action": "BUY",
      "entry_price": 950,
      "target_price": 980,
      "stop_loss": 930,
      "strategy_type": null,
      "confidence": null,
      "reasoning": null,
      "risk_reward_ratio": "1:1.5",
      "time_horizon": null
    },
    "ai_confidence": "high"
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

### Common Errors

| Status Code | Error | Description | Solution |
|-------------|-------|-------------|----------|
| 400 | `INVALID_TRANSCRIPT` | Transcript too short (<10 chars) | Provide longer transcript |
| 400 | `TRANSCRIPT_TOO_LONG` | Transcript exceeds 1000 chars | Shorten the transcript |
| 400 | `MISSING_TRANSCRIPT` | Transcript field missing | Include transcript in request body |
| 401 | `UNAUTHORIZED` | Not logged in | Provide valid JWT token |
| 403 | `FORBIDDEN` | Not an analyst | Only analysts can use this feature |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry (10/min, 100/day) |
| 500 | `AI_SERVICE_ERROR` | Claude API failed | Enter details manually |
| 503 | `SERVICE_UNAVAILABLE` | AI service down | Try again later |

### Error Response Examples

**400 - Transcript Too Short**:
```json
{
  "success": false,
  "message": "Transcript must be at least 10 characters long"
}
```

**429 - Rate Limit Exceeded**:
```json
{
  "success": false,
  "message": "Rate limit exceeded. Maximum 10 requests per minute. Please try again later."
}
```

**500 - AI Service Error**:
```json
{
  "success": false,
  "message": "AI formatting failed: timeout. Please enter trading details manually."
}
```

---

## Rate Limiting

### Limits

| Limit Type | Threshold | Window |
|------------|-----------|--------|
| Per Minute | 10 requests | 1 minute |
| Per Day | 100 requests | 24 hours |
| Per Month | 3000 requests | 30 days |

### Rate Limit Headers

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1696849200
```

### Rate Limit Strategy

1. **Client-side**: Disable button after request, show cooldown
2. **Server-side**: Track requests in database per user
3. **Response**: Return 429 with retry-after header

---

## Cost Management

### Pricing

- **Claude API**: ~₹750 per 1 million tokens
- **Average call**: ~200-300 tokens
- **Cost per call**: ~₹0.15 - ₹0.22

### Cost Tracking

All API calls are logged in `ai_usage_logs` table:

```sql
SELECT
  user_id,
  COUNT(*) as total_requests,
  SUM(tokens_used) as total_tokens,
  SUM(cost_inr) as total_cost_inr
FROM ai_usage_logs
WHERE created_at >= CURRENT_DATE
GROUP BY user_id;
```

### Daily Spend Monitoring

```sql
-- Check if user is approaching daily budget
SELECT
  SUM(cost_inr) as today_spend
FROM ai_usage_logs
WHERE user_id = 'ANALYST_ID'
AND created_at >= CURRENT_DATE;
```

---

## Stock Symbol Mapping

The `stockSymbolMapper.js` utility automatically converts common stock names to NSE symbols.

### Supported Stocks

- **Banking**: HDFC Bank → HDFCBANK, ICICI Bank → ICICIBANK, SBI → SBIN
- **IT**: TCS → TCS, Infosys → INFY, Wipro → WIPRO
- **Pharma**: Sun Pharma → SUNPHARMA, Cipla → CIPLA, Dr Reddy → DRREDDY
- **Auto**: Maruti → MARUTI, Tata Motors → TATAMOTORS, M&M → M&M
- **Indices**: Nifty → NIFTY, Bank Nifty → BANKNIFTY, Sensex → SENSEX

### Usage

```javascript
const { normalizeStockSymbol } = require('./utils/stockSymbolMapper');

const symbol = normalizeStockSymbol('hdfc bank'); // Returns 'HDFCBANK'
const symbol = normalizeStockSymbol('HDFCBANK'); // Returns 'HDFCBANK'
```

### Adding New Stocks

Edit `/backend/src/utils/stockSymbolMapper.js`:

```javascript
const STOCK_NAME_TO_SYMBOL = {
  // Add new mapping
  'new stock name': 'NSE_SYMBOL',
  // ...
};
```

---

## Testing

### Manual Testing

Run the test suite:

```bash
cd /Users/aditya/dev/call_street_express/backend
./test-ai-formatting.sh
```

### Test Coverage

1. ✓ Analyst authentication
2. ✓ AI service health check
3. ✓ Format simple trading call (English)
4. ✓ Format with Hinglish
5. ✓ Invalid transcript (too short)
6. ✓ Missing transcript
7. ✓ Transcript too long
8. ✓ Usage statistics
9. ✓ Stock symbol normalization
10. ✓ Unauthorized request
11. ✓ AI confidence scoring
12. ✓ Complex trading call

### Example Test

```bash
# Test AI formatting endpoint
curl -X POST http://localhost:8080/api/ai/format-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transcript": "Buy HDFC Bank at 1520 target 1640 stop loss 1480",
    "language": "en"
  }'
```

---

## Frontend Integration

### React Integration Example

```javascript
// src/services/api.js

export const aiAPI = {
  /**
   * Format trading call from voice transcript
   */
  async formatTradingCall(transcript, language = 'en') {
    const response = await apiClient.post('/api/ai/format-call', {
      transcript,
      language,
      use_retry: true
    });
    return response.data;
  },

  /**
   * Get AI usage statistics
   */
  async getUsageStats() {
    const response = await apiClient.get('/api/ai/usage-stats');
    return response.data;
  }
};
```

### Usage in VoiceInput Component

```javascript
// src/components/dashboard/VoiceInput.jsx

import { aiAPI } from '../../services/api';

const handleFormatWithAI = async () => {
  try {
    setFormatting(true);

    const response = await aiAPI.formatTradingCall(transcript, 'en');

    if (response.success) {
      const formattedCall = response.data.formatted_call;

      // Pass to parent component (PostComposer)
      onFormatComplete({
        ...formattedCall,
        voice_transcript: transcript,
        ai_formatted: true,
        ai_formatting_metadata: response.data.metadata
      });

      toast.success('Trading call formatted successfully!');
    }
  } catch (error) {
    console.error('AI formatting failed:', error);
    toast.error(error.message || 'Failed to format call. Please enter details manually.');
  } finally {
    setFormatting(false);
  }
};
```

### Usage Stats Display

```javascript
// src/components/dashboard/AIUsageStats.jsx

import { useEffect, useState } from 'react';
import { aiAPI } from '../../services/api';

const AIUsageStats = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      const response = await aiAPI.getUsageStats();
      setStats(response.data);
    };

    fetchStats();
  }, []);

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="usage-stats">
      <h3>AI Usage Today</h3>
      <p>Requests: {stats.today.requests} / {stats.limits.per_day}</p>
      <p>Remaining: {stats.today.remaining_requests}</p>
      <p>Cost: ₹{stats.today.cost_inr.toFixed(2)}</p>
    </div>
  );
};
```

---

## Database Schema

### ai_usage_logs Table

```sql
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  operation_type VARCHAR(50) NOT NULL,
  input_length INTEGER NOT NULL DEFAULT 0,
  output_data JSONB,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_inr DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

---

## Security Considerations

### API Key Security

- ✓ Claude API key stored in environment variables
- ✓ Never exposed to frontend
- ✓ Rotated regularly

### Input Validation

- ✓ Transcript length: 10-1000 characters
- ✓ Language: 'en', 'hi', 'hinglish' only
- ✓ Sanitized before sending to Claude API

### Authentication

- ✓ JWT token required for all endpoints
- ✓ Analysts only (verified users)
- ✓ Token expiration: 7 days

### Rate Limiting

- ✓ Per-user rate limits enforced
- ✓ Database-backed (not just in-memory)
- ✓ Prevents abuse and cost overruns

---

## Troubleshooting

### Issue: AI formatting returns error

**Cause**: Claude API timeout or invalid response

**Solution**: Enable retry logic (`use_retry: true`)

---

### Issue: Stock symbol not normalized

**Cause**: Stock name not in mapper

**Solution**: Add stock to `stockSymbolMapper.js`

---

### Issue: Rate limit exceeded

**Cause**: Too many requests in short time

**Solution**: Wait for cooldown, implement exponential backoff

---

### Issue: Cost too high

**Cause**: Excessive API calls

**Solution**:
- Cache common calls
- Reduce daily limits
- Implement client-side validation

---

## Support

For issues or questions:

1. Check this documentation
2. Run test suite: `./test-ai-formatting.sh`
3. Check logs: `tail -f backend.log`
4. Review Claude API status: https://status.anthropic.com

---

## Changelog

### v1.0.0 (2025-10-09)

- ✓ Initial release
- ✓ Voice-to-trading-call formatting
- ✓ Multilingual support (English, Hindi, Hinglish)
- ✓ Stock symbol normalization
- ✓ Rate limiting and cost tracking
- ✓ Comprehensive error handling
- ✓ Usage statistics API
- ✓ Test suite
