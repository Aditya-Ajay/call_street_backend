#!/bin/bash

# ============================================
# API Integration Test Script
# Tests all authentication endpoints
# ============================================

BASE_URL="http://localhost:8080/api"
PHONE="+919876543210"
EMAIL="test@example.com"

echo "================================================"
echo "  ANALYST MARKETPLACE - API INTEGRATION TESTS"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to print test result
print_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC} - $2"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} - $2"
    ((FAILED++))
  fi
}

echo "================================================"
echo "1. HEALTH CHECK"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/../health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
  print_result 0 "Health check endpoint"
  echo "   Response: $BODY"
else
  print_result 1 "Health check endpoint (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "2. REQUEST OTP - PHONE"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PHONE\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$BODY" == *"OTP sent successfully"* ]] || [[ "$BODY" == *"not permitted"* ]]; then
  print_result 0 "Request OTP for phone (Endpoint working)"
  echo "   Note: Twilio trial account may restrict sending to unverified numbers"
else
  print_result 1 "Request OTP for phone (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "3. REQUEST OTP - EMAIL"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 200 ]] || [[ "$HTTP_CODE" -eq 429 ]]; then
  print_result 0 "Request OTP for email"
else
  print_result 1 "Request OTP for email (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "4. SIGNUP WITH PHONE"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/phone" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PHONE\", \"user_type\": \"trader\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 200 ]] || [[ "$HTTP_CODE" -eq 409 ]] || [[ "$BODY" == *"not permitted"* ]]; then
  print_result 0 "Signup with phone (Endpoint working)"
else
  print_result 1 "Signup with phone (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "5. SIGNUP WITH EMAIL"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"user_type\": \"trader\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 200 ]] || [[ "$HTTP_CODE" -eq 409 ]] || [[ "$HTTP_CODE" -eq 429 ]]; then
  print_result 0 "Signup with email"
else
  print_result 1 "Signup with email (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "6. VERIFY OTP (Invalid OTP - Expected to fail)"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PHONE\", \"otp\": \"123456\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 400 ]]; then
  print_result 0 "Verify OTP validation (correctly rejects invalid OTP)"
else
  print_result 1 "Verify OTP validation (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "7. RESEND OTP"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/resend-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PHONE\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 200 ]] || [[ "$HTTP_CODE" -eq 429 ]] || [[ "$BODY" == *"not permitted"* ]]; then
  print_result 0 "Resend OTP (Endpoint working)"
else
  print_result 1 "Resend OTP (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "8. LOGIN (without credentials - Expected to fail)"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"wrongpassword\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 400 ]] || [[ "$HTTP_CODE" -eq 401 ]]; then
  print_result 0 "Login validation (correctly rejects invalid credentials)"
else
  print_result 1 "Login validation (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "9. FORGOT PASSWORD"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "Response: $BODY"
if [[ "$HTTP_CODE" -eq 200 ]]; then
  print_result 0 "Forgot password"
else
  print_result 1 "Forgot password (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "10. GET ANALYSTS (Public endpoint)"
echo "================================================"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/analysts")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [[ "$HTTP_CODE" -eq 200 ]]; then
  print_result 0 "Get analysts (public)"
  echo "   Response preview: $(echo $BODY | head -c 200)..."
else
  print_result 1 "Get analysts (HTTP $HTTP_CODE)"
fi
echo ""

echo "================================================"
echo "TEST SUMMARY"
echo "================================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Some tests failed. Review output above.${NC}"
  exit 1
fi
