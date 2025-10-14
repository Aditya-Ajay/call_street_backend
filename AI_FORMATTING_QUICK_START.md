# AI Formatting Quick Start Guide

Quick reference for integrating the voice-to-trading-call AI formatting feature.

## Quick Setup (5 minutes)

### 1. Environment Variables

Ensure these are set in `.env`:

```bash
CLAUDE_API_KEY=sk-ant-api-key-here
CLAUDE_MODEL=claude-sonnet-4-5-20250929
ENABLE_AI_FEATURES=true
```

### 2. Database Migration

```bash
psql -h localhost -p 5433 -U postgres -d analyst_platform -f migrations/026_create_ai_usage_logs_table.sql
```

### 3. Start Server

```bash
npm run dev
```

### 4. Test API

```bash
./test-ai-formatting.sh
```

---

## API Quick Reference

### Format Trading Call

```bash
POST /api/ai/format-call
Authorization: Bearer <JWT_TOKEN>

{
  "transcript": "Buy HDFC Bank at 1520 target 1640 stop 1480",
  "language": "en"
}
```

### Get Usage Stats

```bash
GET /api/ai/usage-stats
Authorization: Bearer <JWT_TOKEN>
```

---

## Frontend Integration

### Install Dependencies

Already included in `package.json`:
- `@anthropic-ai/sdk`: ^0.12.0

### API Service

```javascript
// src/services/api.js

export const aiAPI = {
  async formatTradingCall(transcript, language = 'en') {
    const response = await apiClient.post('/api/ai/format-call', {
      transcript,
      language
    });
    return response.data;
  }
};
```

### React Component

```javascript
// VoiceInput.jsx

const handleFormatWithAI = async () => {
  setFormatting(true);

  try {
    const result = await aiAPI.formatTradingCall(transcript);
    onFormatComplete(result.data.formatted_call);
  } catch (error) {
    toast.error('AI formatting failed. Enter manually.');
  } finally {
    setFormatting(false);
  }
};
```

---

## Common Use Cases

### 1. Simple Buy Call

**Input**: "Buy Reliance at 2450 target 2500 stop 2420"

**Output**:
```json
{
  "stock": "RELIANCE",
  "action": "BUY",
  "entry_price": 2450,
  "target_price": 2500,
  "stop_loss": 2420,
  "risk_reward_ratio": "1:1.7"
}
```

### 2. Sell Call with Strategy

**Input**: "Sell Tata Motors at 620 for intraday target 610 stop 625"

**Output**:
```json
{
  "stock": "TATAMOTORS",
  "action": "SELL",
  "entry_price": 620,
  "target_price": 610,
  "stop_loss": 625,
  "strategy_type": "INTRADAY"
}
```

### 3. Hinglish Call

**Input**: "ICICI Bank ko 950 pe khareed lo target 980"

**Output**:
```json
{
  "stock": "ICICIBANK",
  "action": "BUY",
  "entry_price": 950,
  "target_price": 980
}
```

---

## Error Handling

### Client-Side

```javascript
try {
  const result = await aiAPI.formatTradingCall(transcript);
  // Success
} catch (error) {
  if (error.response?.status === 429) {
    toast.error('Rate limit exceeded. Try again in 1 minute.');
  } else if (error.response?.status === 400) {
    toast.error('Transcript too short or invalid.');
  } else {
    toast.error('AI formatting failed. Enter details manually.');
  }
}
```

### Server-Side

All errors are handled in `aiController.js`:
- Validation errors → 400
- Auth errors → 401, 403
- Rate limits → 429
- AI failures → 500, 503

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Per Minute | 10 requests |
| Per Day | 100 requests |
| Per Month | 3000 requests |

### Check Remaining Quota

```javascript
const stats = await aiAPI.getUsageStats();
console.log('Remaining today:', stats.data.today.remaining_requests);
```

---

## Cost Tracking

### Average Costs

- Per request: ~₹0.15 - ₹0.22
- Per day (100 requests): ~₹15 - ₹22
- Per month (3000 requests): ~₹450 - ₹660

### Query User Spend

```sql
SELECT
  SUM(cost_inr) as total_spend
FROM ai_usage_logs
WHERE user_id = 'ANALYST_ID'
AND created_at >= CURRENT_DATE;
```

---

## Stock Symbol Mapping

### Add New Stock

Edit `src/utils/stockSymbolMapper.js`:

```javascript
const STOCK_NAME_TO_SYMBOL = {
  'hdfc bank': 'HDFCBANK',
  'new stock name': 'NEWSYMBOL',  // Add here
  // ...
};
```

### Test Mapping

```javascript
const { normalizeStockSymbol } = require('./utils/stockSymbolMapper');

console.log(normalizeStockSymbol('hdfc bank')); // 'HDFCBANK'
console.log(normalizeStockSymbol('HDFCBANK'));  // 'HDFCBANK'
```

---

## Testing

### Run All Tests

```bash
./test-ai-formatting.sh
```

### Test Single Endpoint

```bash
curl -X POST http://localhost:8080/api/ai/format-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "transcript": "Buy TCS at 3500 target 3600",
    "language": "en"
  }'
```

---

## Files Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── aiController.js          # AI endpoints
│   ├── routes/
│   │   └── ai.routes.js             # AI routes
│   ├── services/
│   │   └── aiService.js             # Claude API integration
│   ├── utils/
│   │   └── stockSymbolMapper.js     # Stock name mapping
│   └── server.js                    # Register AI routes
├── migrations/
│   └── 026_create_ai_usage_logs_table.sql
└── test-ai-formatting.sh            # Test suite
```

---

## Debugging

### Enable Debug Logs

```javascript
// src/services/aiService.js

console.log('Claude API request:', {
  model: config.claude.model,
  input: trimmedText,
  language: language
});
```

### Check Database Logs

```sql
SELECT *
FROM ai_usage_logs
WHERE user_id = 'ANALYST_ID'
ORDER BY created_at DESC
LIMIT 10;
```

### Monitor API Usage

```bash
tail -f backend.log | grep "Claude API"
```

---

## Performance

### Expected Latency

- P50: ~1200ms
- P95: ~4000ms
- P99: ~5000ms

### Timeout

- API timeout: 5 seconds
- Retry on timeout: Yes (exponential backoff)

---

## Security Checklist

- [x] API key in environment variables
- [x] JWT authentication required
- [x] Rate limiting enabled
- [x] Input validation (10-1000 chars)
- [x] Error messages don't expose internals
- [x] Database logs for audit trail

---

## Troubleshooting

### Issue: "Claude API key not configured"

**Fix**: Add `CLAUDE_API_KEY` to `.env`

### Issue: "Rate limit exceeded"

**Fix**: Wait 1 minute, or increase limits in controller

### Issue: Stock symbol not normalized

**Fix**: Add stock to `stockSymbolMapper.js`

### Issue: AI formatting returns null

**Fix**: Check Claude API status, enable retry logic

---

## Next Steps

1. ✓ Test API endpoints
2. ✓ Integrate with frontend VoiceInput component
3. ✓ Monitor usage and costs
4. ✓ Add more stocks to symbol mapper
5. ✓ Implement caching for common calls

---

## Support

- **Documentation**: `AI_FORMATTING_API_DOCUMENTATION.md`
- **Test Suite**: `./test-ai-formatting.sh`
- **Logs**: `tail -f backend.log`
- **Claude Status**: https://status.anthropic.com

---

**Last Updated**: 2025-10-09
**Version**: 1.0.0
