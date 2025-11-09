#!/bin/bash

# Test Question Generation Endpoint
# Prerequisites:
# 1. Backend server running (npm run dev)
# 2. ANTHROPIC_API_KEY set in .env
# 3. Database migrations applied
# 4. User registered and logged in (get JWT token)

set -e

API_URL="http://localhost:8000/api"

echo "==================================="
echo "Guardian - Question Generation Test"
echo "==================================="
echo ""

# Check if JWT token is provided
if [ -z "$1" ]; then
    echo "Error: JWT token required"
    echo "Usage: ./test-question-generation.sh <JWT_TOKEN>"
    echo ""
    echo "To get a token:"
    
    echo "1. Register: curl -X POST $API_URL/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"test@test.com\",\"password\":\"TestPass123!\",\"name\":\"Test User\"}'"
    echo "2. Login: curl -X POST $API_URL/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test@test.com\",\"password\":\"TestPass123!\"}'"
    exit 1
fi

JWT_TOKEN="$1"

echo "Step 1: Creating test vendor..."
VENDOR_RESPONSE=$(curl -s -X POST "$API_URL/vendors" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "TechFlow Solutions",
        "industry": "Healthcare",
        "website": "https://techflow.example.com"
    }')

VENDOR_ID=$(echo "$VENDOR_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Vendor created: $VENDOR_ID"
echo ""

echo "Step 2: Creating test assessment..."
ASSESSMENT_RESPONSE=$(curl -s -X POST "$API_URL/assessments" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"vendorId\": \"$VENDOR_ID\",
        \"assessmentType\": \"comprehensive\",
        \"solutionName\": \"AI Clinical Decision Support\",
        \"solutionType\": \"Clinical AI\"
    }")

ASSESSMENT_ID=$(echo "$ASSESSMENT_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Assessment created: $ASSESSMENT_ID"
echo ""

echo "Step 3: Generating questions (this may take 10-15 seconds)..."
echo "Calling Claude API..."
echo ""

QUESTION_RESPONSE=$(curl -s -X POST "$API_URL/assessments/$ASSESSMENT_ID/generate-questions" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "vendorType": "SaaS Provider",
        "solutionType": "Clinical Decision Support AI",
        "industry": "Healthcare",
        "assessmentFocus": "PIPEDA compliance, patient safety"
    }')

echo "Question Generation Response:"
echo "$QUESTION_RESPONSE" | jq '.' 2>/dev/null || echo "$QUESTION_RESPONSE"
echo ""

QUESTION_COUNT=$(echo "$QUESTION_RESPONSE" | grep -o '"questionCount":[0-9]*' | cut -d':' -f2)

if [ -z "$QUESTION_COUNT" ]; then
    echo "Error: Failed to generate questions"
    echo "Response: $QUESTION_RESPONSE"
    exit 1
fi

echo "Step 4: Retrieving generated questions..."
QUESTIONS=$(curl -s -X GET "$API_URL/assessments/$ASSESSMENT_ID/questions" \
    -H "Authorization: Bearer $JWT_TOKEN")

echo "Questions Retrieved:"
echo "$QUESTIONS" | jq '.questionCount' 2>/dev/null || echo "$QUESTIONS"
echo ""

echo "Sample Questions:"
echo "$QUESTIONS" | jq '.questions[0:3] | .[] | {section: .sectionName, number: .questionNumber, text: .questionText}' 2>/dev/null
echo ""

echo "==================================="
echo "Test Complete!"
echo "==================================="
echo "Assessment ID: $ASSESSMENT_ID"
echo "Questions Generated: $QUESTION_COUNT"
echo ""
echo "To view all questions:"
echo "curl -X GET $API_URL/assessments/$ASSESSMENT_ID/questions -H 'Authorization: Bearer $JWT_TOKEN' | jq '.'"
