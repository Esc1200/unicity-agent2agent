#!/bin/bash
cd "$(dirname "$0")"
rm -rf data

echo "=== Starting Agent A ==="
npx tsx src/agent-a.ts > /tmp/agent-a.log 2>&1 &
PID_A=$!
sleep 25

echo "=== Starting Agent B ==="
npx tsx src/agent-b.ts > /tmp/agent-b.log 2>&1 &
PID_B=$!
sleep 90

echo ""
echo "=== Agent B (clean) ==="
cat /tmp/agent-b.log | tr -cd '[:print:]\n' | grep -E "^\[agent|payment|RESULT|COMPLETE|discovered|sending|balance" | head -15

echo ""
echo "=== Agent A (clean) ==="
cat /tmp/agent-a.log | tr -cd '[:print:]\n' | grep -E "^\[agent|incoming|transfer|enrichment|result|discovery" | head -15

echo ""
echo "=== Agent A errors ==="
cat /tmp/agent-a.log | tr -cd '[:print:]\n' | grep -i "403\|error\|failed" | head -5

kill $PID_A $PID_B 2>/dev/null
wait $PID_A $PID_B 2>/dev/null
echo ""
echo "=== DONE ==="
