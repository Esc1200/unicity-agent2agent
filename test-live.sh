#!/bin/bash
cd "$(dirname "$0")"
rm -rf data

echo "=== Starting Agent A (enricher-v2) ==="
npx tsx src/agent-a.ts > /tmp/agent-a.log 2>&1 &
PID_A=$!
echo "Agent A PID: $PID_A"

echo "Waiting 15s for Agent A to boot..."
sleep 15

echo "=== Agent A Log ==="
cat /tmp/agent-a.log

echo ""
echo "=== Starting Agent B (scout-v2) ==="
npx tsx src/agent-b.ts > /tmp/agent-b.log 2>&1 &
PID_B=$!
echo "Agent B PID: $PID_B"

echo "Waiting 20s for Agent B to complete..."
sleep 20

echo "=== Agent B Log ==="
cat /tmp/agent-b.log

echo ""
echo "=== Agent A Log (post-transaction) ==="
cat /tmp/agent-a.log

# Cleanup
kill $PID_A $PID_B 2>/dev/null
echo ""
echo "=== DONE ==="
