# Trading Call Formatter - Quick Reference

Quick reference guide for developers integrating the Trading Call Formatter API.

---

## Endpoint

```
POST /api/posts/format-call
```

**Auth**: Required (Analyst only)
**Rate Limit**: 100 requests per 15 minutes

---

## Quick Request

```bash
curl -X POST http://localhost:5000/api/posts/format-call \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "NIFTY buy at 19500 target 19600 stop 19450 intraday"
  }'
```

---

## Call Types

| Type | Description | Example Keywords |
|------|-------------|------------------|
| `intraday` | Same day trading | "intraday", "aaj", "today" |
| `swing` | 2-10 days | "swing", "few days" |
| `positional` | Days to weeks | "positional", "few weeks" |
| `longterm` | Weeks to months | "long term", "investment" |
| `overnight` | 1-2 days | "overnight", "tomorrow" |
| `quant` | Algorithmic | "algo", "quant", "systematic" |

---

## Request Format

```json
{
  "raw_input": "string (required)",
  "call_type": "string (optional)",
  "stock_symbol": "string (optional)"
}
```

---

## Response Format

```json
{
  "success": true,
  "data": {
    "call_type": "intraday",
    "stock_symbol": "NIFTY",
    "action": "BUY",
    "entry_price": 19500,
    "target_price": 19600,
    "stop_loss": 19450,
    "risk_reward_ratio": "1:2.0",
    "formatted_text": "🎯 **INTRADAY CALL**...",
    "db_strategy_type": "intraday"
  }
}
```

---

## Integration Code

```javascript
// Format call
const response = await fetch('/api/posts/format-call', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    raw_input: userInput,
    call_type: 'intraday'
  })
});

const { data } = await response.json();

// Use formatted data
console.log(data.stock_symbol);     // "NIFTY"
console.log(data.action);            // "BUY"
console.log(data.db_strategy_type);  // "intraday"
```

---

## Error Handling

```javascript
try {
  const response = await fetch('/api/posts/format-call', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ /* ... */ })
  });

  if (!response.ok) {
    const error = await response.json();

    if (error.fallback) {
      // AI formatting failed, allow manual entry
      showManualEntry();
    } else {
      // Validation error
      showError(error.message);
    }
    return;
  }

  const { data } = await response.json();
  displayFormattedCall(data);

} catch (error) {
  console.error('API error:', error);
  showManualEntry(); // Fallback to manual
}
```

---

## Common Errors

| Status | Reason | Solution |
|--------|--------|----------|
| 400 | Missing raw_input | Provide raw_input field |
| 400 | Invalid call_type | Use one of 6 valid types |
| 401 | No JWT token | Add Authorization header |
| 403 | Not an analyst | Use analyst account |
| 429 | Rate limit hit | Wait and retry |
| 500 | AI failed | Use fallback/manual entry |

---

## Validation Utils

```javascript
import {
  isValidCallType,
  mapToDbStrategyType,
  getAllCallTypes
} from '@/utils/callTypeValidator';

// Check if call type is valid
isValidCallType('intraday'); // true
isValidCallType('invalid');  // false

// Get database field value
mapToDbStrategyType('intraday'); // "intraday"
mapToDbStrategyType('overnight'); // "swing"

// Get all call types for dropdown
const callTypes = getAllCallTypes();
// [
//   { type: 'intraday', label: 'Intraday', ... },
//   { type: 'swing', label: 'Swing', ... },
//   ...
// ]
```

---

## Language Support

**English:**
```
"NIFTY buy at 19500 target 19600"
```

**Hindi:**
```
"NIFTY को 19500 पे खरीदो"
```

**Hinglish:**
```
"NIFTY ko 19500 pe khareed lo"
```

---

## Stock Symbol Mapping

```javascript
import {
  normalizeStockSymbol,
  isValidSymbol
} from '@/utils/stockSymbolMapper';

normalizeStockSymbol('hdfc bank');  // "HDFCBANK"
normalizeStockSymbol('reliance');   // "RELIANCE"
normalizeStockSymbol('nifty 50');   // "NIFTY"

isValidSymbol('NIFTY');   // true
isValidSymbol('invalid'); // false
```

---

## Testing

**Test Endpoint:**
```bash
curl -X POST http://localhost:5000/api/posts/format-call \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"raw_input":"test input"}'
```

**Test Call Types:**
```bash
# Intraday
curl ... -d '{"raw_input":"NIFTY buy at 19500 intraday"}'

# Swing
curl ... -d '{"raw_input":"RELIANCE swing trade at 2450"}'

# Long-term
curl ... -d '{"raw_input":"TCS long term investment at 3500"}'
```

---

## Best Practices

1. **Always provide raw_input**
   ```javascript
   ✅ { raw_input: "NIFTY buy at 19500" }
   ❌ { raw_input: "" }
   ```

2. **Use hints when available**
   ```javascript
   ✅ { raw_input: "...", call_type: "intraday", stock_symbol: "NIFTY" }
   ⚠️ { raw_input: "..." } // Works but slower
   ```

3. **Handle fallback gracefully**
   ```javascript
   if (response.fallback) {
     // Show manual entry form
     showManualEntry();
   }
   ```

4. **Validate before submit**
   ```javascript
   if (data.entry_price > data.target_price && data.action === 'BUY') {
     alert('Invalid: Target should be higher than entry for BUY');
   }
   ```

5. **Show preview before posting**
   ```javascript
   // Format → Preview → Confirm → Post
   displayPreview(data.formatted_text);
   ```

---

## File Locations

```
backend/
├── src/
│   ├── services/
│   │   └── aiService.js              # formatTradingCall()
│   ├── controllers/
│   │   └── postController.js         # formatCallWithAI()
│   ├── routes/
│   │   └── post.routes.js            # /format-call route
│   └── utils/
│       ├── callTypeValidator.js      # Call type utils
│       └── stockSymbolMapper.js      # Stock symbol utils
├── docs/
│   ├── API_FORMAT_CALL.md           # Full API docs
│   ├── IMPLEMENTATION_SUMMARY.md    # Implementation details
│   └── QUICK_REFERENCE.md           # This file
└── test/
    └── format-call.test.js          # Test cases
```

---

## Support

- **Docs**: `/backend/docs/API_FORMAT_CALL.md`
- **Tests**: `/backend/test/format-call.test.js`
- **Slack**: #backend-support
- **Email**: backend@callstreet.com

---

## Example: Complete Integration

```javascript
// Step 1: Format the call
async function formatCall(rawInput, callType = null) {
  const response = await fetch('/api/posts/format-call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw_input: rawInput,
      call_type: callType
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Step 2: Create post with formatted data
async function createPost(formattedData) {
  const response = await fetch('/api/posts/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw_content: formattedData.metadata.rawInput,
      post_type: 'call',
      strategy_type: formattedData.db_strategy_type,
      stock_symbol: formattedData.stock_symbol,
      action: formattedData.action,
      entry_price: formattedData.entry_price,
      target_price: formattedData.target_price,
      stop_loss: formattedData.stop_loss,
      risk_reward_ratio: formattedData.risk_reward_ratio,
      audience: 'paid'
    })
  });

  return await response.json();
}

// Step 3: Use it
try {
  const formatted = await formatCall(
    "NIFTY buy at 19500 target 19600 stop 19450 intraday",
    "intraday"
  );

  console.log('Formatted:', formatted.data);

  const post = await createPost(formatted.data);

  console.log('Post created:', post.data);

} catch (error) {
  console.error('Error:', error.message);
  // Show manual entry form
}
```

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
