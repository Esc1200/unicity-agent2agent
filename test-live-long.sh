#!/bin/bash
cd "$(dirname "$0")"
# DON'T delete data — keep wallets persistent across runs

echo "=== Starting Agent A (enricher) ==="
npx tsx src/agent-a.ts > /tmp/agent-a.log 2>&1 &
PID_A=$!
echo "Agent A PID: $PID_A"

echo "Waiting 20s for Agent A to boot + mint + publish..."
sleep 20

echo "=== Agent A Log ==="
cat /tmp/agent-a.log
echo ""

echo "=== Starting Agent B (scout) ==="
npx tsx src/agent-b.ts > /tmp/agent-b.log 2>&1 &
PID_B=$!
echo "Agent B PID: $PID_B"

echo "Waiting 60s for full send cycle..."
sleep 60

echo "=== Agent B Log ==="
cat /tmp/agent-b.log
echo ""

echo "=== Agent A Log (post-transaction) ==="
cat /tmp/agent-a.log
echo ""

# Check for result delivery
echo "=== Checking Agent A for incoming transfers ==="
grep -i "incoming\|transfer\|result\|enrichment" /tmp/agent-a.log || echo "(no incoming activity yet)"

echo ""
echo "=== Checking Agent B for result ==="
grep -i "RESULT\|result\|COMPLETE\|complete" /tmp/agent-b.log || echo "(no result received yet)"

# Cleanup
kill $PID_A $PID_B 2>/dev/null
wait $PID_A $PID_B 2>/dev/null
echo ""
echo "=== TEST COMPLETE ==="
