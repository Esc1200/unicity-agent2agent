#!/bin/bash
cd "$(dirname "$0")"
rm -rf data

echo "=== Starting Agent A ==="
npx tsx src/agent-a.ts > /tmp/agent-a.log 2>&1 &
PID_A=$!
echo "Agent A PID: $PID_A"
echo "Waiting 30s for Agent A to boot + mint + publish..."
sleep 30

echo "=== Agent A Log ==="
cat /tmp/agent-a.log | tr -cd '[:print:]\n' | grep -E "^\[agent|mint|intent|discovery|wallet ready|nametag:|address:" | head -10
echo ""

echo "=== Starting Agent B ==="
npx tsx src/agent-b.ts > /tmp/agent-b.log 2>&1 &
PID_B=$!
echo "Agent B PID: $PID_B"
echo "Waiting 90s for full send cycle..."
sleep 90

echo "=== Agent B Log ==="
cat /tmp/agent-b.log | tr -cd '[:print:]\n' | grep -E "^\[agent|payment|RESULT|COMPLETE|discovered|sending|balance|timeout|result" | head -15
echo ""

echo "=== Agent A Log (post-transaction) ==="
cat /tmp/agent-a.log | tr -cd '[:print:]\n' | grep -E "^\[agent|incoming|transfer|enrichment|result delivered|service request" | head -10
echo ""

echo "=== Agent A errors ==="
cat /tmp/agent-a.log | tr -cd '[:print:]\n' | grep -iE "403|error|failed" | grep -v "at " | head -5

kill $PID_A $PID_B 2>/dev/null
wait $PID_A $PID_B 2>/dev/null
echo ""
echo "=== TEST COMPLETE ==="
