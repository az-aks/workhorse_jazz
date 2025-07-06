#!/bin/bash

# Paper Trading Setup Script
# This script helps you set up the paper trading environment

echo "=== PAPER TRADING SETUP ==="
echo ""

# Create paper trading environment file
if [ ! -f ".env.paper" ]; then
    echo "Creating .env.paper file..."
    cp .env.copy .env.paper
    echo "✅ .env.paper created"
else
    echo "✅ .env.paper already exists"
fi

echo ""
echo "=== SETUP INSTRUCTIONS ==="
echo ""
echo "1. CONFIGURE .env.paper:"
echo "   - Set PRIVATE_KEY to any test wallet (no real funds needed)"
echo "   - Keep mainnet RPC endpoints for real market data"
echo "   - Adjust QUOTE_AMOUNT and other parameters as needed"
echo ""
echo "2. RUN PAPER TRADING:"
echo "   - Copy .env.paper to .env: cp .env.paper .env"
echo "   - Run: npm run paper-trade"
echo ""
echo "3. MONITOR RESULTS:"
echo "   - Watch simulated trades in real-time"
echo "   - Review profit/loss summaries"
echo "   - Tune parameters based on paper trading results"
echo ""
echo "=== SAFETY FEATURES ==="
echo "- ✅ Uses real mainnet data for accurate simulation"
echo "- ✅ No real transactions executed - completely safe"
echo "- ✅ Virtual balances start with 1 SOL equivalent"
echo "- ✅ Detailed trade logging and profit/loss tracking"
echo ""
echo "=== NEXT STEPS ==="
echo "1. Configure your .env.paper file"
echo "2. Run: cp .env.paper .env"
echo "3. Run: npm run paper-trade"
echo "================================"
