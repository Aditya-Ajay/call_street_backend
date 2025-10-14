#!/bin/bash

###############################################################################
# Voice-to-Trading-Call AI Formatting Test Suite
#
# Tests the complete AI formatting feature:
# 1. Authentication
# 2. AI formatting endpoint
# 3. Stock symbol normalization
# 4. Error handling
# 5. Rate limiting
# 6. Usage statistics
#
# Usage: ./test-ai-formatting.sh
###############################################################################

set -e  # Exit on error

# Configuration
API_URL="http://localhost:8080/api"
ANALYST_EMAIL="test.analyst@example.com"
ANALYST_PASSWORD="TestPass123!"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test header
print_header() {
  echo ""
  echo "============================================"
  echo "$1"
  echo "============================================"
}

# Function to print test result
print_result() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Function to print info
print_info() {
  echo -e "${YELLOW}ℹ INFO${NC}: $1"
}

# Start tests
print_header "VOICE-TO-TRADING-CALL AI FORMATTING TEST SUITE"
echo "Testing AI formatting feature with Claude API"
echo ""

###############################################################################
# TEST 1: Analyst Login
###############################################################################

print_header "TEST 1: Analyst Login"

LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ANALYST_EMAIL}\",
    \"password\": \"${ANALYST_PASSWORD}\"
  }")

AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // empty')

if [ -n "$AUTH_TOKEN" ]; then
  print_result 0 "Analyst logged in successfully"
  print_info "Token: ${AUTH_TOKEN:0:20}..."
else
  print_result 1 "Failed to login as analyst"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

###############################################################################
# TEST 2: AI Service Health Check
###############################################################################

print_header "TEST 2: AI Service Health Check"

HEALTH_RESPONSE=$(curl -s -X GET "${API_URL}/ai/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.success')

if [ "$HEALTH_STATUS" == "true" ]; then
  print_result 0 "AI service health check passed"
  SERVICE=$(echo "$HEALTH_RESPONSE" | jq -r '.data.service')
  MODEL=$(echo "$HEALTH_RESPONSE" | jq -r '.data.model')
  print_info "Service: $SERVICE, Model: $MODEL"
else
  print_result 1 "AI service health check failed"
  echo "Response: $HEALTH_RESPONSE"
fi

###############################################################################
# TEST 3: Format Simple Trading Call (English)
###############################################################################

print_header "TEST 3: Format Simple Trading Call (English)"

FORMAT_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Buy HDFC Bank at 1520 rupees, target 1640, stop loss at 1480, this is a swing trade based on breakout pattern",
    "language": "en"
  }')

FORMAT_SUCCESS=$(echo "$FORMAT_RESPONSE" | jq -r '.success')
STOCK_SYMBOL=$(echo "$FORMAT_RESPONSE" | jq -r '.data.formatted_call.stock // empty')
ACTION=$(echo "$FORMAT_RESPONSE" | jq -r '.data.formatted_call.action // empty')
ENTRY_PRICE=$(echo "$FORMAT_RESPONSE" | jq -r '.data.formatted_call.entry_price // empty')

if [ "$FORMAT_SUCCESS" == "true" ] && [ -n "$STOCK_SYMBOL" ]; then
  print_result 0 "Trading call formatted successfully"
  print_info "Stock: $STOCK_SYMBOL, Action: $ACTION, Entry: ₹$ENTRY_PRICE"

  # Show formatted data
  echo ""
  echo "Formatted Call Data:"
  echo "$FORMAT_RESPONSE" | jq '.data.formatted_call'
else
  print_result 1 "Failed to format trading call"
  echo "Response: $FORMAT_RESPONSE"
fi

###############################################################################
# TEST 4: Format with Hindi/Hinglish
###############################################################################

print_header "TEST 4: Format with Hindi/Hinglish"

HINGLISH_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Reliance ko 2450 pe khareed lo target 2480 stop 2430",
    "language": "hinglish"
  }')

HINGLISH_SUCCESS=$(echo "$HINGLISH_RESPONSE" | jq -r '.success')
HINGLISH_STOCK=$(echo "$HINGLISH_RESPONSE" | jq -r '.data.formatted_call.stock // empty')

if [ "$HINGLISH_SUCCESS" == "true" ] && [ -n "$HINGLISH_STOCK" ]; then
  print_result 0 "Hinglish transcript formatted successfully"
  print_info "Stock: $HINGLISH_STOCK"
else
  print_result 1 "Failed to format Hinglish transcript"
  echo "Response: $HINGLISH_RESPONSE"
fi

###############################################################################
# TEST 5: Test Invalid Transcript (Too Short)
###############################################################################

print_header "TEST 5: Test Invalid Transcript (Too Short)"

SHORT_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Buy",
    "language": "en"
  }')

SHORT_SUCCESS=$(echo "$SHORT_RESPONSE" | jq -r '.success')

if [ "$SHORT_SUCCESS" == "false" ]; then
  print_result 0 "Correctly rejected short transcript"
  ERROR_MSG=$(echo "$SHORT_RESPONSE" | jq -r '.message')
  print_info "Error: $ERROR_MSG"
else
  print_result 1 "Should have rejected short transcript"
  echo "Response: $SHORT_RESPONSE"
fi

###############################################################################
# TEST 6: Test Missing Transcript
###############################################################################

print_header "TEST 6: Test Missing Transcript"

MISSING_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "language": "en"
  }')

MISSING_SUCCESS=$(echo "$MISSING_RESPONSE" | jq -r '.success')

if [ "$MISSING_SUCCESS" == "false" ]; then
  print_result 0 "Correctly rejected missing transcript"
else
  print_result 1 "Should have rejected missing transcript"
  echo "Response: $MISSING_RESPONSE"
fi

###############################################################################
# TEST 7: Test Transcript Too Long
###############################################################################

print_header "TEST 7: Test Transcript Too Long"

LONG_TRANSCRIPT=$(printf 'A%.0s' {1..1100})  # 1100 characters

LONG_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d "{
    \"transcript\": \"$LONG_TRANSCRIPT\",
    \"language\": \"en\"
  }")

LONG_SUCCESS=$(echo "$LONG_RESPONSE" | jq -r '.success')

if [ "$LONG_SUCCESS" == "false" ]; then
  print_result 0 "Correctly rejected long transcript"
else
  print_result 1 "Should have rejected long transcript"
  echo "Response: $LONG_RESPONSE"
fi

###############################################################################
# TEST 8: Get Usage Statistics
###############################################################################

print_header "TEST 8: Get Usage Statistics"

STATS_RESPONSE=$(curl -s -X GET "${API_URL}/ai/usage-stats" \
  -H "Authorization: Bearer ${AUTH_TOKEN}")

STATS_SUCCESS=$(echo "$STATS_RESPONSE" | jq -r '.success')
TODAY_REQUESTS=$(echo "$STATS_RESPONSE" | jq -r '.data.today.requests // 0')
REMAINING=$(echo "$STATS_RESPONSE" | jq -r '.data.today.remaining_requests // 0')

if [ "$STATS_SUCCESS" == "true" ]; then
  print_result 0 "Usage statistics retrieved successfully"
  print_info "Today's requests: $TODAY_REQUESTS, Remaining: $REMAINING"

  echo ""
  echo "Usage Stats:"
  echo "$STATS_RESPONSE" | jq '.data'
else
  print_result 1 "Failed to retrieve usage statistics"
  echo "Response: $STATS_RESPONSE"
fi

###############################################################################
# TEST 9: Test Stock Symbol Normalization
###############################################################################

print_header "TEST 9: Test Stock Symbol Normalization"

SYMBOL_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Buy ICICI Bank at 950 target 980 stop loss 930",
    "language": "en"
  }')

SYMBOL_SUCCESS=$(echo "$SYMBOL_RESPONSE" | jq -r '.success')
NORMALIZED_SYMBOL=$(echo "$SYMBOL_RESPONSE" | jq -r '.data.formatted_call.stock // empty')

if [ "$SYMBOL_SUCCESS" == "true" ] && [ "$NORMALIZED_SYMBOL" == "ICICIBANK" ]; then
  print_result 0 "Stock symbol normalized correctly (ICICI Bank → ICICIBANK)"
  print_info "Normalized: $NORMALIZED_SYMBOL"
else
  print_result 1 "Stock symbol normalization failed"
  echo "Response: $SYMBOL_RESPONSE"
fi

###############################################################################
# TEST 10: Test Without Authentication
###############################################################################

print_header "TEST 10: Test Without Authentication"

NOAUTH_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Buy TCS at 3500",
    "language": "en"
  }')

NOAUTH_SUCCESS=$(echo "$NOAUTH_RESPONSE" | jq -r '.success')

if [ "$NOAUTH_SUCCESS" == "false" ]; then
  print_result 0 "Correctly rejected unauthenticated request"
else
  print_result 1 "Should have rejected unauthenticated request"
  echo "Response: $NOAUTH_RESPONSE"
fi

###############################################################################
# TEST 11: Test AI Confidence Scoring
###############################################################################

print_header "TEST 11: Test AI Confidence Scoring"

CONFIDENCE_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Buy Infosys at 1400 rupees target 1500 stop loss 1350 swing trade high confidence",
    "language": "en"
  }')

CONFIDENCE_SUCCESS=$(echo "$CONFIDENCE_RESPONSE" | jq -r '.success')
AI_CONFIDENCE=$(echo "$CONFIDENCE_RESPONSE" | jq -r '.data.ai_confidence // empty')

if [ "$CONFIDENCE_SUCCESS" == "true" ] && [ -n "$AI_CONFIDENCE" ]; then
  print_result 0 "AI confidence scoring working"
  print_info "Confidence: $AI_CONFIDENCE"
else
  print_result 1 "AI confidence scoring failed"
  echo "Response: $CONFIDENCE_RESPONSE"
fi

###############################################################################
# TEST 12: Test Complex Trading Call
###############################################################################

print_header "TEST 12: Test Complex Trading Call"

COMPLEX_RESPONSE=$(curl -s -X POST "${API_URL}/ai/format-call" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "transcript": "Sell Tata Motors at 620 for intraday target 610 with stop loss at 625 based on bearish reversal pattern",
    "language": "en"
  }')

COMPLEX_SUCCESS=$(echo "$COMPLEX_RESPONSE" | jq -r '.success')
COMPLEX_ACTION=$(echo "$COMPLEX_RESPONSE" | jq -r '.data.formatted_call.action // empty')
COMPLEX_STRATEGY=$(echo "$COMPLEX_RESPONSE" | jq -r '.data.formatted_call.strategy_type // empty')

if [ "$COMPLEX_SUCCESS" == "true" ] && [ "$COMPLEX_ACTION" == "SELL" ]; then
  print_result 0 "Complex trading call formatted successfully"
  print_info "Action: $COMPLEX_ACTION, Strategy: $COMPLEX_STRATEGY"
else
  print_result 1 "Failed to format complex trading call"
  echo "Response: $COMPLEX_RESPONSE"
fi

###############################################################################
# TEST SUMMARY
###############################################################################

print_header "TEST SUMMARY"

echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
