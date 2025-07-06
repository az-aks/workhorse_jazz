#!/bin/bash

# .env.test Validation Script
echo "🔍 Validating .env.test file..."
echo "================================"

# Check if .env.test exists
if [ ! -f ".env.test" ]; then
    echo "❌ .env.test file not found!"
    echo "Run: cp .env.copy .env.test"
    exit 1
fi

# Source the .env.test file
source .env.test

# Validation flags
VALID=true
WARNINGS=()
ERRORS=()

# 1. Check Private Key
if [ -z "$PRIVATE_KEY" ]; then
    ERRORS+=("❌ PRIVATE_KEY is empty")
    VALID=false
else
    echo "✅ PRIVATE_KEY is set"
fi

# 2. Check Network Configuration
if [[ "$RPC_ENDPOINT" == *"devnet"* ]]; then
    echo "✅ Using DEVNET (safe for testing)"
elif [[ "$RPC_ENDPOINT" == *"mainnet"* ]]; then
    ERRORS+=("❌ Using MAINNET - DANGEROUS for testing!")
    VALID=false
else
    WARNINGS+=("⚠️ Unknown network: $RPC_ENDPOINT")
fi

# 3. Check WebSocket Endpoint
if [[ "$RPC_WEBSOCKET_ENDPOINT" == *"devnet"* ]]; then
    echo "✅ WebSocket using DEVNET"
elif [[ "$RPC_WEBSOCKET_ENDPOINT" == *"mainnet"* ]]; then
    ERRORS+=("❌ WebSocket using MAINNET - DANGEROUS!")
    VALID=false
fi

# 4. Check Quote Amount (should be small for testing)
if (( $(echo "$QUOTE_AMOUNT > 0.01" | bc -l) )); then
    WARNINGS+=("⚠️ QUOTE_AMOUNT ($QUOTE_AMOUNT) is high for testing")
elif (( $(echo "$QUOTE_AMOUNT < 0.00001" | bc -l) )); then
    WARNINGS+=("⚠️ QUOTE_AMOUNT ($QUOTE_AMOUNT) might be too small")
else
    echo "✅ QUOTE_AMOUNT ($QUOTE_AMOUNT) is reasonable for testing"
fi

# 5. Check Transaction Executor
if [ "$TRANSACTION_EXECUTOR" == "default" ]; then
    echo "✅ Using default executor (cheapest for testing)"
elif [ "$TRANSACTION_EXECUTOR" == "warp" ] || [ "$TRANSACTION_EXECUTOR" == "jito" ]; then
    WARNINGS+=("⚠️ Using $TRANSACTION_EXECUTOR executor - will charge $CUSTOM_FEE SOL per transaction")
fi

# 6. Check Slippage Settings
if (( $(echo "$BUY_SLIPPAGE > 30" | bc -l) )); then
    WARNINGS+=("⚠️ BUY_SLIPPAGE ($BUY_SLIPPAGE%) is very high")
elif (( $(echo "$BUY_SLIPPAGE < 1" | bc -l) )); then
    WARNINGS+=("⚠️ BUY_SLIPPAGE ($BUY_SLIPPAGE%) might be too low")
else
    echo "✅ BUY_SLIPPAGE ($BUY_SLIPPAGE%) is reasonable"
fi

if (( $(echo "$SELL_SLIPPAGE > 30" | bc -l) )); then
    WARNINGS+=("⚠️ SELL_SLIPPAGE ($SELL_SLIPPAGE%) is very high")
elif (( $(echo "$SELL_SLIPPAGE < 1" | bc -l) )); then
    WARNINGS+=("⚠️ SELL_SLIPPAGE ($SELL_SLIPPAGE%) might be too low")
else
    echo "✅ SELL_SLIPPAGE ($SELL_SLIPPAGE%) is reasonable"
fi

# 7. Check Profit/Loss Settings
if (( $(echo "$TAKE_PROFIT < 10" | bc -l) )); then
    WARNINGS+=("⚠️ TAKE_PROFIT ($TAKE_PROFIT%) is quite low")
elif (( $(echo "$TAKE_PROFIT > 200" | bc -l) )); then
    WARNINGS+=("⚠️ TAKE_PROFIT ($TAKE_PROFIT%) is very high")
else
    echo "✅ TAKE_PROFIT ($TAKE_PROFIT%) is reasonable"
fi

if (( $(echo "$STOP_LOSS < 5" | bc -l) )); then
    WARNINGS+=("⚠️ STOP_LOSS ($STOP_LOSS%) is quite low")
elif (( $(echo "$STOP_LOSS > 50" | bc -l) )); then
    WARNINGS+=("⚠️ STOP_LOSS ($STOP_LOSS%) is very high")
else
    echo "✅ STOP_LOSS ($STOP_LOSS%) is reasonable"
fi

# 8. Check Pool Size Filters
if (( $(echo "$MIN_POOL_SIZE < 1" | bc -l) )); then
    WARNINGS+=("⚠️ MIN_POOL_SIZE ($MIN_POOL_SIZE) is very low")
fi

if (( $(echo "$MAX_POOL_SIZE > 1000" | bc -l) )); then
    WARNINGS+=("⚠️ MAX_POOL_SIZE ($MAX_POOL_SIZE) is very high")
fi

# 9. Check Safety Settings
if [ "$CHECK_IF_BURNED" == "true" ]; then
    echo "✅ Checking if liquidity is burned (good for safety)"
else
    WARNINGS+=("⚠️ Not checking if liquidity is burned - risky!")
fi

if [ "$CHECK_IF_MINT_IS_RENOUNCED" == "true" ]; then
    echo "✅ Checking if mint is renounced (good for safety)"
else
    WARNINGS+=("⚠️ Not checking if mint is renounced - risky!")
fi

# Print warnings
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo "⚠️ WARNINGS:"
    for warning in "${WARNINGS[@]}"; do
        echo "  $warning"
    done
fi

# Print errors
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "❌ ERRORS:"
    for error in "${ERRORS[@]}"; do
        echo "  $error"
    done
fi

echo ""
echo "================================"

if [ "$VALID" = true ]; then
    echo "✅ Validation passed! Your .env.test is ready for dry run."
    echo ""
    echo "📋 Next steps:"
    echo "1. Make sure you have devnet SOL in your wallet"
    echo "2. Run: npm run paper-trade"
    echo "3. Monitor the results and adjust parameters"
else
    echo "❌ Validation failed! Please fix the errors above."
    exit 1
fi
